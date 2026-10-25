import path from 'node:path';
import type { Artifact } from './artifacts.js';

// Continual improvement actions (AMEL-NNN) and knowledge links between artifacts (`liens`).

/** Progress of an improvement action (`avancement`); `statut` stays the human-validation field. */
export const AVANCEMENTS = ['ouvert', 'en cours', 'fait', 'abandonné'] as const;
export type Avancement = (typeof AVANCEMENTS)[number];

/** Where an improvement action comes from (`source`). */
export const SOURCES_AMELIORATION = ['retro', 'incident', 'metrique'] as const;
export type SourceAmelioration = (typeof SOURCES_AMELIORATION)[number];

const norm = (v: unknown): string =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .trim();

const AVANCEMENT_ALIASES: Record<string, Avancement> = {
  ouvert: 'ouvert',
  ouverte: 'ouvert',
  'a faire': 'ouvert',
  'en cours': 'en cours',
  fait: 'fait',
  faite: 'fait',
  termine: 'fait',
  terminee: 'fait',
  abandonne: 'abandonné',
  abandonnee: 'abandonné',
};

/**
 * Normalised progress of an improvement action: `ouvert` when the field is absent,
 * `undefined` when the value is not recognised (reported by `orbith check`).
 */
export function avancement(a: { data: Record<string, unknown> }): Avancement | undefined {
  const v = a.data['avancement'];
  if (v == null || String(v).trim() === '') return 'ouvert';
  return AVANCEMENT_ALIASES[norm(v)];
}

export function sourceAmelioration(a: { data: Record<string, unknown> }): SourceAmelioration | undefined {
  const s = norm(a.data['source']).replace(/ /g, '');
  if (s === 'retro' || s === 'retrospective') return 'retro';
  if (s === 'incident') return 'incident';
  if (s === 'metrique' || s === 'metriques' || s === 'indicateur') return 'metrique';
  return undefined;
}

/** Date-only string (AAAA-MM-JJ) from a frontmatter value, or undefined. */
export function dateJour(v: unknown): string | undefined {
  if (v == null || v === '') return undefined;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v.toISOString().slice(0, 10);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v).trim());
  return m && !Number.isNaN(Date.parse(m[1]!)) ? m[1] : undefined;
}

/** True when the action is still open (`ouvert` / `en cours`) and its `echeance` is before `aujourdhui`. */
export function enRetard(a: Artifact, aujourdhui: string): boolean {
  const av = avancement(a);
  if (av === 'fait' || av === 'abandonné') return false;
  const e = dateJour(a.data['echeance']);
  return !!e && e < aujourdhui;
}

/** Values of the optional `liens` field (list, or comma-separated string), trimmed and de-duplicated. */
export function lireLiens(data: Record<string, unknown>): string[] {
  const raw = data['liens'];
  const xs = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  return [...new Set(xs.filter((x) => x != null).map((x) => String(x).trim()).filter(Boolean))];
}

/** Key of an artifact in the knowledge graph: its `id`, else its file name without `.md` (e.g. `retro-1.2.0`). */
export function cleArtifact(a: Artifact): string {
  return a.id ?? path.posix.basename(a.chemin).replace(/\.md$/i, '');
}

/** Template placeholders such as `US-XXX` or `CHG-XXX` are not links. */
const estPlaceholder = (v: string): boolean => /-x+$/i.test(v) || /^<.*>$/.test(v);

export type ChampLien = 'liens' | 'cause' | 'change' | 'source_ref';

export interface Lien {
  source: string;
  cible: string;
  champ: ChampLien;
  /** False when no scanned artifact has this key. */
  existe: boolean;
}

export interface NoeudConnaissance {
  cle: string;
  type: Artifact['type'];
  libelle: string;
  chemin: string;
  sortants: Lien[];
  entrants: Lien[];
}

/** Outgoing references of an artifact: `liens`, plus `cause` (bug), `change` (incident), `source_ref` (improvement). */
export function referencesSortantes(a: Artifact): { cible: string; champ: ChampLien }[] {
  const out: { cible: string; champ: ChampLien }[] = lireLiens(a.data).map((cible) => ({ cible, champ: 'liens' as const }));
  const simple = (champ: ChampLien): void => {
    const v = a.data[champ];
    if (v == null || typeof v === 'object') return;
    const s = String(v).trim();
    if (s && !estPlaceholder(s)) out.push({ cible: s, champ });
  };
  if (a.type === 'story') simple('cause');
  if (a.type === 'incident') simple('change');
  if (a.type === 'amelioration') simple('source_ref');
  return out.filter((r) => !estPlaceholder(r.cible));
}

/** Knowledge graph: every artifact that has at least one outgoing or incoming link. */
export function grapheConnaissance(arts: Artifact[]): NoeudConnaissance[] {
  const parCle = new Map<string, Artifact>();
  for (const a of arts) {
    const k = cleArtifact(a).toLowerCase();
    if (!parCle.has(k)) parCle.set(k, a);
  }
  const liens: Lien[] = [];
  for (const a of arts) {
    for (const r of referencesSortantes(a)) {
      const cible = parCle.get(r.cible.toLowerCase());
      liens.push({ source: cleArtifact(a), cible: cible ? cleArtifact(cible) : r.cible, champ: r.champ, existe: !!cible });
    }
  }
  const noeuds: NoeudConnaissance[] = [];
  for (const a of arts) {
    const k = cleArtifact(a);
    const sortants = liens.filter((l) => l.source === k);
    const entrants = liens.filter((l) => l.existe && l.cible === k);
    if (!sortants.length && !entrants.length) continue;
    noeuds.push({ cle: k, type: a.type, libelle: a.titre ?? k, chemin: a.chemin, sortants, entrants });
  }
  return noeuds;
}

/** Links (field `liens` or `source_ref`) that point to an identifier no scanned artifact has. */
export function liensCasses(arts: Artifact[]): { artefact: Artifact; cible: string; champ: ChampLien }[] {
  const cles = new Set(arts.map((a) => cleArtifact(a).toLowerCase()));
  const out: { artefact: Artifact; cible: string; champ: ChampLien }[] = [];
  for (const a of arts) {
    for (const r of referencesSortantes(a)) {
      if (r.champ !== 'liens' && r.champ !== 'source_ref') continue;
      if (!cles.has(r.cible.toLowerCase())) out.push({ artefact: a, ...r });
    }
  }
  return out;
}

/**
 * Improvement actions linked to the given artifact, in either direction: the action references it
 * (`source_ref` or `liens`), or the artifact lists the action in its own `liens`.
 */
export function ameliorationsLiees(arts: Artifact[], cible: Artifact): Artifact[] {
  const k = cleArtifact(cible).toLowerCase();
  const citees = new Set(referencesSortantes(cible).map((r) => r.cible.toLowerCase()));
  return arts.filter(
    (a) =>
      a.type === 'amelioration' &&
      (citees.has(cleArtifact(a).toLowerCase()) || referencesSortantes(a).some((r) => r.cible.toLowerCase() === k)),
  );
}
