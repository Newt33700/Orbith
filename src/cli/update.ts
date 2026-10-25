import path from 'node:path';
import type { Command } from 'commander';
import * as p from '@clack/prompts';
import { defaultConfig, loadConfig, requireProjectRoot, OrbithError, ui } from '../core/index.js';
import { runAdapters } from '../adapters/index.js';
import { copyCore, patchConfig } from './install.js';

export interface UpdateOptions {
  yes?: boolean;
  cwd?: string;
}

export async function runUpdate(opts: UpdateOptions): Promise<void> {
  const root = await requireProjectRoot(path.resolve(opts.cwd ?? process.cwd()));
  const cfg = await loadConfig(root);

  if (!opts.yes && process.stdin.isTTY) {
    const ok = await p.confirm({
      message:
        'Mettre à jour les agents, workflows, templates et règles dans .orbith/ ? (ta config, tes dossiers custom/ et csr/ et tes validations ne sont pas touchés)',
    });
    if (p.isCancel(ok) || !ok) throw new OrbithError("Mise à jour annulée. Rien n'a été modifié.");
  }

  ui.titre('Mise à jour d\'Orbith');
  const files = await copyCore(root, true);
  const version = defaultConfig(cfg.projet.nom).orbith_version;
  const avant = cfg.orbith_version;
  await patchConfig(root, { orbith_version: version });
  const adapterFiles = await runAdapters(root, { ...cfg, orbith_version: version });

  ui.ok(`${files.length} fichier(s) du cœur Orbith remis à jour, ${adapterFiles.length} fichier(s) de plateforme régénérés.`);
  ui.ok(avant === version ? `Version d'Orbith : ${version}` : `Version d'Orbith : ${avant} → ${version}`);
  ui.info('Conservés tels quels : .orbith/config.yaml, .orbith/config/, .orbith/csr/, .orbith/custom/, .orbith/validations.json');
  ui.rappelNouvelleSession();
}

export function register(program: Command): void {
  program
    .command('update')
    .description("Met à jour les agents, workflows, templates et règles d'Orbith")
    .option('--yes', 'mode non interactif')
    .option('--cwd <dir>', 'dossier de travail')
    .action(async (opts: UpdateOptions) => {
      await runUpdate(opts);
    });
}
