import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { confirm, isCancel } from '@clack/prompts';
import {
  OrbithError,
  exists,
  gitCommitPaths,
  gitCommitsSince,
  gitCreateTag,
  gitTags,
  gitUser,
  isGitRepo,
  requireProjectRoot,
  scanArtifacts,
  storyStatus,
  ui,
  type Artifact,
} from '../core/index.js';
import { buildContext, runAll } from '../checks/index.js';
import { mentions } from './trace-report.js';
import {
  BREAKING_LABEL,
  compareSemVer,
  isBreakingStory,
  isBug,
  lastReleaseTag,
  parseCommit,
  parseSemVer,
  proposerVersion,
  type ParsedCommit,
} from './version-calc.js';

export interface ReleaseOptions {
  cwd?: string;
  date?: string;
  yes?: boolean;
  /** Generate CHANGELOG.md only: no commit, no tag. */
  sansTag?: boolean;
  dryRun?: boolean;
}

export interface ReleaseResult {
  version: string;
  changelog: string;
  tag: string | null;
}

const HEADER =
  '# Journal des modifications\n\nToutes les évolutions notables de ce projet sont consignées ici.\n' +
  'Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions selon [SemVer](https://semver.org/lang/fr/).\n' +
  'Fichier généré par `npx orbith release` : relis-le avant de le conserver.\n';

function notesFor(arts: Artifact[], version: string): Artifact | undefined {
  const notes = arts.filter((a) => a.type === 'release-notes');
  return (
    notes.find((n) => n.data['version'] != null && String(n.data['version']) === version) ??
    notes.find((n) => path.posix.basename(n.chemin) === `release-notes-${version}.md`)
  );
}

function ligneCommit(c: ParsedCommit): string {
  return `- ${c.description}${c.us.length ? ` (${c.us.join(', ')})` : ''}`;
}

/** Markdown section of CHANGELOG.md for one version. */
export function renderChangelogSection(version: string, date: string, commits: ParsedCommit[], stories: Artifact[]): string {
  const cassants = commits.filter((c) => c.breaking).map(ligneCommit);
  for (const s of stories.filter(isBreakingStory)) cassants.push(`- ${s.titre ?? s.id} (${s.id})`);
  const nouveautes = commits.filter((c) => !c.breaking && c.type === 'feat').map(ligneCommit);
  const corrections = commits.filter((c) => !c.breaking && c.type === 'fix').map(ligneCommit);
  const out = [`## [${version}] - ${date}`];
  const bloc = (titre: string, lignes: string[]) => {
    if (lignes.length) out.push('', `### ${titre}`, '', ...lignes);
  };
  bloc('Changements majeurs', cassants);
  bloc('Nouveautés', nouveautes);
  bloc('Corrections', corrections);
  if (out.length === 1) out.push('', '- Aucun changement notable dans les commits.');
  return out.join('\n') + '\n';
}

/** Inserts a section on top of the existing entries; creates the file when missing. */
export function insererSection(existing: string | null, section: string): string {
  if (existing == null || !existing.trim()) return `${HEADER}\n${section}`;
  const i = existing.search(/^## \[/m);
  if (i === -1) return `${existing.replace(/\s+$/, '')}\n\n${section}`;
  return `${existing.slice(0, i)}${section}\n${existing.slice(i)}`;
}

/** Draft release notes with the two audiences (users / operations), to be reviewed then validated. */
export function renderNotesBrouillon(version: string, date: string, stories: Artifact[]): string {
  const ligne = (s: Artifact) => `- ${s.id} : ${s.titre ?? ''}`.trimEnd();
  const bugs = stories.filter(isBug);
  const features = stories.filter((s) => !isBug(s));
  const cassants = stories.filter(isBreakingStory);
  const lines = [
    '---',
    'type: release-notes',
    'statut: brouillon',
    `version: ${version}`,
    `date: ${date}`,
    '---',
    '',
    `# Notes de livraison : version ${version}`,
    '',
    '<!-- Brouillon généré par `orbith release` à partir des US terminées : relis, complète et reformule, puis valide avec `npx orbith valider`. -->',
    '',
    '## Résumé',
    '',
    "<!-- Deux ou trois phrases : ce qui change pour l'utilisateur dans cette version. -->",
    '',
    '## Pour les utilisateurs',
    '',
    '### Nouveautés',
    '',
    ...(features.length ? features.map(ligne) : ['- ']),
    '',
    '### Corrections',
    '',
    ...(bugs.length ? bugs.map(ligne) : ['- ']),
    '',
    '### Limites connues',
    '',
    '- ',
    '',
    "## Pour l'exploitation",
    '',
    '### Changements à connaître',
    '',
    ...(cassants.length
      ? cassants.map((s) => `- **Rupture** : ${s.id} ${s.titre ?? ''} (à détailler : migration, compatibilité)`)
      : ['- ']),
    '',
    '### Déploiement et retour arrière',
    '',
    '- Migrations, nouvelles variables de configuration, ordre de déploiement :',
    '- Procédure de retour arrière :',
    '',
    '### Surveillance',
    '',
    '- ',
    '',
    '## Stories livrées',
    '',
    '| ID | Titre | Epic |',
    '|---|---|---|',
    ...stories.map((s) => `| ${s.id} | ${s.titre ?? ''} | ${s.data['epic'] != null ? String(s.data['epic']) : ''} |`),
    '',
  ];
  return lines.join('\n');
}

export async function runRelease(versionArg: string, opts: ReleaseOptions = {}): Promise<ReleaseResult | null> {
  const cwd = path.resolve(opts.cwd ?? process.cwd());
  const root = await requireProjectRoot(cwd);
  const version = versionArg.trim().replace(/^v/, '');
  const sv = parseSemVer(version);
  if (!sv || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new OrbithError(`Version invalide : « ${versionArg} » (format attendu : X.Y.Z, par exemple 1.2.0).`);
  }
  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    throw new OrbithError(`Date invalide : ${date} (format attendu : AAAA-MM-JJ).`);
  }
  const tag = `v${version}`;
  const git = await isGitRepo(root);
  if (git && (await gitTags(root)).includes(tag)) throw new OrbithError(`Le tag ${tag} existe déjà : choisis un autre numéro de version.`);
  const last = git ? await lastReleaseTag(root) : null;
  if (last && compareSemVer(sv, last.version) <= 0) {
    throw new OrbithError(`La version ${version} doit être supérieure à la dernière version publiée (${last.tag}).`);
  }

  const arts = await scanArtifacts(root);
  const notes = notesFor(arts, version);
  const proposal = await proposerVersion(root, arts);

  if (!notes) {
    const livrees = proposal.stories.filter((s) => storyStatus(s) === 'Terminée');
    const rel = `docs/livraisons/release-notes-${version}.md`;
    if (!opts.dryRun) {
      const file = path.join(root, rel);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, renderNotesBrouillon(version, date, livrees), 'utf8');
    }
    throw new OrbithError(
      `Notes de version introuvables pour ${version}. ${opts.dryRun ? 'Elles seraient créées' : 'Un brouillon a été créé'} : ${rel}\n` +
        `Relis-le (public utilisateur et public exploitation), puis : npx orbith valider ${rel}\nEnsuite relance : npx orbith release ${version}`,
    );
  }

  // Guardrails: everything is collected so the human sees every blocker at once.
  const refus: string[] = [];
  if (notes.etat !== 'validé') {
    refus.push(`les notes de version ${notes.chemin} ne sont pas validées (état : ${notes.etat}) → npx orbith valider ${notes.chemin}`);
  }
  const stories = arts.filter((a): a is Artifact & { id: string } => a.type === 'story' && !!a.id && mentions(notes.body, a.id));
  for (const s of stories.filter((x) => storyStatus(x) !== 'Terminée')) {
    refus.push(`${s.id} figure dans les notes mais n'est pas « Terminée » (colonne : ${storyStatus(s)})`);
  }
  const erreurs = (await runAll(await buildContext(root))).filter((r) => r.niveau === 'erreur');
  if (erreurs.length > 0) {
    refus.push(
      `\`orbith check\` est en erreur (${erreurs.length}) : ${erreurs.slice(0, 3).map((e) => e.message).join(' ; ')}${erreurs.length > 3 ? ' …' : ''}`,
    );
  }
  if (refus.length > 0) {
    throw new OrbithError(`Version ${version} refusée :\n${refus.map((r) => `  - ${r}`).join('\n')}`);
  }

  if (stories.length === 0) ui.avert('Les notes ne citent aucune US : vérifie la section « Stories livrées ».');
  if (!/^#{1,6}\s+.*exploitation/im.test(notes.body)) ui.avert("Les notes n'ont pas de partie « Pour l'exploitation » (public exploitation).");
  if (proposal.bump === 'majeur' && sv.major <= (last?.version.major ?? 0)) {
    ui.avert(`Des changements à rupture (« ${BREAKING_LABEL} » ou \`!\`) sont présents : une version majeure est attendue, tu as choisi ${version}.`);
  }

  const ids = arts.filter((a) => a.type === 'story' && a.id).map((a) => a.id!);
  const commits = (await gitCommitsSince(root, last?.tag)).map((c) => parseCommit(c, ids));
  const section = renderChangelogSection(version, date, commits, stories);
  const changelogPath = path.join(root, 'CHANGELOG.md');
  const existing = (await exists(changelogPath)) ? await fs.readFile(changelogPath, 'utf8') : null;
  if (existing && existing.includes(`## [${version}]`)) {
    throw new OrbithError(`CHANGELOG.md contient déjà une section pour ${version} : supprime-la d'abord si tu veux la régénérer.`);
  }

  ui.titre(`Version ${version}`);
  console.log(section);
  console.log(`  US : ${stories.map((s) => s.id).join(', ') || '—'}\n  Notes : ${notes.chemin}\n`);
  if (opts.dryRun) {
    ui.info("Simulation (--dry-run) : rien n'a été écrit.");
    return null;
  }

  const veutTag = git && !opts.sansTag;
  if (veutTag && !(await gitUser(root))) {
    throw new OrbithError('Identité git introuvable. Configure-la avec :\n  git config user.name "Ton Nom"\n  git config user.email "ton@email.fr"');
  }
  if (veutTag && !opts.yes) {
    if (!process.stdin.isTTY) {
      throw new OrbithError(
        "Confirmation impossible : ce terminal n'est pas interactif. Lance la commande toi-même dans un terminal (ou ajoute --yes, ou --sans-tag).",
      );
    }
    const ok = await confirm({
      message: `Je confirme : écrire CHANGELOG.md, le valider dans Git et créer le tag ${tag} (sans rien pousser)`,
      initialValue: false,
    });
    if (isCancel(ok) || !ok) {
      ui.avert("Publication de la version annulée. Rien n'a été modifié.");
      process.exitCode = 1;
      return null;
    }
  }

  await fs.writeFile(changelogPath, insererSection(existing, section), 'utf8');
  ui.ok('CHANGELOG.md mis à jour.');
  if (!veutTag) {
    ui.info(git ? `Tag non créé (--sans-tag). Quand tu es prêt : git tag -a ${tag} -m "Version ${version}"` : 'Dossier non versionné avec Git : pas de tag.');
    return { version, changelog: 'CHANGELOG.md', tag: null };
  }
  await gitCommitPaths(root, ['CHANGELOG.md'], `chore(release): ${tag}`);
  await gitCreateTag(root, tag, `Version ${version}`);
  ui.ok(`Tag ${tag} créé en local.`);
  ui.info(`Rien n'a été poussé. Quand tu es prêt : git push && git push origin ${tag}`);
  return { version, changelog: 'CHANGELOG.md', tag };
}

export function register(program: Command): void {
  program
    .command('release <version>')
    .description('Prépare une version : CHANGELOG.md, notes de version, tag Git local (après confirmation humaine)')
    .option('--date <AAAA-MM-JJ>', 'date de la version (par défaut : aujourd’hui)')
    .option('--sans-tag', 'écrit seulement CHANGELOG.md (ni commit ni tag)')
    .option('--dry-run', 'affiche ce qui serait fait sans rien écrire')
    .option('--cwd <dir>', 'dossier de travail')
    .option('--yes', 'ne pas demander de confirmation (réservé à un usage humain en script)')
    .action(async (version: string, opts: ReleaseOptions) => {
      await runRelease(version, opts);
    });
}
