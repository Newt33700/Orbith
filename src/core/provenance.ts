import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ORBITH_DIR } from './paths.js';
import { exists } from './fsutil.js';
import { OrbithError } from './errors.js';
import { chainer, verifierChaine, type EtatChaine } from './chaine.js';

/**
 * Provenance IA : commits dont le message porte un pied `Co-Authored-By:` désignant une IA.
 * Données conservées : empreinte et date du commit, nom de l'IA (et modèle s'il figure dans ce nom), US
 * mentionnées, documents Orbith modifiés, noms des relecteurs (`Reviewed-by:`). Ni adresse électronique, ni
 * contenu de conversation, ni diff.
 */
export interface ProvenanceCommit {
  commit: string;
  date: string;
  /** Noms des co-auteurs IA tels qu'écrits dans le pied (sans adresse). */
  ia: string[];
  /** Modèle, si le pied le précise (par exemple « Claude Opus 5.5 »). */
  modele?: string;
  us: string[];
  /** Documents Orbith (docs/produit, docs/architecture, docs/livraisons, backlog/tasks) modifiés. */
  documents: string[];
  /** Relecteurs humains déclarés par un pied `Reviewed-by:` (noms seulement). */
  relu_par: string[];
  /** Empreinte de l'entrée précédente (journal chaîné, voir chaine.ts). */
  precedent?: string;
}

// « Claude » est aussi un prénom : seul « Claude » seul ou suivi d'un nom de modèle ou de « Code » compte.
const MOTS_IA =
  /^claude$|\bclaude[\s-]+(code|opus|sonnet|haiku|\d)|\b(anthropic|gemini|copilot|codex|chatgpt|openai|gpt-?\d[\w.-]*|codewhisperer|amazon q developer|codestral|windsurf|tabnine)\b/i;
const DOMAINES_IA = /@(anthropic\.com|openai\.com)$/i;
const BOTS_IA = /(copilot|gemini|cursor|devin|jules|codex)[^@\s]*@users\.noreply\.github\.com$/i;

/** Nom de l'IA désignée par une valeur `Nom <adresse>`, ou null si elle désigne un humain. */
export function coAuteurIa(valeur: string): { nom: string; modele?: string } | null {
  const v = valeur.trim();
  const nom = v.replace(/\s*<[^>]*>\s*$/, '').trim();
  const email = (/<([^>]*)>/.exec(v)?.[1] ?? '').trim();
  if (!MOTS_IA.test(nom) && !DOMAINES_IA.test(email) && !BOTS_IA.test(email)) return null;
  // Un numéro de version dans le nom indique le modèle (« Claude Opus 5.5 », « GPT-5 ») ; sinon inconnu.
  return /\d/.test(nom) ? { nom, modele: nom } : { nom: nom || email };
}

function pieds(message: string, cle: string): string[] {
  const re = new RegExp(`^\\s*${cle}\\s*:\\s*(.+)$`, 'gim');
  return [...message.matchAll(re)].map((m) => m[1]!.trim());
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const DOSSIERS_DOCS = ['docs/produit/', 'docs/architecture/', 'docs/livraisons/', 'backlog/tasks/'];

/** Analyse un commit ; null s'il n'a aucun co-auteur IA. */
export function analyserCommit(
  c: { hash: string; date: string; message: string; files: string[] },
  prefixe = 'US',
): ProvenanceCommit | null {
  const ias = pieds(c.message, 'co-authored-by').map(coAuteurIa).filter((x): x is { nom: string; modele?: string } => !!x);
  if (ias.length === 0) return null;
  const sansPieds = c.message
    .split(/\r?\n/)
    .filter((l) => !/^\s*(co-authored-by|reviewed-by|signed-off-by|claude-session)\s*:/i.test(l))
    .join('\n');
  const us = [...new Set(sansPieds.match(new RegExp(`(?<![A-Za-z0-9-])${escapeRe(prefixe)}-\\d+(?![A-Za-z0-9-])`, 'g')) ?? [])];
  const relu = pieds(c.message, 'reviewed-by')
    .filter((v) => !coAuteurIa(v))
    .map((v) => v.replace(/\s*<[^>]*>\s*$/, '').trim())
    .filter(Boolean);
  const modele = ias.find((i) => i.modele)?.modele;
  return {
    commit: c.hash,
    date: c.date,
    ia: [...new Set(ias.map((i) => i.nom))],
    ...(modele ? { modele } : {}),
    us,
    documents: c.files.filter((f) => DOSSIERS_DOCS.some((d) => f.startsWith(d)) && f.toLowerCase().endsWith('.md')),
    relu_par: [...new Set(relu)],
  };
}

function git(root: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      execFile('git', args, { cwd: root, maxBuffer: 256 * 1024 * 1024 }, (err, stdout) => resolve(err ? null : stdout.toString()));
    } catch {
      resolve(null);
    }
  });
}

/** Commits de l'historique (du plus ancien au plus récent) avec message complet et fichiers modifiés. */
export async function gitLogComplet(root: string): Promise<{ hash: string; date: string; message: string; files: string[] }[]> {
  const out = await git(root, ['-c', 'core.quotePath=false', 'log', '--reverse', '--name-only', '--format=%x1e%H%x1f%cI%x1f%B%x1f']);
  if (!out) return [];
  return out
    .split('\x1e')
    .filter((b) => b.trim())
    .map((b) => {
      const [hash = '', date = '', message = '', reste = ''] = b.split('\x1f');
      return { hash: hash.trim(), date: date.slice(0, 10), message, files: reste.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) };
    });
}

/** Commits co-écrits par une IA dans l'historique Git courant. */
export async function provenanceGit(root: string, prefixe = 'US'): Promise<ProvenanceCommit[]> {
  return (await gitLogComplet(root)).map((c) => analyserCommit(c, prefixe)).filter((x): x is ProvenanceCommit => !!x);
}

function registryPath(root: string): string {
  return path.join(root, ORBITH_DIR, 'provenance.json');
}

export async function loadProvenance(root: string): Promise<ProvenanceCommit[]> {
  const file = registryPath(root);
  if (!(await exists(file))) return [];
  try {
    const json = JSON.parse(await fs.readFile(file, 'utf8')) as { commits?: ProvenanceCommit[] };
    return Array.isArray(json?.commits) ? json.commits : [];
  } catch {
    throw new OrbithError('Le registre .orbith/provenance.json est illisible (JSON invalide). Restaure-le depuis git.');
  }
}

export async function etatChaineProvenance(root: string): Promise<EtatChaine> {
  return verifierChaine(await loadProvenance(root));
}

/**
 * Ajoute au registre les commits pas encore enregistrés (journal en ajout seul, chaîné).
 * Les entrées existantes ne sont jamais modifiées. Retourne le nombre d'entrées ajoutées.
 */
export async function enregistrerProvenance(root: string, commits: ProvenanceCommit[]): Promise<number> {
  const actuel = await loadProvenance(root);
  const chaine = verifierChaine(actuel);
  if (chaine.etat === 'rompue') {
    throw new OrbithError(
      `Le registre .orbith/provenance.json a été modifié à la main (chaîne rompue à l'entrée ${chaine.index + 1}). Restaure-le depuis git avant de continuer.`,
    );
  }
  const connus = new Set(actuel.map((e) => e.commit));
  const nouveaux = commits.filter((c) => !connus.has(c.commit)).map(({ precedent: _p, ...c }) => c);
  if (nouveaux.length === 0 && chaine.etat !== 'sans-chaine') return 0;
  const entries = chainer([...actuel, ...nouveaux]);
  await fs.mkdir(path.dirname(registryPath(root)), { recursive: true });
  await fs.writeFile(registryPath(root), JSON.stringify({ version: 1, commits: entries }, null, 2) + '\n', 'utf8');
  return nouveaux.length;
}

/** Union du registre et de l'historique Git (le registre garde la trace des commits réécrits ou écrasés). */
export async function provenanceComplete(root: string, prefixe = 'US'): Promise<ProvenanceCommit[]> {
  const reg = await loadProvenance(root);
  const vus = new Set(reg.map((e) => e.commit));
  const live = (await provenanceGit(root, prefixe)).filter((c) => !vus.has(c.commit));
  return [...reg.map(({ precedent: _p, ...c }) => c), ...live];
}
