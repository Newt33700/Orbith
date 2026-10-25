import { rm } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultConfig, hashBody, recordValidation, scanArtifacts, type Artifact, type Piste } from '../../src/core/index.js';
import { computeNext, runNext } from '../../src/cli/next.js';
import { GHERKIN, makeProject, put } from './helpers.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const r of roots.splice(0)) await rm(r, { recursive: true, force: true });
});

function art(type: Artifact['type'], over: Partial<Artifact> & { data?: Record<string, unknown> } = {}): Artifact {
  return {
    type,
    chemin: `docs/${type}.md`,
    etat: 'validé',
    body: '',
    data: {},
    statut: 'validé',
    ...over,
  } as Artifact;
}
const cfg = (piste: Piste) => ({ ...defaultConfig('x'), piste });
const story = (id: string, status: string, over: Partial<Artifact> = {}) =>
  art('story', { id, chemin: `backlog/tasks/${id}.md`, body: GHERKIN, data: { status }, ...over });

describe('computeNext', () => {
  it('colonnes Backlog.md par défaut et variantes de casse/accents reconnues', () => {
    const r = computeNext([story('US-001', 'ready')], cfg('evolution'));
    expect(r.principal.claude).toBe('/orbith-dev US-001');
    expect(computeNext([story('US-001', 'prete')], cfg('evolution')).principal.claude).toBe('/orbith-dev US-001');
    expect(computeNext([story('US-001', 'To Do')], cfg('evolution')).principal.message).toMatch(/DoR/);
    expect(computeNext([story('US-001', 'Done')], cfg('evolution')).principal.claude).toBe('/orbith-sm');
  });
  it('projet: brief manquant -> po', () => {
    const r = computeNext([], cfg('projet'));
    expect(r.principal.claude).toBe('/orbith-po');
    expect(r.principal.gemini).toBe('/orbith:po');
  });
  it('projet: brief non validé -> valider', () => {
    const r = computeNext([art('brief', { etat: 'non-validé', chemin: 'docs/produit/brief.md' })], cfg('projet'));
    expect(r.principal.cli).toBe('npx orbith valider docs/produit/brief.md');
  });
  it('projet: enchaînement prd, ux, architecture, epic, story', () => {
    const a: Artifact[] = [art('brief')];
    expect(computeNext(a, cfg('projet')).principal.claude).toBe('/orbith-po');
    a.push(art('prd'));
    expect(computeNext(a, cfg('projet')).principal.claude).toBe('/orbith-ux');
    a.push(art('ux'));
    const r = computeNext(a, cfg('projet')).principal;
    expect(r.claude).toBe('/orbith-archi');
    expect(r.gemini).toBe('/orbith:archi');
    a.push(art('architecture'));
    expect(computeNext(a, cfg('projet')).principal.claude).toBe('/orbith-po');
    a.push(art('epic', { etat: 'non-validé' }));
    expect(computeNext(a, cfg('projet')).principal.cli).toContain('valider');
    a[a.length - 1] = art('epic');
    expect(computeNext(a, cfg('projet')).principal.message).toMatch(/US/);
    a.push(story('US-001', 'À faire'));
    expect(computeNext(a, cfg('projet')).principal.message).toMatch(/DoR/);
  });
  it('evolution: pas de story -> po', () => {
    expect(computeNext([], cfg('evolution')).principal.claude).toBe('/orbith-po');
  });
  it('correctif: pas de story -> po (US courte)', () => {
    const r = computeNext([], cfg('correctif'));
    expect(r.principal.claude).toBe('/orbith-po');
    expect(r.principal.message).toMatch(/courte/);
  });
  it('story sans gherkin -> po', () => {
    const r = computeNext([story('US-001', 'À faire', { body: 'rien', etat: 'non-validé' })], cfg('evolution'));
    expect(r.principal.claude).toBe('/orbith-po US-001');
  });
  it('story non validée avec gherkin -> valider', () => {
    const r = computeNext([story('US-001', 'À faire', { etat: 'non-validé' })], cfg('evolution'));
    expect(r.principal.cli).toBe('npx orbith valider backlog/tasks/US-001.md');
  });
  it('story validée À faire -> DoR', () => {
    expect(computeNext([story('US-001', 'À faire')], cfg('evolution')).principal.message).toMatch(/Prête/);
  });
  it('story Prête -> dev', () => {
    const r = computeNext([story('US-001', 'Prête')], cfg('evolution'));
    expect(r.principal.claude).toBe('/orbith-dev US-001');
    expect(r.principal.gemini).toBe('/orbith:dev US-001');
  });
  it('story En cours -> dev', () => {
    expect(computeNext([story('US-001', 'En cours')], cfg('correctif')).principal.claude).toBe('/orbith-dev US-001');
  });
  it('story En revue -> qa', () => {
    expect(computeNext([story('US-001', 'En revue')], cfg('evolution')).principal.claude).toBe('/orbith-qa US-001');
  });
  it('tout Terminée -> sm puis livré', () => {
    const s = story('US-001', 'Terminée');
    expect(computeNext([s], cfg('evolution')).principal.claude).toBe('/orbith-sm');
    const brouillon = art('release-notes', { body: 'Livré : US-001', etat: 'non-validé', data: { version: '1.0.0' } });
    expect(computeNext([s, brouillon], cfg('evolution')).principal.cli).toContain('valider');
    const notes = art('release-notes', { body: 'Livré : US-001', data: { version: '1.0.0' } });
    const r = computeNext([s, notes], cfg('evolution')).principal;
    expect(r.kind).toBe('humain');
    expect(r.cli).toBe('npx orbith deploiement 1.0.0');
    const livrees = art('release-notes', { body: 'Livré : US-001', data: { version: '1.0.0', mis_en_prod_le: '2026-10-25' } });
    expect(computeNext([s, livrees], cfg('evolution')).principal.kind).toBe('fini');
  });
  it('tout Terminée, notes qui ne couvrent que US-12 -> pas fini, sm', () => {
    const a = [story('US-1', 'Terminée'), story('US-12', 'Terminée'), art('release-notes', { body: 'Livré : US-12' })];
    const r = computeNext(a, cfg('evolution')).principal;
    expect(r.kind).not.toBe('fini');
    expect(r.claude).toBe('/orbith-sm');
  });
  it('problèmes en premier', () => {
    const r = computeNext([story('US-001', 'Prête', { etat: 'modifié' })], cfg('evolution'));
    expect(r.principal.kind).toBe('probleme');
    expect(r.principal.message).toMatch(/modifié après/);
    const r2 = computeNext([story('US-001', 'Prête', { etat: 'non-tracé' })], cfg('evolution'));
    expect(r2.principal.message).toMatch(/sans trace/);
  });
  it('secondaires limités à 3, impact-archi mentionné', () => {
    const a = [1, 2, 3, 4, 5].map((i) => story(`US-00${i}`, 'Prête'));
    a.push(story('US-006', 'Prête', { data: { status: 'Prête', labels: ['impact-archi'] } }));
    const r = computeNext(a, cfg('evolution'));
    expect(r.secondaires).toHaveLength(3);
    const only = computeNext([story('US-006', 'À faire', { data: { status: 'À faire', labels: ['impact-archi'] } })], cfg('evolution'));
    expect([only.principal, ...only.secondaires].some((x) => x.claude === '/orbith-archi')).toBe(true);
  });
});

describe('frontmatter invalide', () => {
  it('est le problème prioritaire', () => {
    const r = computeNext([story('US-001', 'Prête')], cfg('evolution'), [{ chemin: 'docs/produit/prd.md', message: 'x' }]);
    expect(r.principal.kind).toBe('probleme');
    expect(r.principal.message).toMatch(/Frontmatter invalide dans docs\/produit\/prd\.md/);
  });
});

describe('orbith next (intégration)', () => {
  it('lit le projet, sortie texte compacte avec rappel', async () => {
    const root = await makeProject('evolution');
    roots.push(root);
    const body = `# Ma US\n\n${GHERKIN}`;
    await put(root, 'backlog/tasks/us-001 - Ma US.md', `---\ntype: story\nid: US-001\nstatut: validé\nstatus: Prête\n---\n${body}`);
    await recordValidation(root, { fichier: 'backlog/tasks/us-001 - Ma US.md', sha256: hashBody(body.replace(/^/, '\n')), par: 'a', email: 'a@a', le: new Date().toISOString() });
    const arts = await scanArtifacts(root);
    expect(arts[0]?.etat).toBe('validé');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runNext(root, 'texte');
    const out = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain('/orbith-dev US-001');
    expect(out).toContain('NOUVELLE session');
    expect(out.split('\n').length).toBeLessThanOrEqual(15);
  });
  it('format json', async () => {
    const root = await makeProject('correctif');
    roots.push(root);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runNext(root, 'json');
    const json = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(json.principal.claude).toBe('/orbith-po');
    expect(json.piste).toBe('correctif');
  });
});

describe('agent DevOps (piste projet)', () => {
  const base = (): Artifact[] => [art('brief'), art('prd'), art('ux'), art('architecture'), art('epic'), story('US-001', 'Prête')];
  it('sans environnements : suggère l’agent DevOps', () => {
    const r = computeNext(base(), cfg('projet'));
    expect([r.principal, ...r.secondaires].some((a) => a.claude === '/orbith-devops')).toBe(true);
  });
  it('environnements non validés : demande la validation, puis plus rien une fois validés', () => {
    const a = [...base(), art('environnements', { etat: 'non-validé' })];
    const r = computeNext(a, cfg('projet'));
    expect([r.principal, ...r.secondaires].some((x) => x.cli?.includes('valider'))).toBe(true);
    a[a.length - 1] = art('environnements');
    const all = [computeNext(a, cfg('projet')).principal, ...computeNext(a, cfg('projet')).secondaires];
    expect(all.some((x) => x.claude === '/orbith-devops' || x.message.includes('environnements'))).toBe(false);
  });
});
