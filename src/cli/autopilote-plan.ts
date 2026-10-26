import { AGENTS as AGENT_DEFS } from '../adapters/agents.js';
import { mentions } from './trace-report.js';
import { arg, hasGherkin, storyStatus, type Artifact, type FrontmatterProblem, type OrbithConfig } from '../core/index.js';

/**
 * Bounded autopilot plan (SPEC §15). Pure and deterministic: no AI, no I/O.
 * The plan never crosses a human gate: it only lists the stories an agent may take through Dev then QA,
 * and the gates that will stop the run.
 */

/** Default maximum number of stories per run (also the WIP limit of stories awaiting human review). */
export const AUTOPILOTE_MAX_US_DEFAUT = 3;

export interface AutopiloteOptions {
  /** `EPIC-NNN` or story ids; empty = whole project. */
  cibles: string[];
  /** Raw values (CLI strings accepted); validated by `calculerPlan`. */
  maxUs?: number | string;
  budget?: number | string;
}

export interface UsPlan {
  ordre: number;
  id: string;
  chemin: string;
  titre?: string;
  epic?: string;
  etapes: { etape: 'dev' | 'qa' | 'revue-humaine'; qui: string; gemini?: string; claude?: string; porte: boolean }[];
}

export interface UsEcartee {
  id: string;
  chemin: string;
  raison: string;
}

export interface PorteHumaine {
  quand: string;
  action: string;
}

export interface BudgetPlan {
  devise: string;
  /** Ceiling for the AI cost of the scope; null = no ceiling configured. */
  plafond: number | null;
  /** Sum of the recorded `couts_ia` entries of the scope's stories. */
  consomme: number;
  /** Same sum over the whole project (shown for information; the ceiling applies to the scope). */
  consomme_projet: number;
  restant: number | null;
  /** Average recorded cost of a finished story (whole project), null without history. */
  cout_moyen_us: number | null;
  /** Entries ignored (unknown currency, no cost and no matching price). */
  entrees_ignorees: number;
}

export interface PlanAutopilote {
  ok: boolean;
  refus: string[];
  avertissements: string[];
  perimetre: string;
  max_us: number;
  /** Stories of the whole project already `En cours` or `En revue` (they use up places under `max_us`). */
  en_attente: string[];
  places: number;
  budget: BudgetPlan;
  eligibles: string[];
  plan: UsPlan[];
  ecartees: UsEcartee[];
  portes: PorteHumaine[];
}

const norm = (s: string): string => s.trim().toLowerCase();
const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Amount with the French decimal separator, as in the plan's Budget line (all autopilot messages use it). */
export const montant = (n: number, devise: string): string => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${devise}`;

function deps(s: Artifact): string[] {
  const d = s.data['dependencies'];
  return Array.isArray(d) ? d.map((x) => String(x).trim()).filter((x) => x !== '') : [];
}

/** « Validée par le PO » checkbox of older DoR checklists. */
const CASE_VALIDATION_PO = /valid[ée]e?\s+par\s+le\s+po\b/i;

/**
 * Definition of Ready filled: the `## Definition of Ready` section exists, holds at least one checkbox,
 * and every checkbox is ticked. A « Validée par le PO » box (older templates) is ignored: PO validation is proven by
 * `statut: validé` + the registry (checked separately), and ticking it after `valider` would void the validation.
 */
export function dorRemplie(body: string): boolean {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  let inDor = false;
  let total = 0;
  let coches = 0;
  for (const line of lines) {
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      inDor = /definition\s+of\s+ready|\bdor\b/i.test(h[2] ?? '');
      continue;
    }
    if (!inDor) continue;
    const c = /^\s*[-*]\s+\[([ xX])\]/.exec(line);
    if (!c || CASE_VALIDATION_PO.test(line.normalize('NFC'))) continue;
    total++;
    if (c[1] !== ' ') coches++;
  }
  return total > 0 && coches === total;
}

function prixPour(config: OrbithConfig, modele: unknown): { entree: number; sortie: number } | undefined {
  const prix = config.finops.prix ?? {};
  const m = typeof modele === 'string' ? norm(modele) : '';
  const cle = Object.keys(prix)
    .filter((k) => k !== 'defaut' && m !== '' && m.startsWith(norm(k)))
    .sort((a, b) => b.length - a.length)[0];
  const p = prix[cle ?? 'defaut'];
  return p && Number.isFinite(Number(p.entree)) && Number.isFinite(Number(p.sortie)) ? p : undefined;
}

/**
 * Recorded AI cost of a story (`couts_ia`), in `finops.devise`. An entry without `cout` is priced from its
 * token counts with `finops.prix` (key matching the model family, else `defaut`).
 */
export function coutEnregistre(s: Artifact, config: OrbithConfig): { total: number; ignorees: number } {
  const list = s.data['couts_ia'];
  let total = 0;
  let ignorees = 0;
  if (!Array.isArray(list)) return { total, ignorees };
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    const x = e as Record<string, unknown>;
    if (x['devise'] != null && norm(String(x['devise'])) !== norm(config.finops.devise)) {
      ignorees++;
      continue;
    }
    const cout = Number(x['cout']);
    if (x['cout'] != null && Number.isFinite(cout) && cout >= 0) {
      total += cout;
      continue;
    }
    const te = Number(x['tokens_entree']);
    const ts = Number(x['tokens_sortie']);
    const p = prixPour(config, x['modele']);
    if (p && Number.isFinite(te) && Number.isFinite(ts) && te >= 0 && ts >= 0) {
      total += (te / 1_000_000) * Number(p.entree) + (ts / 1_000_000) * Number(p.sortie);
    } else {
      ignorees++;
    }
  }
  return { total, ignorees };
}

const PRIORITE: Record<string, number> = { high: 0, haute: 0, medium: 1, moyenne: 1, low: 2, basse: 2 };

function numero(id: string): number {
  const m = /(\d+)\s*$/.exec(id);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

/** Plan order: Backlog.md `ordinal`, then `priority`, then story number. */
function comparer(a: Artifact, b: Artifact): number {
  const oa = Number(a.data['ordinal']);
  const ob = Number(b.data['ordinal']);
  const fa = Number.isFinite(oa) ? oa : Number.MAX_SAFE_INTEGER;
  const fb = Number.isFinite(ob) ? ob : Number.MAX_SAFE_INTEGER;
  if (fa !== fb) return fa - fb;
  const pa = PRIORITE[norm(String(a.data['priority'] ?? ''))] ?? 3;
  const pb = PRIORITE[norm(String(b.data['priority'] ?? ''))] ?? 3;
  if (pa !== pb) return pa - pb;
  return numero(a.id ?? '') - numero(b.id ?? '') || (a.id ?? '').localeCompare(b.id ?? '');
}

/** Why a story of the scope is not eligible, or null when it is (validated, DoR, `Prête`, deps done). */
export function raisonInelegible(s: Artifact, stories: Artifact[], adrsValides: Artifact[]): string | null {
  const col = storyStatus(s);
  if (col === 'Terminée') return 'déjà terminée';
  if (col === 'Abandonnée') return 'abandonnée';
  if (s.etat === 'modifié') return 'modifiée après validation : à relire et revalider';
  if (s.etat !== 'validé') return "pas encore validée (npx orbith valider)";
  if (col === 'En cours' || col === 'En revue') return `déjà « ${col} » : attend la suite ou ta revue`;
  if (col !== 'Prête') return `colonne « ${col} » : vérifie la DoR puis passe-la en « Prête »`;
  if (!hasGherkin(s.body)) return "pas de critères d'acceptation Gherkin";
  if (!dorRemplie(s.body)) return 'Definition of Ready incomplète (cases non cochées)';
  const labels = s.data['labels'];
  if (Array.isArray(labels) && labels.map((l) => norm(String(l))).includes('impact-archi')) {
    const id = s.id ?? '';
    if (!adrsValides.some((a) => mentions(a.body, id) || mentions(JSON.stringify(a.data), id))) {
      return "impact d'architecture sans ADR validé";
    }
  }
  const byId = new Map(stories.filter((x) => x.id).map((x) => [norm(x.id as string), x]));
  for (const d of deps(s)) {
    const dep = byId.get(norm(d));
    if (!dep) return `dépendance introuvable : ${d}`;
    if (storyStatus(dep) !== 'Terminée') return `dépendance non terminée : ${d}`;
  }
  return null;
}

/** Eligible stories of a list (used by `orbith next` to suggest the autopilot). */
export function usEligibles(artifacts: Artifact[]): Artifact[] {
  const stories = artifacts.filter((a) => a.type === 'story');
  const adrs = artifacts.filter((a) => a.type === 'adr' && a.etat === 'validé');
  return stories.filter((s) => s.id && raisonInelegible(s, stories, adrs) === null).sort(comparer);
}

function commande(key: string, arg: string): { gemini?: string; claude?: string } {
  const def = AGENT_DEFS.find((a) => a.key === key);
  return def ? { gemini: `/${def.gemini} ${arg}`, claude: `/${def.claude} ${arg}` } : {};
}

function lireEntier(v: unknown, nom: string, refus: string[]): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) {
    refus.push(`${nom} doit être un nombre entier supérieur ou égal à 1 (reçu : « ${String(v)} »).`);
    return undefined;
  }
  return n;
}

function lireMontant(v: unknown, nom: string, refus: string[]): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  if (!Number.isFinite(n) || n < 0) {
    refus.push(`${nom} doit être un montant positif ou nul (reçu : « ${String(v)} »).`);
    return undefined;
  }
  return n;
}

export interface EntreesPlan {
  artifacts: Artifact[];
  config: OrbithConfig;
  options: AutopiloteOptions;
  /** Messages of `orbith check` results at level `erreur`. */
  erreursCheck?: string[];
  problemes?: FrontmatterProblem[];
}

export function calculerPlan(e: EntreesPlan): PlanAutopilote {
  const { artifacts, config, options } = e;
  const refus: string[] = [];
  const avertissements: string[] = [];
  const stories = artifacts.filter((a) => a.type === 'story');
  const adrs = artifacts.filter((a) => a.type === 'adr' && a.etat === 'validé');

  // Bounds: CLI option, then config `autopilote`, then default.
  const maxUs =
    lireEntier(options.maxUs, '--max-us', refus) ??
    lireEntier(config.autopilote?.max_us, 'autopilote.max_us', refus) ??
    AUTOPILOTE_MAX_US_DEFAUT;
  const plafond =
    lireMontant(options.budget, '--budget', refus) ?? lireMontant(config.autopilote?.budget, 'autopilote.budget', refus) ?? null;

  // Scope.
  let perimetre = 'tout le projet';
  let scope = stories;
  if (options.cibles.length > 0) {
    const ids = new Set<string>();
    for (const c of options.cibles) {
      const k = norm(c);
      const parEpic = stories.filter((s) => s.data['epic'] != null && norm(String(s.data['epic'])) === k);
      const parId = stories.filter((s) => s.id && norm(s.id) === k);
      const trouvees = [...parEpic, ...parId];
      if (trouvees.length === 0) refus.push(`Cible inconnue : « ${c} » (ni epic avec des US, ni identifiant de US).`);
      for (const s of trouvees) ids.add(s.chemin);
    }
    scope = stories.filter((s) => ids.has(s.chemin));
    perimetre = options.cibles.join(', ');
  }

  // Refusals that stop everything.
  for (const p of e.problemes ?? []) refus.push(`Frontmatter invalide dans ${p.chemin} : corrige-le avant l'autopilote.`);
  for (const a of artifacts.filter((x) => x.etat === 'modifié')) {
    refus.push(`${a.chemin} a été modifié après sa validation : relis-le puis revalide-le (npx orbith valider ${arg(a.chemin)}).`);
  }
  const erreursCheck = e.erreursCheck ?? [];
  if (erreursCheck.length > 0) {
    refus.push(`npx orbith check signale ${erreursCheck.length} erreur(s) : corrige-les avant l'autopilote.`);
  }

  // Budget.
  let consomme = 0;
  let ignorees = 0;
  for (const s of scope) {
    const c = coutEnregistre(s, config);
    consomme += c.total;
    ignorees += c.ignorees;
  }
  const consommeProjet = stories.reduce((t, s) => t + coutEnregistre(s, config).total, 0);
  const terminees = stories.filter((s) => storyStatus(s) === 'Terminée').map((s) => coutEnregistre(s, config).total).filter((c) => c > 0);
  const coutMoyen = terminees.length > 0 ? r2(terminees.reduce((a, b) => a + b, 0) / terminees.length) : null;
  const restant = plafond != null ? r2(plafond - consomme) : null;
  if (ignorees > 0) {
    avertissements.push(`${ignorees} entrée(s) de coût IA ignorée(s) (autre devise que ${config.finops.devise}, ou ni coût ni prix applicable).`);
  }
  if (plafond == null) {
    avertissements.push("Aucun budget plafond (option --budget ou autopilote.budget) : l'autopilote ne s'arrêtera qu'au plafond de US.");
  } else if (restant != null && restant <= 0) {
    refus.push(`Budget épuisé : ${montant(consomme, config.finops.devise)} déjà consommés pour un plafond de ${montant(plafond, config.finops.devise)}.`);
  }

  // WIP bound: stories of the whole project already in progress or awaiting review use up places
  // (narrowing the scope must not dodge the limit on work awaiting human review).
  const enAttente = stories.filter((s) => ['En cours', 'En revue'].includes(storyStatus(s))).map((s) => s.id ?? s.chemin);
  let places = Math.max(0, maxUs - enAttente.length);
  if (places === 0 && refus.length === 0) {
    refus.push(
      `Plafond atteint : ${enAttente.length} US du projet déjà en cours ou en revue (${enAttente.join(', ')}) pour un maximum de ${maxUs}. Relis-les d'abord.`,
    );
  }
  if (restant != null && restant > 0 && coutMoyen != null && coutMoyen > 0) {
    const parBudget = Math.floor(restant / coutMoyen);
    if (parBudget < places) {
      avertissements.push(
        `Le budget restant (${montant(restant, config.finops.devise)}) couvre environ ${parBudget} US au coût moyen constaté (${montant(coutMoyen, config.finops.devise)}) : plan réduit.`,
      );
      places = parBudget;
      if (places === 0 && refus.length === 0) {
        refus.push(`Budget insuffisant pour une US de plus (coût moyen constaté : ${montant(coutMoyen, config.finops.devise)}).`);
      }
    }
  }

  // Eligibility.
  const ecartees: UsEcartee[] = [];
  const eligibles: Artifact[] = [];
  for (const s of scope) {
    if (['Terminée', 'Abandonnée'].includes(storyStatus(s))) continue;
    const raison = s.id ? raisonInelegible(s, stories, adrs) : 'pas d\'identifiant (champ id)';
    if (raison) ecartees.push({ id: s.id ?? '?', chemin: s.chemin, raison });
    else eligibles.push(s);
  }
  eligibles.sort(comparer);
  const retenues = refus.length > 0 ? [] : eligibles.slice(0, places);
  for (const s of eligibles.slice(retenues.length)) {
    if (refus.length === 0) ecartees.push({ id: s.id as string, chemin: s.chemin, raison: 'au-delà du plafond de cette exécution' });
  }

  const plan: UsPlan[] = retenues.map((s, i) => {
    const id = s.id as string;
    return {
      ordre: i + 1,
      id,
      chemin: s.chemin,
      ...(s.titre ? { titre: s.titre } : {}),
      ...(s.data['epic'] != null ? { epic: String(s.data['epic']) } : {}),
      etapes: [
        { etape: 'dev', qui: 'agent dev', ...commande('dev', id), porte: false },
        { etape: 'qa', qui: 'agent qa', ...commande('qa', id), porte: false },
        { etape: 'revue-humaine', qui: 'toi', porte: true },
      ],
    };
  });

  const portes: PorteHumaine[] = [
    { quand: 'Avant de commencer', action: "Tu confirmes le plan (US, plafond, budget) : sans ton accord, l'autopilote ne démarre pas." },
    ...plan.map((u) => ({
      quand: `Après la QA de ${u.id}`,
      action: `Revue humaine : tu relis le code et le rapport QA, puis TU passes la carte en « Terminée » (ou la renvoies en « En cours »).`,
    })),
    { quand: 'Choix technique structurant ou d\'architecture', action: "Arrêt : 2 ou 3 options sont proposées, tu décides (ou l'architecte et un ADR)." },
    { quand: 'Critère ambigu, US à modifier, document modifié après validation', action: 'Arrêt : retour au PO, puis npx orbith valider par un humain.' },
    { quand: 'Tests en échec ou npx orbith check en erreur', action: 'Arrêt : rien ne passe en revue tant que ce n\'est pas corrigé.' },
    { quand: `Plafond de ${maxUs} US en attente de revue, ou budget atteint`, action: "Arrêt : l'autopilote ne prend pas d'US de plus." },
    { quand: 'Push, merge request, version, mise en production', action: 'Toujours toi : l\'autopilote ne pousse jamais.' },
  ];

  return {
    ok: refus.length === 0,
    refus,
    avertissements,
    perimetre,
    max_us: maxUs,
    en_attente: enAttente,
    places: refus.length > 0 ? 0 : places,
    budget: {
      devise: config.finops.devise,
      plafond,
      consomme: r2(consomme),
      consomme_projet: r2(consommeProjet),
      restant,
      cout_moyen_us: coutMoyen,
      entrees_ignorees: ignorees,
    },
    eligibles: eligibles.map((s) => s.id as string),
    plan,
    ecartees,
    portes,
  };
}
