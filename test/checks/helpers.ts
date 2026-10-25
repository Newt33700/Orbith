import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach } from 'vitest';

export interface Fixture {
  root: string;
  put(rel: string, content: string): Promise<string>;
}

export function useProject(): Fixture {
  const f = { root: '' } as Fixture;
  beforeEach(async () => {
    f.root = await mkdtemp(path.join(os.tmpdir(), 'orbith-chk-'));
    await mkdir(path.join(f.root, '.orbith'), { recursive: true });
  });
  afterEach(async () => {
    await rm(f.root, { recursive: true, force: true });
  });
  f.put = async (rel, content) => {
    const p = path.join(f.root, rel);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, content, 'utf8');
    return p;
  };
  return f;
}

export function git(root: string, ...args: string[]): void {
  execFileSync('git', args, { cwd: root, stdio: 'ignore' });
}

export function initRepo(root: string): void {
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Test User');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'commit.gpgsign', 'false');
}

export const CSR = `# Cadre de Référence (CSR)

## Langages
| Outil | Version min | Statut | Commentaire |
|---|---|---|---|
| Java | 21 | autorisé | |
| Node.js | 22 | autorisé | LTS uniquement |
| Python | 3.11 | autorisé | |

## Frameworks
| Outil | Version min | Statut | Commentaire |
|---|---|---|---|
| Spring Boot | 3.3 | autorisé | |
| AngularJS | | interdit | fin de vie |
| moment | | déprécié | utiliser date-fns |
`;
