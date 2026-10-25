import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import {
  ORBITH_DIR,
  OrbithError,
  exists,
  gitHasCommit,
  gitHead,
  gitLogSince,
  gitUser,
  isGitRepo,
  requireProjectRoot,
  scanArtifacts,
  storyStatus,
  ui,
  type Artifact,
} from '../core/index.js';
import { estBug } from './metriques-calc.js';
import { mentions } from './trace-report.js';
import { runProposition } from './version-proposition.js';

export interface Version {
  numero: string;
  /** AAAA-MM-JJ */
  date: string;
  /** Commit de référence (HEAD à la création) : la version suivante part de là. */
  commit: string;
  par: string;
  us: string[];
}

export interface VersionOptions {
  cwd?: string;
  depuis?: string;
}

export interface VersionResult {
  version: Version;
  notes: string;
  /** US incluses mais pas encore « Terminée » ou pas validées : à arbitrer par le PO. */
  avertissements: string[];
}

const NUMERO_RE = /^\d+(\.\d+)*([-+][0-9A-Za-z.-]+)?$/;

function registryPath(root: string): string {
  return path.join(root, ORBITH_DIR, 'versions.json');
}

export async function loadVersions(root: string): Promise<Version[]> {
  let raw: string;
  try {
    raw = await fs.readFile(registryPath(root), 'utf8');
  } catch {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as { versions?: unknown };
    return Array.isArray(parsed.versions) ? (parsed.versions as Version[]) : [];
  } catch {
    throw new OrbithError('Le fichier .orbith/versions.json est illisible (JSON invalide) : corrige-le avant de continuer.');
  }
}

function notesBody(numero: string, date: string, stories: (Artifact & { id: string })[]): string {
  const ligne = (s: Artifact & { id: string }): string => `- ${s.id} : ${s.titre ?? '<à compléter>'}`;
  const us = stories.filter((s) => !estBug(s));
  const bugs = stories.filter((s) => estBug(s));
  const epic = (s: Artifact): string => (s.data['epic'] != null ? String(s.data['epic']) : '');
  return [
    '---',
    'type: release-notes',
    'statut: brouillon',
    `version: ${numero}`,
    `date: ${date}`,
    '---',
    '',
    `# Notes de livraison : version ${numero}`,
    '',
    `<!-- Brouillon créé par « npx orbith version ${numero} » : US citées dans les commits fusionnés depuis la version`,
    '     précédente. Le SM réécrit les lignes en langage utilisateur ; retire une US qui ne doit pas partir.',
    '     Une fois relu : npx orbith valider, puis après la mise en production : npx orbith deploiement. -->',
    '',
    '## Résumé',
    '',
    '<!-- Deux ou trois phrases : ce qui change pour l\'utilisateur dans cette version. -->',
    '',
    '## Nouveautés',
    '',
    ...(us.length ? us.map(ligne) : ['- Aucune.']),
    '',
    '## Corrections',
    '',
    ...(bugs.length ? bugs.map(ligne) : ['- Aucune.']),
    '',
    '## Changements à connaître',
    '',
    '- ',
    '',
    '## Limites connues',
    '',
    '- ',
    '',
    '## Stories livrées',
    '',
    '| ID | Titre | Epic |',
    '|---|---|---|',
    ...stories.map((s) => `| ${s.id} | ${s.titre ?? ''} | ${epic(s)} |`),
    '',
  ].join('\n');
}

/** Crée une version : US fusionnées depuis la version précédente + brouillon des notes de version. */
export async function runVersion(numero: string, opts: VersionOptions = {}): Promise<VersionResult> {
  const cwd = path.resolve(opts.cwd ?? process.cwd());
  const root = await requireProjectRoot(cwd);
  if (!NUMERO_RE.test(numero)) {
    throw new OrbithError(`Numéro de version invalide : ${numero} (exemples : 1.1.0, 1.1.0.0, 2.0.0-rc1).`);
  }
  if (!(await isGitRepo(root))) throw new OrbithError('Ce projet n\'est pas un dépôt Git : impossible de savoir quelles US ont été fusionnées.');
  const head = await gitHead(root);
  if (!head) throw new OrbithError('Le dépôt Git n\'a encore aucun commit.');

  const versions = await loadVersions(root);
  if (versions.some((v) => v.numero === numero)) throw new OrbithError(`La version ${numero} existe déjà.`);
  const notesRel = `docs/livraisons/release-notes-${numero}.md`;
  const notesFile = path.join(root, notesRel);
  if (await exists(notesFile)) throw new OrbithError(`${notesRel} existe déjà : supprime-le ou choisis un autre numéro.`);

  const precedente = versions.at(-1);
  const depuis = opts.depuis ?? precedente?.commit;
  if (depuis && !(await gitHasCommit(root, depuis))) {
    throw new OrbithError(`Point de départ introuvable dans Git : ${depuis}. Indique-le avec --depuis <commit|tag>.`);
  }
  const user = await gitUser(root);
  if (!user) {
    throw new OrbithError(
      'Identité git introuvable. Configure-la avec :\n  git config user.name "Ton Nom"\n  git config user.email "ton@email.fr"',
    );
  }

  const commits = await gitLogSince(root, depuis);
  const stories = (await scanArtifacts(root))
    .filter((a): a is Artifact & { id: string } => a.type === 'story' && !!a.id)
    .filter((s) => commits.some((c) => mentions(c.message, s.id)))
    .sort((a, b) => a.id.localeCompare(b.id, 'fr', { numeric: true }));

  const avertissements: string[] = [];
  for (const s of stories) {
    if (storyStatus(s) !== 'Terminée') avertissements.push(`${s.id} est en « ${storyStatus(s)} » : elle a des commits fusionnés mais n'est pas Terminée.`);
    if (s.etat !== 'validé') avertissements.push(`${s.id} n'est pas validée.`);
  }

  const date = new Date().toISOString().slice(0, 10);
  const version: Version = { numero, date, commit: head, par: user.name, us: stories.map((s) => s.id) };
  await fs.mkdir(path.dirname(notesFile), { recursive: true });
  await fs.writeFile(notesFile, notesBody(numero, date, stories), 'utf8');
  await fs.mkdir(path.dirname(registryPath(root)), { recursive: true });
  await fs.writeFile(registryPath(root), JSON.stringify({ version: 1, versions: [...versions, version] }, null, 2) + '\n', 'utf8');
  return { version, notes: notesRel, avertissements };
}

export function register(program: Command): void {
  program
    .command('version [numero]')
    .description(
      'Sans numéro : propose le prochain numéro de version (W.X.Y.Z). Avec un numéro : crée la version (US fusionnées depuis la précédente et brouillon des notes)',
    )
    .option('--depuis <ref>', 'commit ou tag de départ (par défaut : la version précédente, sinon tout l\'historique)')
    .option('--format <format>', 'sans numéro : format de la proposition (texte|json)', 'texte')
    .option('--cwd <dir>', 'dossier de travail')
    .action(async (numero: string | undefined, opts: VersionOptions & { format?: string }) => {
      if (numero === undefined) {
        if (opts.depuis) throw new OrbithError('--depuis ne s\'utilise qu\'avec un numéro de version.');
        await runProposition({ cwd: opts.cwd, format: opts.format });
        return;
      }
      const r = await runVersion(numero, opts);
      ui.ok(`Version ${numero} créée avec ${r.version.us.length} US : ${r.version.us.join(', ') || 'aucune'}.`);
      ui.ok(`Brouillon des notes de version : ${r.notes}`);
      for (const a of r.avertissements) ui.avert(a);
      ui.info('Ensuite : le SM rédige les notes (/orbith:sm · /orbith-sm), tu les valides avec `npx orbith valider`,');
      ui.info(`puis, après la mise en production réelle : npx orbith deploiement ${numero}`);
    });
}
