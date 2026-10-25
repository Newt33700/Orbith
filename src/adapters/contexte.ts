import { promises as fs } from 'node:fs';
import path from 'node:path';
import { contentDir, exists, ORBITH_DIR } from '../core/index.js';

/** Project context file, relative to the project root (posix). */
export const CONTEXTE_PROJET = `${ORBITH_DIR}/contexte-projet.md`;

/** Marker that stays in the file until a human or an agent has completed it. */
export const MARQUEUR_A_COMPLETER = '<!-- orbith:a-completer -->';

/** Creates `.orbith/contexte-projet.md` from the template when missing. Never overwrites. */
export async function ensureContexteProjet(root: string): Promise<void> {
  const file = path.join(root, CONTEXTE_PROJET);
  if (await exists(file)) return;
  const template = path.join(contentDir(), 'templates', 'contexte-projet.md');
  if (!(await exists(template))) return;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.copyFile(template, file);
}
