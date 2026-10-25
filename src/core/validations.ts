import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ORBITH_DIR, toPosixRelative } from './paths.js';
import { readDoc, type Doc } from './frontmatter.js';
import { exists } from './fsutil.js';
import { OrbithError } from './errors.js';

export type EtatValidation = 'validé' | 'non-validé' | 'modifié' | 'non-tracé';

export interface ValidationEntry {
  fichier: string;
  sha256: string;
  par: string;
  email: string;
  le: string;
}

export function hashBody(body: string): string {
  const normalized = body.replace(/\r\n/g, '\n').trim();
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function registryPath(root: string): string {
  return path.join(root, ORBITH_DIR, 'validations.json');
}

export async function loadRegistry(root: string): Promise<ValidationEntry[]> {
  const file = registryPath(root);
  if (!(await exists(file))) return [];
  let json: { validations?: ValidationEntry[] };
  try {
    json = JSON.parse(await fs.readFile(file, 'utf8')) as { validations?: ValidationEntry[] };
  } catch {
    // Ne jamais repartir d'un registre vide : recordValidation écraserait les validations existantes.
    throw new OrbithError(
      'Le registre .orbith/validations.json est illisible (JSON invalide). Corrige-le ou restaure-le depuis git avant de continuer.',
    );
  }
  return Array.isArray(json?.validations) ? json.validations : [];
}

export async function recordValidation(root: string, entry: ValidationEntry): Promise<void> {
  const entries = (await loadRegistry(root)).filter((e) => e.fichier !== entry.fichier);
  entries.push(entry);
  const file = registryPath(root);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ version: 1, validations: entries }, null, 2) + '\n', 'utf8');
}

/** `statut: validé` (tolère les accents saisis en forme décomposée et les espaces autour). */
export function estValide(statut: unknown): boolean {
  return typeof statut === 'string' && statut.normalize('NFC').trim() === 'validé';
}

export async function etatValidation(root: string, file: string, doc?: Doc): Promise<EtatValidation> {
  const abs = path.resolve(root, file);
  const d = doc ?? (await readDoc(abs));
  if (!estValide(d.data['statut'])) return 'non-validé';
  const rel = toPosixRelative(root, abs);
  const entry = (await loadRegistry(root)).find((e) => e.fichier === rel);
  if (!entry) return 'non-tracé';
  return entry.sha256 === hashBody(d.body) ? 'validé' : 'modifié';
}
