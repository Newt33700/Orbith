import { GRAVITES, GRAVITE_LIBELLES, lireGravite, type Artifact, type Gravite, type SlaConfig } from '../core/index.js';
import type { Deploiement } from './deploiement.js';

// Service level objectives (config `sla`), DORA deployment rework rate and the optional reliability
// self-assessment. Pure functions: no I/O. Missing data is reported as "non mesurable", never as 0.

const JOUR = 86_400_000;
const HEURE = 3_600_000;
const arrondi = (n: number, d = 1): number => Math.round(n * 10 ** d) / 10 ** d;

/** Mention used when a value is computed although nothing was declared (same convention as the failure rate). */
export const AVERTISSEMENT_AUCUN_INCIDENT = 'aucun incident déclaré : à vérifier';

/**
 * Instant (ms) of a frontmatter date: `AAAA-MM-JJ` (midnight), `AAAA-MM-JJ HH:MM[:SS]` or ISO, a YAML date.
 * Times without a time zone are read as UTC so that durations between two such values stay exact.
 */
export function instant(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v.getTime();
  const s = String(v).trim();
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?))?\s*(Z|[+-]\d{2}:?\d{2})?$/.exec(s);
  if (!m) return undefined;
  const iso = `${m[1]}T${m[2] ?? '00:00'}${m[3] ?? 'Z'}`;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? undefined : t;
}

const debutJour = (d: string): number => Date.parse(`${d}T00:00:00Z`);

export type CleObjectif = 'disponibilite' | 'retablissement' | 'correction_bug_prod';

export interface ObjectifMesure {
  cle: CleObjectif;
  libelle: string;
  /** Only for `retablissement`. */
  gravite?: Gravite;
  /** `min`: the value must reach the target; `max`: must not exceed it. */
  sens: 'min' | 'max';
  cible: number;
  unite: string;
  /** Availability in %, or the worst (longest) measured duration; null when not measurable. */
  valeur: number | null;
  /** Incidents or bugs with both dates, in the period. */
  mesures: number;
  /** Among `mesures`, those within the target. */
  respectes: number;
  /** Incidents or bugs of the period still missing their end date. */
  incomplets: string[];
  /** null = non mesurable. */
  atteint: boolean | null;
  /** Why it is not measurable, or a caution about the value. */
  remarque: string | null;
}

export interface ResultatSla {
  objectifs: ObjectifMesure[];
  bilan: { atteints: number; nonAtteints: number; nonMesurables: number };
  /** Data-quality notes (incidents without a usable severity or detection date…). */
  avertissements: string[];
}

export interface Reprise {
  /** Production deployments of the period. */
  deploiements: number;
  /** Among them, deployments that ship the fix of a production bug (unplanned work). */
  deploiementsDeReprise: number;
  /** null without any production deployment. */
  pourcentage: number | null;
  avertissement: string | null;
}

export interface AutoEvaluationFiabilite {
  /** Retrospective file the value comes from. */
  source: string;
  version: string | null;
  /** Value written by the team, shown verbatim (no DORA level exists for it). */
  valeur: string;
}

const estBug = (a: Artifact): boolean =>
  Array.isArray(a.data['labels']) && (a.data['labels'] as unknown[]).some((l) => String(l).toLowerCase() === 'bug');
const estBugProd = (a: Artifact): boolean =>
  a.type === 'story' && estBug(a) && String(a.data['origine'] ?? '').toLowerCase() === 'production';
const nom = (a: Artifact): string => a.id ?? a.chemin;

interface Periode {
  debut: number;
  /** Exclusive end (the day after `fin`). */
  fin: number;
}

function periode(debut: string, fin: string): Periode {
  return { debut: debutJour(debut), fin: debutJour(fin) + JOUR };
}

interface Element {
  nom: string;
  det?: number;
  fin?: number;
}

/** Common logic of a per-item time objective (incident restore, production bug fix). */
function objectifDuree(
  base: Omit<ObjectifMesure, 'valeur' | 'mesures' | 'respectes' | 'incomplets' | 'atteint' | 'remarque'>,
  elements: Element[],
  p: Periode,
  uniteMs: number,
  vide: string,
): ObjectifMesure {
  const complets = elements.filter((e) => e.det != null && e.fin != null && e.fin >= p.debut && e.fin < p.fin);
  const ouverts = elements.filter((e) => e.det != null && e.fin == null && e.det < p.fin);
  const durees = complets.map((e) => Math.max(0, (e.fin! - e.det!) / uniteMs));
  const respectes = durees.filter((d) => d <= base.cible).length;
  // An item still open at the end of the period, already older than the target, misses it for sure.
  const ouvertsHorsDelai = ouverts.filter((e) => (p.fin - e.det!) / uniteMs > base.cible);
  let atteint: boolean | null;
  let remarque: string | null = null;
  if (respectes < durees.length || ouvertsHorsDelai.length) atteint = false;
  else if (ouverts.length) {
    atteint = null;
    remarque = `date de fin manquante : ${ouverts.map((e) => e.nom).join(', ')}`;
  } else if (durees.length) atteint = true;
  else {
    atteint = null;
    remarque = vide;
  }
  if (atteint === false && ouvertsHorsDelai.length) {
    remarque = `toujours ouvert(s) au-delà de l'objectif : ${ouvertsHorsDelai.map((e) => e.nom).join(', ')}`;
  }
  return {
    ...base,
    valeur: durees.length ? arrondi(Math.max(...durees)) : null,
    mesures: durees.length,
    respectes,
    incomplets: ouverts.map((e) => e.nom),
    atteint,
    remarque,
  };
}

/**
 * Compares the configured service level objectives with the incidents (`detecte_le`, `retabli_le`, `gravite`)
 * and production bugs (`detecte_le`, `mis_en_prod_le`) of the period `[debut, fin]` (dates AAAA-MM-JJ, inclusive).
 */
export function calculerSla(arts: Artifact[], sla: SlaConfig, debut: string, fin: string): ResultatSla {
  const p = periode(debut, fin);
  const incidents = arts.filter((a) => a.type === 'incident');
  const objectifs: ObjectifMesure[] = [];
  const avertissements: string[] = [];

  const sansDetection = incidents.filter((i) => instant(i.data['detecte_le']) == null);
  if (sansDetection.length) {
    avertissements.push(`incident(s) sans date de détection exploitable, ignoré(s) : ${sansDetection.map(nom).join(', ')}`);
  }
  const datees = incidents
    .map((i) => ({ a: i, nom: nom(i), det: instant(i.data['detecte_le']), fin: instant(i.data['retabli_le']) }))
    .filter((e) => e.det != null);

  if (sla.disponibilite_pct != null) {
    const touchent = datees.filter((e) => e.det! < p.fin && (e.fin == null || e.fin > p.debut));
    const ouverts = touchent.filter((e) => e.fin == null);
    let valeur: number | null = null;
    let remarque: string | null = null;
    if (ouverts.length) {
      remarque = `date de rétablissement manquante : ${ouverts.map((e) => e.nom).join(', ')}`;
    } else {
      // Union of the downtime intervals, clipped to the period.
      const iv = touchent
        .map((e) => [Math.max(e.det!, p.debut), Math.min(e.fin!, p.fin)] as [number, number])
        .filter(([a, b]) => b > a)
        .sort((x, y) => x[0] - y[0]);
      let total = 0;
      let cur: [number, number] | null = null;
      for (const x of iv) {
        if (cur && x[0] <= cur[1]) cur[1] = Math.max(cur[1], x[1]);
        else {
          if (cur) total += cur[1] - cur[0];
          cur = [x[0], x[1]];
        }
      }
      if (cur) total += cur[1] - cur[0];
      valeur = arrondi(100 * (1 - total / (p.fin - p.debut)), 2);
      if (touchent.length === 0) remarque = AVERTISSEMENT_AUCUN_INCIDENT;
    }
    objectifs.push({
      cle: 'disponibilite',
      libelle: 'Disponibilité (estimée à partir des incidents déclarés)',
      sens: 'min',
      cible: sla.disponibilite_pct,
      unite: '%',
      valeur,
      mesures: touchent.length - ouverts.length,
      respectes: 0,
      incomplets: ouverts.map((e) => e.nom),
      atteint: valeur == null ? null : valeur >= sla.disponibilite_pct,
      remarque,
    });
  }

  const sansGravite = datees.filter((e) => !lireGravite(e.a.data['gravite']));
  if (sla.retablissement_heures && Object.keys(sla.retablissement_heures).length) {
    if (sansGravite.length) {
      avertissements.push(`incident(s) sans gravité reconnue (1, 2 ou 3), non comptés par gravité : ${sansGravite.map((e) => e.nom).join(', ')}`);
    }
    for (const g of GRAVITES) {
      const cible = sla.retablissement_heures[g];
      if (cible == null) continue;
      const elements = datees.filter((e) => lireGravite(e.a.data['gravite']) === g);
      objectifs.push(
        objectifDuree(
          { cle: 'retablissement', gravite: g, libelle: `Rétablissement d'un incident de gravité ${g} (${GRAVITE_LIBELLES[g]})`, sens: 'max', cible, unite: 'heure(s)' },
          elements,
          p,
          HEURE,
          `aucun incident de gravité ${g} sur la période`,
        ),
      );
    }
  }

  if (sla.correction_bug_prod_jours != null) {
    const sansDate = arts.filter(estBugProd).filter((b) => instant(b.data['detecte_le']) == null);
    if (sansDate.length) avertissements.push(`bug(s) de production sans date de détection exploitable, ignoré(s) : ${sansDate.map(nom).join(', ')}`);
    const bugs = arts.filter(estBugProd).map((b) => ({
      nom: nom(b),
      det: instant(b.data['detecte_le']),
      fin: instant(b.data['mis_en_prod_le']),
    }));
    objectifs.push(
      objectifDuree(
        { cle: 'correction_bug_prod', libelle: "Correction d'un bug de production (détection → mise en production du correctif)", sens: 'max', cible: sla.correction_bug_prod_jours, unite: 'jour(s)' },
        bugs,
        p,
        JOUR,
        'aucun bug de production corrigé ni ouvert sur la période',
      ),
    );
  }

  return {
    objectifs,
    bilan: {
      atteints: objectifs.filter((o) => o.atteint === true).length,
      nonAtteints: objectifs.filter((o) => o.atteint === false).length,
      nonMesurables: objectifs.filter((o) => o.atteint === null).length,
    },
    avertissements,
  };
}

/**
 * DORA deployment rework rate (fifth software delivery metric since the 2024 report): share of production
 * deployments that were unplanned and performed to fix a user-facing bug. Orbith counts a production deployment
 * of the period as rework when it ships a story labelled `bug` with `origine: production`. No performance level:
 * DORA publishes none for this metric.
 */
export function calculerReprise(arts: Artifact[], deploiements: Deploiement[], debut: string, fin: string): Reprise {
  const p = periode(debut, fin);
  const prod = deploiements.filter((d) => {
    const t = instant(d.date);
    return d.env === 'production' && t != null && t >= p.debut && t < p.fin;
  });
  const bugs = new Set(arts.filter(estBugProd).map((b) => b.id).filter((i): i is string => !!i));
  const reprise = prod.filter((d) => Array.isArray(d.us) && d.us.some((id) => bugs.has(id))).length;
  return {
    deploiements: prod.length,
    deploiementsDeReprise: reprise,
    pourcentage: prod.length ? arrondi((reprise / prod.length) * 100) : null,
    avertissement: prod.length > 0 && bugs.size === 0 ? 'aucun bug de production déclaré : à vérifier' : null,
  };
}

/** Optional reliability self-assessments written by the team in retrospectives (`fiabilite_auto_evaluation`). */
export function autoEvaluationsFiabilite(arts: Artifact[]): AutoEvaluationFiabilite[] {
  return arts
    .filter((a) => a.type === 'retro' && a.data['fiabilite_auto_evaluation'] != null && String(a.data['fiabilite_auto_evaluation']).trim() !== '')
    .map((a) => ({
      source: a.chemin,
      version: a.data['version'] != null ? String(a.data['version']) : null,
      valeur: String(a.data['fiabilite_auto_evaluation']).trim(),
    }))
    .sort((x, y) => x.source.localeCompare(y.source));
}
