import { promises as fs } from 'node:fs';
import path from 'node:path';
import { exists } from '../core/index.js';

/** Replaces the marked block of a text (or appends it). Pure and idempotent. */
export function upsertBlock(content: string, start: string, end: string, block: string): string {
  const full = `${start}\n${block.replace(/\n+$/, '')}\n${end}`;
  const i = content.indexOf(start);
  const j = i >= 0 ? content.indexOf(end, i + start.length) : -1;
  if (i >= 0 && j >= 0) {
    return content.slice(0, i) + full + content.slice(j + end.length);
  }
  if (content.trim() === '') return full + '\n';
  return content.replace(/\n*$/, '\n\n') + full + '\n';
}

/** Writes `content` only if it differs. Returns the posix path relative to root. */
export async function writeIfChanged(root: string, rel: string, content: string): Promise<string> {
  const file = path.join(root, rel);
  const previous = (await exists(file)) ? await fs.readFile(file, 'utf8') : null;
  if (previous !== content) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, 'utf8');
  }
  return rel.split(path.sep).join('/');
}

export async function upsertBlockFile(
  root: string,
  rel: string,
  start: string,
  end: string,
  block: string,
): Promise<string> {
  const file = path.join(root, rel);
  const previous = (await exists(file)) ? await fs.readFile(file, 'utf8') : '';
  return writeIfChanged(root, rel, upsertBlock(previous, start, end, block));
}
