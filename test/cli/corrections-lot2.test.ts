import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { arg, defaultConfig, OrbithError, storyStatus, type Artifact } from '../../src/core/index.js';
import { runValider } from '../../src/cli/valider.js';
import { runInstall, assurerGitignoreSecrets } from '../../src/cli/install.js';
import { runVersion } from '../../src/cli/version.js';
import { proposerVersion } from '../../src/cli/version-calc.js';
import { runProposition } from '../../src/cli/version-proposition.js';
import { calculerPlan } from '../../src/cli/autopilote.js';
import { computeNext } from '../../src/cli/next.js';
import { evaluerPreparation } from '../../src/cli/preparation.js';
import { consignesInterdites, run as runCheckAgents } from '../../src/checks/agents.js';
import { run as runCheckCsr } from '../../src/checks/csr.js';
import { scanArtifacts } from '../../src/core/index.js';
import { GHERKIN, commit, makeProject, put } from './helpers.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = 0;
  for (const r of roots.splice(0)) await rm(r, { recursive: true, force: true });
});
async function tmp(): Promise<string> {
  const r = await mkdtemp(path.join(os.tmpdir(), 'orbith-lot2-'));
  roots.push(r);
  return r;
}

const DOR_OK = '\n## Definition of Ready\n\n- [x] Valeur métier claire\n';
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
const cfg = () => {
  const c = defaultConfig('x');
  c.finops.prix = { defaut: { entree: 3, sortie: 15 } };
  return c;
};

describe('défaut 4 : valider en terminal non interactif', () => {
  it("ne suggère plus --yes : seul un humain valide, dans son terminal", async () => {
    const root = await makeProject('evolution', true);
    roots.push(root);
    await put(root, 'docs/produit/prd.md', '---\ntype: prd\nstatut: brouillon\n---\n# PRD\n');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = await runValider('docs/produit/prd.md', { cwd: root }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OrbithError);
    const msg = (err as Error).message;
    expect(msg).toMatch(/agent IA, arrête-toi : seul un humain valide/);
    expect(msg).toMatch(/dans ton terminal/);
    expect(msg).not.toMatch(/--yes/);
  });
});

describe('défauts 7, 8, 9, 27 : autopilote', () => {
  it('9 : le plafond compte les US en cours/en revue de tout le projet, pas seulement du périmètre', () => {
    const arts = [story('US-002', 'En revue'), story('US-003', 'Prête')];
    const p = calculerPlan({ artifacts: arts, config: cfg(), options: { cibles: ['US-003'], maxUs: 1 } });
    expect(p.ok).toBe(false);
    expect(p.en_attente).toEqual(['US-002']);
    expect(p.refus.join(' ')).toMatch(/Plafond atteint : 1 US du projet/);
    // Avec une place de plus, la cible est retenue.
    const q = calculerPlan({ artifacts: arts, config: cfg(), options: { cibles: ['US-003'], maxUs: 2 } });
    expect(q.plan.map((u) => u.id)).toEqual(['US-003']);
  });

  it('9 : le budget reste par périmètre et le total du projet est exposé', () => {
    const cout = (c: number) => ({ couts_ia: [{ agent: 'dev', cout: c, devise: 'EUR' }] });
    const arts = [story('US-002', 'En revue', cout(1)), story('US-003', 'Prête', cout(0.5))];
    const p = calculerPlan({ artifacts: arts, config: cfg(), options: { cibles: ['US-003'], budget: '10' } });
    expect(p.budget.consomme).toBe(0.5);
    expect(p.budget.consomme_projet).toBe(1.5);
  });

  it('27 : montants avec la virgule décimale dans les refus', () => {
    const arts = [story('US-003', 'Prête', { couts_ia: [{ agent: 'dev', cout: 0.67, devise: 'EUR' }] })];
    const p = calculerPlan({ artifacts: arts, config: cfg(), options: { cibles: [], budget: '0,5' } });
    expect(p.refus.join(' ')).toMatch(/Budget épuisé : 0,67 EUR déjà consommés pour un plafond de 0,5 EUR/);
    expect(p.refus.join(' ')).not.toMatch(/0\.67/);
  });

  it("7 et 8 : le workflow exige un oui après le plan et reprend --max-us/--budget", async () => {
    const wf = await readFile(path.join(process.cwd(), 'content/workflows/autopilote.md'), 'utf8');
    expect(wf).toMatch(/\[--max-us N\] \[--budget M\] --format json/);
    expect(wf).toMatch(/donné \*\*après\*\* l'affichage du plan/);
    expect(wf).toMatch(/d'avance/);
  });

  it('25 : une US Abandonnée est ignorée par le plan', () => {
    const p = calculerPlan({ artifacts: [story('US-004', 'Abandonnée'), story('US-005', 'Prête')], config: cfg(), options: { cibles: [] } });
    expect(p.plan.map((u) => u.id)).toEqual(['US-005']);
    expect(p.ecartees.some((e) => e.id === 'US-004')).toBe(false);
  });
});

describe('défaut 25 : statut Abandonnée', () => {
  it('est reconnu avec ses alias, et next ne propose plus de la valider', () => {
    for (const v of ['Abandonnée', 'abandonnee', 'abandoned']) {
      expect(storyStatus({ data: { status: v } })).toBe('Abandonnée');
    }
    const s = story('US-004', 'Abandonnée', {}, { etat: 'non-validé', statut: 'brouillon' });
    const r = computeNext([s], { ...defaultConfig('x'), piste: 'evolution' });
    expect(r.principal.message).not.toMatch(/US-004/);
    expect(r.principal.cli ?? '').not.toMatch(/valider/);
  });
});

describe('défaut 10 : .env dans le .gitignore', () => {
  it('ajoute les fichiers sensibles à un .gitignore existant, sans écraser, de façon idempotente', async () => {
    const root = await tmp();
    await writeFile(path.join(root, '.gitignore'), 'node_modules/\n.env\n');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await runInstall({ cwd: root, yes: true, nom: 'demo' });
    const g1 = await readFile(path.join(root, '.gitignore'), 'utf8');
    expect(g1.startsWith('node_modules/\n.env\n')).toBe(true);
    for (const l of ['.env.*', '!.env.example', '*.pem', '*.key', 'secrets/', '# orbith:debut', '# orbith:fin']) {
      expect(g1.split('\n')).toContain(l);
    }
    expect(g1.split('\n').filter((l) => l === '.env')).toHaveLength(1);
    await runInstall({ cwd: root, yes: true, nom: 'demo' });
    expect(await readFile(path.join(root, '.gitignore'), 'utf8')).toBe(g1);
  });

  it('crée le .gitignore s\'il manque', async () => {
    const root = await tmp();
    await writeFile(path.join(root, 'package.json'), '{}');
    expect(await assurerGitignoreSecrets(root)).not.toBeNull();
    const g = await readFile(path.join(root, '.gitignore'), 'utf8');
    expect(g).toContain('.env\n');
    expect(g).toContain('secrets/');
  });

  it('un nouveau projet (squelette déjà complet) ne reçoit pas de doublon', async () => {
    const root = await tmp();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await runInstall({ cwd: root, yes: true, nom: 'neuf' });
    const g = await readFile(path.join(root, '.gitignore'), 'utf8');
    expect(g).not.toContain('# orbith:debut');
    expect(g.split('\n').filter((l) => l === '.env')).toHaveLength(1);
  });
});

describe('défauts 12 : orbith version', () => {
  const us = (id: string, status: string) =>
    `---\ntype: story\nid: ${id}\ntitle: Titre ${id}\nstatut: brouillon\nstatus: ${status}\n---\n# ${id}\n\n${GHERKIN}`;

  async function fixture(): Promise<string> {
    const root = await makeProject('evolution', true);
    roots.push(root);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await put(root, 'backlog/tasks/us-001.md', us('US-001', 'Terminée'));
    await put(root, 'backlog/tasks/us-003.md', us('US-003', 'En cours'));
    commit(root, 'feat(US-001): première fonctionnalité');
    commit(root, 'docs: DoR US-002, ajoute US-003');
    commit(root, 'chore: revalide US-002, valide US-003');
    return root;
  }

  it('ne compte pas une US seulement citée par un commit docs/chore', async () => {
    const root = await fixture();
    const r = await runVersion('1.0.0.0', { cwd: root });
    expect(r.version.us).toEqual(['US-001']);
    const p = await proposerVersion(root, await scanArtifacts(root));
    expect(p.stories.map((s) => s.id)).toEqual(['US-001']);
  });

  it('conseille version <numéro> puis release', async () => {
    const root = await fixture();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runProposition({ cwd: root });
    const out = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toMatch(/npx orbith version 0\.1\.0\.0/);
    expect(out).toMatch(/npx orbith release 0\.1\.0\.0/);
    expect(out.indexOf('orbith version 0.1.0.0')).toBeLessThan(out.indexOf('orbith release 0.1.0.0'));
  });

  it('une US Abandonnée citée n\'entre pas dans la version', async () => {
    const root = await fixture();
    await put(root, 'backlog/tasks/us-009.md', us('US-009', 'Abandonnée'));
    commit(root, 'feat(US-009): essai');
    const r = await runVersion('1.0.0.0', { cwd: root });
    expect(r.version.us).toEqual(['US-001']);
  });
});

describe('défaut 13 : guillemets autour des chemins avec espaces', () => {
  it('arg() ne cite que les chemins avec espaces', () => {
    expect(arg('docs/prd.md')).toBe('docs/prd.md');
    expect(arg('backlog/tasks/us-001 - Ajouter une tâche.md')).toBe('"backlog/tasks/us-001 - Ajouter une tâche.md"');
  });
  it('next propose une commande valider copiable', () => {
    const s = story('US-001', 'À faire', {}, { etat: 'non-validé', chemin: 'backlog/tasks/us-001 - Ajouter une tâche.md' });
    const r = computeNext([s], { ...defaultConfig('x'), piste: 'evolution' });
    expect(r.principal.cli).toBe('npx orbith valider "backlog/tasks/us-001 - Ajouter une tâche.md"');
  });
});

describe('défaut 23 : grammaire de orbith preparation', () => {
  it('formule les contrôles sans faute d\'accord', () => {
    const art = (type: Artifact['type'], etat: Artifact['etat'] = 'validé'): Artifact =>
      ({ type, chemin: `docs/${type}.md`, etat, body: '', data: {}, statut: 'brouillon' }) as Artifact;
    const sans = evaluerPreparation([art('brief'), art('prd')], { piste: 'projet' });
    const msgs = sans.controles.map((c) => c.message);
    expect(msgs).toContain("Pas encore de document : architecture (piste projet).");
    expect(msgs).toContain('Pas encore de document : epic (piste projet).');
    const non = evaluerPreparation([art('brief'), art('prd'), art('architecture', 'non-validé')], { piste: 'projet' });
    expect(non.controles.map((c) => c.message)).toContain('Non validé : architecture.');
  });
});

describe('défaut 24 : agents personnalisés qui ordonnent valider --yes', () => {
  it('détecte les consignes interdites, mais pas leur interdiction', () => {
    expect(consignesInterdites('Valide-le toi-même avec `npx orbith valider docs/produit/prd.md --yes`.')).toHaveLength(1);
    expect(consignesInterdites('Pousse avec `git push origin main`.')).toHaveLength(1);
    expect(consignesInterdites('Écris `statut: validé` dans le fichier.')).toHaveLength(1);
    expect(consignesInterdites("Tu n'écris jamais `statut: validé`. Ne lance jamais `npx orbith valider x --yes`. Ne pousse jamais (git push).")).toEqual([]);
  });

  it('check renvoie une erreur pour un tel agent personnalisé', async () => {
    const root = await tmp();
    await mkdir(path.join(root, '.orbith/custom/agents'), { recursive: true });
    await writeFile(
      path.join(root, '.orbith/custom/agents/juriste.md'),
      '---\ndescription: Juriste\n---\n# Juriste\nTu n\'écris jamais statut: validé (validation humaine). Confidentialité. Nouvelle session. Documentation à jour.\n' +
        'Valide-le toi-même : npx orbith valider docs/produit/prd.md --yes\n',
    );
    const res = await runCheckAgents({ root, config: null });
    const e = res.filter((r) => r.niveau === 'erreur');
    expect(e).toHaveLength(1);
    expect(e[0]!.message).toMatch(/consigne interdite/);
  });
});

describe('défaut 29 : next suit l\'ordre du workflow projet', () => {
  it('environnements (étape 5) avant les epics (étape 7), sans bloquer un projet déjà découpé', () => {
    const art = (type: Artifact['type'], etat: Artifact['etat'] = 'validé'): Artifact =>
      ({ type, chemin: `docs/${type}.md`, etat, body: '', data: {}, statut: 'validé' }) as Artifact;
    const base = [art('brief'), art('prd'), art('ux'), art('architecture')];
    const c = { ...defaultConfig('x'), piste: 'projet' as const };
    expect(computeNext(base, c).principal.claude).toBe('/orbith-devops');
    expect(computeNext([...base, art('environnements')], c).principal.claude).toBe('/orbith-po');
    // Rétrocompatible : un epic existe déjà, l'absence d'environnements ne bloque pas.
    expect(computeNext([...base, art('epic')], c).principal.claude).not.toBe('/orbith-devops');
  });
});

describe('défaut 31 : CSR d\'exemple après l\'installation', () => {
  it('check ne signale plus d\'erreur CSR sur un projet neuf, et dit que le CSR est l\'exemple', async () => {
    const root = await tmp();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await runInstall({ cwd: root, yes: true, nom: 'neuf' });
    const res = await runCheckCsr({ root, config: await (await import('../../src/core/index.js')).loadConfig(root) });
    expect(res.filter((r) => r.niveau === 'erreur')).toEqual([]);
    expect(res.some((r) => r.niveau === 'info' && /encore l'exemple/.test(r.message))).toBe(true);
  });

  it('un vrai CSR garde ses contrôles : outil obligatoire absent = erreur', async () => {
    const root = await tmp();
    await mkdir(path.join(root, '.orbith/csr'), { recursive: true });
    await writeFile(path.join(root, '.orbith/csr/CSR.md'), '## Outils\n| Outil | Version min | Statut | Commentaire |\n|---|---|---|---|\n| GitLab CI | | obligatoire | |\n');
    const res = await runCheckCsr({ root, config: null });
    expect(res.some((r) => r.niveau === 'erreur' && /GitLab CI est obligatoire/.test(r.message))).toBe(true);
    expect(res.some((r) => /encore l'exemple/.test(r.message))).toBe(false);
  });
});
