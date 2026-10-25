import type { Command } from 'commander';
import pc from 'picocolors';
import { OrbithError, requireProjectRoot, scanArtifacts, storyStatus, ui } from '../core/index.js';
import { BREAKING_LABEL, proposerVersion, type VersionProposal } from './version-calc.js';

export interface VersionOptions {
  cwd?: string;
  format?: string;
}

function rendre(p: VersionProposal): void {
  ui.titre('Prochaine version');
  console.log(`  Dernière version : ${p.derniere ?? 'aucune (premier jalon)'}`);
  if (!p.propose || !p.bump) {
    ui.info('Rien à proposer : aucun commit `feat`/`fix`/`!` ni US terminée depuis la dernière version.');
    return;
  }
  console.log(`  Proposition      : ${pc.bold(p.propose)} (${p.bump})\n`);
  console.log(pc.bold('Pourquoi'));
  for (const r of p.raisons.slice(0, 20)) console.log(`  - [${r.bump}] ${r.text}`);
  if (p.raisons.length > 20) console.log(`  … et ${p.raisons.length - 20} autre(s)`);
  if (p.nonTerminees.length > 0) {
    console.log('');
    ui.avert(
      `US citées dans les commits mais pas « Terminée » : ${p.nonTerminees.map((s) => `${s.id} (${storyStatus(s)})`).join(', ')}. ` +
        "`orbith release` refusera la version tant qu'elles figurent dans les notes.",
    );
  }
  console.log(
    `\nC'est une proposition : c'est à toi de décider. Pour préparer la version :\n  npx orbith release ${p.propose}\n` +
      pc.dim(`(étiquette « ${BREAKING_LABEL} » sur une US ou \`!\` dans un commit = version majeure)`),
  );
}

export async function runVersion(opts: VersionOptions = {}): Promise<VersionProposal> {
  const format = opts.format === 'json' ? 'json' : opts.format === 'texte' || !opts.format ? 'texte' : null;
  if (!format) throw new OrbithError(`Format inconnu : « ${opts.format} » (attendu : texte ou json).`);
  const root = await requireProjectRoot(opts.cwd ?? process.cwd());
  const p = await proposerVersion(root, await scanArtifacts(root));
  if (format === 'json') {
    console.log(
      JSON.stringify(
        {
          derniere: p.derniere,
          propose: p.propose,
          bump: p.bump,
          raisons: p.raisons,
          us: p.stories.map((s) => ({ id: s.id, status: storyStatus(s) })),
        },
        null,
        2,
      ),
    );
  } else rendre(p);
  return p;
}

export function register(program: Command): void {
  program
    .command('version')
    .description('Propose le prochain numéro de version (SemVer) à partir des commits et des US, sans IA')
    .option('--format <format>', 'format de sortie (texte|json)', 'texte')
    .option('--cwd <dir>', 'dossier de travail')
    .action(async (opts: VersionOptions) => {
      await runVersion(opts);
    });
}
