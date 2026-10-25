import path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import { OrbithError, decouper, requireProjectRoot, ui } from '../core/index.js';

export function register(program: Command): void {
  program
    .command('decouper <fichier>')
    .description('Découpe un document Markdown volumineux en extraits par section (sans IA, le document n\'est jamais modifié)')
    .option('--niveau <n>', 'niveau de titre où couper (1 à 6)', '2')
    .option('--sortie <dossier>', 'dossier de sortie (défaut : .orbith/extraits/<nom>/)')
    .option('--cwd <dir>', 'dossier de travail')
    .action(async (fichier: string, opts: { niveau: string; sortie?: string; cwd?: string }) => {
      const niveau = /^\d+$/.test(opts.niveau) ? Number(opts.niveau) : NaN;
      if (!Number.isInteger(niveau) || niveau < 1 || niveau > 6) {
        throw new OrbithError(`Niveau invalide : « ${opts.niveau} » (attendu : un entier de 1 à 6).`);
      }
      const cwd = path.resolve(opts.cwd ?? process.cwd());
      const root = await requireProjectRoot(cwd);
      // Les chemins saisis sont relatifs au dossier de travail ; le cœur les attend relatifs à la racine du projet.
      const sortie = opts.sortie === undefined ? undefined : path.relative(root, path.resolve(cwd, opts.sortie));
      const r = await decouper(root, path.resolve(cwd, fichier), niveau, sortie);
      ui.ok(`${r.source} découpé en ${r.extraits.length} extrait(s) dans ${r.dossier}/ (environ ${r.jetonsTotal} jetons au total).`);
      for (const e of r.extraits) console.log(`  ${pc.dim(String(e.jetons).padStart(6))} jetons  ${e.nom}`);
      console.log(`\nLes agents lisent d'abord ${pc.bold(`${r.dossier}/index.md`)}. Le document source n'a pas été modifié.`);
    });
}
