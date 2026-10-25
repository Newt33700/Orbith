import { OrbithError } from './errors.js';

/** Incident severities of the `incident` template: 1 critique, 2 majeure, 3 mineure. */
export type Gravite = 1 | 2 | 3;
export const GRAVITES: readonly Gravite[] = [1, 2, 3];
export const GRAVITE_LIBELLES: Record<Gravite, string> = { 1: 'critique', 2: 'majeure', 3: 'mineure' };

/**
 * Optional service level objectives (`sla` in .orbith/config.yaml), compared by `orbith metriques`
 * with what the incidents (INC-NNN) and production bugs actually show.
 */
export interface SlaConfig {
  /** Target availability over the period, in % (estimated from declared incidents). */
  disponibilite_pct?: number;
  /** Maximum restore time of an incident (`retabli_le` − `detecte_le`), in hours, per severity. */
  retablissement_heures?: Partial<Record<Gravite, number>>;
  /** Maximum time to fix a production bug (`mis_en_prod_le` − `detecte_le`), in days. */
  correction_bug_prod_jours?: number;
}

export const SLA_CLES = ['disponibilite_pct', 'retablissement_heures', 'correction_bug_prod_jours'] as const;

const err = (msg: string): OrbithError => new OrbithError(`Fichier .orbith/config.yaml invalide : ${msg}`);

const nombre = (v: unknown, cle: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw err(`\`sla.${cle}\` doit être un nombre positif ou nul.`);
  return v;
};

/**
 * Reads a severity written as `1`, `"1"`, `"1 critique"`, `critique`, `majeure`, `mineure`
 * (case and accents ignored). Returns undefined when it cannot be recognised.
 */
export function lireGravite(v: unknown): Gravite | undefined {
  if (v == null) return undefined;
  const s = String(v)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
  const m = /^([123])\b/.exec(s);
  if (m) return Number(m[1]) as Gravite;
  if (s.startsWith('critique')) return 1;
  if (s.startsWith('majeur')) return 2;
  if (s.startsWith('mineur')) return 3;
  return undefined;
}

/** Parses the optional `sla` section; unknown keys or non-numeric values raise an `OrbithError`. */
export function lireSla(raw: unknown): SlaConfig | undefined {
  if (raw == null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw err('`sla` doit être une liste de clés et de valeurs.');
  const out: SlaConfig = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k === 'disponibilite_pct') {
      const n = nombre(v, k);
      if (n > 100) throw err('`sla.disponibilite_pct` doit être compris entre 0 et 100.');
      out.disponibilite_pct = n;
    } else if (k === 'correction_bug_prod_jours') {
      out.correction_bug_prod_jours = nombre(v, k);
    } else if (k === 'retablissement_heures') {
      if (v == null) continue;
      if (typeof v !== 'object' || Array.isArray(v)) {
        throw err('`sla.retablissement_heures` doit associer une gravité (1, 2, 3 ou critique, majeure, mineure) à un nombre d\'heures.');
      }
      const parGravite: Partial<Record<Gravite, number>> = {};
      for (const [g, h] of Object.entries(v as Record<string, unknown>)) {
        const grav = lireGravite(g);
        if (!grav) throw err(`gravité inconnue « ${g} » dans \`sla.retablissement_heures\` (attendu : 1, 2, 3 ou critique, majeure, mineure).`);
        parGravite[grav] = nombre(h, `retablissement_heures.${g}`);
      }
      out.retablissement_heures = parGravite;
    } else {
      throw err(`clé \`sla\` inconnue « ${k} » (attendu : ${SLA_CLES.join(', ')}).`);
    }
  }
  return out;
}
