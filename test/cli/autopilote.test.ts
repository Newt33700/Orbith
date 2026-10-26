import { rm } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultConfig, loadConfig, type Artifact, type OrbithConfig } from '../../src/core/index.js';
import { calculerPlan, dorRemplie, runAutopilote } from '../../src/cli/autopilote.js';
import { computeNext } from '../../src/cli/next.js';
import { GHERKIN, makeProject, put } from './helpers.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = 0;
  for (const r of roots.splice(0)) await rm(r, { recursive: true, force: true });
});

const DOR_OK = '\n## Definition of Ready\n\n- [x] Valeur métier claire\n- [x] Validée par le PO\n';
const DOR_KO = '\n## Definition of Ready\n\n- [x] Valeur métier claire\n- [ ] Estimable par l\'équipe\n';

function story(id: string, status: string, data: Record<string, unknown> = {}, over: Partial<Artifact> = {}): Artifact {
  return {
    type: 'story',
    id,
    chemin: `backlog/tasks/${id}.md`,
    etat: 'validé',
    statut: 'validé',
    body: GHERKIN + DOR_OK,
    data: { status, ...data },
    ...over,
  } as Artifact;
}

function cfg(over: Partial<OrbithConfig> = {}): OrbithConfig {
  const c = defaultConfig('x');
  c.finops.prix = { defaut: { entree: 3, sortie: 15 } };
  return { ...c, ...over };
}

const plan = (artifacts: Artifact[], options: Parameters<typeof calculerPlan>[0]['options'] = { cibles: [] }, c = cfg(), erreursCheck: string[] = []) =>
  calculerPlan({ artifacts, config: c, options, erreursCheck });

describe('dorRemplie', () => {
  it('exige une section DoR avec toutes les cases cochées', () => {
    expect(dorRemplie(DOR_OK)).toBe(true);
    expect(dorRemplie(DOR_KO)).toBe(false);
    expect(dorRemplie(GHERKIN)).toBe(false);
    expect(dorRemplie('## Definition of Ready\n\nrien\n')).toBe(false);
  });
  it('ignore la case « Validée par le PO » (prouvée par le registre, pas par une case)', () => {
    expect(dorRemplie('## Definition of Ready\n\n- [x] Valeur métier claire\n- [ ] **Validée par le PO** : relue\n')).toBe(true);
    expect(dorRemplie('## Definition of Ready\n\n- [ ] Validee par le PO\n')).toBe(false);
  });
});

describe('calculerPlan : éligibilité', () => {
  it('retient seulement les US validées, prêtes, DoR remplie, dépendances terminées', () => {
    const arts = [
      story('US-001', 'Terminée'),
      story('US-002', 'Prête', { dependencies: ['US-001'] }),
      story('US-003', 'Prête', { dependencies: ['US-004'] }),
      story('US-004', 'À faire'),
      story('US-005', 'Prête', {}, { etat: 'non-validé' }),
      story('US-006', 'Prête', {}, { body: GHERKIN + DOR_KO }),
      story('US-007', 'Prête', { dependencies: ['US-999'] }),
      story('US-008', 'Prête', { labels: ['impact-archi'] }),
    ];
    const p = plan(arts);
    expect(p.ok).toBe(true);
    expect(p.plan.map((u) => u.id)).toEqual(['US-002']);
    const raison = (id: string) => p.ecartees.find((e) => e.id === id)?.raison ?? '';
    expect(raison('US-003')).toMatch(/dépendance non terminée : US-004/);
    expect(raison('US-004')).toMatch(/À faire/);
    expect(raison('US-005')).toMatch(/pas encore validée/);
    expect(raison('US-006')).toMatch(/Definition of Ready/);
    expect(raison('US-007')).toMatch(/introuvable/);
    expect(raison('US-008')).toMatch(/ADR/);
    expect(p.ecartees.some((e) => e.id === 'US-001')).toBe(false);
  });

  it('une US à impact archi avec un ADR validé qui la cite est éligible', () => {
    const adr = { type: 'adr', chemin: 'docs/architecture/adr/0001.md', etat: 'validé', body: 'Concerne US-008', data: {} } as Artifact;
    expect(plan([story('US-008', 'Prête', { labels: ['impact-archi'] }), adr]).plan.map((u) => u.id)).toEqual(['US-008']);
  });

  it('chaque US du plan enchaîne Dev, QA puis une porte de revue humaine', () => {
    const [u] = plan([story('US-002', 'Prête')]).plan;
    expect(u?.etapes.map((e) => e.etape)).toEqual(['dev', 'qa', 'revue-humaine']);
    expect(u?.etapes[0]?.claude).toBe('/orbith-dev US-002');
    expect(u?.etapes[1]?.gemini).toBe('/orbith:qa US-002');
    expect(u?.etapes[2]?.porte).toBe(true);
  });

  it("ordonne par ordinal, priorité puis numéro, et filtre par epic ou par US", () => {
    const arts = [
      story('US-010', 'Prête', { epic: 'EPIC-001' }),
      story('US-002', 'Prête', { epic: 'EPIC-002' }),
      story('US-003', 'Prête', { epic: 'EPIC-001', priority: 'high' }),
      story('US-009', 'Prête', { epic: 'EPIC-001', ordinal: 1 }),
    ];
    expect(plan(arts, { cibles: [], maxUs: 9 }).plan.map((u) => u.id)).toEqual(['US-009', 'US-003', 'US-002', 'US-010']);
    expect(plan(arts, { cibles: ['epic-001'] }).plan.map((u) => u.id)).toEqual(['US-009', 'US-003', 'US-010']);
    expect(plan(arts, { cibles: ['US-002', 'US-010'] }).plan.map((u) => u.id)).toEqual(['US-002', 'US-010']);
  });
});

describe('calculerPlan : bornes', () => {
  const quatre = () => ['US-001', 'US-002', 'US-003', 'US-004'].map((id) => story(id, 'Prête'));

  it('plafonne à 3 US par défaut, puis à --max-us, puis à autopilote.max_us', () => {
    expect(plan(quatre()).plan).toHaveLength(3);
    expect(plan(quatre()).ecartees.find((e) => e.id === 'US-004')?.raison).toMatch(/plafond/);
    expect(plan(quatre(), { cibles: [], maxUs: '1' }).plan.map((u) => u.id)).toEqual(['US-001']);
    expect(plan(quatre(), { cibles: [] }, cfg({ autopilote: { max_us: 2 } })).plan).toHaveLength(2);
    expect(plan(quatre(), { cibles: [], maxUs: 4 }, cfg({ autopilote: { max_us: 2 } })).plan).toHaveLength(4);
  });

  it('les US déjà en cours ou en revue consomment des places', () => {
    const p = plan([...quatre(), story('US-005', 'En revue'), story('US-006', 'En cours')]);
    expect(p.en_attente).toEqual(['US-005', 'US-006']);
    expect(p.plan.map((u) => u.id)).toEqual(['US-001']);
  });

  it('calcule le consommé du périmètre depuis couts_ia (et finops.prix sans coût)', () => {
    const arts = [
      story('US-001', 'Terminée', { epic: 'EPIC-001', couts_ia: [{ agent: 'dev', cout: 1.5, devise: 'EUR' }, { agent: 'qa', tokens_entree: 1_000_000, tokens_sortie: 0 }] }),
      story('US-002', 'Prête', { epic: 'EPIC-001', couts_ia: [{ agent: 'dev', cout: 9, devise: 'USD' }] }),
      story('US-003', 'Prête', { epic: 'EPIC-002', couts_ia: [{ agent: 'dev', cout: 100 }] }),
    ];
    const p = plan(arts, { cibles: ['EPIC-001'], budget: '10' });
    expect(p.budget.consomme).toBe(4.5);
    expect(p.budget.restant).toBe(5.5);
    expect(p.budget.entrees_ignorees).toBe(1);
    expect(p.budget.cout_moyen_us).toBe(4.5);
    expect(p.plan.map((u) => u.id)).toEqual(['US-002']);
  });

  it('réduit le plan au nombre de US que couvre le budget restant au coût moyen constaté', () => {
    const arts = [story('US-001', 'Terminée', { couts_ia: [{ cout: 2 }] }), ...['US-002', 'US-003', 'US-004'].map((id) => story(id, 'Prête'))];
    const p = plan(arts, { cibles: [], budget: 6.5 });
    expect(p.budget.restant).toBe(4.5);
    expect(p.plan).toHaveLength(2);
    expect(p.avertissements.join(' ')).toMatch(/plan réduit/);
  });
});

describe('calculerPlan : refus', () => {
  it('refuse quand le budget est épuisé', () => {
    const p = plan([story('US-001', 'Prête', { couts_ia: [{ cout: 5 }] })], { cibles: [], budget: '5' });
    expect(p.ok).toBe(false);
    expect(p.refus.join(' ')).toMatch(/Budget épuisé/);
    expect(p.plan).toEqual([]);
  });
  it('refuse quand check est en erreur', () => {
    const p = plan([story('US-001', 'Prête')], { cibles: [] }, cfg(), ['CSR : outil interdit']);
    expect(p.ok).toBe(false);
    expect(p.refus.join(' ')).toMatch(/orbith check/);
  });
  it("refuse quand un document est modifié après validation", () => {
    const prd = { type: 'prd', chemin: 'docs/produit/prd.md', etat: 'modifié', body: '', data: {} } as Artifact;
    const p = plan([story('US-001', 'Prête'), prd]);
    expect(p.ok).toBe(false);
    expect(p.refus.join(' ')).toMatch(/docs\/produit\/prd\.md a été modifié après sa validation/);
  });
  it('refuse une cible inconnue, des bornes invalides, et le plafond déjà atteint', () => {
    expect(plan([story('US-001', 'Prête')], { cibles: ['EPIC-404'] }).refus.join(' ')).toMatch(/Cible inconnue/);
    expect(plan([story('US-001', 'Prête')], { cibles: [], maxUs: '0' }).refus.join(' ')).toMatch(/--max-us/);
    expect(plan([story('US-001', 'Prête')], { cibles: [], budget: 'beaucoup' }).refus.join(' ')).toMatch(/--budget/);
    const plein = plan([story('US-001', 'Prête'), story('US-002', 'En revue')], { cibles: [], maxUs: 1 });
    expect(plein.ok).toBe(false);
    expect(plein.refus.join(' ')).toMatch(/Plafond atteint/);
  });
  it('liste toujours les portes humaines, dont la revue de chaque US et le push', () => {
    const p = plan([story('US-001', 'Prête'), story('US-002', 'Prête')]);
    const txt = p.portes.map((g) => `${g.quand} ${g.action}`).join('\n');
    expect(txt).toMatch(/Après la QA de US-001/);
    expect(txt).toMatch(/Après la QA de US-002/);
    expect(txt).toMatch(/Terminée/);
    expect(txt).toMatch(/ne pousse jamais/);
  });
});

describe('orbith next et autopilote', () => {
  it("suggère l'autopilote seulement à partir de 2 US éligibles", () => {
    const une = computeNext([story('US-001', 'Prête')], cfg());
    const all1 = [une.principal, ...une.secondaires];
    expect(all1.some((a) => a.cli === 'npx orbith autopilote')).toBe(false);
    const deux = computeNext([story('US-001', 'Prête'), story('US-002', 'Prête')], cfg());
    const all2 = [deux.principal, ...deux.secondaires];
    const a = all2.find((x) => x.cli === 'npx orbith autopilote');
    expect(a?.claude).toBe('/orbith-autopilote');
    expect(a?.gemini).toBe('/orbith:autopilote');
    expect(deux.principal.claude).toBe('/orbith-dev US-001');
  });
});

describe('runAutopilote', () => {
  const us = (id: string, statut: string) =>
    `---\nid: ${id}\ntitle: t\nstatus: Prête\ntype: story\nstatut: ${statut}\ndependencies: []\n---\n\n${GHERKIN}${DOR_OK}`;

  it('lit autopilote dans config.yaml, sort un JSON, et code 1 en cas de refus', async () => {
    const root = await makeProject();
    roots.push(root);
    await put(root, '.orbith/config.yaml', 'version: 1\nprojet:\n  nom: demo\nautopilote:\n  max_us: 2\n  budget: 0\n');
    expect((await loadConfig(root)).autopilote).toEqual({ max_us: 2, budget: 0 });
    await put(root, 'backlog/tasks/us-001 - a.md', us('US-001', 'brouillon'));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const p = await runAutopilote(root, [], { format: 'json' });
    const json = JSON.parse(String(log.mock.calls[0]?.[0])) as { ok: boolean; max_us: number };
    expect(json.max_us).toBe(2);
    expect(p.ok).toBe(false);
    expect(p.refus.join(' ')).toMatch(/Budget épuisé/);
    expect(process.exitCode).toBe(1);
  });

  it('affiche le plan en texte, avec les portes humaines', async () => {
    const root = await makeProject();
    roots.push(root);
    await put(root, 'backlog/tasks/us-001 - a.md', us('US-001', 'brouillon'));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const p = await runAutopilote(root, [], {});
    const out = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain('Portes humaines');
    expect(out).toContain('US-001');
    expect(p.plan).toEqual([]);
    await expect(runAutopilote(root, [], { format: 'xml' })).rejects.toThrow(/Format inconnu/);
  });
});
