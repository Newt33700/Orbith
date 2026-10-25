import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import { OrbithError } from './errors.js';
import { ORBITH_DIR } from './paths.js';
import { exists } from './fsutil.js';
import { readFileSync } from 'node:fs';
import { packageRoot } from './paths.js';
import { lireSla, type SlaConfig } from './sla-config.js';

export type Plateforme = 'gemini' | 'claude' | 'copilot';
/** Plateformes reconnues. `copilot` est facultative : absente des valeurs par défaut. */
export const PLATEFORMES: readonly Plateforme[] = ['gemini', 'claude', 'copilot'];

function lirePlateformes(raw: unknown, def: Plateforme[]): Plateforme[] {
  if (raw == null) return def;
  if (!Array.isArray(raw)) {
    throw new OrbithError(
      `Fichier .orbith/config.yaml invalide : \`plateformes\` doit être une liste (valeurs permises : ${PLATEFORMES.join(', ')}).`,
    );
  }
  for (const v of raw) {
    if (typeof v !== 'string' || !(PLATEFORMES as readonly string[]).includes(v)) {
      throw new OrbithError(
        `Fichier .orbith/config.yaml invalide : plateforme inconnue « ${String(v)} » (valeurs permises : ${PLATEFORMES.join(', ')}).`,
      );
    }
  }
  return [...new Set(raw as Plateforme[])];
}
export type Piste = 'correctif' | 'evolution' | 'projet';

/** Cibles facultatives par indicateur DORA (`dora.cibles`). La fréquence est un minimum, les autres des maximums. */
export interface DoraCibles {
  frequence_par_semaine?: number;
  delai_jours?: number;
  taux_echec_pct?: number;
  retablissement_heures?: number;
}

export const DORA_CIBLES_CLES = ['frequence_par_semaine', 'delai_jours', 'taux_echec_pct', 'retablissement_heures'] as const;

export interface OrbithConfig {
  version: 1;
  orbith_version: string;
  projet: { nom: string };
  plateformes: Plateforme[];
  piste: Piste;
  backlog: { prefixe: string };
  csr: { fichier: string; source: string | null };
  plugins: string[];
  finops: { devise: string; prix: Record<string, { entree: number; sortie: number }> };
  /** Facultatif : cibles DORA comparées aux valeurs mesurées par `orbith metriques`. */
  dora?: { cibles?: DoraCibles };
  /** Facultatif : gestion des changements (désactivée par défaut). */
  changements?: { exiger_pour_deploiement: boolean };
  /** Facultatif : matrice des rôles et principe des quatre yeux (désactivés par défaut). */
  roles?: { quatre_yeux: boolean; valideurs: Record<string, string[]> };
  /** Politique de licences (optionnelle) : s'ajoute à la catégorie « Licences » du CSR. */
  sbom?: { licences_interdites: string[] };
  /**
   * Facultatif : contrôle « code modifié sans documentation » de `orbith check` (actif par défaut).
   * `controle: false` le désactive ; `code` liste les préfixes de chemins considérés comme du code (défaut `src/`).
   */
  documentation?: { controle: boolean; code: string[] };
  /** Facultatif : seuil (jetons estimés) au-delà duquel un document est jugé volumineux (défaut 4000, voir extraits.ts). */
  extraits?: { seuil_jetons: number };
  /** Facultatif : bornes du mode autopilote (`orbith autopilote`). Valeurs vérifiées par la commande. */
  autopilote?: { max_us?: unknown; budget?: unknown };
  /** Facultatif : objectifs de service (SLA/SLO) comparés aux incidents et bugs de production par `orbith metriques`. */
  sla?: SlaConfig;
}

/** Préfixes de chemins considérés comme du code par défaut (contrôle de documentation). */
export const DOCUMENTATION_CODE_DEFAUT = ['src/'] as const;

function lireCiblesDora(raw: unknown): DoraCibles | undefined {
  if (raw == null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new OrbithError('Fichier .orbith/config.yaml invalide : `dora.cibles` doit être une liste de clés et de nombres.');
  }
  const out: DoraCibles = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!(DORA_CIBLES_CLES as readonly string[]).includes(k)) {
      throw new OrbithError(`Fichier .orbith/config.yaml invalide : cible DORA inconnue « ${k} » (attendu : ${DORA_CIBLES_CLES.join(', ')}).`);
    }
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      throw new OrbithError(`Fichier .orbith/config.yaml invalide : \`dora.cibles.${k}\` doit être un nombre positif ou nul.`);
    }
    out[k as keyof DoraCibles] = v;
  }
  return out;
}

function packageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.join(packageRoot(), 'package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.1.0';
  } catch {
    return '0.1.0';
  }
}

export function defaultConfig(nom: string): OrbithConfig {
  return {
    version: 1,
    orbith_version: packageVersion(),
    projet: { nom },
    plateformes: ['gemini', 'claude'],
    piste: 'evolution',
    backlog: { prefixe: 'US' },
    csr: { fichier: '.orbith/csr/CSR.md', source: null },
    plugins: [],
    finops: { devise: 'EUR', prix: {} },
  };
}

function configPath(root: string): string {
  return path.join(root, ORBITH_DIR, 'config.yaml');
}

export async function loadConfig(root: string): Promise<OrbithConfig> {
  const file = configPath(root);
  if (!(await exists(file))) {
    throw new OrbithError('Fichier .orbith/config.yaml introuvable. Lance `npx orbith install`.');
  }
  let raw: unknown;
  try {
    raw = parse(await fs.readFile(file, 'utf8'));
  } catch (e) {
    throw new OrbithError(`Fichier .orbith/config.yaml illisible : ${(e as Error).message}`);
  }
  if (!raw || typeof raw !== 'object') {
    throw new OrbithError('Fichier .orbith/config.yaml invalide (contenu vide ou mal formé).');
  }
  const r = raw as Partial<OrbithConfig>;
  const def = defaultConfig(r.projet?.nom ?? path.basename(root));
  const interdites = Array.isArray(r.sbom?.licences_interdites)
    ? r.sbom.licences_interdites.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    : [];
  const cfg: OrbithConfig = {
    version: 1,
    orbith_version: r.orbith_version ?? def.orbith_version,
    projet: { nom: r.projet?.nom ?? def.projet.nom },
    plateformes: lirePlateformes(r.plateformes, def.plateformes),
    piste: r.piste ?? def.piste,
    backlog: { prefixe: r.backlog?.prefixe ?? def.backlog.prefixe },
    csr: {
      fichier: r.csr?.fichier ?? def.csr.fichier,
      source: r.csr?.source ?? null,
    },
    plugins: Array.isArray(r.plugins) ? r.plugins : [],
    finops: {
      devise: typeof r.finops?.devise === 'string' ? r.finops.devise : def.finops.devise,
      prix: r.finops?.prix && typeof r.finops.prix === 'object' ? r.finops.prix : {},
    },
    ...(r.dora?.cibles != null ? { dora: { cibles: lireCiblesDora(r.dora.cibles)! } } : {}),
  };
  if (r.changements && typeof r.changements === 'object') {
    cfg.changements = { exiger_pour_deploiement: r.changements.exiger_pour_deploiement === true };
  }
  if (r.roles && typeof r.roles === 'object') {
    const valideurs: Record<string, string[]> = {};
    const brut = (r.roles as { valideurs?: unknown }).valideurs;
    if (brut && typeof brut === 'object') {
      for (const [type, liste] of Object.entries(brut as Record<string, unknown>)) {
        valideurs[type] = (Array.isArray(liste) ? liste : [liste])
          .filter((x) => x != null && String(x).trim())
          .map((x) => String(x).trim());
      }
    }
    cfg.roles = { quatre_yeux: (r.roles as { quatre_yeux?: unknown }).quatre_yeux === true, valideurs };
  }
  const sla = lireSla((r as { sla?: unknown }).sla);
  if (sla) cfg.sla = sla;
  if (interdites.length) cfg.sbom = { licences_interdites: interdites };
  if (r.documentation && typeof r.documentation === 'object') {
    const d = r.documentation as { controle?: unknown; code?: unknown };
    const code = Array.isArray(d.code)
      ? d.code.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim())
      : [];
    cfg.documentation = {
      controle: d.controle !== false,
      code: code.length ? code : [...DOCUMENTATION_CODE_DEFAUT],
    };
  }
  if (r.extraits && typeof r.extraits === 'object') {
    const v = (r.extraits as { seuil_jetons?: unknown }).seuil_jetons;
    if (v != null && (typeof v !== 'number' || !Number.isFinite(v) || v < 1)) {
      throw new OrbithError('Fichier .orbith/config.yaml invalide : `extraits.seuil_jetons` doit être un nombre strictement positif.');
    }
    cfg.extraits = { seuil_jetons: typeof v === 'number' ? Math.floor(v) : 4000 };
  }
  if (r.autopilote && typeof r.autopilote === 'object') {
    const a = r.autopilote as { max_us?: unknown; budget?: unknown };
    cfg.autopilote = {
      ...(a.max_us != null ? { max_us: a.max_us } : {}),
      ...(a.budget != null ? { budget: a.budget } : {}),
    };
  }
  return cfg;
}

export async function saveConfig(root: string, cfg: OrbithConfig): Promise<void> {
  const file = configPath(root);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, stringify(cfg), 'utf8');
}
