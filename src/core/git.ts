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

/** Commits du plus ancien au plus récent, avec la date (AAAA-MM-JJ, date de commit). */
export async function gitLogDated(root: string): Promise<{ hash: string; date: string; subject: string }[]> {
  const out = await git(root, ['log', '--reverse', '--pretty=format:%H%x09%cI%x09%s']);
  if (!out) return [];
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      const [hash = '', date = '', ...rest] = l.split('\t');
      return { hash, date: date.slice(0, 10), subject: rest.join('\t') };
    });
}

/** Auteur du dernier commit ayant touché le fichier, ou null (fichier non suivi, pas de dépôt). */
export async function gitLastAuthor(root: string, rel: string): Promise<{ name: string; email: string } | null> {
  const out = await git(root, ['log', '-n1', '--format=%an%x09%ae', '--', rel]);
  const line = out?.split(/\r?\n/).find(Boolean);
  if (!line) return null;
  const [name = '', email = ''] = line.split('\t');
  return name || email ? { name, email } : null;
}

/**
 * Dernier commit ayant modifié une ligne `status:` du fichier, avec son contenu à ce commit.
 * Sert à dater le passage d'une US dans une colonne (par exemple « Terminée »).
 */
export async function gitLastStatusChange(root: string, rel: string): Promise<{ date: string; content: string } | null> {
  const out = await git(root, ['log', '-n1', '--format=%H%x09%cI', '-G', 'status:', '--', rel]);
  const line = out?.split(/\r?\n/).find(Boolean);
  if (!line) return null;
  const [hash = '', date = ''] = line.split('\t');
  const content = await git(root, ['show', `${hash}:${rel}`]);
  return content === null ? null : { date: date.slice(0, 10), content };
}
