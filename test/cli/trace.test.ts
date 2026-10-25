import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runValider } from '../../src/cli/valider.js';
import { runTrace } from '../../src/cli/trace.js';
import { GHERKIN, commit, makeProject, put } from './helpers.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const r of roots.splice(0)) await rm(r, { recursive: true, force: true });
});

async function fixture(): Promise<string> {
  const root = await makeProject('evolution', true);
  roots.push(root);
  await put(root, 'backlog/tasks/us-001 - Connexion.md', `---\ntype: story\nid: US-001\ntitle: Connexion par email\nstatut: brouillon\nstatus: En cours\n---\n# Connexion\n\n${GHERKIN}`);
  await put(root, 'backlog/tasks/us-002 - Profil.md', '---\ntype: story\nid: US-002\ntitle: Profil\nstatut: brouillon\nstatus: À faire\n---\n# Profil\n');
  await put(root, 'docs/livraisons/release-notes-1.0.md', '---\ntype: release-notes\nstatut: brouillon\n---\n# 1.0\n\n- US-001 login\n');
  await put(root, 'tests/login.feature', '@US-001\nFonctionnalité: login\n');
  await put(root, 'src/auth.test.ts', "it('US-001 se connecte', () => {})\n");
  await put(root, 'tests/other.test.ts', "it('US-0010 autre', () => {})\n");
  await put(root, 'node_modules/x/a.test.js', '// US-001\n');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  await runValider('backlog/tasks/us-001 - Connexion.md', { cwd: root, yes: true });
  commit(root, 'feat(US-001): ajoute le login');
  commit(root, 'chore: sans story');
  return root;
}

describe('orbith trace', () => {
  it('matrice markdown', async () => {
    const root = await fixture();
    const out = await runTrace(undefined, { cwd: root, sortie: 'out/trace.md' });
    expect(out).toContain('| US-001 | Connexion par email | validé | En cours | Jane Doe');
    expect(out).toMatch(/feat\(US-001\): ajoute le login/);
    expect(out).toContain('tests/login.feature');
    expect(out).toContain('src/auth.test.ts');
    expect(out).not.toContain('node_modules');
    expect(out).not.toContain('tests/other.test.ts');
    expect(out).toContain('release-notes-1.0.md');
    expect(out).toMatch(/\| US-002 \| Profil \| brouillon \| À faire \| — \| — \| — \| — \|/);
    expect(await readFile(path.join(root, 'out/trace.md'), 'utf8')).toBe(out);
  });
  it('détail pour un ID et erreur si inconnu', async () => {
    const root = await fixture();
    const out = await runTrace('US-001', { cwd: root, sortie: 't.md' });
    expect(out).toContain('# US-001 — Connexion par email');
    expect(out).toContain('## Commits');
    expect(out).toContain('Validée par : Jane Doe');
    await expect(runTrace('US-999', { cwd: root })).rejects.toThrow(/introuvable/);
  });
});
