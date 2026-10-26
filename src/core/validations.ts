import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ORBITH_DIR, toPosixRelative } from './paths.js';
import { readDoc, type Doc } from './frontmatter.js';
import { exists } from './fsutil.js';
import { OrbithError } from './errors.js';
import { chainer, verifierChaine, type EtatChaine } from './chaine.js';

export type EtatValidation = 'validé' | 'non-validé' | 'modifié' | 'non-tracé';

export interface ValidationEntry {
  fichier: string;
  sha256: string;
  par: string;
  email: string;
  le: string;
  /** Auteur du dernier commit du fichier au moment de la validation (principe des quatre yeux). */
  auteur?: string;
  auteur_email?: string;
  /** Empreinte de l'entrée précédente du registre (journal chaîné, voir chaine.ts). */
  precedent?: string;
}

export function hashBody(body: string): string {
  const normalized = body.replace(/\r\n/g, '\n').trim();
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/** Heading of the only body section left out of the validation hash (stories only, bugs included: `type: story`). */
export const SECTION_JOURNAL = 'Journal de réalisation';
const TYPES_AVEC_JOURNAL = new Set(['story']);
const RE_JOURNAL = /^##[ \t]+journal[ \t]+de[ \t]+réalisation[ \t]*#*[ \t]*$/i;

/**
 * Body without its `## Journal de réalisation` sections: each one runs from its heading up to the next heading of
 * level 1 or 2 (or the end). Everything else is kept byte for byte, so a body without journal is unchanged.
 */
export function retirerJournal(body: string): string {
  const out: string[] = [];
  let dansJournal = false;
  for (const ligne of body.replace(/\r\n/g, '\n').split('\n')) {
    if (/^#{1,2}[ \t]/.test(ligne)) dansJournal = RE_JOURNAL.test(ligne.normalize('NFC'));
    if (!dansJournal) out.push(ligne);
  }
  return out.join('\n');
}

/**
 * Hash recorded by `orbith valider`. For a story, the `## Journal de réalisation` section is excluded, so
 * agents can log their work there without invalidating the human validation. Other types: `hashBody`.
 */
export function empreinteValidation(body: string, type: unknown): string {
  return typeof type === 'string' && TYPES_AVEC_JOURNAL.has(type) ? hashBody(retirerJournal(body)) : hashBody(body);
}

/**
 * Does a recorded hash still match the body? Accepts the full-body hash (registries written before the journal
 * existed) or, for a story, the hash without the journal. Any other change of the body is still detected.
 */
export function empreinteCorrespond(sha256: string, body: string, type: unknown): boolean {
  return sha256 === hashBody(body) || sha256 === empreinteValidation(body, type);
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

/** État de la chaîne du registre des validations (lecture seule). */
export async function etatChaineRegistre(root: string): Promise<EtatChaine> {
  return verifierChaine(await loadRegistry(root));
}

/**
 * Enregistre une validation (remplace l'entrée du fichier) puis rechaîne le registre.
 * Un registre à la chaîne rompue est refusé : le rechaîner effacerait la trace de l'édition manuelle.
 * Un ancien registre sans chaîne est chaîné à cette occasion (migration douce).
 */
export async function recordValidation(root: string, entry: ValidationEntry): Promise<void> {
  const actuel = await loadRegistry(root);
  const chaine = verifierChaine(actuel);
  if (chaine.etat === 'rompue') {
    throw new OrbithError(
      `Le registre .orbith/validations.json a été modifié à la main (chaîne rompue à l'entrée ${chaine.index + 1}). Restaure-le depuis git avant de continuer.`,
    );
  }
  const entries = chainer([...actuel.filter((e) => e.fichier !== entry.fichier), entry]);
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
  return empreinteCorrespond(entry.sha256, d.body, d.data['type']) ? 'validé' : 'modifié';
}
