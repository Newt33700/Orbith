import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { OrbithError, loadConfig, requireProjectRoot, scanArtifacts, ui } from '../core/index.js';
import { buildTraces, renderDetail, renderMatrix } from './trace-report.js';

export interface TraceOptions {
  cwd?: string;
  sortie?: string;
}

/** Construit le rapport markdown (matrice, ou détail si `id` est fourni). */
export async function runTrace(id: string | undefined, opts: TraceOptions = {}): Promise<string> {
  const cwd = path.resolve(opts.cwd ?? process.cwd());
  const root = await requireProjectRoot(cwd);
  const config = await loadConfig(root);
  const traces = await buildTraces(root, await scanArtifacts(root));
  let out: string;
  if (id) {
    const t = traces.find((x) => x.id.toLowerCase() === id.toLowerCase());
    if (!t) throw new OrbithError(`User story introuvable : ${id}`);
    out = renderDetail(t);
  } else {
    out = renderMatrix(traces, config.projet.nom);
  }
  if (opts.sortie) {
    const file = path.resolve(cwd, opts.sortie);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, out, 'utf8');
    ui.ok(`Rapport de traçabilité écrit dans ${opts.sortie}`);
  } else {
    process.stdout.write(out);
  }
  return out;
}

export function register(program: Command): void {
  program
    .command('trace [id]')
    .description('Génère la matrice de traçabilité (US → commits → tests → livraison)')
    .option('--cwd <dir>', 'dossier de travail')
    .option('--sortie <fichier>', 'écrit le rapport dans un fichier markdown')
    .action(async (id: string | undefined, opts: TraceOptions) => {
      await runTrace(id, opts);
    });
}
