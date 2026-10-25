import type { Command } from 'commander';
import pc from 'picocolors';
import { OrbithError, requireProjectRoot } from '../core/index.js';
import { buildContext, runAll, type CheckCategorie, type CheckResult } from '../checks/index.js';

const CATEGORIES: { id: CheckCategorie; titre: string }[] = [
  { id: 'csr', titre: 'Cadre de référence (CSR)' },
  { id: 'validations', titre: 'Validations' },
  { id: 'tracabilite', titre: 'Traçabilité' },
  { id: 'secrets', titre: 'Secrets' },
  { id: 'sbom', titre: 'Licences (SBOM)' },
];

function ligne(r: CheckResult): string {
  const icone = r.niveau === 'erreur' ? pc.red('❌') : r.niveau === 'avertissement' ? pc.yellow('⚠️ ') : pc.blue('ℹ️ ');
  const f = r.fichier ? pc.dim(` [${r.fichier}]`) : '';
  return `  ${icone} ${r.message}${f}`;
}

export function register(program: Command): void {
  program
    .command('check')
    .description('Vérifie la conformité (CSR, validations, traçabilité, secrets)')
    .option('--format <format>', 'format de sortie (texte|json)', 'texte')
    .option('--cwd <dir>', 'dossier de travail')
    .action(async (opts: { format: string; cwd?: string }) => {
      const format = opts.format === 'json' ? 'json' : opts.format === 'texte' ? 'texte' : null;
      if (!format) throw new OrbithError(`Format inconnu : « ${opts.format} » (attendu : texte ou json).`);
      const root = await requireProjectRoot(opts.cwd ?? process.cwd());
      const resultats = await runAll(await buildContext(root));
      const erreurs = resultats.filter((r) => r.niveau === 'erreur').length;
      const avertissements = resultats.filter((r) => r.niveau === 'avertissement').length;
      if (erreurs > 0) process.exitCode = 1;

      if (format === 'json') {
        console.log(JSON.stringify({ conforme: erreurs === 0, erreurs, avertissements, resultats }, null, 2));
        return;
      }
      for (const c of CATEGORIES) {
        const rs = resultats.filter((r) => r.categorie === c.id);
        console.log('\n' + pc.bold(pc.cyan(c.titre)));
        if (!rs.some((r) => r.niveau !== 'info')) console.log(`  ${pc.green('✅')} Rien à signaler`);
        for (const r of rs) console.log(ligne(r));
      }
      console.log(
        '\n' + (erreurs === 0 && avertissements === 0
          ? pc.green('✅ Tout est conforme')
          : erreurs === 0
            ? `${pc.green('✅ Aucune erreur')}, ${avertissements} avertissement(s)`
            : pc.red(`❌ ${erreurs} erreur(s), ${avertissements} avertissement(s)`)),
      );
    });
}
