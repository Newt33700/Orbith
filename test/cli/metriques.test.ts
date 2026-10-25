import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runValider } from '../../src/cli/valider.js';
import { loadDeploiements, runDeploiement } from '../../src/cli/deploiement.js';
import { runMetriques } from '../../src/cli/metriques.js';
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
