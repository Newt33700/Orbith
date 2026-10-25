import { execFileSync } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runValider } from '../../src/cli/valider.js';
import { dateTerminee, loadDeploiements, runDeploiement } from '../../src/cli/deploiement.js';
import { renderMetriques, runMetriques } from '../../src/cli/metriques.js';
import { calculerMetriques } from '../../src/cli/metriques-calc.js';
import { readDoc, scanArtifacts, type Artifact } from '../../src/core/index.js';
import { GHERKIN, commit, makeProject, put } from './helpers.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const r of roots.splice(0)) await rm(r, { recursive: true, force: true });
});

const COUTS = 'couts_ia:\n  - { date: 2026-10-01, agent: dev, cout: 0.5, source: estimé }\n  - { date: 2026-10-02, agent: qa, cout: 0.25, source: estimé }\n';

async function fixture(): Promise<string> {
  const root = await makeProject('evolution', true);
  roots.push(root);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  await put(root, 'backlog/tasks/us-001 - Connexion.md', `---\ntype: story\nid: US-001\ntitle: Connexion\nstatut: brouillon\nstatus: Terminée\ncreated_date: 2026-09-01\nupdated_date: 2026-09-05\n${COUTS}---\n# Connexion\n\n${GHERKIN}`);
  await runValider('backlog/tasks/us-001 - Connexion.md', { cwd: root, yes: true });
  commit(root, 'feat(US-001): login');
  await put(root, 'docs/livraisons/release-notes-1.0.0.md', '---\ntype: release-notes\nstatut: brouillon\nversion: 1.0.0\n---\n# 1.0.0\n\n- US-001 connexion\n');
  return root;
}

describe('orbith deploiement', () => {
  it('refuse des notes de version non validées', async () => {
    const root = await fixture();
    await expect(runDeploiement('1.0.0', { cwd: root, yes: true })).rejects.toThrow(/pas validées/);
  });

  it('enregistre la mise en prod, date les US sans casser leur validation, idempotent', async () => {
    const root = await fixture();
    await runValider('docs/livraisons/release-notes-1.0.0.md', { cwd: root, yes: true });
    const dep = await runDeploiement('1.0.0', { cwd: root, yes: true, date: '2026-10-20' });
    expect(dep?.us).toEqual(['US-001']);
    const us = await readDoc(path.join(root, 'backlog/tasks/us-001 - Connexion.md'));
    expect(us.data['mis_en_prod_le']).toBe('2026-10-20');
    expect(us.data['debut_dev_le']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(us.data['created_date']).toBe('2026-09-01');
    const story = (await scanArtifacts(root)).find((a) => a.id === 'US-001');
    expect(story?.etat).toBe('validé');
    const notes = await readDoc(path.join(root, 'docs/livraisons/release-notes-1.0.0.md'));
    expect(notes.data['mis_en_prod_le']).toBe('2026-10-20');
    await runDeploiement('1.0.0', { cwd: root, yes: true, date: '2026-10-21' });
    expect(await loadDeploiements(root)).toHaveLength(1);
    expect(JSON.parse(await readFile(path.join(root, '.orbith/deploiements.json'), 'utf8')).deploiements[0].par).toBe('Jane Doe');
  });

  it('un autre environnement est enregistré sans dater les US', async () => {
    const root = await fixture();
    await runValider('docs/livraisons/release-notes-1.0.0.md', { cwd: root, yes: true });
    await runDeploiement('1.0.0', { cwd: root, yes: true, env: 'recette', date: '2026-10-10' });
    const us = await readDoc(path.join(root, 'backlog/tasks/us-001 - Connexion.md'));
    expect(us.data['mis_en_prod_le']).toBeUndefined();
    expect((await loadDeploiements(root))[0]?.env).toBe('recette');
  });

  it('date invalide refusée', async () => {
    const root = await fixture();
    await expect(runDeploiement('1.0.0', { cwd: root, yes: true, date: '20/10/2026' })).rejects.toThrow(/Date invalide/);
  });
});

function story(id: string, data: Record<string, unknown>): Artifact {
  return { type: 'story', id, chemin: `backlog/tasks/${id}.md`, titre: id, etat: 'validé', body: '', data } as Artifact;
}

describe('calculerMetriques', () => {
  it('calcule les quatre indicateurs DORA et les coûts IA', () => {
    const arts = [
      story('US-1', { debut_dev_le: '2026-10-01', mis_en_prod_le: '2026-10-03', couts_ia: [{ agent: 'dev', cout: 1.2 }, { agent: 'qa', cout: 0.3 }] }),
      story('US-2', { mis_en_prod_le: '2026-10-10' }),
      story('US-12', { debut_dev_le: '2026-10-08', mis_en_prod_le: '2026-10-10' }),
      story('BUG-1', { labels: ['bug'], origine: 'production', cause: 'US-1', detecte_le: '2026-10-04', mis_en_prod_le: '2026-10-05' }),
    ];
    const deps = [
      { version: '1.0', env: 'production', date: '2026-10-03', par: 'x', email: 'x', us: ['US-1'] },
      { version: '1.1', env: 'production', date: '2026-10-10', par: 'x', email: 'x', us: ['US-2', 'US-12'] },
      { version: '1.1', env: 'recette', date: '2026-10-09', par: 'x', email: 'x', us: ['US-2'] },
    ];
    const m = calculerMetriques(arts, deps, new Map([['US-2', '2026-10-06']]), { jours: 28, aujourdhui: '2026-10-25', devise: 'EUR' });
    expect(m.frequence.deploiements).toBe(2);
    expect(m.frequence.parSemaine).toBe(0.5);
    expect(m.frequence.niveau).toBe('moyen');
    // US-1 : 2 j, US-2 : 4 j (premier commit), US-12 : 2 j → médiane 2 j ; le bug n'est pas compté.
    expect(m.leadTime).toMatchObject({ medianeJours: 2, us: 3, niveau: 'élevé' });
    // Le bug cause US-1 → 1 déploiement sur 2 en échec ; US-12 n'est pas confondue avec US-1.
    expect(m.tauxEchec).toMatchObject({ pourcentage: 50, deploiementsEnEchec: 1, niveau: 'faible' });
    expect(m.retablissement).toMatchObject({ medianeHeures: 24, incidents: 1, niveau: 'moyen' });
    expect(m.couts.total).toBe(1.5);
    expect(m.couts.parAgent).toEqual({ dev: 1.2, qa: 0.3 });
    expect(m.us.find((u) => u.id === 'US-2')?.debutDev).toBe('2026-10-06');
  });

  it('sans données : aucune valeur inventée', () => {
    const m = calculerMetriques([story('US-1', {})], [], new Map(), { jours: 90, aujourdhui: '2026-10-25', devise: 'EUR' });
    expect(m.frequence.niveau).toBeNull();
    expect(m.leadTime.medianeJours).toBeNull();
    expect(m.tauxEchec.pourcentage).toBeNull();
    expect(m.retablissement.medianeHeures).toBeNull();
  });
});

describe('orbith metriques', () => {
  it('rapport texte et json après un déploiement', async () => {
    const root = await fixture();
    await runValider('docs/livraisons/release-notes-1.0.0.md', { cwd: root, yes: true });
    const today = new Date().toISOString().slice(0, 10);
    await runDeploiement('1.0.0', { cwd: root, yes: true });
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const m = await runMetriques({ cwd: root, aujourdhui: today });
    const out = String(write.mock.calls.map((c) => c[0]).join(''));
    expect(m.frequence.deploiements).toBe(1);
    expect(m.couts.total).toBe(0.75);
    expect(out).toContain('Fréquence de déploiement');
    expect(out).toMatch(/\| US-001 \| US \| Terminée \| 2026-09-01 \| 2026-09-05 \|/);
    await runMetriques({ cwd: root, format: 'json', sortie: 'out/m.json' });
    expect(JSON.parse(await readFile(path.join(root, 'out/m.json'), 'utf8')).us[0].id).toBe('US-001');
    await expect(runMetriques({ cwd: root, jours: 'abc' })).rejects.toThrow(/Période invalide/);
  });
});

function commitAt(root: string, msg: string, date: string): void {
  const env = { ...process.env, GIT_AUTHOR_DATE: `${date}T10:00:00Z`, GIT_COMMITTER_DATE: `${date}T10:00:00Z` };
  execFileSync('git', ['add', '-A'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['commit', '-q', '-m', msg], { cwd: root, stdio: 'ignore', env });
}

describe('termine_le (passage en « Terminée »)', () => {
  it('daté par le commit qui déplace la carte, puis écrit dans la US à la mise en prod', async () => {
    const root = await makeProject('evolution', true);
    roots.push(root);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const us = 'backlog/tasks/us-001 - Connexion.md';
    const fm = (status: string) => `---\ntype: story\nid: US-001\ntitle: Connexion\nstatut: brouillon\nstatus: ${status}\n---\n# Connexion\n\n${GHERKIN}`;
    await put(root, us, fm('En cours'));
    commitAt(root, 'feat(US-001): login', '2026-10-01');
    let s = (await scanArtifacts(root)).find((a) => a.id === 'US-001')!;
    expect(await dateTerminee(root, s)).toBeUndefined();
    // Déplacement de carte (Backlog.md) puis commit : seul le status change.
    await put(root, us, fm('Terminée'));
    commitAt(root, 'chore: US-001 terminée', '2026-10-04');
    await put(root, us, fm('Terminée').replace('# Connexion', '# Connexion par email'));
    commitAt(root, 'docs: titre', '2026-10-06');
    s = (await scanArtifacts(root)).find((a) => a.id === 'US-001')!;
    expect(await dateTerminee(root, s)).toBe('2026-10-04');

    await runValider(us, { cwd: root, yes: true });
    await put(root, 'docs/livraisons/release-notes-1.0.0.md', '---\ntype: release-notes\nstatut: brouillon\nversion: 1.0.0\n---\n# 1.0.0\n\n- US-001\n');
    await runValider('docs/livraisons/release-notes-1.0.0.md', { cwd: root, yes: true });
    await runDeploiement('1.0.0', { cwd: root, yes: true, date: '2026-10-09' });
    const doc = await readDoc(path.join(root, us));
    expect(doc.data).toMatchObject({ debut_dev_le: '2026-10-01', termine_le: '2026-10-04', mis_en_prod_le: '2026-10-09' });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const m = await runMetriques({ cwd: root, aujourdhui: '2026-10-25' });
    expect(m.attente).toEqual({ medianeJours: 5, us: 1 });
    expect(m.leadTime.medianeJours).toBe(8);
  });

  it('calcul de l’attente avec les dates fournies par Git', () => {
    const arts = [story('US-1', { status: 'Terminée', debut_dev_le: '2026-10-01', mis_en_prod_le: '2026-10-10' })];
    const deps = [{ version: '1', env: 'production', date: '2026-10-10', par: 'x', email: 'x', us: ['US-1'] }];
    const m = calculerMetriques(arts, deps, new Map(), { jours: 30, aujourdhui: '2026-10-25', devise: 'EUR', terminees: new Map([['US-1', '2026-10-07']]) });
    expect(m.attente).toEqual({ medianeJours: 3, us: 1 });
    expect(m.us[0]?.terminee).toBe('2026-10-07');
  });
});

describe('DORA enrichi', () => {
  const dep = (version: string, env: string, date: string, us: string[]) => ({ version, env, date, par: 'x', email: 'x', us });
  const base = { jours: 30, aujourdhui: '2026-10-25', devise: 'EUR' };

  it('tendances : période courante vs précédente, flèche et écart', () => {
    const arts = [
      story('US-1', { debut_dev_le: '2026-09-20', mis_en_prod_le: '2026-10-10' }),
      story('US-2', { debut_dev_le: '2026-08-25', mis_en_prod_le: '2026-09-01' }),
    ];
    const deps = [dep('1', 'production', '2026-10-10', ['US-1']), dep('0', 'production', '2026-09-01', ['US-2'])];
    const m = calculerMetriques(arts, deps, new Map(), base);
    expect(m.precedent).toEqual({ debut: '2026-08-25', fin: '2026-09-24' });
    const delai = m.tendances.find((t) => t.cle === 'delai')!;
    expect(delai).toMatchObject({ valeur: 20, precedent: 7, ecart: 13, fleche: '↑', favorable: false });
    // Aucun bug corrigé : rétablissement non mesurable des deux côtés, pas 0.
    expect(m.tendances.find((t) => t.cle === 'retablissement')).toMatchObject({ valeur: null, ecart: null, fleche: null });
  });

  it('cibles : atteinte, non atteinte, non mesurable ; absentes par défaut', () => {
    const arts = [story('US-1', { debut_dev_le: '2026-10-01', mis_en_prod_le: '2026-10-11' })];
    const deps = [dep('1', 'production', '2026-10-11', ['US-1'])];
    expect(calculerMetriques(arts, deps, new Map(), base).cibles).toBeUndefined();
    const m = calculerMetriques(arts, deps, new Map(), {
      ...base,
      cibles: { delai_jours: 7, frequence_par_semaine: 0.2, retablissement_heures: 24 },
    });
    expect(m.cibles?.map((c) => [c.cle, c.atteinte])).toEqual([
      ['frequence', true],
      ['delai', false],
      ['retablissement', null],
    ]);
  });

  it("découpage de l'attente avec revue_le et recette ; facultatif", () => {
    const arts = [
      story('US-1', { termine_le: '2026-10-01', revue_le: '2026-10-03', mis_en_prod_le: '2026-10-10' }),
      story('US-2', { termine_le: '2026-10-01', mis_en_prod_le: '2026-10-10' }),
    ];
    const deps = [
      dep('1', 'recette', '2026-10-06', ['US-1']),
      dep('1', 'production', '2026-10-10', ['US-1', 'US-2']),
    ];
    const m = calculerMetriques(arts, deps, new Map(), base);
    expect(m.decoupageAttente.revue).toEqual({ medianeJours: 2, us: 1 });
    expect(m.decoupageAttente.recette).toEqual({ medianeJours: 3, us: 1 });
    expect(m.decoupageAttente.production).toEqual({ medianeJours: 4, us: 1 });
    const sans = calculerMetriques([story('US-3', { termine_le: '2026-10-01', mis_en_prod_le: '2026-10-10' })], [dep('2', 'production', '2026-10-10', ['US-3'])], new Map(), base);
    expect(sans.decoupageAttente.revue).toEqual({ medianeJours: null, us: 0 });
    expect(sans.decoupageAttente.production.medianeJours).toBeNull();
  });

  it('taille des changements : US et commits par version, non mesurable sans Git', () => {
    const arts = [story('US-1', {}), story('US-2', {})];
    const deps = [dep('1', 'production', '2026-10-10', ['US-1', 'US-2'])];
    const commits = [{ subject: 'feat(US-1): a' }, { subject: 'fix(US-1): b' }, { subject: 'feat(US-2): c' }, { subject: 'chore: autre' }];
    const m = calculerMetriques(arts, deps, new Map(), { ...base, commits });
    expect(m.taille).toMatchObject({ usParVersion: 2, commitsParVersion: 3, versions: [{ version: '1', us: 2, commits: 3 }] });
    const sans = calculerMetriques(arts, deps, new Map(), base);
    expect(sans.taille.commitsParVersion).toBeNull();
    expect(sans.taille.versions[0]?.commits).toBeNull();
  });
});

describe('orbith metriques : csv, cibles, rappel', () => {
  it('export csv, rappel dans le texte et le json, cibles de la configuration', async () => {
    const root = await fixture();
    await runValider('docs/livraisons/release-notes-1.0.0.md', { cwd: root, yes: true });
    await runDeploiement('1.0.0', { cwd: root, yes: true });
    const cfg = path.join(root, '.orbith/config.yaml');
    await writeFile(cfg, (await readFile(cfg, 'utf8')) + 'dora:\n  cibles:\n    frequence_par_semaine: 1\n    retablissement_heures: 24\n');
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const m = await runMetriques({ cwd: root });
    const texte = String(write.mock.calls.map((c) => c[0]).join(''));
    expect(texte).toContain('## Cibles');
    expect(texte).toContain('## Tendances');
    expect(texte).toContain('pas des personnes');
    expect(m.cibles?.find((c) => c.cle === 'retablissement')?.atteinte).toBeNull();
    expect(texte).toContain('non mesurable');
    await runMetriques({ cwd: root, format: 'csv', sortie: 'out/m.csv' });
    const csv = await readFile(path.join(root, 'out/m.csv'), 'utf8');
    expect(csv.startsWith('﻿famille;indicateur;valeur')).toBe(true);
    expect(csv).toContain('dora;Temps de rétablissement (médiane);non mesurable');
    expect(csv).toContain('rappel;');
    await runMetriques({ cwd: root, format: 'json', sortie: 'out/m2.json' });
    expect(JSON.parse(await readFile(path.join(root, 'out/m2.json'), 'utf8')).rappel).toMatch(/pas des personnes/);
    await expect(runMetriques({ cwd: root, format: 'xml' })).rejects.toThrow(/texte, json ou csv/);
  });

  it('cible invalide ou inconnue refusée à la lecture de la configuration', async () => {
    const root = await fixture();
    const cfg = path.join(root, '.orbith/config.yaml');
    const orig = await readFile(cfg, 'utf8');
    await writeFile(cfg, orig + 'dora:\n  cibles:\n    delai_jours: beaucoup\n');
    await expect(runMetriques({ cwd: root })).rejects.toThrow(/delai_jours/);
    await writeFile(cfg, orig + 'dora:\n  cibles:\n    vitesse: 3\n');
    await expect(runMetriques({ cwd: root })).rejects.toThrow(/inconnue/);
  });
});

describe('taux d\'échec sans bug déclaré', () => {
  const dep = { version: '1', env: 'production', date: '2026-10-10', par: 'x', email: 'x', us: ['US-1'] };
  const opts = { jours: 30, aujourdhui: '2026-10-25', devise: 'EUR' };

  it('garde 0 % mais le signale', () => {
    const m = calculerMetriques([story('US-1', {})], [dep], new Map(), opts);
    expect(m.tauxEchec).toMatchObject({ pourcentage: 0, deploiementsEnEchec: 0, niveau: 'élite', avertissement: 'aucun bug déclaré : à vérifier' });
    expect(renderMetriques(m, 'p')).toContain('0 % (0 déploiement(s) suivi(s) d\'un bug de production) (niveau DORA : élite) : aucun bug déclaré : à vérifier');
  });

  it('pas d\'avertissement avec un bug déclaré, ni sans déploiement', () => {
    const bug = story('BUG-1', { labels: ['bug'], origine: 'production', cause: 'US-9' });
    expect(calculerMetriques([story('US-1', {}), bug], [dep], new Map(), opts).tauxEchec.avertissement).toBeNull();
    const vide = calculerMetriques([story('US-1', {})], [], new Map(), opts);
    expect(vide.tauxEchec).toMatchObject({ pourcentage: null, avertissement: null });
    expect(renderMetriques(vide, 'p')).not.toContain('à vérifier');
  });
});
