import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OrbithError } from './errors.js';
import { exists } from './fsutil.js';

export const ORBITH_DIR = '.orbith';

let cachedRoot: string | undefined;

export function packageRoot(): string {
  if (cachedRoot) return cachedRoot;
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const pkg = path.join(dir, 'package.json');
    if (existsSync(pkg)) {
      try {
        const json = JSON.parse(readFileSync(pkg, 'utf8')) as { name?: string };
        if (json.name === 'orbith') {
          cachedRoot = dir;
          return dir;
        }
      } catch {
        // ignore unreadable package.json and keep walking up
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) throw new OrbithError("Impossible de localiser le paquet Orbith (package.json introuvable).");
    dir = parent;
  }
}

export function contentDir(): string {
  return path.join(packageRoot(), 'content');
}

export function pluginsDir(): string {
  return path.join(packageRoot(), 'plugins');
}

export async function findProjectRoot(start: string): Promise<string | null> {
  let dir = path.resolve(start);
  for (;;) {
    if (await exists(path.join(dir, ORBITH_DIR))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export async function requireProjectRoot(start: string): Promise<string> {
  const root = await findProjectRoot(start);
  if (!root) {
    throw new OrbithError(
      "Aucun projet Orbith trouvé ici (dossier .orbith introuvable). Lance d'abord `npx orbith install`.",
    );
  }
  return root;
}

export function toPosixRelative(root: string, file: string): string {
  return path.relative(root, path.resolve(root, file)).split(path.sep).join('/');
}
