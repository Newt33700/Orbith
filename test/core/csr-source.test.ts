import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultConfig, OrbithError, parseSource, syncCsr } from '../../src/core/index.js';
import { CSR } from '../checks/helpers.js';

let root: string;
let repo: string;
const tmpDirs: string[] = [];

async function tmp(prefix: string): Promise<string> {
  const d = await mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}
function cfg(source: string | null) {
  const c = defaultConfig('demo');
  c.csr.source = source;
  return c;
}
const git = (...a: string[]) => execFileSync('git', a, { cwd: repo, stdio: 'ignore' });
const local = () => readFile(path.join(root, '.orbith', 'csr', 'CSR.md'), 'utf8');

beforeEach(async () => {
  root = await tmp('orbith-src-');
  repo = await tmp('orbith-repo-');
  await mkdir(path.join(root, '.orbith', 'csr'), { recursive: true });
  await writeFile(path.join(root, '.orbith', 'csr', 'CSR.md'), 'ancien');
});
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const d of tmpDirs.splice(0)) await rm(d, { recursive: true, force: true, maxRetries: 3 });
});

async function initRepo(): Promise<string> {
  git('init', '-q');
  git('config', 'user.name', 'T');
  git('config', 'user.email', 't@example.com');
  git('config', 'commit.gpgsign', 'false');
  await mkdir(path.join(repo, 'csr'), { recursive: true });
  await writeFile(path.join(repo, 'csr', 'CSR.md'), CSR);
  git('add', '-A');
  git('commit', '-q', '-m', 'csr');
  return pathToFileURL(repo).href;
}

describe('parseSource', () => {
  it('reconnaît les formes supportées', () => {
    expect(parseSource('docs/CSR.md')).toEqual({ kind: 'local', path: 'docs/CSR.md' });
    expect(parseSource('https://h/raw/CSR.md')).toEqual({ kind: 'url', url: 'https://h/raw/CSR.md' });
    expect(parseSource('git+https://h/g/r.git#csr/CSR.md')).toEqual({ kind: 'git', repo: 'https://h/g/r.git', file: 'csr/CSR.md' });
    expect(parseSource('git+https://h/g/r.git@v2#csr/CSR.md')).toEqual({ kind: 'git', repo: 'https://h/g/r.git', ref: 'v2', file: 'csr/CSR.md' });
    expect(parseSource('git+ssh://git@h/g/r.git#CSR.md')).toEqual({ kind: 'git', repo: 'ssh://git@h/g/r.git', file: 'CSR.md' });
  });
  it('refuse les sources dangereuses ou incomplètes', () => {
    expect(() => parseSource('git+https://h/g/r.git')).toThrow(/incomplète/);
    expect(() => parseSource('git+https://h/g/r.git#../x')).toThrow(/invalide/);
    expect(() => parseSource('http://h/CSR.md')).toThrow(/https/);
  });
});

describe('syncCsr', () => {
  it('sans source : erreur claire', async () => {
    await expect(syncCsr(root, cfg(null))).rejects.toThrow(/Aucune source CSR/);
  });

  it('chemin local relatif à la racine du projet', async () => {
    await writeFile(path.join(root, 'ref.md'), CSR);
    const r = await syncCsr(root, cfg('ref.md'));
    expect(r).toMatchObject({ fichier: '.orbith/csr/CSR.md', change: true, outils: 6 });
    expect(await local()).toBe(CSR);
    expect((await syncCsr(root, cfg('ref.md'))).change).toBe(false);
  });

  it('chemin local absolu', async () => {
    const f = path.join(repo, 'CSR.md');
    await writeFile(f, CSR);
    expect((await syncCsr(root, cfg(f))).change).toBe(true);
  });

  it('dépôt git (clone superficiel via git+file://)', async () => {
    const url = await initRepo();
    const r = await syncCsr(root, cfg(`git+${url}#csr/CSR.md`));
    expect(r.change).toBe(true);
    expect(await local()).toBe(CSR);
    expect((await readdir(os.tmpdir())).filter((n) => n.startsWith('orbith-csr-'))).toHaveLength(0);
  });

  it('dépôt git avec @ref', async () => {
    const url = await initRepo();
    git('tag', 'v1');
    await writeFile(path.join(repo, 'csr', 'CSR.md'), CSR + '| Go | 1.22 | autorisé | |\n');
    git('commit', '-q', '-am', 'go');
    const r = await syncCsr(root, cfg(`git+${url}@v1#csr/CSR.md`));
    expect(r.outils).toBe(6);
  });

  it('fichier absent du dépôt ou dépôt introuvable : erreur, ancien fichier conservé', async () => {
    const url = await initRepo();
    await expect(syncCsr(root, cfg(`git+${url}#nope.md`))).rejects.toThrow(/introuvable dans le dépôt/);
    await expect(syncCsr(root, cfg(`git+${pathToFileURL(path.join(repo, 'absent')).href}#CSR.md`))).rejects.toThrow(OrbithError);
    expect(await local()).toBe('ancien');
  });

  it('URL https (fetch)', async () => {
    const fetchMock = vi.fn(async () => new Response(CSR, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await syncCsr(root, cfg('https://exemple.test/CSR.md'));
    expect(r.outils).toBe(6);
    expect(await local()).toBe(CSR);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    await expect(syncCsr(root, cfg('https://exemple.test/CSR.md'))).rejects.toThrow(/HTTP 404/);
  });

  it('contenu invalide : erreur en français et ancien fichier conservé', async () => {
    await writeFile(path.join(root, 'vide.md'), '# Rien ici\n\nPas de tableau.\n');
    await expect(syncCsr(root, cfg('vide.md'))).rejects.toThrow(/invalide : aucun outil reconnu/);
    expect(await local()).toBe('ancien');
  });
});
