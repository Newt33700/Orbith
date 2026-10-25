import { storyStatus, type Artifact } from '../core/index.js';
import type { Deploiement } from './deploiement.js';
import { mentions } from './trace-report.js';

export type Niveau = 'élite' | 'élevé' | 'moyen' | 'faible';

export interface LigneUS {
  id: string;
  titre: string;
  bug: boolean;
  colonne: string;
  creee?: string;
  modifiee?: string;
  debutDev?: string;
  /** Passage en « Terminée » (développée, relue, acceptée). */
  terminee?: string;
  misEnProd?: string;
  /** Jours entre le début du développement (premier commit) et la mise en production. */
  leadTimeJours?: number;
  coutIa: number;
}

export interface Metriques {
  periode: { debut: string; fin: string; jours: number };
  devise: string;
  frequence: { deploiements: number; parSemaine: number; niveau: Niveau | null };
  leadTime: { medianeJours: number | null; us: number; niveau: Niveau | null };
  /** Attente entre « Terminée » et la mise en production. */
  attente: { medianeJours: number | null; us: number };
  tauxEchec: { pourcentage: number | null; deploiementsEnEchec: number; niveau: Niveau | null };
  retablissement: { medianeHeures: number | null; incidents: number; niveau: Niveau | null };
  couts: { total: number; parAgent: Record<string, number>; estimations: number };
  us: LigneUS[];
}

const JOUR = 86_400_000;

function dateStr(v: unknown): string | undefined {
  if (v == null || v === '') return undefined;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v.toISOString().slice(0, 10);
  const s = String(v).trim();
  return Number.isNaN(Date.parse(s)) ? undefined : s;
}

function ms(s: string): number {
  return Date.parse(s.length === 10 ? `${s}T00:00:00Z` : s);
}

function mediane(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

const arrondi = (n: number, d = 1): number => Math.round(n * 10 ** d) / 10 ** d;

export function estBug(a: Artifact): boolean {
  const labels = a.data['labels'];
  return Array.isArray(labels) && labels.some((l) => String(l).toLowerCase() === 'bug');
}

/** Somme des coûts IA estimés d'une US (`couts_ia`), et répartition par agent. */
export function coutsIa(a: Artifact): { total: number; parAgent: Record<string, number>; n: number } {
  const list = a.data['couts_ia'];
  const parAgent: Record<string, number> = {};
  let total = 0;
  let n = 0;
  if (!Array.isArray(list)) return { total, parAgent, n };
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    const cout = Number((e as Record<string, unknown>)['cout']);
    if (!Number.isFinite(cout) || cout < 0) continue;
    const agent = String((e as Record<string, unknown>)['agent'] ?? 'inconnu');
    parAgent[agent] = (parAgent[agent] ?? 0) + cout;
    total += cout;
    n++;
  }
  return { total, parAgent, n };
}

// Seuils inspirés des rapports DORA (State of DevOps).
function niveauFrequence(parSemaine: number): Niveau {
  if (parSemaine >= 7) return 'élite';
  if (parSemaine >= 1) return 'élevé';
  if (parSemaine >= 12 / 52) return 'moyen';
  return 'faible';
}
function niveauLeadTime(jours: number): Niveau {
  if (jours < 1) return 'élite';
  if (jours <= 7) return 'élevé';
  if (jours <= 30) return 'moyen';
  return 'faible';
}
function niveauEchec(pct: number): Niveau {
  if (pct <= 5) return 'élite';
  if (pct <= 10) return 'élevé';
  if (pct <= 15) return 'moyen';
  return 'faible';
}
function niveauRetablissement(heures: number): Niveau {
  if (heures < 1) return 'élite';
  if (heures < 24) return 'élevé';
  if (heures < 24 * 7) return 'moyen';
  return 'faible';
}

/**
 * Calcule les quatre indicateurs DORA sur la période, à partir des US (en-têtes), du registre des
 * mises en production et des dates de premier commit par US (repli quand `debut_dev_le` est absent).
 */
export function calculerMetriques(
  arts: Artifact[],
  deploiements: Deploiement[],
  premiersCommits: Map<string, string>,
  opts: { jours: number; aujourdhui?: string; devise: string; terminees?: Map<string, string> },
): Metriques {
  const fin = opts.aujourdhui ?? new Date().toISOString().slice(0, 10);
  const debut = new Date(ms(fin) - opts.jours * JOUR).toISOString().slice(0, 10);
  const dansPeriode = (d: string | undefined): boolean => !!d && ms(d) >= ms(debut) && ms(d) <= ms(fin) + JOUR - 1;

  const stories = arts.filter((a): a is Artifact & { id: string } => a.type === 'story' && !!a.id);
  const prod = deploiements.filter((d) => d.env === 'production' && dansPeriode(d.date));

  const lignes: LigneUS[] = stories.map((s) => {
    const debutDev = dateStr(s.data['debut_dev_le']) ?? premiersCommits.get(s.id);
    const misEnProd = dateStr(s.data['mis_en_prod_le']);
    const terminee = dateStr(s.data['termine_le']) ?? opts.terminees?.get(s.id);
    const lead = debutDev && misEnProd ? Math.max(0, (ms(misEnProd) - ms(debutDev)) / JOUR) : undefined;
    return {
      id: s.id,
      titre: s.titre ?? s.id,
      bug: estBug(s),
      colonne: storyStatus(s),
      creee: dateStr(s.data['created_date']),
      modifiee: dateStr(s.data['updated_date']),
      debutDev,
      terminee,
      misEnProd,
      leadTimeJours: lead != null ? arrondi(lead) : undefined,
      coutIa: arrondi(coutsIa(s).total, 2),
    };
  });

  const leads = lignes.filter((l) => !l.bug && dansPeriode(l.misEnProd) && l.leadTimeJours != null).map((l) => l.leadTimeJours!);
  const leadMed = mediane(leads);
  const attentes = lignes
    .filter((l) => !l.bug && dansPeriode(l.misEnProd) && l.terminee)
    .map((l) => Math.max(0, (ms(l.misEnProd!) - ms(l.terminee!)) / JOUR));
  const attenteMed = mediane(attentes);

  // Bugs de production : `cause` désigne l'US dont la livraison a introduit l'incident.
  const bugsProd = stories.filter((s) => estBug(s) && String(s.data['origine'] ?? '').toLowerCase() === 'production');
  const causes = new Set(bugsProd.map((b) => String(b.data['cause'] ?? '').trim()).filter(Boolean));
  const enEchec = prod.filter((d) => d.us.some((id) => [...causes].some((c) => mentions(c, id)))).length;
  const pct = prod.length > 0 ? arrondi((enEchec / prod.length) * 100) : null;

  const retab = bugsProd
    .map((b) => ({ det: dateStr(b.data['detecte_le']), fix: dateStr(b.data['mis_en_prod_le']) }))
    .filter((x): x is { det: string; fix: string } => !!x.det && !!x.fix && dansPeriode(x.fix))
    .map((x) => Math.max(0, (ms(x.fix) - ms(x.det)) / 3_600_000));
  const retabMed = mediane(retab);

  const parAgent: Record<string, number> = {};
  let total = 0;
  let estimations = 0;
  for (const s of stories) {
    const c = coutsIa(s);
    total += c.total;
    estimations += c.n;
    for (const [k, v] of Object.entries(c.parAgent)) parAgent[k] = arrondi((parAgent[k] ?? 0) + v, 2);
  }

  const parSemaine = arrondi(prod.length / (opts.jours / 7), 2);
  return {
    periode: { debut, fin, jours: opts.jours },
    devise: opts.devise,
    frequence: { deploiements: prod.length, parSemaine, niveau: prod.length > 0 ? niveauFrequence(parSemaine) : null },
    leadTime: { medianeJours: leadMed != null ? arrondi(leadMed) : null, us: leads.length, niveau: leadMed != null ? niveauLeadTime(leadMed) : null },
    attente: { medianeJours: attenteMed != null ? arrondi(attenteMed) : null, us: attentes.length },
    tauxEchec: { pourcentage: pct, deploiementsEnEchec: enEchec, niveau: pct != null ? niveauEchec(pct) : null },
    retablissement: {
      medianeHeures: retabMed != null ? arrondi(retabMed) : null,
      incidents: retab.length,
      niveau: retabMed != null ? niveauRetablissement(retabMed) : null,
    },
    couts: { total: arrondi(total, 2), parAgent, estimations },
    us: lignes,
  };
}
