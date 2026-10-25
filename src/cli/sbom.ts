import { promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { loadConfig, packageRoot, requireProjectRoot, ui } from '../core/index.js';
import { collecterComposants, versCycloneDx, type CycloneDx } from '../sbom/index.js';

export interface SbomOptions {
  cwd?: string;
  sortie?: string;
}

function orbithVersion(): string | undefined {
  try {
    return (JSON.parse(readFileSync(path.join(packageRoot(), 'package.json'), 'utf8')) as { version?: string }).version;
  } catch {
    return undefined;
  }
}

export async function runSbom(opts: SbomOptions = {}): Promise<{ sbom: CycloneDx; sortie: string | null }> {
  const cwd = path.resolve(opts.cwd ?? process.cwd());
  const root = await requireProjectRoot(cwd);
  let nom = path.basename(root);
  try {
    nom = (await loadConfig(root)).projet.nom;
  } catch {
    // configuration illisible : nom du dossier
  }
  const composants = await collecterComposants(root);
  const sbom = versCycloneDx(nom, composants, orbithVersion());
  const json = JSON.stringify(sbom, null, 2) + '\n';

  let sortie: string | null = null;
  if (opts.sortie) {
    sortie = path.resolve(cwd, opts.sortie);
    await fs.mkdir(path.dirname(sortie), { recursive: true });
    await fs.writeFile(sortie, json, 'utf8');
  } else {
    process.stdout.write(json);
  }
  const log = sortie ? console.log : console.error;
  log(`\nSBOM : ${composants.length} composant(s) (CycloneDX 1.5).`);
  if (sortie) ui.ok(`SBOM écrit dans ${path.relative(cwd, sortie) || sortie}`);
  else if (composants.length === 0) ui.avert('Aucun composant trouvé (package.json, pom.xml, requirements*.txt, pyproject.toml).');
  return { sbom, sortie };
}

export function register(program: Command): void {
  program
    .command('sbom')
    .description('Produit la liste des composants du projet (SBOM CycloneDX JSON) pour les équipes sécurité et conformité')
    .option('--sortie <fichier>', 'fichier de sortie (défaut : sortie standard)')
    .option('--cwd <dir>', 'dossier de travail')
    .action(async (opts: SbomOptions) => {
      await runSbom(opts);
    });
}
