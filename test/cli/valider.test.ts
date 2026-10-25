import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { etatValidation, loadRegistry, OrbithError, readDoc } from '../../src/core/index.js';
import { runValider } from '../../src/cli/valider.js';
import { makeProject, put } from './helpers.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const r of roots.splice(0)) await rm(r, { recursive: true, force: true });
});
const prd = '---\ntype: prd\nstatut: brouillon\n---\n# PRD\n\nContenu\n';

describe('orbith valider', () => {
  it('valide, écrit le frontmatter et le registre', async () => {
    const root = await makeProject('evolution', true);
    roots.push(root);
    const f = await put(root, 'docs/produit/prd.md', prd);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await runValider('docs/produit/prd.md', { cwd: root, yes: true })).toBe(true);
    const doc = await readDoc(f);
    expect(doc.data['statut']).toBe('validé');
    expect(doc.data['valide_par']).toBe('Jane Doe');
    expect(doc.data['valide_le']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const reg = await loadRegistry(root);
    expect(reg).toHaveLength(1);
    expect(reg[0]?.email).toBe('jane@corp.fr');
    expect(await etatValidation(root, f)).toBe('validé');
  });
  it('déjà validé et inchangé', async () => {
    const root = await makeProject('evolution', true);
    roots.push(root);
    await put(root, 'docs/produit/prd.md', prd);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runValider('docs/produit/prd.md', { cwd: root, yes: true });
    log.mockClear();
    await runValider('docs/produit/prd.md', { cwd: root, yes: true });
    expect(log.mock.calls.map((c) => String(c[0])).join('\n')).toContain('déjà validé');
    expect(await loadRegistry(root)).toHaveLength(1);
  });
  it('revalide après modification', async () => {
    const root = await makeProject('evolution', true);
    roots.push(root);
    const f = await put(root, 'docs/produit/prd.md', prd);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await runValider('docs/produit/prd.md', { cwd: root, yes: true });
    const raw = await readFile(f, 'utf8');
    await put(root, 'docs/produit/prd.md', raw + '\nAjout\n');
    expect(await etatValidation(root, f)).toBe('modifié');
    await runValider('docs/produit/prd.md', { cwd: root, yes: true });
    expect(await etatValidation(root, f)).toBe('validé');
    expect(await loadRegistry(root)).toHaveLength(1);
  });
  it('erreurs claires', async () => {
    const root = await makeProject('evolution', true);
    roots.push(root);
    await expect(runValider('nope.md', { cwd: root, yes: true })).rejects.toThrow(/introuvable/);
    await put(root, 'docs/note.md', '# juste une note\n');
    await expect(runValider('docs/note.md', { cwd: root, yes: true })).rejects.toThrow(/frontmatter/);
    await expect(runValider('docs/note.md', { cwd: root, yes: true })).rejects.toBeInstanceOf(OrbithError);
  });
  it('identité git manquante', async () => {
    const root = await makeProject('evolution', false); // pas de repo git local
    roots.push(root);
    await put(root, 'docs/produit/prd.md', prd);
    const prev = { ...process.env };
    // isole la config git globale/système pour que l'identité soit introuvable
    process.env['GIT_CONFIG_GLOBAL'] = path.join(root, 'nogit');
    process.env['GIT_CONFIG_SYSTEM'] = path.join(root, 'nogit');
    process.env['GIT_CONFIG_NOSYSTEM'] = '1';
    try {
      await expect(runValider('docs/produit/prd.md', { cwd: root, yes: true })).rejects.toThrow(/Identité git/);
    } finally {
      process.env = prev;
    }
  });
});

describe('orbith valider : environnements (agent DevOps)', () => {
  it('accepte le document des environnements, vu ensuite par le scan', async () => {
    const root = await makeProject('projet', true);
    roots.push(root);
    const tpl = await readFile(path.join(__dirname, '../../content/templates/environnements.md'), 'utf8');
    await put(root, 'docs/architecture/environnements.md', tpl);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await runValider('docs/architecture/environnements.md', { cwd: root, yes: true })).toBe(true);
    const { scanArtifacts } = await import('../../src/core/index.js');
    const env = (await scanArtifacts(root)).find((a) => a.type === 'environnements');
    expect(env?.etat).toBe('validé');
  });
});
