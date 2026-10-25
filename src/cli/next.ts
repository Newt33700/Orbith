import path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import { loadConfig, requireProjectRoot, scanArtifacts, ui } from '../core/index.js';
import { computeNext, type Action, type NextResult } from './next-rules.js';

export { computeNext } from './next-rules.js';
export type { Action, NextResult } from './next-rules.js';

function lignesAction(a: Action, prefix: string): string[] {
  const lines = [prefix + a.message];
  if (a.gemini && a.claude) lines.push(`    Gemini : ${pc.bold(a.gemini)}   Claude : ${pc.bold(a.claude)}`);
  if (a.cli) lines.push(`    ${pc.bold(a.cli)}`);
  return lines;
}

export function renderNext(res: NextResult, projet: string, piste: string): string {
  const out: string[] = [`${pc.bold(pc.cyan('Orbith'))} · ${projet} · piste « ${piste} »`, ''];
  out.push(pc.bold('Prochaine action :'));
  out.push(...lignesAction(res.principal, '  → '));
  if (res.secondaires.length > 0) {
    out.push('', pc.bold('Ensuite / aussi :'));
    for (const s of res.secondaires) out.push(...lignesAction(s, '  • '));
  }
  return out.join('\n');
}

export async function runNext(cwd: string, format: string): Promise<void> {
  const root = await requireProjectRoot(cwd);
  const config = await loadConfig(root);
  const arts = await scanArtifacts(root);
  const res = computeNext(arts, config);
  if (format === 'json') {
    console.log(JSON.stringify({ projet: config.projet.nom, piste: config.piste, ...res }, null, 2));
    return;
  }
  console.log(renderNext(res, config.projet.nom || path.basename(root), config.piste));
  ui.rappelNouvelleSession();
}

export function register(program: Command): void {
  program
    .command('next')
    .description('Indique la prochaine action recommandée')
    .option('--cwd <dir>', 'dossier de travail')
    .option('--format <format>', 'texte ou json', 'texte')
    .action(async (opts: { cwd?: string; format?: string }) => {
      await runNext(opts.cwd ?? process.cwd(), opts.format ?? 'texte');
    });
}
