import { execFileSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runValider } from '../../src/cli/valider.js';
import { runVersion } from '../../src/cli/version.js';
import { runRelease, insererSection } from '../../src/cli/release.js';
import { applyBump, parseCommit, parseSemVer } from '../../src/cli/version-calc.js';
import { GHERKIN, commit, makeProject, put } from './helpers.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const r of roots.splice(0)) await rm(r, { recursive: true, force: true });
});

const story = (id: string, status: string, extra = '') =>
  `---\ntype: story\nid: ${id}\ntitle: Titre ${id}\nstatut: brouillon\nstatus: ${status}\n${extra}---\n# Titre ${id}\n\n${GHERKIN}`;
const NOTES = (v: string, ids: string[]) =>
  `---\ntype: release-notes\nstatut: brouillon\nversion: ${v}\n---\n# ${v}\n\n## Pour les utilisateurs\n\n${ids.map((i) => `- ${i}`).join('\n')}\n\n## Pour l'exploitation\n\n- rien\n`;
const git = (root: string, ...a: string[]) => execFileSync('git', a, { cwd: root }).toString();

async function projet(): Promise<string> {
  const root = await makeProject('evolution', true);
  roots.push(root);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  return root;
}

describe('calcul SemVer', () => {
  it('applique les incréments', () => {
    const v = parseSemVer('1.4.2')!;
    expect(applyBump(v, 'majeur')).toEqual({ major: 2, minor: 0, patch: 0 });
    expect(applyBump(v, 'mineur')).toEqual({ major: 1, minor: 5, patch: 0 });
    expect(applyBump(v, 'correctif')).toEqual({ major: 1, minor: 4, patch: 3 });
    expect(parseSemVer('1.4')).toBeNull();
  });

  it('lit les Conventional Commits (!, BREAKING CHANGE, US)', () => {
    const p = parseCommit({ hash: 'a', subject: 'feat(US-001)!: change', body: '' }, ['US-001']);
    expect(p).toMatchObject({ type: 'feat', breaking: true, us: ['US-001'], description: 'change' });
    expect(parseCommit({ hash: 'b', subject: 'fix: x', body: 'BREAKING CHANGE: oui' }, []).breaking).toBe(true);
    expect(parseCommit({ hash: 'c', subject: 'divers', body: '' }, []).type).toBe('autre');
  });
});

describe('orbith version', () => {
  it('propose mineur pour feat, correctif pour fix, majeur pour « ! », sans rien écrire', async () => {
    const root = await projet();
    await put(root, 'a.txt', '1');
    commit(root, 'feat: première');
    expect((await runVersion({ cwd: root })).propose).toBe('0.1.0');
    git(root, 'tag', '-a', 'v1.2.0', '-m', 'x');
    commit(root, 'fix: bug');
    expect((await runVersion({ cwd: root })).propose).toBe('1.2.1');
    commit(root, 'feat: truc');
    expect((await runVersion({ cwd: root })).propose).toBe('1.3.0');
    commit(root, 'refactor!: rupture');
    const p = await runVersion({ cwd: root });
    expect(p.propose).toBe('2.0.0');
    expect(p.bump).toBe('majeur');
  });

  it("l'étiquette breaking d'une US terminée force le majeur ; un bug donne un correctif", async () => {
    const root = await projet();
    commit(root, 'chore: init');
    git(root, 'tag', '-a', 'v1.0.0', '-m', 'x');
    await put(root, 'backlog/tasks/us-001.md', story('US-001', 'Terminée', 'labels: [bug]\n'));
    commit(root, 'chore: sans conventions utiles');
    expect((await runVersion({ cwd: root })).propose).toBe('1.0.1');
    await put(root, 'backlog/tasks/us-002.md', story('US-002', 'Terminée', 'labels: [Breaking]\n'));
    commit(root, 'docs: notes');
    expect((await runVersion({ cwd: root })).propose).toBe('2.0.0');
  });

  it("ne propose rien sans changement et refuse un format inconnu", async () => {
    const root = await projet();
    commit(root, 'chore: rien');
    expect((await runVersion({ cwd: root })).propose).toBeNull();
    await expect(runVersion({ cwd: root, format: 'xml' })).rejects.toThrow(/Format inconnu/);
  });
});

describe('orbith release', () => {
  async function pret(): Promise<string> {
    const root = await projet();
    await put(root, 'backlog/tasks/us-001.md', story('US-001', 'Terminée'));
    await runValider('backlog/tasks/us-001.md', { cwd: root, yes: true });
    commit(root, 'feat(US-001): connexion');
    return root;
  }

  it('crée un brouillon de notes (2 publics) quand elles manquent, puis refuse', async () => {
    const root = await pret();
    await expect(runRelease('1.0.0', { cwd: root, yes: true })).rejects.toThrow(/Un brouillon a été créé/);
    const txt = await readFile(path.join(root, 'docs/livraisons/release-notes-1.0.0.md'), 'utf8');
    expect(txt).toContain('## Pour les utilisateurs');
    expect(txt).toContain("## Pour l'exploitation");
    expect(txt).toContain('US-001');
    expect(git(root, 'tag')).toBe('');
  });

  it('refuse des notes non validées', async () => {
    const root = await pret();
    await put(root, 'docs/livraisons/release-notes-1.0.0.md', NOTES('1.0.0', ['US-001']));
    await expect(runRelease('1.0.0', { cwd: root, yes: true })).rejects.toThrow(/ne sont pas validées/);
  });

  it("refuse si une US des notes n'est pas Terminée", async () => {
    const root = await pret();
    await put(root, 'backlog/tasks/us-002.md', story('US-002', 'En cours'));
    await put(root, 'docs/livraisons/release-notes-1.0.0.md', NOTES('1.0.0', ['US-001', 'US-002']));
    await runValider('docs/livraisons/release-notes-1.0.0.md', { cwd: root, yes: true });
    await expect(runRelease('1.0.0', { cwd: root, yes: true })).rejects.toThrow(/US-002.*pas « Terminée »/s);
  });

  it('refuse si check est en erreur (secret committé)', async () => {
    const root = await pret();
    await put(root, 'cle.txt', '-----BEGIN RSA PRIVATE KEY-----\nabc\n');
    commit(root, 'chore: oups');
    await put(root, 'docs/livraisons/release-notes-1.0.0.md', NOTES('1.0.0', ['US-001']));
    await runValider('docs/livraisons/release-notes-1.0.0.md', { cwd: root, yes: true });
    await expect(runRelease('1.0.0', { cwd: root, yes: true })).rejects.toThrow(/orbith check/);
    expect(git(root, 'tag')).toBe('');
  });

  it('génère CHANGELOG.md, le commit et crée le tag local avec --yes ; refuse un second passage', async () => {
    const root = await pret();
    await put(root, 'docs/livraisons/release-notes-1.0.0.md', NOTES('1.0.0', ['US-001']));
    await runValider('docs/livraisons/release-notes-1.0.0.md', { cwd: root, yes: true });
    commit(root, 'docs: notes');
    const res = await runRelease('v1.0.0', { cwd: root, yes: true, date: '2026-10-25' });
    expect(res?.tag).toBe('v1.0.0');
    const log = await readFile(path.join(root, 'CHANGELOG.md'), 'utf8');
    expect(log).toContain('## [1.0.0] - 2026-10-25');
    expect(log).toContain('connexion (US-001)');
    expect(git(root, 'tag').trim()).toBe('v1.0.0');
    expect(git(root, 'log', '-1', '--format=%s').trim()).toBe('chore(release): v1.0.0');
    expect(git(root, 'status', '--porcelain').trim()).toBe('');
    await expect(runRelease('1.0.0', { cwd: root, yes: true })).rejects.toThrow(/existe déjà/);
    await expect(runRelease('0.9.0', { cwd: root, yes: true })).rejects.toThrow(/supérieure/);
  });

  it('sans --yes et sans terminal interactif : demande une confirmation et ne crée rien', async () => {
    const root = await pret();
    await put(root, 'docs/livraisons/release-notes-1.0.0.md', NOTES('1.0.0', ['US-001']));
    await runValider('docs/livraisons/release-notes-1.0.0.md', { cwd: root, yes: true });
    await expect(runRelease('1.0.0', { cwd: root })).rejects.toThrow(/Confirmation impossible/);
    expect(git(root, 'tag')).toBe('');
  });

  it('--sans-tag et --dry-run ne créent pas de tag ; dry-run n’écrit rien', async () => {
    const root = await pret();
    await put(root, 'docs/livraisons/release-notes-1.0.0.md', NOTES('1.0.0', ['US-001']));
    await runValider('docs/livraisons/release-notes-1.0.0.md', { cwd: root, yes: true });
    await runRelease('1.0.0', { cwd: root, dryRun: true });
    await expect(readFile(path.join(root, 'CHANGELOG.md'), 'utf8')).rejects.toThrow();
    const res = await runRelease('1.0.0', { cwd: root, sansTag: true });
    expect(res?.tag).toBeNull();
    expect(await readFile(path.join(root, 'CHANGELOG.md'), 'utf8')).toContain('## [1.0.0]');
    expect(git(root, 'tag')).toBe('');
  });

  it('insère la nouvelle section avant les anciennes', () => {
    const out = insererSection('# Journal\n\nintro\n\n## [1.0.0] - x\n\n- a\n', '## [1.1.0] - y\n\n- b\n');
    expect(out.indexOf('[1.1.0]')).toBeLessThan(out.indexOf('[1.0.0]'));
  });
});
