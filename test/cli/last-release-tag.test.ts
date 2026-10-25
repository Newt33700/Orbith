import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { lastReleaseTag } from '../../src/cli/version-calc.js';
import { gitReachableTags, gitTags } from '../../src/core/index.js';

const roots: string[] = [];
afterEach(async () => {
  for (const r of roots.splice(0)) await rm(r, { recursive: true, force: true });
});

async function repo(): Promise<(...args: string[]) => void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'orbith-tag-'));
  roots.push(dir);
  const git = (...args: string[]) => {
    execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], {
      cwd: dir,
      stdio: 'pipe',
    });
  };
  git('init', '-q', '-b', 'main');
  (git as unknown as { dir: string }).dir = dir;
  return git;
}
const dirOf = (g: unknown) => (g as { dir: string }).dir;
let n = 0;
async function commitFile(g: (...a: string[]) => void): Promise<void> {
  await writeFile(path.join(dirOf(g), `f${n++}.txt`), 'x');
  g('add', '.');
  g('commit', '-q', '-m', `c${n}`);
}

describe('lastReleaseTag : tags atteignables depuis HEAD', () => {
  it('tous les tags atteignables : le plus grand (annoté et léger)', async () => {
    const g = await repo();
    await commitFile(g);
    g('tag', 'v1.0.0');
    await commitFile(g);
    g('tag', '-a', 'v1.2.0', '-m', 'm');
    await commitFile(g);
    g('tag', 'v1.10.0');
    const last = await lastReleaseTag(dirOf(g));
    expect(last?.tag).toBe('v1.10.0');
  });

  it('un tag plus grand sur une autre branche est ignoré, mais reste dans gitTags', async () => {
    const g = await repo();
    await commitFile(g);
    g('tag', '-a', 'v1.4.0', '-m', 'm');
    g('branch', 'maintenance-1');
    await commitFile(g);
    g('tag', '-a', 'v2.0.0', '-m', 'm');
    g('checkout', '-q', 'maintenance-1');
    await commitFile(g);
    g('tag', 'v3.0.0-rc.1');
    const root = dirOf(g);
    expect((await lastReleaseTag(root))?.tag).toBe('v1.4.0');
    expect(await gitTags(root)).toContain('v2.0.0');
    expect(await gitReachableTags(root)).not.toContain('v2.0.0');
  });

  it('un tag léger plus grand sur une autre branche est ignoré aussi', async () => {
    const g = await repo();
    await commitFile(g);
    g('tag', 'v1.0.0');
    g('checkout', '-q', '-b', 'autre');
    await commitFile(g);
    g('tag', 'v5.0.0');
    g('checkout', '-q', 'main');
    expect((await lastReleaseTag(dirOf(g)))?.tag).toBe('v1.0.0');
  });

  it('aucun tag atteignable : null', async () => {
    const g = await repo();
    await commitFile(g);
    g('checkout', '-q', '-b', 'autre');
    await commitFile(g);
    g('tag', '-a', 'v1.0.0', '-m', 'm');
    g('checkout', '-q', 'main');
    expect(await lastReleaseTag(dirOf(g))).toBeNull();
  });
});
