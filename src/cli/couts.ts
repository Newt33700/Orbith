import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Command } from 'commander';
import { OrbithError, loadConfig, readDoc, requireProjectRoot, scanArtifacts, ui, writeDoc, type Artifact } from '../core/index.js';
import { coutConsommation, lireTranscriptionsClaude, prixPour, type Consommation } from './couts-import.js';

export interface CoutsImporterOptions {
  cwd?: string;
  source?: string;
  chemin?: string;
  us?: string;
  agent?: string;
  session?: string;
  depuis?: string;
  /** Pour les tests : date du jour (AAAA-MM-JJ). */
  aujourdhui?: string;
  /** Pour les tests : dossier personnel (remplace `os.homedir()`). */
  home?: string;
}

export interface EntreeMesuree {
  date: string;
  agent: string;
  outil: string;
  modele: string;
  tache: string;
  tokens_entree: number;
  tokens_cache_ecriture: number;
  tokens_cache_lecture: number;
  tokens_sortie: number;
  cout: number;
  devise: string;
  source: 'mesuré';
  session: string;
  du: string;
  au: string;
}

export interface ResultatImport {
  fichiers: number;
  entrees: EntreeMesuree[];
  /** Fichier de la US modifiée, ou null en simple aperçu (sans `--us`). */
  us: string | null;
}

/**
 * Dossier des transcriptions de Claude Code pour ce projet : `~/.claude/projects/<chemin du projet>`, où chaque
 * caractère non alphanumérique du chemin absolu est remplacé par « - » (constaté : `/home/user/Orbith` →
 * `-home-user-Orbith`). `CLAUDE_CONFIG_DIR` remplace `~/.claude` s'il est défini.
 */
export function dossierClaudeParDefaut(root: string, home: string = os.homedir()): string {
  const base = process.env['CLAUDE_CONFIG_DIR'] || path.join(home, '.claude');
  return path.join(base, 'projects', path.resolve(root).replace(/[^A-Za-z0-9]/g, '-'));
}

async function fichiersJsonl(cible: string): Promise<string[]> {
  let st;
  try {
    st = await fs.stat(cible);
  } catch {
    return [];
  }
  if (st.isFile()) return cible.endsWith('.jsonl') ? [cible] : [];
  const out: string[] = [];
  for (const e of (await fs.readdir(cible, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(cible, e.name);
    if (e.isDirectory()) out.push(...(await fichiersJsonl(p)));
    else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p);
  }
  return out;
}

/** Dernier horodatage déjà importé par session, toutes US confondues (évite de compter deux fois). */
export function bornesImportees(arts: Artifact[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const a of arts) {
    const list = a.data['couts_ia'];
    if (!Array.isArray(list)) continue;
    for (const e of list) {
      if (!e || typeof e !== 'object') continue;
      const r = e as Record<string, unknown>;
      if (String(r['source'] ?? '').normalize('NFC') !== 'mesuré') continue;
      const s = typeof r['session'] === 'string' ? r['session'] : '';
      const au = typeof r['au'] === 'string' ? r['au'] : '';
      if (!s || !au || Number.isNaN(Date.parse(au))) continue;
      const prev = out.get(s);
      if (!prev || Date.parse(au) > Date.parse(prev)) out.set(s, au);
    }
  }
  return out;
}

const fr = (n: number): string => String(n).replace('.', ',');

export async function runCoutsImporter(opts: CoutsImporterOptions = {}): Promise<ResultatImport> {
  const cwd = path.resolve(opts.cwd ?? process.cwd());
  const root = await requireProjectRoot(cwd);
  const source = opts.source ?? 'claude';
  if (source === 'gemini') {
    throw new OrbithError(
      "Import Gemini CLI pas encore pris en charge : le format des fichiers de session et de télémétrie locale de Gemini CLI n'est pas documenté de façon assez précise pour être lu sans risque d'erreur. Continue avec les estimations (règle couts-ia).",
    );
  }
  if (source !== 'claude') throw new OrbithError(`Source inconnue : ${source} (claude ou gemini).`);
  if (opts.depuis && !/^\d{4}-\d{2}-\d{2}$/.test(opts.depuis)) {
    throw new OrbithError(`Date invalide pour --depuis : ${opts.depuis} (format AAAA-MM-JJ).`);
  }

  const config = await loadConfig(root);
  const arts = await scanArtifacts(root);
  let story: Artifact | undefined;
  if (opts.us) {
    story = arts.find((a) => a.type === 'story' && a.id === opts.us);
    if (!story) throw new OrbithError(`User story ${opts.us} introuvable dans backlog/tasks.`);
  }

  const cible = opts.chemin ? path.resolve(cwd, opts.chemin) : dossierClaudeParDefaut(root, opts.home);
  const fichiers = await fichiersJsonl(cible);
  if (fichiers.length === 0) {
    throw new OrbithError(
      `Aucune transcription Claude Code (.jsonl) trouvée dans ${cible}. Indique le dossier ou le fichier avec --chemin.`,
    );
  }
  const contenus = await Promise.all(fichiers.map((f) => fs.readFile(f, 'utf8')));
  const conso = lireTranscriptionsClaude(contenus, {
    dejaImporteJusqua: bornesImportees(arts),
    ...(opts.depuis ? { depuis: opts.depuis } : {}),
    ...(opts.session ? { session: opts.session } : {}),
  });

  const date = opts.aujourdhui ?? new Date().toISOString().slice(0, 10);
  const devise = config.finops.devise;
  const entrees = conso.map((c: Consommation): EntreeMesuree => {
    const p = prixPour(c.modele, config.finops.prix as Record<string, unknown>);
    if (!p) {
      throw new OrbithError(
        `Aucun prix pour le modèle ${c.modele} dans finops.prix de .orbith/config.yaml (ajoute une clé de famille ou \`defaut\`).`,
      );
    }
    return {
      date,
      agent: opts.agent ?? 'inconnu',
      outil: 'claude-code',
      modele: c.modele,
      tache: `Import des compteurs réels (session ${c.session.slice(0, 8)}, ${c.appels} appel(s))`,
      tokens_entree: c.entree,
      tokens_cache_ecriture: c.cacheEcriture5m + c.cacheEcriture1h,
      tokens_cache_lecture: c.cacheLecture,
      tokens_sortie: c.sortie,
      cout: coutConsommation(c, p.prix),
      devise,
      source: 'mesuré',
      session: c.session,
      du: c.du,
      au: c.au,
    };
  });

  if (entrees.length === 0) {
    ui.info('Aucun nouvel appel à importer (déjà importé, ou hors des filtres).');
    return { fichiers: fichiers.length, entrees, us: null };
  }
  for (const e of entrees) {
    ui.info(
      `${e.modele}, session ${e.session.slice(0, 8)} : ${e.tokens_entree} jetons en entrée, ${e.tokens_cache_lecture} lus en cache, ${e.tokens_cache_ecriture} écrits en cache, ${e.tokens_sortie} en sortie : ${fr(e.cout)} ${devise}`,
    );
  }
  const total = Math.round(entrees.reduce((s, e) => s + e.cout, 0) * 100) / 100;
  if (!story) {
    ui.info(`Total mesuré : ${fr(total)} ${devise} (aperçu : rien n'est écrit ; ajoute --us US-NNN pour l'enregistrer).`);
    return { fichiers: fichiers.length, entrees, us: null };
  }

  // Ajout en fin de liste uniquement : les entrées existantes ne sont jamais modifiées (règle couts-ia).
  const file = path.join(root, story.chemin);
  const doc = await readDoc(file);
  const avant = Array.isArray(doc.data['couts_ia']) ? (doc.data['couts_ia'] as unknown[]) : [];
  doc.data['couts_ia'] = [...avant, ...entrees];
  await writeDoc(file, doc);
  ui.ok(`${entrees.length} entrée(s) mesurée(s) ajoutée(s) à ${story.id} : ${fr(total)} ${devise} (prix de finops.prix, pas une facture).`);
  return { fichiers: fichiers.length, entrees, us: story.chemin };
}

export function register(program: Command): void {
  const couts = program.command('couts').description('Coûts IA : import des compteurs de jetons réels');
  couts
    .command('importer')
    .description('Lit les compteurs de jetons laissés par Claude Code et les ajoute à couts_ia (source: mesuré)')
    .option('--source <outil>', 'claude (gemini : pas encore pris en charge)', 'claude')
    .option('--chemin <fichier ou dossier>', 'transcription .jsonl ou dossier (défaut : ~/.claude/projects/<projet>)')
    .option('--us <id>', 'US à laquelle ajouter les coûts (sans cette option : simple aperçu)')
    .option('--agent <nom>', "nom de l'agent Orbith à indiquer (défaut : inconnu)")
    .option('--session <id>', "ne lit que cette session (début de l'identifiant)")
    .option('--depuis <date>', 'ne lit que les appels depuis cette date (AAAA-MM-JJ)')
    .option('--cwd <dir>', 'dossier de travail')
    .action(async (opts: CoutsImporterOptions) => {
      await runCoutsImporter(opts);
    });
}
