import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runValider } from '../../src/cli/valider.js';
import { loadDeploiements, runDeploiement } from '../../src/cli/deploiement.js';
import { computeNext } from '../../src/cli/next-rules.js';
import { renderChanges } from '../../src/cli/trace-report.js';
import { run as runChecks } from '../../src/checks/validations.js';
import { loadConfig, refusQuatreYeux, refusRole, scanArtifacts } from '../../src/core/index.js';
import { GHERKIN, commit, makeProject, put } from './helpers.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const r of roots.splice(0)) await rm(r, { recursive: true, force: true });
});

const BASE_CFG = 'version: 1\norbith_version: 0.1.0\nprojet:\n  nom: demo\nplateformes: [gemini, claude]\npiste: evolution\nbacklog:\n  prefixe: US\n';
const prd = '---\ntype: prd\nstatut: brouillon\n---\n# PRD\n\nContenu\n';
const asUser = (root: string, name: string, email: string): void => {
  execFileSync('git', ['config', 'user.name', name], { cwd: root });
  execFileSync('git', ['config', 'user.email', email], { cwd: root });
};

function change(extra = '', plan = '1. Redéployer la version 0.9.0'): string {
  return `---
id: CHG-001
title: Mise en production 1.0.0
type: change
statut: brouillon
changement: normal
risque: moyen
version: 1.0.0
fenetre_debut: 2026-10-30 22:00
fenetre_fin: 2026-10-30 23:00
approbateurs: []
${extra}---

# Demande de changement

## Plan de retour arrière

${plan}
`;
}

describe('configuration facultative', () => {
  it('reste absente par défaut et se lit quand elle existe', async () => {
    const root = await makeProject();
    roots.push(root);
    expect((await loadConfig(root)).roles).toBeUndefined();
    expect((await loadConfig(root)).changements).toBeUndefined();
    await put(root, '.orbith/config.yaml', BASE_CFG + 'changements:\n  exiger_pour_deploiement: true\nroles:\n  quatre_yeux: true\n  valideurs:\n    prd: alice@corp.fr\n    "*": [Bob]\n');
    const cfg = await loadConfig(root);
    expect(cfg.changements?.exiger_pour_deploiement).toBe(true);
    expect(cfg.roles).toEqual({ quatre_yeux: true, valideurs: { prd: ['alice@corp.fr'], '*': ['Bob'] } });
  });
});

describe('matrice des rôles et quatre yeux (fonctions pures)', () => {
  const cfg = { roles: { quatre_yeux: true, valideurs: { prd: ['Alice@Corp.fr'] } } } as never;
  it('compare email et nom sans tenir compte de la casse', () => {
    expect(refusRole(cfg, 'prd', {}, { name: 'A', email: 'alice@corp.fr' })).toBeNull();
    expect(refusRole(cfg, 'prd', {}, { name: 'B', email: 'b@corp.fr' })).toMatch(/pas autorisé/);
    expect(refusRole(cfg, 'epic', {}, { name: 'B', email: 'b@corp.fr' })).toBeNull();
    expect(refusRole(null, 'prd', {}, { name: 'B', email: 'b@corp.fr' })).toBeNull();
  });
  it('applique les approbateurs d’une demande de changement', () => {
    expect(refusRole(null, 'change', { approbateurs: ['carol@corp.fr'] }, { name: 'B', email: 'b@corp.fr' })).toMatch(/approbateurs/);
    expect(refusRole(null, 'change', { approbateurs: ['Bob'] }, { name: 'bob', email: 'b@corp.fr' })).toBeNull();
  });
  it('quatre yeux : auteur identique refusé, auteur inconnu toléré', () => {
    const jane = { name: 'Jane', email: 'jane@corp.fr' };
    expect(refusQuatreYeux(cfg, jane, jane)).toMatch(/quatre yeux/);
    expect(refusQuatreYeux(cfg, null, jane)).toBeNull();
    expect(refusQuatreYeux({ roles: { quatre_yeux: false, valideurs: {} } } as never, jane, jane)).toBeNull();
  });
});

describe('orbith valider avec rôles', () => {
  it('sans configuration, rien ne change', async () => {
    const root = await makeProject('evolution', true);
    roots.push(root);
    await put(root, 'docs/produit/prd.md', prd);
    commit(root, 'prd');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await runValider('docs/produit/prd.md', { cwd: root, yes: true })).toBe(true);
  });

  it('refuse une personne hors matrice, accepte une personne listée', async () => {
    const root = await makeProject('evolution', true);
    roots.push(root);
    await put(root, '.orbith/config.yaml', BASE_CFG + 'roles:\n  valideurs:\n    prd: [alice@corp.fr]\n');
    await put(root, 'docs/produit/prd.md', prd);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(runValider('docs/produit/prd.md', { cwd: root, yes: true })).rejects.toThrow(/pas autorisé/);
    asUser(root, 'Alice', 'ALICE@corp.fr');
    expect(await runValider('docs/produit/prd.md', { cwd: root, yes: true })).toBe(true);
  });

  it('quatre yeux : l’auteur du dernier commit ne peut pas valider', async () => {
    const root = await makeProject('evolution', true);
    roots.push(root);
    await put(root, '.orbith/config.yaml', BASE_CFG + 'roles:\n  quatre_yeux: true\n');
    await put(root, 'docs/produit/prd.md', prd);
    commit(root, 'prd par Jane');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(runValider('docs/produit/prd.md', { cwd: root, yes: true })).rejects.toThrow(/quatre yeux/);
    asUser(root, 'Bob', 'bob@corp.fr');
    expect(await runValider('docs/produit/prd.md', { cwd: root, yes: true })).toBe(true);
    const r = await runChecks({ root, config: await loadConfig(root) });
    expect(r).toEqual([]);
  });

  it('check signale une validation qui contourne la matrice ou les quatre yeux', async () => {
    const root = await makeProject('evolution', true);
    roots.push(root);
    await put(root, 'docs/produit/prd.md', prd);
    commit(root, 'prd par Jane');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await runValider('docs/produit/prd.md', { cwd: root, yes: true }); // règles encore désactivées
    await put(root, '.orbith/config.yaml', BASE_CFG + 'roles:\n  quatre_yeux: true\n  valideurs:\n    prd: [alice@corp.fr]\n');
    const r = await runChecks({ root, config: await loadConfig(root) });
    const messages = r.map((x) => x.message).join('\n');
    expect(r.every((x) => x.niveau === 'erreur' && x.fichier === 'docs/produit/prd.md')).toBe(true);
    expect(messages).toMatch(/liste des valideurs/);
    expect(messages).toMatch(/quatre yeux/);
  });
});

describe('demande de changement', () => {
  async function projetLivre(cfgExtra: string): Promise<string> {
    const root = await makeProject('evolution', true);
    roots.push(root);
    await put(root, '.orbith/config.yaml', BASE_CFG + cfgExtra);
    await put(
      root,
      'backlog/tasks/us-001 - Connexion.md',
      `---\nid: US-001\ntitle: Connexion\nstatus: Terminée\ntype: story\nstatut: brouillon\n---\n# Connexion\n\n${GHERKIN}`,
    );
    await put(
      root,
      'docs/livraisons/release-notes-1.0.0.md',
      '---\ntype: release-notes\nstatut: brouillon\nversion: 1.0.0\n---\n# Notes\n\n- US-001 : connexion\n',
    );
    commit(root, 'US-001 connexion');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await runValider('docs/livraisons/release-notes-1.0.0.md', { cwd: root, yes: true });
    return root;
  }

  it('est scannée comme artefact et validable', async () => {
    const root = await projetLivre('');
    await put(root, 'docs/livraisons/changes/CHG-001-1.0.0.md', change());
    await runValider('docs/livraisons/changes/CHG-001-1.0.0.md', { cwd: root, yes: true });
    const c = (await scanArtifacts(root)).find((a) => a.type === 'change');
    expect(c?.id).toBe('CHG-001');
    expect(c?.etat).toBe('validé');
  });

  it('deploiement ne l’exige pas par défaut', async () => {
    const root = await projetLivre('');
    expect(await runDeploiement('1.0.0', { cwd: root, yes: true, date: '2026-10-20' })).not.toBeNull();
  });

  it('deploiement l’exige quand c’est activé : absente, non validée, puis validée', async () => {
    const root = await projetLivre('changements:\n  exiger_pour_deploiement: true\n');
    await expect(runDeploiement('1.0.0', { cwd: root, yes: true })).rejects.toThrow(/Aucune demande de changement/);
    // un autre environnement que la production n'est pas concerné
    await runDeploiement('1.0.0', { cwd: root, yes: true, env: 'recette', date: '2026-10-10' });
    await put(root, 'docs/livraisons/changes/CHG-001-1.0.0.md', change());
    await expect(runDeploiement('1.0.0', { cwd: root, yes: true })).rejects.toThrow(/n'est pas validée/);
    await runValider('docs/livraisons/changes/CHG-001-1.0.0.md', { cwd: root, yes: true });
    const dep = await runDeploiement('1.0.0', { cwd: root, yes: true, date: '2026-10-20' });
    expect(dep?.change).toBe('CHG-001');
    expect((await loadDeploiements(root)).find((d) => d.env === 'production')?.change).toBe('CHG-001');
  });

  it('next propose de préparer puis de valider la demande', async () => {
    const root = await projetLivre('changements:\n  exiger_pour_deploiement: true\n');
    const cfg = await loadConfig(root);
    let arts = await scanArtifacts(root);
    expect(computeNext(arts, cfg).principal.message).toMatch(/demande de changement/);
    await put(root, 'docs/livraisons/changes/CHG-001-1.0.0.md', change());
    arts = await scanArtifacts(root);
    const n = computeNext(arts, cfg).principal;
    expect(n.kind).toBe('valider');
    expect(n.cli).toContain('CHG-001-1.0.0.md');
    // désactivé : la suite habituelle (enregistrer le déploiement)
    expect(computeNext(arts, { ...cfg, changements: undefined }).principal.cli).toContain('deploiement 1.0.0');
  });

  it('check signale une demande incomplète', async () => {
    const root = await makeProject();
    roots.push(root);
    await put(root, 'docs/livraisons/changes/CHG-002.md', '---\nid: CHG-002\ntype: change\nstatut: brouillon\nchangement: bizarre\n---\n# Changement\n\n## Plan de retour arrière\n\n<étapes>\n');
    await put(root, 'docs/livraisons/changes/CHG-001.md', change());
    const r = await runChecks({ root, config: null });
    expect(r.filter((x) => x.fichier === 'docs/livraisons/changes/CHG-001.md')).toEqual([
      expect.objectContaining({ niveau: 'avertissement', message: expect.stringContaining('approbateur') }),
    ]);
    const msgs = r.filter((x) => x.fichier === 'docs/livraisons/changes/CHG-002.md').map((x) => x.message).join('\n');
    expect(msgs).toMatch(/`changement`/);
    expect(msgs).toMatch(/`risque`/);
    expect(msgs).toMatch(/version/);
    expect(msgs).toMatch(/retour arrière est vide/);
    expect(msgs).toMatch(/fenêtre/);
  });

  it('un changement standard n’a besoin ni de fenêtre ni d’approbateurs', async () => {
    const root = await makeProject();
    roots.push(root);
    await put(root, 'docs/livraisons/changes/CHG-003.md', '---\nid: CHG-003\ntype: change\nstatut: brouillon\nchangement: standard\nrisque: faible\nversion: 1.0.1\n---\n# Standard\n\n## Plan de retour arrière\n\nRedéployer 1.0.0\n');
    expect(await runChecks({ root, config: null })).toEqual([]);
  });

  it('seuls les approbateurs désignés peuvent la valider', async () => {
    const root = await makeProject('evolution', true);
    roots.push(root);
    await put(root, 'docs/livraisons/changes/CHG-001.md', change().replace('approbateurs: []', 'approbateurs: [carol@corp.fr]'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(runValider('docs/livraisons/changes/CHG-001.md', { cwd: root, yes: true })).rejects.toThrow(/approbateurs/);
  });

  it('trace liste les demandes de changement', async () => {
    const root = await makeProject();
    roots.push(root);
    expect(renderChanges(await scanArtifacts(root))).toBe('');
    await put(root, 'docs/livraisons/changes/CHG-001.md', change().replace('# Demande de changement', '# Demande\n\nLivre US-001'));
    await put(root, 'backlog/tasks/us-001.md', `---\nid: US-001\ntype: story\nstatut: brouillon\n---\n# US\n`);
    const out = renderChanges(await scanArtifacts(root));
    expect(out).toContain('## Demandes de changement');
    expect(out).toMatch(/CHG-001 \| normal \| moyen \| 1\.0\.0 \|.*\| US-001 \|/);
  });
});
