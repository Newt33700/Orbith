import { storyStatus, type Artifact, type DoraCibles } from '../core/index.js';
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
  /** Fin de revue (`revue_le`, facultatif : renseigné par l'équipe). */
  revue?: string;
  /** Première mise en recette (déploiement hors production du registre contenant l'US). */
  recette?: string;
  misEnProd?: string;
  /** Jours entre le début du développement (premier commit) et la mise en production. */
  leadTimeJours?: number;
  coutIa: number;
}

/** Durée médiane d'une étape de l'attente ; `medianeJours` vaut null si aucune US n'a les deux dates. */
export interface Etape {
  medianeJours: number | null;
  us: number;
}

/** Découpage de l'attente (Terminée → mise en production) en revue, recette et production. */
export interface DecoupageAttente {
  revue: Etape;
  recette: Etape;
  production: Etape;
}

export interface TailleVersion {
  version: string;
  date: string;
  us: number;
  /** Commits mentionnant les US de la version ; null si l'historique Git est indisponible. */
  commits: number | null;
}

export interface Taille {
  versions: TailleVersion[];
  usParVersion: number | null;
  commitsParVersion: number | null;
}

export type CleIndicateur = 'frequence' | 'delai' | 'tauxEchec' | 'retablissement';

export interface Tendance {
  cle: CleIndicateur;
  libelle: string;
  unite: string;
  valeur: number | null;
  precedent: number | null;
  /** valeur - precedent ; null si l'une des deux périodes n'est pas mesurable. */
  ecart: number | null;
  fleche: '↑' | '↓' | '→' | null;
  /** true si l'évolution va dans le bon sens, false sinon, null si stable ou non mesurable. */
  favorable: boolean | null;
}

export interface CibleMesuree {
  cle: CleIndicateur;
  libelle: string;
  unite: string;
  /** `min` : la valeur doit atteindre la cible ; `max` : ne pas la dépasser. */
  sens: 'min' | 'max';
  cible: number;
  valeur: number | null;
  /** null si l'indicateur n'est pas mesurable. */
  atteinte: boolean | null;
}

export interface Metriques {
  periode: { debut: string; fin: string; jours: number };
  devise: string;
  frequence: { deploiements: number; parSemaine: number; niveau: Niveau | null };
  leadTime: { medianeJours: number | null; us: number; niveau: Niveau | null };
  /** Attente entre « Terminée » et la mise en production. */
  attente: { medianeJours: number | null; us: number };
  /** Découpage de l'attente selon les dates disponibles (revue_le, déploiements hors production). */
  decoupageAttente: DecoupageAttente;
  /** Taille des changements par mise en production. */
  taille: Taille;
  /** Période précédente de même durée, pour les tendances. */
  precedent: { debut: string; fin: string };
  tendances: Tendance[];
  /** Présent seulement si `dora.cibles` est renseigné dans la configuration. */
  cibles?: CibleMesuree[];
  tauxEchec: {
    pourcentage: number | null;
    deploiementsEnEchec: number;
    niveau: Niveau | null;
    /** Renseigné quand le 0 % n'est pas une mesure : des déploiements existent mais aucun bug n'est déclaré. */
    avertissement: string | null;
  };
  retablissement: { medianeHeures: number | null; incidents: number; niveau: Niveau | null };
  couts: { total: number; parAgent: Record<string, number>; estimations: number };
  us: LigneUS[];
}

const JOUR = 86_400_000;

/** Mention affichée (texte et JSON) quand le taux d'échec vaut 0 % faute de bug déclaré. */
export const AVERTISSEMENT_AUCUN_BUG = 'aucun bug déclaré : à vérifier';

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

export interface OptionsMetriques {
  jours: number;
  aujourdhui?: string;
  devise: string;
  terminees?: Map<string, string>;
  /** Commits (sujet) de l'historique Git, pour la taille des changements. Absent : non mesurable. */
  commits?: { subject: string }[];
  cibles?: DoraCibles;
}

type Periode = Omit<Metriques, 'precedent' | 'tendances' | 'cibles'>;

function mediane1(xs: number[]): number | null {
  const m = mediane(xs);
  return m != null ? arrondi(m) : null;
}

function calculerPeriode(
  arts: Artifact[],
  deploiements: Deploiement[],
  premiersCommits: Map<string, string>,
  opts: OptionsMetriques,
): Periode {
  const fin = opts.aujourdhui ?? new Date().toISOString().slice(0, 10);
  const debut = new Date(ms(fin) - opts.jours * JOUR).toISOString().slice(0, 10);
  const dansPeriode = (d: string | undefined): boolean => !!d && ms(d) >= ms(debut) && ms(d) <= ms(fin) + JOUR - 1;

  const stories = arts.filter((a): a is Artifact & { id: string } => a.type === 'story' && !!a.id);
  const prod = deploiements.filter((d) => d.env === 'production' && dansPeriode(d.date));

  const lignes: LigneUS[] = stories.map((s) => {
    const debutDev = dateStr(s.data['debut_dev_le']) ?? premiersCommits.get(s.id);
    const misEnProd = dateStr(s.data['mis_en_prod_le']);
    const terminee = dateStr(s.data['termine_le']) ?? opts.terminees?.get(s.id);
    const revue = dateStr(s.data['revue_le']);
    const recettes = deploiements
      .filter((d) => d.env !== 'production' && Array.isArray(d.us) && d.us.includes(s.id) && !!dateStr(d.date))
      .map((d) => d.date)
      .sort();
    const recette = recettes[0];
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
      ...(revue ? { revue } : {}),
      ...(recette ? { recette } : {}),
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

  // Découpage de l'attente : chaque étape n'est calculée que si ses deux dates existent.
  const livrees = lignes.filter((l) => !l.bug && dansPeriode(l.misEnProd));
  const duree = (a: string | undefined, b: string | undefined): number[] =>
    a && b ? [Math.max(0, (ms(b) - ms(a)) / JOUR)] : [];
  const etape = (f: (l: LigneUS) => number[]): Etape => {
    const xs = livrees.flatMap(f);
    return { medianeJours: mediane1(xs), us: xs.length };
  };
  const decoupageAttente: DecoupageAttente = {
    revue: etape((l) => duree(l.terminee, l.revue)),
    // Sans `revue_le`, la recette est comptée depuis « Terminée » (la revue y est alors incluse).
    recette: etape((l) => duree(l.revue ?? l.terminee, l.recette)),
    production: etape((l) => duree(l.recette, l.misEnProd)),
  };

  // Taille des changements : US et commits par mise en production.
  const versions: TailleVersion[] = [...prod]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((dep) => ({
      version: dep.version,
      date: dep.date,
      us: dep.us.length,
      commits: opts.commits ? opts.commits.filter((c) => dep.us.some((id) => mentions(c.subject, id))).length : null,
    }));
  const taille: Taille = {
    versions,
    usParVersion: mediane1(versions.map((v) => v.us)),
    commitsParVersion: opts.commits ? mediane1(versions.map((v) => v.commits!)) : null,
  };

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
    decoupageAttente,
    taille,
    tauxEchec: {
      pourcentage: pct,
      deploiementsEnEchec: enEchec,
      niveau: pct != null ? niveauEchec(pct) : null,
      avertissement: prod.length > 0 && bugsProd.length === 0 ? AVERTISSEMENT_AUCUN_BUG : null,
    },
    retablissement: {
      medianeHeures: retabMed != null ? arrondi(retabMed) : null,
      incidents: retab.length,
      niveau: retabMed != null ? niveauRetablissement(retabMed) : null,
    },
    couts: { total: arrondi(total, 2), parAgent, estimations },
    us: lignes,
  };
}

const INDICATEURS: {
  cle: CleIndicateur;
  cibleCle: keyof DoraCibles;
  libelle: string;
  unite: string;
  sens: 'min' | 'max';
  lire: (m: Periode) => number | null;
}[] = [
  {
    cle: 'frequence',
    cibleCle: 'frequence_par_semaine',
    libelle: 'Fréquence de déploiement',
    unite: 'par semaine',
    sens: 'min',
    // Aucun déploiement = pas de données (cohérent avec le niveau DORA, absent dans ce cas).
    lire: (m) => (m.frequence.deploiements > 0 ? m.frequence.parSemaine : null),
  },
  { cle: 'delai', cibleCle: 'delai_jours', libelle: 'Délai de mise en production', unite: 'jour(s)', sens: 'max', lire: (m) => m.leadTime.medianeJours },
  { cle: 'tauxEchec', cibleCle: 'taux_echec_pct', libelle: "Taux d'échec des changements", unite: '%', sens: 'max', lire: (m) => m.tauxEchec.pourcentage },
  { cle: 'retablissement', cibleCle: 'retablissement_heures', libelle: 'Temps de rétablissement', unite: 'heure(s)', sens: 'max', lire: (m) => m.retablissement.medianeHeures },
];

/**
 * Calcule les quatre indicateurs DORA sur la période, à partir des US (en-têtes), du registre des
 * mises en production et des dates de premier commit par US (repli quand `debut_dev_le` est absent).
 * Ajoute le découpage de l'attente, la taille des changements, les tendances par rapport à la période
 * précédente de même durée et, si fournies, la comparaison aux cibles.
 */
export function calculerMetriques(
  arts: Artifact[],
  deploiements: Deploiement[],
  premiersCommits: Map<string, string>,
  opts: OptionsMetriques,
): Metriques {
  const courante = calculerPeriode(arts, deploiements, premiersCommits, opts);
  const finPrecedente = new Date(ms(courante.periode.debut) - JOUR).toISOString().slice(0, 10);
  const prec = calculerPeriode(arts, deploiements, premiersCommits, { ...opts, aujourdhui: finPrecedente });

  const tendances: Tendance[] = INDICATEURS.map((i) => {
    const valeur = i.lire(courante);
    const precedent = i.lire(prec);
    const ecart = valeur != null && precedent != null ? arrondi(valeur - precedent, 2) : null;
    const fleche = ecart == null ? null : ecart > 0 ? '↑' : ecart < 0 ? '↓' : '→';
    const favorable = ecart == null || ecart === 0 ? null : i.sens === 'min' ? ecart > 0 : ecart < 0;
    return { cle: i.cle, libelle: i.libelle, unite: i.unite, valeur, precedent, ecart, fleche, favorable };
  });

  const cibles: CibleMesuree[] = [];
  for (const i of INDICATEURS) {
    const cible = opts.cibles?.[i.cibleCle];
    if (cible == null) continue;
    const valeur = i.lire(courante);
    const atteinte = valeur == null ? null : i.sens === 'min' ? valeur >= cible : valeur <= cible;
    cibles.push({ cle: i.cle, libelle: i.libelle, unite: i.unite, sens: i.sens, cible, valeur, atteinte });
  }

  return {
    ...courante,
    precedent: { debut: prec.periode.debut, fin: prec.periode.fin },
    tendances,
    ...(cibles.length ? { cibles } : {}),
  };
}
