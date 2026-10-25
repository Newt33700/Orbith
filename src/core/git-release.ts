import { execFile } from 'node:child_process';

/** Runs git and returns stdout, or throws an Error carrying git's stderr. */
function run(root: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.toString().trim() || err.message));
      else resolve(stdout.toString());
    });
  });
}

export interface RawCommit {
  hash: string;
  subject: string;
  body: string;
}

/** All tag names (empty when git fails or the folder is not a repository). */
export async function gitTags(root: string): Promise<string[]> {
  try {
    return (await run(root, ['tag', '--list'])).split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Commits reachable from HEAD and not from `since` (a tag), oldest first, with their full body
 * (needed to detect `BREAKING CHANGE:` footers). Without `since`: the whole history.
 */
export async function gitCommitsSince(root: string, since?: string): Promise<RawCommit[]> {
  const args = ['log', '--reverse', '--pretty=format:%H%x1f%s%x1f%b%x1e'];
  if (since) args.push(`${since}..HEAD`);
  let out: string;
  try {
    out = await run(root, args);
  } catch {
    return [];
  }
  return out
    .split('\x1e')
    .map((r) => r.replace(/^\r?\n/, ''))
    .filter((r) => r.trim())
    .map((r) => {
      const [hash = '', subject = '', body = ''] = r.split('\x1f');
      return { hash, subject, body: body.trim() };
    });
}

/** Creates an annotated tag on HEAD. Never pushes. */
export async function gitCreateTag(root: string, tag: string, message: string): Promise<void> {
  await run(root, ['tag', '-a', tag, '-m', message]);
}

/** Commits only the given paths (adds them first); other staged or modified files are left untouched. */
export async function gitCommitPaths(root: string, paths: string[], message: string): Promise<void> {
  await run(root, ['add', '--', ...paths]);
  await run(root, ['commit', '-q', '-m', message, '--', ...paths]);
}
