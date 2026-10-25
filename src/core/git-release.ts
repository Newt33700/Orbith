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

/** Tag names reachable from HEAD (`git tag --merged HEAD`, git >= 2.7); empty when git fails or there is no commit. */
export async function gitReachableTags(root: string): Promise<string[]> {
  try {
    return (await run(root, ['tag', '--merged', 'HEAD'])).split(/\r?\n/).filter(Boolean);
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

/**
 * Among `paths` (posix, relative to root), those with uncommitted changes: modified, staged or untracked.
 * Ignored files are not reported. Empty when git fails.
 */
export async function gitDirtyPaths(root: string, paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  let out: string;
  let prefix: string;
  try {
    // Porcelain paths are relative to the repository top level, not to `root` (project in a sub-folder).
    prefix = (await run(root, ['rev-parse', '--show-prefix'])).trim();
    out = await run(root, ['status', '--porcelain', '-z', '--untracked-files=all', '--', ...paths]);
  } catch {
    return [];
  }
  const dirty = new Set<string>();
  const entries = out.split('\0');
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    if (e.length < 4) continue;
    dirty.add(e.slice(3));
    // Renames and copies carry the original path in the next NUL-separated field.
    if (e[0] === 'R' || e[0] === 'C') i++;
  }
  return paths.filter((p) => dirty.has(prefix + p));
}

/** Removes the given paths from the index (back to HEAD, or untracked when HEAD does not exist yet). */
export async function gitUnstage(root: string, paths: string[]): Promise<void> {
  try {
    await run(root, ['reset', '-q', '--', ...paths]);
  } catch {
    await run(root, ['rm', '--cached', '-q', '--ignore-unmatch', '--', ...paths]);
  }
}
