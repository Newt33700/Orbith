import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import { OrbithError } from './errors.js';
import { ORBITH_DIR } from './paths.js';
import { exists } from './fsutil.js';
import { readFileSync } from 'node:fs';
import { packageRoot } from './paths.js';

export type Plateforme = 'gemini' | 'claude';
export type Piste = 'correctif' | 'evolution' | 'projet';

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
  /** Politique de licences (optionnelle) : s'ajoute à la catégorie « Licences » du CSR. */
  sbom?: { licences_interdites: string[] };
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
  return {
    ...(interdites.length ? { sbom: { licences_interdites: interdites } } : {}),
    version: 1,
    orbith_version: r.orbith_version ?? def.orbith_version,
    projet: { nom: r.projet?.nom ?? def.projet.nom },
    plateformes: Array.isArray(r.plateformes) ? r.plateformes : def.plateformes,
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
  };
}

export async function saveConfig(root: string, cfg: OrbithConfig): Promise<void> {
  const file = configPath(root);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, stringify(cfg), 'utf8');
}
