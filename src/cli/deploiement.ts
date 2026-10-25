import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { confirm, isCancel } from '@clack/prompts';
import {
  ORBITH_DIR,
  OrbithError,
  gitLastStatusChange,
  gitLogDated,
  gitUser,
  isGitRepo,
  parseDoc,
  readDoc,
  requireProjectRoot,
  scanArtifacts,
  storyStatus,
  ui,
  writeDoc,
  type Artifact,
} from '../core/index.js';
import { mentions } from './trace-report.js';

export interface Deploiement {
  version: string;
  env: string;
  /** AAAA-MM-JJ */
  date: string;
  par: string;
  email: string;
  /** Ids des US livrées (celles citées dans les notes de version). */
  us: string[];
}

export interface DeploiementOptions {
  cwd?: string;
  env?: string;
  date?: string;
  yes?: boolean;
}

/**
 * Date de passage en « Terminée » : `termine_le` s'il est renseigné, sinon le dernier commit qui a changé
 * le `status` du fichier, à condition qu'il l'ait mis en « Terminée » (déplacement de carte dans Backlog.md compris).
 */
export async function dateTerminee(root: string, s: Artifact): Promise<string | undefined> {
  if (storyStatus(s) !== 'Terminée') return undefined;
  if (s.data['termine_le'] != null && String(s.data['termine_le']).trim()) return String(s.data['termine_le']).trim();
  const change = await gitLastStatusChange(root, s.chemin);
  return change && storyStatus(parseDoc(change.content)) === 'Terminée' ? change.date : undefined;
}

function registryPath(root: string): string {
  return path.join(root, ORBITH_DIR, 'deploiements.json');
}

export async function loadDeploiements(root: string): Promise<Deploiement[]> {
  let raw: string;
  try {
    raw = await fs.readFile(registryPath(root), 'utf8');
  } catch {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as { deploiements?: unknown };
    return Array.isArray(parsed.deploiements) ? (parsed.deploiements as Deploiement[]) : [];
  } catch {
    throw new OrbithError('Le fichier .orbith/deploiements.json est illisible (JSON invalide) : corrige-le avant de continuer.');
  }
}

async function saveDeploiements(root: string, list: Deploiement[]): Promise<void> {
  await fs.mkdir(path.dirname(registryPath(root)), { recursive: true });
  await fs.writeFile(registryPath(root), JSON.stringify({ version: 1, deploiements: list }, null, 2) + '\n', 'utf8');
}

function notesFor(arts: Artifact[], version: string): Artifact | undefined {
  const notes = arts.filter((a) => a.type === 'release-notes');
  return (
    notes.find((n) => n.data['version'] != null && String(n.data['version']) === version) ??
    notes.find((n) => path.posix.basename(n.chemin) === `release-notes-${version}.md`)
  );
}

/** Enregistre une mise en production réelle (commande humaine). Retourne le déploiement, ou null si annulé. */
export async function runDeploiement(version: string, opts: DeploiementOptions = {}): Promise<Deploiement | null> {
  const cwd = path.resolve(opts.cwd ?? process.cwd());
  const root = await requireProjectRoot(cwd);
  const env = (opts.env ?? 'production').trim().toLowerCase();
  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    throw new OrbithError(`Date invalide : ${date} (format attendu : AAAA-MM-JJ).`);
  }

  const arts = await scanArtifacts(root);
  const notes = notesFor(arts, version);
  if (!notes) {
    throw new OrbithError(
      `Notes de version introuvables pour ${version} : crée docs/livraisons/release-notes-${version}.md avec le SM (/orbith:sm · /orbith-sm).`,
    );
  }
  // Validation humaine d'abord : on ne date pas une livraison que personne n'a relue.
  if (notes.etat !== 'validé') {
    throw new OrbithError(`Les notes de version ${notes.chemin} ne sont pas validées. Relis-les puis lance : npx orbith valider ${notes.chemin}`);
  }
  const deja = await loadDeploiements(root);
  if (deja.some((d) => d.version === version && d.env === env)) {
    ui.info(`La version ${version} est déjà enregistrée en ${env}. Rien à faire.`);
    return deja.find((d) => d.version === version && d.env === env)!;
  }

  const user = await gitUser(root);
  if (!user) {
    throw new OrbithError(
      'Identité git introuvable. Configure-la avec :\n  git config user.name "Ton Nom"\n  git config user.email "ton@email.fr"',
    );
  }
  const stories = arts.filter((a): a is Artifact & { id: string } => a.type === 'story' && !!a.id && mentions(notes.body, a.id));

  ui.titre('Mise en production');
  console.log(`  Version : ${version}\n  Env.    : ${env}\n  Date    : ${date}\n  US      : ${stories.map((s) => s.id).join(', ') || '—'}\n`);
  if (!opts.yes) {
    if (!process.stdin.isTTY) {
      throw new OrbithError(
        "Confirmation impossible : ce terminal n'est pas interactif. Lance la commande toi-même dans un terminal (ou ajoute --yes).",
      );
    }
    const ok = await confirm({ message: `Je confirme que la version ${version} est réellement déployée en ${env}`, initialValue: false });
    if (isCancel(ok) || !ok) {
      ui.avert('Enregistrement annulé.');
      process.exitCode = 1;
      return null;
    }
  }

  const dep: Deploiement = { version, env, date, par: user.name, email: user.email, us: stories.map((s) => s.id) };
  await saveDeploiements(root, [...deja, dep]);

  if (env === 'production') {
    const commits = (await isGitRepo(root)) ? await gitLogDated(root) : [];
    // Seul l'en-tête change : le corps (couvert par la validation) reste identique.
    for (const s of stories) {
      const file = path.join(root, s.chemin);
      const doc = await readDoc(file);
      if (doc.data['mis_en_prod_le'] == null) doc.data['mis_en_prod_le'] = date;
      if (doc.data['debut_dev_le'] == null) {
        const first = commits.find((c) => mentions(c.subject, s.id));
        if (first) doc.data['debut_dev_le'] = first.date;
      }
      if (doc.data['termine_le'] == null) {
        const fin = await dateTerminee(root, s);
        if (fin) doc.data['termine_le'] = fin;
      }
      await writeDoc(file, doc);
    }
    const nf = path.join(root, notes.chemin);
    const nd = await readDoc(nf);
    if (nd.data['mis_en_prod_le'] == null) {
      nd.data['mis_en_prod_le'] = date;
      await writeDoc(nf, nd);
    }
  }
  ui.ok(`Version ${version} enregistrée en ${env} le ${date} (${stories.length} US).`);
  if (env === 'production') ui.info('Lance `npx orbith metriques` pour voir les indicateurs DORA.');
  return dep;
}

export function register(program: Command): void {
  program
    .command('deploiement <version>')
    .description('Enregistre une mise en production réelle (dates des US, indicateurs DORA)')
    .option('--env <nom>', "environnement (production par défaut ; les autres sont seulement enregistrés)", 'production')
    .option('--date <AAAA-MM-JJ>', 'date du déploiement (par défaut : aujourd’hui)')
    .option('--cwd <dir>', 'dossier de travail')
    .option('--yes', 'ne pas demander de confirmation (réservé à un usage humain en script)')
    .action(async (version: string, opts: DeploiementOptions) => {
      await runDeploiement(version, opts);
    });
}
