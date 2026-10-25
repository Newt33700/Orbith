import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { OrbithError, loadConfig, requireProjectRoot, scanArtifacts, ui } from '../core/index.js';
import { buildTraces, renderChanges, renderDetail, renderMatrix } from './trace-report.js';
import { renderAmeliorations, renderConnaissance, renderDetailConnaissance } from './trace-connaissance.js';

export interface TraceOptions {
  cwd?: string;
  sortie?: string;
}

/** Construit le rapport markdown (matrice, ou détail si `id` est fourni). */
export async function runTrace(id: string | undefined, opts: TraceOptions = {}): Promise<string> {
  const cwd = path.resolve(opts.cwd ?? process.cwd());
  const root = await requireProjectRoot(cwd);
  const config = await loadConfig(root);
  const arts = await scanArtifacts(root);
  const traces = await buildTraces(root, arts);
  let out: string;
  if (id) {
    const t = traces.find((x) => x.id.toLowerCase() === id.toLowerCase());
    // Hors US : détail des liens d'un autre artefact (incident, ADR, action d'amélioration…).
    const autre = t ? undefined : renderDetailConnaissance(arts, id);
    if (!t && !autre) throw new OrbithError(`User story introuvable : ${id}`);
    out = t ? renderDetail(t) : autre!;
  } else {
    out = renderMatrix(traces, config.projet.nom) + renderChanges(arts) + renderAmeliorations(arts) + renderConnaissance(arts);
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
    .description('Génère la matrice de traçabilité (US → commits → tests → livraison) et les liens de connaissance')
    .option('--cwd <dir>', 'dossier de travail')
    .option('--sortie <fichier>', 'écrit le rapport dans un fichier markdown')
    .action(async (id: string | undefined, opts: TraceOptions) => {
      await runTrace(id, opts);
    });
}
