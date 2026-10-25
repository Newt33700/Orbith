import { createHash } from 'node:crypto';

/** `precedent` de la première entrée d'une chaîne. */
export const GENESE = '0'.repeat(64);

export type EtatChaine =
  /** Aucune entrée. */
  | { etat: 'vide' }
  /** Ancien registre sans chaîne : à chaîner au prochain enregistrement. */
  | { etat: 'sans-chaine' }
  | { etat: 'ok' }
  /** `index` = position (0-based) de la première entrée dont le chaînage est incohérent. */
  | { etat: 'rompue'; index: number };

/** Sérialisation canonique : clés triées, indépendante de l'ordre d'écriture dans le JSON. */
function canonique(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonique).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonique(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** Empreinte SHA-256 d'une entrée complète (`precedent` inclus). */
export function hashEntree(entry: object): string {
  return createHash('sha256').update(canonique(entry), 'utf8').digest('hex');
}

/** Recalcule `precedent` de toutes les entrées (ordre du tableau = ordre du journal). */
export function chainer<T extends object>(entries: readonly T[]): (T & { precedent: string })[] {
  const out: (T & { precedent: string })[] = [];
  let prec = GENESE;
  for (const e of entries) {
    const { precedent: _ancien, ...reste } = e as T & { precedent?: unknown };
    const c = { ...reste, precedent: prec } as unknown as T & { precedent: string };
    out.push(c);
    prec = hashEntree(c);
  }
  return out;
}

export function verifierChaine(entries: readonly { precedent?: unknown }[]): EtatChaine {
  if (entries.length === 0) return { etat: 'vide' };
  if (entries.every((e) => e.precedent === undefined)) return { etat: 'sans-chaine' };
  let prec = GENESE;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i]!.precedent !== prec) return { etat: 'rompue', index: i };
    prec = hashEntree(entries[i]!);
  }
  return { etat: 'ok' };
}

function sansPrecedent(entry: object): string {
  const { precedent: _p, ...reste } = entry as { precedent?: unknown };
  return canonique(reste);
}

/**
 * Entries of the committed journal (`head`) that are gone or altered in the working copy (`travail`):
 * what the chain alone cannot see (removing only the LAST entry leaves a valid chain).
 * - `append-seul` (deployments): the committed entries must be an unchanged prefix of the working ones.
 * - `remplacement` (validations): `recordValidation` replaces the entry of a file by a new one at the end and
 *   rechains everything, so `precedent` is ignored and an entry is legitimately replaced when the working copy
 *   still has an entry for the same `fichier`. Anything else is a removal.
 * Returns the indexes (0-based, in `head`) of the missing or altered entries.
 */
export function entreesPerdues(
  head: readonly object[],
  travail: readonly object[],
  mode: 'append-seul' | 'remplacement',
): number[] {
  const perdues: number[] = [];
  if (mode === 'append-seul') {
    head.forEach((h, i) => {
      const t = travail[i];
      if (!t || hashEntree(t) !== hashEntree(h)) perdues.push(i);
    });
    return perdues;
  }
  const contenus = new Set(travail.map(sansPrecedent));
  const fichiers = new Set(travail.map((t) => (t as { fichier?: unknown }).fichier));
  head.forEach((h, i) => {
    if (contenus.has(sansPrecedent(h))) return;
    if (fichiers.has((h as { fichier?: unknown }).fichier)) return;
    perdues.push(i);
  });
  return perdues;
}
