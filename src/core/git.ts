import { execFile } from 'node:child_process';
import { exists } from './fsutil.js';
import path from 'node:path';

function git(root: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      execFile('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
        resolve(err ? null : stdout.toString());
      });
    } catch {
      resolve(null);
    }
  });
}

export async function isGitRepo(root: string): Promise<boolean> {
  if (await exists(path.join(root, '.git'))) return true;
  return (await git(root, ['rev-parse', '--is-inside-work-tree']))?.trim() === 'true';
}

export async function gitUser(root: string): Promise<{ name: string; email: string } | null> {
  const name = (await git(root, ['config', 'user.name']))?.trim();
  const email = (await git(root, ['config', 'user.email']))?.trim();
  if (!name || !email) return null;
  return { name, email };
}

export async function gitLog(root: string, max: number): Promise<{ hash: string; subject: string }[]> {
  const out = await git(root, ['log', `-n${Math.max(1, Math.floor(max))}`, '--pretty=format:%H%x09%s']);
  if (!out) return [];
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf('\t');
      return { hash: l.slice(0, i), subject: l.slice(i + 1) };
    });
}

export async function gitLsFiles(root: string): Promise<string[] | null> {
  const out = await git(root, ['ls-files', '-z']);
  if (out === null) return null;
  return out.split('\0').filter(Boolean);
}
