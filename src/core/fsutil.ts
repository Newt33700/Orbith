import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Writes a file, creating parent dirs. Returns false when skipped (exists and !overwrite). */
export async function writeFileSafe(
  p: string,
  content: string,
  opts: { overwrite?: boolean } = {},
): Promise<boolean> {
  if (!opts.overwrite && (await exists(p))) return false;
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, 'utf8');
  return true;
}

/** Recursively copies src into dest. Returns the list of files actually written. */
export async function copyDir(
  src: string,
  dest: string,
  opts: { overwrite?: boolean } = {},
): Promise<string[]> {
  const written: string[] = [];
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      written.push(...(await copyDir(from, to, opts)));
    } else if (entry.isFile()) {
      if (!opts.overwrite && (await exists(to))) continue;
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(from, to);
      written.push(to);
    }
  }
  return written;
}
