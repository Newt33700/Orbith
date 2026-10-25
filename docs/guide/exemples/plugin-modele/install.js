// Modèle d'installeur Orbith (ESM pur : le dossier plugins/ n'est pas compilé).
// Appelé par `npx orbith plugin add <nom>` avec le contexte :
//   { root, config, run(cmd, args, { cwd }) => Promise<{ code, stdout, stderr }>, log: { info, ok, avert } }
import { promises as fs } from 'node:fs';
import path from 'node:path';

// Fichier créé dans le projet de l'utilisateur. Adapte le chemin et le contenu.
const FICHIER = path.join('docs', 'mon-plugin.md');

export async function install({ root, config, log }) {
  const cible = path.join(root, FICHIER);
  try {
    await fs.mkdir(path.dirname(cible), { recursive: true });
    // flag 'wx' : échoue si le fichier existe déjà, il n'est donc jamais écrasé.
    await fs.writeFile(
      cible,
      `# ${config.projet.nom}\n\nFichier créé par le plugin « mon-plugin ». Modifie-le librement.\n`,
      { encoding: 'utf8', flag: 'wx' },
    );
    log.ok(`${FICHIER} créé.`);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    log.info(`${FICHIER} existe déjà : conservé tel quel.`);
  }
}
