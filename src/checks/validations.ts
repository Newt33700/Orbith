import { scanArtifacts } from '../core/index.js';
import type { CheckContext, CheckResult } from './types.js';

export async function run(ctx: CheckContext): Promise<CheckResult[]> {
  const res: CheckResult[] = [];
  for (const a of await scanArtifacts(ctx.root)) {
    if (a.etat === 'modifié') {
      res.push({
        categorie: 'validations',
        niveau: 'erreur',
        message: `Modifié après validation : le contenu ne correspond plus à la version validée. Relance \`orbith valider ${a.chemin}\`.`,
        fichier: a.chemin,
      });
    } else if (a.etat === 'non-tracé') {
      res.push({
        categorie: 'validations',
        niveau: 'erreur',
        message: `Validation non tracée : le statut « validé » a été écrit sans passer par \`orbith valider\`.`,
        fichier: a.chemin,
      });
    }
  }
  return res;
}
