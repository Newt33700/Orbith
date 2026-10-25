import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultConfig, type Artifact, type Piste } from '../../src/core/index.js';
import { adapters } from '../../src/adapters/index.js';
import { geminiMdBlock } from '../../src/adapters/gemini/index.js';
import { computeNext } from '../../src/cli/next.js';
import { evaluerPreparation, runPreparation } from '../../src/cli/preparation.js';
import { detect, runInitContext, renderDetection } from '../../src/cli/init-context.js';
import { GHERKIN, makeProject, put } from './helpers.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = 0;
  for (const r of roots.splice(0)) await rm(r, { recursive: true, force: true });
});

function art(type: Artifact['type'], over: Partial<Artifact> & { data?: Record<string, unknown> } = {}): Artifact {
  return { type, chemin: `docs/${type}.md`, etat: 'validé', body: '', data: {}, statut: 'validé', ...over } as Artifact;
}
const story = (id: string, status: string, data: Record<string, unknown> = {}, over: Partial<Artifact> = {}) =>
  art('story', { id, chemin: `backlog/tasks/${id}.md`, body: GHERKIN, data: { status, ...data }, ...over });
const epic = (id: string) => art('epic', { id, chemin: `docs/produit/epics/${id}.md` });
const prep = (arts: Artifact[], piste: Piste = 'projet') => evaluerPreparation(arts, { piste });
const complet = (): Artifact[] => [
  art('brief'), art('prd'), art('ux'), art('architecture'), epic('EPIC-001'),
  story('US-001', 'Prête', { epic: 'EPIC-001' }),
];

describe('evaluerPreparation', () => {
  it('PASS quand tout est cohérent', () => {
    expect(prep(complet()).verdict).toBe('PASS');
  });
  it('FAIL en projet quand le PRD manque ou n\'est pas validé', () => {
    const sans = complet().filter((a) => a.type !== 'prd');
    expect(prep(sans).verdict).toBe('FAIL');
    const brouillon = complet().map((a) => (a.type === 'prd' ? { ...a, etat: 'non-validé' as const } : a));
    expect(prep(brouillon).verdict).toBe('FAIL');
  });
  it('hors piste projet, les documents de cadrage ne sont pas exigés', () => {
    expect(prep([story('US-001', 'Prête')], 'evolution').verdict).toBe('PASS');
  });
  it('FAIL sans aucune US', () => {
    expect(prep([], 'evolution').verdict).toBe('FAIL');
  });
  it('CONCERNS pour un epic sans US', () => {
    const r = prep([...complet(), epic('EPIC-002')]);
    expect(r.verdict).toBe('CONCERNS');
    expect(r.controles.some((c) => /EPIC-002/.test(c.message))).toBe(true);
  });
  it('FAIL pour une US rattachée à un epic inexistant', () => {
    const r = prep([...complet(), story('US-002', 'À faire', { epic: 'EPIC-099' })]);
    expect(r.verdict).toBe('FAIL');
  });
  it('FAIL pour une US ouverte sans Gherkin', () => {
    const r = prep([story('US-001', 'Prête', {}, { body: 'rien' })], 'evolution');
    expect(r.verdict).toBe('FAIL');
  });
  it('FAIL pour une dépendance inexistante ou circulaire', () => {
    expect(prep([story('US-001', 'Prête', { dependencies: ['US-404'] })], 'evolution').verdict).toBe('FAIL');
    const cyc = prep([story('US-001', 'Prête', { dependencies: ['US-002'] }), story('US-002', 'Prête', { dependencies: ['US-001'] })], 'evolution');
    expect(cyc.verdict).toBe('FAIL');
    expect(cyc.controles.some((c) => /circulaires/.test(c.message))).toBe(true);
  });
  it('FAIL pour impact-archi sans ADR validé, PASS avec ADR qui la cite', () => {
    const s = story('US-001', 'Prête', { labels: ['impact-archi'] });
    expect(prep([s], 'evolution').verdict).toBe('FAIL');
    const adr = art('adr', { id: 'ADR-001', body: 'Décision pour US-001' });
    expect(prep([s, adr], 'evolution').verdict).toBe('PASS');
  });
  it('FAIL pour un document modifié après validation', () => {
    const arts = complet().map((a) => (a.type === 'brief' ? { ...a, etat: 'modifié' as const } : a));
    expect(prep(arts).verdict).toBe('FAIL');
  });
  it('CONCERNS quand le contexte projet reste à compléter', () => {
    const r = evaluerPreparation(complet(), { piste: 'projet' }, [], 'a-completer');
    expect(r.verdict).toBe('CONCERNS');
  });
});

describe('orbith next et préparation', () => {
  it('suggère la préparation avant le premier développement seulement', () => {
    const avant = computeNext([story('US-001', 'Prête')], { ...defaultConfig('x'), piste: 'evolution' });
    expect(avant.principal.claude).toBe('/orbith-dev US-001');
    expect(avant.secondaires.some((a) => a.cli === 'npx orbith preparation')).toBe(true);
    const apres = computeNext([story('US-001', 'Terminée'), story('US-002', 'Prête')], { ...defaultConfig('x'), piste: 'evolution' });
    expect(apres.secondaires.some((a) => a.cli === 'npx orbith preparation')).toBe(false);
  });
});

describe('runPreparation', () => {
  it('code de sortie 1 en cas de FAIL, 0 sinon', async () => {
    const root = await makeProject('evolution');
    roots.push(root);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const r = await runPreparation(root, 'json');
    expect(r.verdict).toBe('FAIL');
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
    await put(root, 'backlog/tasks/us-001 - a.md', `---\nid: US-001\ntype: story\nstatus: Prête\nstatut: brouillon\n---\n${GHERKIN}`);
    const r2 = await runPreparation(root, 'texte');
    expect(r2.verdict).not.toBe('FAIL');
    expect(process.exitCode ?? 0).toBe(0);
  });
});

describe('contexte projet', () => {
  it('le bloc GEMINI.md / CLAUDE.md référence le contexte et le fichier est créé sans être écrasé', async () => {
    expect(geminiMdBlock(defaultConfig('x'))).toContain('@.orbith/contexte-projet.md');
    const root = await makeProject();
    roots.push(root);
    await adapters.claude.generate(root, defaultConfig('x'));
    const file = path.join(root, '.orbith', 'contexte-projet.md');
    expect(await readFile(file, 'utf8')).toContain('orbith:a-completer');
    await put(root, '.orbith/contexte-projet.md', 'mon contexte');
    await adapters.gemini.generate(root, defaultConfig('x'));
    expect(await readFile(file, 'utf8')).toBe('mon contexte');
  });

  it('init-context détecte la stack et préserve le texte écrit à la main', async () => {
    const root = await makeProject();
    roots.push(root);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await put(root, 'package.json', JSON.stringify({ scripts: { test: 'vitest run' }, devDependencies: { vitest: '^2', typescript: '^5' } }));
    await put(root, 'package-lock.json', '{}');
    await put(root, 'src/index.ts', 'export {}');
    const d = await detect(root);
    expect(d.stack).toContain('TypeScript');
    expect(d.tests).toContain('vitest');
    expect(d.outils).toContain('npm');
    expect(d.arborescence).toContain('src/');
    expect(renderDetection(d)).toContain('`test` : `vitest run`');

    await runInitContext(root);
    const file = path.join(root, '.orbith', 'contexte-projet.md');
    const first = await readFile(file, 'utf8');
    expect(first).toContain('vitest');
    await put(root, '.orbith/contexte-projet.md', first.replace('## Pièges connus', '## Pièges connus\n\n- Ne pas toucher à legacy/'));
    await runInitContext(root);
    const second = await readFile(file, 'utf8');
    expect(second).toContain('Ne pas toucher à legacy/');
    expect(second.match(/orbith:auto-debut/g)).toHaveLength(1);
    expect(await readFile(file, 'utf8')).toBe(second);
  });
});
