import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runValider } from '../../src/cli/valider.js';
import { runVersion } from '../../src/cli/version.js';
import { runRelease, insererSection, dateLocale } from '../../src/cli/release.js';
import { applyBump, parseCommit, parseSemVer } from '../../src/cli/version-calc.js';
import { gitDirtyPaths } from '../../src/core/index.js';
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

// Regressions found by running the commands in a real repository.
describe('orbith release : cas réels', () => {
  async function pret(): Promise<string> {
    const root = await projet();
    await put(root, 'backlog/tasks/us-001.md', story('US-001', 'Terminée'));
    await runValider('backlog/tasks/us-001.md', { cwd: root, yes: true });
    commit(root, 'feat(US-001): connexion');
    return root;
  }
  async function notesValidees(root: string, v: string, ids: string[]): Promise<void> {
    await put(root, `docs/livraisons/release-notes-${v}.md`, NOTES(v, ids));
    await runValider(`docs/livraisons/release-notes-${v}.md`, { cwd: root, yes: true });
  }
  const sortie = () =>
    (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => c.join(' ')).join('\n');

  it('le commit de version embarque les notes validées et leur validation (le tag contient la preuve)', async () => {
    const root = await pret();
    await notesValidees(root, '1.0.0', ['US-001']); // notes et validations.json pas encore commitées
    await put(root, 'src/en-cours.ts', 'wip'); // travail sans rapport : ne doit pas partir dans le commit
    git(root, 'add', 'src/en-cours.ts');
    await runRelease('1.0.0', { cwd: root, yes: true });
    const fichiers = git(root, 'ls-tree', '-r', '--name-only', 'v1.0.0');
    expect(fichiers).toContain('docs/livraisons/release-notes-1.0.0.md');
    expect(git(root, 'show', 'v1.0.0:.orbith/validations.json')).toContain('release-notes-1.0.0.md');
    expect(fichiers).not.toContain('src/en-cours.ts');
    expect(git(root, 'status', '--porcelain').trim()).toBe('A  src/en-cours.ts');
  });

  it('après une version publiée, ses US ne sont plus recomptées ni remises dans le brouillon suivant', async () => {
    const root = await pret();
    await notesValidees(root, '1.0.0', ['US-001']);
    await runRelease('1.0.0', { cwd: root, yes: true });
    const p = await runVersion({ cwd: root });
    expect(p.propose).toBeNull();
    expect(p.stories).toEqual([]);
    await put(root, 'backlog/tasks/us-002.md', story('US-002', 'Terminée'));
    commit(root, 'feat(US-002): export');
    expect((await runVersion({ cwd: root })).stories.map((s) => s.id)).toEqual(['US-002']);
    await expect(runRelease('1.1.0', { cwd: root, yes: true })).rejects.toThrow(/brouillon a été créé/);
    const brouillon = await readFile(path.join(root, 'docs/livraisons/release-notes-1.1.0.md'), 'utf8');
    expect(brouillon).toContain('US-002');
    expect(brouillon).not.toContain('US-001');
  });

  it('garde les fins de ligne CRLF d’un CHANGELOG.md venu de Windows', () => {
    const out = insererSection('# Journal\r\n\r\nintro\r\n\r\n## [1.0.0] - x\r\n\r\n- a\r\n', '## [1.1.0] - y\n\n- b\n');
    expect(out).not.toMatch(/[^\r]\n/);
    expect(out.indexOf('[1.1.0]')).toBeLessThan(out.indexOf('[1.0.0]'));
    const sansEntree = insererSection('# Journal\r\n', '## [1.0.0] - y\n\n- b\n');
    expect(sansEntree).not.toMatch(/[^\r]\n/);
  });

  it('commit refusé par un hook : CHANGELOG.md et l’index sont remis en état, message de Git affiché, relance possible', async () => {
    const root = await pret();
    await notesValidees(root, '1.0.0', ['US-001']);
    commit(root, 'docs: notes');
    const hook = path.join(root, '.git/hooks/pre-commit');
    await mkdir(path.dirname(hook), { recursive: true });
    await writeFile(hook, '#!/bin/sh\necho "lint KO" >&2\nexit 1\n', { mode: 0o755 });
    const err = await runRelease('1.0.0', { cwd: root, yes: true }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).name).toBe('OrbithError');
    expect((err as Error).message).toMatch(/commit de la version a échoué[\s\S]*lint KO/);
    await expect(readFile(path.join(root, 'CHANGELOG.md'), 'utf8')).rejects.toThrow();
    expect(git(root, 'status', '--porcelain').trim()).toBe('');
    expect(git(root, 'tag')).toBe('');
    await rm(hook);
    expect((await runRelease('1.0.0', { cwd: root, yes: true }))?.tag).toBe('v1.0.0');
  });

  it('tag impossible après le commit : message clair avec la commande pour finir', async () => {
    const root = await pret();
    await notesValidees(root, '1.0.0', ['US-001']);
    await mkdir(path.join(root, '.git/refs/tags'), { recursive: true });
    await writeFile(path.join(root, '.git/refs/tags/v1.0.0.lock'), '');
    await expect(runRelease('1.0.0', { cwd: root, yes: true })).rejects.toThrow(
      /a été créé, mais pas le tag v1\.0\.0[\s\S]*git tag -a v1\.0\.0/,
    );
    expect(git(root, 'log', '-1', '--format=%s').trim()).toBe('chore(release): v1.0.0');
  });

  it('--sans-tag indique de commiter avant de taguer (sinon le tag ne contient pas le changelog)', async () => {
    const root = await pret();
    await notesValidees(root, '1.0.0', ['US-001']);
    await runRelease('1.0.0', { cwd: root, sansTag: true });
    expect(sortie()).toMatch(/git add CHANGELOG\.md[\s\S]*git commit -m "chore\(release\): v1\.0\.0"[\s\S]*git tag -a v1\.0\.0/);
    await expect(runRelease('1.0.0', { cwd: root, yes: true })).rejects.toThrow(/--sans-tag, termine à la main[\s\S]*git commit/);
  });

  it('--dry-run sans notes : ne prétend pas avoir créé de brouillon ; un fichier non reconnu n’est jamais écrasé', async () => {
    const root = await pret();
    const err = await runRelease('1.0.0', { cwd: root, dryRun: true }).catch((e: Error) => e);
    expect((err as Error).message).toMatch(/aucun brouillon n'a été écrit/);
    expect((err as Error).message).not.toMatch(/Relis-le/);
    await expect(readFile(path.join(root, 'docs/livraisons/release-notes-1.0.0.md'), 'utf8')).rejects.toThrow();
    await put(root, 'docs/livraisons/release-notes-1.0.0.md', '# Mes notes écrites à la main\n');
    await expect(runRelease('1.0.0', { cwd: root, yes: true })).rejects.toThrow(/existe mais n'est pas reconnu/);
    expect(await readFile(path.join(root, 'docs/livraisons/release-notes-1.0.0.md'), 'utf8')).toBe('# Mes notes écrites à la main\n');
  });

  it('avertit quand le changelog reprend des commits d’US pas terminées', async () => {
    const root = await pret();
    await put(root, 'backlog/tasks/us-002.md', story('US-002', 'En cours'));
    commit(root, 'feat(US-002): export partiel');
    await notesValidees(root, '1.0.0', ['US-001']);
    await runRelease('1.0.0', { cwd: root, dryRun: true });
    expect(sortie()).toMatch(/commits d'US pas « Terminée » : US-002 \(En cours\)/);
  });

  it('date par défaut : jour local, pas UTC', () => {
    expect(dateLocale(new Date(2026, 9, 25, 0, 30))).toBe('2026-10-25');
    expect(dateLocale(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('gitDirtyPaths : projet dans un sous-dossier du dépôt, chemins avec espaces', async () => {
    const root = await projet();
    const sous = path.join(root, 'mon projet');
    await put(sous, 'docs/notes 1.md', 'a');
    await put(sous, 'propre.md', 'b');
    commit(root, 'chore: init');
    await put(sous, 'docs/notes 1.md', 'modifié');
    await put(sous, 'nouveau.md', 'c');
    expect(await gitDirtyPaths(sous, ['docs/notes 1.md', 'propre.md', 'nouveau.md'])).toEqual(['docs/notes 1.md', 'nouveau.md']);
  });
});
