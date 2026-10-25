import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runValider } from '../../src/cli/valider.js';
import { loadVersions, runVersion } from '../../src/cli/version.js';
import { runDeploiement } from '../../src/cli/deploiement.js';
import { readDoc } from '../../src/core/index.js';
import { GHERKIN, commit, makeProject, put } from './helpers.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const r of roots.splice(0)) await rm(r, { recursive: true, force: true });
});

const us = (id: string, status: string, extra = '') =>
  `---\ntype: story\nid: ${id}\ntitle: Titre ${id}\nstatut: brouillon\nstatus: ${status}\n${extra}---\n# ${id}\n\n${GHERKIN}`;

async function fixture(): Promise<string> {
  const root = await makeProject('evolution', true);
  roots.push(root);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  await put(root, 'backlog/tasks/us-001 - A.md', us('US-001', 'Terminée'));
  await put(root, 'backlog/tasks/us-002 - B.md', us('US-002', 'Terminée', 'labels: [bug]\n'));
  await put(root, 'backlog/tasks/us-012 - C.md', us('US-012', 'En cours'));
  await runValider('backlog/tasks/us-001 - A.md', { cwd: root, yes: true });
  await runValider('backlog/tasks/us-002 - B.md', { cwd: root, yes: true });
  commit(root, 'feat(US-001): première fonctionnalité');
  commit(root, 'Merge branch "fix"\n\nCorrige US-002');
  return root;
}

describe('orbith version', () => {
  it('première version : US fusionnées de tout l’historique, brouillon des notes, avertissements', async () => {
    const root = await fixture();
    const r = await runVersion('1.0.0.0', { cwd: root });
    expect(r.version.us).toEqual(['US-001', 'US-002']);
    expect(r.notes).toBe('docs/livraisons/release-notes-1.0.0.0.md');
    const notes = await readDoc(path.join(root, r.notes));
    expect(notes.data).toMatchObject({ type: 'release-notes', statut: 'brouillon', version: '1.0.0.0' });
    expect(notes.body).toMatch(/## Nouveautés\n\n- US-001 : Titre US-001/);
    expect(notes.body).toMatch(/## Corrections\n\n- US-002 : Titre US-002/);
    expect(r.avertissements).toEqual([]);
    expect((await loadVersions(root))[0]?.par).toBe('Jane Doe');
  });

  it('version suivante : seulement ce qui a été fusionné depuis, US-1 ≠ US-12', async () => {
    const root = await fixture();
    await runVersion('1.0.0.0', { cwd: root });
    commit(root, 'feat(US-012): suite');
    const r = await runVersion('1.1.0.0', { cwd: root });
    expect(r.version.us).toEqual(['US-012']);
    expect(r.avertissements.join('\n')).toMatch(/US-012 est en « En cours »/);
    expect(r.avertissements.join('\n')).toMatch(/US-012 n'est pas validée/);
  });

  it('refuse un numéro invalide, un doublon, des notes déjà présentes', async () => {
    const root = await fixture();
    await expect(runVersion('v1/2', { cwd: root })).rejects.toThrow(/invalide/);
    await runVersion('1.0.0', { cwd: root });
    await expect(runVersion('1.0.0', { cwd: root })).rejects.toThrow(/existe déjà/);
    await put(root, 'docs/livraisons/release-notes-2.0.0.md', 'x');
    await expect(runVersion('2.0.0', { cwd: root })).rejects.toThrow(/existe déjà/);
  });

  it('chaîne complète : version → validation des notes → mise en prod qui date toutes les US de la version', async () => {
    const root = await fixture();
    const r = await runVersion('1.1.0.0', { cwd: root });
    await runValider(r.notes, { cwd: root, yes: true });
    const dep = await runDeploiement('1.1.0.0', { cwd: root, yes: true, date: '2026-11-02' });
    expect(dep?.us).toEqual(['US-001', 'US-002']);
    for (const f of ['backlog/tasks/us-001 - A.md', 'backlog/tasks/us-002 - B.md']) {
      expect((await readDoc(path.join(root, f))).data['mis_en_prod_le']).toBe('2026-11-02');
    }
    expect((await readDoc(path.join(root, 'backlog/tasks/us-012 - C.md'))).data['mis_en_prod_le']).toBeUndefined();
    expect(JSON.parse(await readFile(path.join(root, '.orbith/versions.json'), 'utf8')).versions).toHaveLength(1);
  });
});
