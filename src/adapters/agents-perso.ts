import { promises as fs } from 'node:fs';
import path from 'node:path';
import { exists, OrbithError, ORBITH_DIR, parseDoc } from '../core/index.js';
import { AGENTS, type AgentDef } from './agents.js';

/**
 * Project-specific agents (SPEC §6, §15). A file `.orbith/custom/agents/<key>.md` is either:
 * - a complement of a core agent (its name is the basename of a core `agents/*.md` file): read by that agent,
 *   no command generated;
 * - a custom agent: frontmatter with at least `description`; one command per platform is generated, referencing
 *   the file (no copied content);
 * - otherwise ignored by the adapters (reported by `orbith check`).
 */
export const DOSSIER_AGENTS_PERSO = `${ORBITH_DIR}/custom/agents`;

/** Allowed key / command name: lowercase letters, digits and dashes, not starting with a dash. */
export const CLE_RE = /^[a-z0-9][a-z0-9-]*$/;

export interface AgentPerso extends AgentDef {
  /** Display name (frontmatter `nom`), e.g. « Jade ». */
  nom?: string;
  persona?: string;
  /** Command suffix (frontmatter `commande`, default: the key). */
  commande: string;
  /** Path relative to the project root (posix). */
  chemin: string;
  /** Markdown body without frontmatter. */
  corps: string;
}

export interface InventaireAgentsPerso {
  agents: AgentPerso[];
  /** Files that complement a core agent (posix paths relative to root). */
  complements: string[];
  /** Files neither complement nor valid custom agent (no `description`). */
  ignores: string[];
  /** Blocking problems (collision, invalid name or frontmatter). */
  erreurs: { chemin: string; message: string }[];
}

/** Basenames of the core agent files: `custom/agents/<name>.md` with one of these names is a complement. */
export function clesComplements(): Set<string> {
  return new Set(AGENTS.filter((a) => a.file.startsWith('agents/')).map((a) => path.posix.basename(a.file, '.md')));
}

/** Command suffixes already used by the core, for each platform naming scheme. */
function commandesDuCoeur(): Map<string, string> {
  const pris = new Map<string, string>();
  for (const a of AGENTS) {
    pris.set(a.gemini.split(':')[1] as string, a.key);
    if (a.claude.startsWith('orbith-')) pris.set(a.claude.slice('orbith-'.length), a.key);
  }
  return pris;
}

/** Raison d'un conflit entre un nom de commande et le cœur, ou null. */
export function collisionAvecCoeur(commande: string): string | null {
  const cle = commandesDuCoeur().get(commande);
  if (cle) {
    const a = AGENTS.find((x) => x.key === cle) as AgentDef;
    return `la commande « ${commande} » est déjà utilisée par l'agent du cœur « ${cle} » (/${a.gemini}, /${a.claude})`;
  }
  return null;
}

const texte = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);

/** Reads `.orbith/custom/agents/*.md`. Never throws on content problems: they are listed in `erreurs`. */
export async function inventaireAgentsPerso(root: string): Promise<InventaireAgentsPerso> {
  const res: InventaireAgentsPerso = { agents: [], complements: [], ignores: [], erreurs: [] };
  const dir = path.join(root, DOSSIER_AGENTS_PERSO);
  if (!(await exists(dir))) return res;
  const complements = clesComplements();
  const noms = (await fs.readdir(dir, { withFileTypes: true }))
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name)
    .sort();
  const parCommande = new Map<string, string>();
  for (const nomFichier of noms) {
    const cle = nomFichier.slice(0, -'.md'.length);
    const chemin = `${DOSSIER_AGENTS_PERSO}/${nomFichier}`;
    if (complements.has(cle)) {
      res.complements.push(chemin);
      continue;
    }
    let data: Record<string, unknown>;
    let corps: string;
    try {
      ({ data, body: corps } = parseDoc(await fs.readFile(path.join(dir, nomFichier), 'utf8')));
    } catch (e) {
      res.erreurs.push({ chemin, message: `en-tête YAML illisible (${e instanceof Error ? e.message : String(e)})` });
      continue;
    }
    const description = texte(data['description'])?.replace(/\s+/g, ' ');
    if (!description) {
      res.ignores.push(chemin);
      continue;
    }
    if (!CLE_RE.test(cle)) {
      res.erreurs.push({ chemin, message: `nom de fichier invalide : utilise des minuscules, des chiffres et des tirets (ex. « juriste-rgpd.md »)` });
      continue;
    }
    const commande = texte(data['commande']) ?? cle;
    if (!CLE_RE.test(commande)) {
      res.erreurs.push({ chemin, message: `commande « ${commande} » invalide : utilise des minuscules, des chiffres et des tirets` });
      continue;
    }
    const conflit = collisionAvecCoeur(commande);
    if (conflit) {
      res.erreurs.push({ chemin, message: `${conflit} : choisis une autre valeur pour \`commande\` (ou renomme le fichier)` });
      continue;
    }
    const deja = parCommande.get(commande);
    if (deja) {
      res.erreurs.push({ chemin, message: `la commande « ${commande} » est déjà déclarée par ${deja} : choisis une autre valeur pour \`commande\`` });
      continue;
    }
    parCommande.set(commande, chemin);
    const nom = texte(data['nom']);
    const persona = texte(data['persona']);
    res.agents.push({
      key: cle,
      file: `custom/agents/${nomFichier}`,
      gemini: `orbith:${commande}`,
      claude: `orbith-${commande}`,
      description,
      commande,
      chemin,
      corps,
      ...(nom ? { nom } : {}),
      ...(persona ? { persona } : {}),
    });
  }
  return res;
}

/**
 * Core agents followed by the project's custom agents, as used by the adapters.
 * Throws an OrbithError (French, actionable) on any collision or invalid declaration.
 */
export async function agentsDuProjet(root: string): Promise<AgentDef[]> {
  const inv = await inventaireAgentsPerso(root);
  if (inv.erreurs.length > 0) {
    throw new OrbithError(
      'Agent(s) personnalisé(s) invalide(s), aucune commande générée :\n' +
        inv.erreurs.map((e) => `  - ${e.chemin} : ${e.message}`).join('\n'),
    );
  }
  return [...AGENTS, ...inv.agents];
}
