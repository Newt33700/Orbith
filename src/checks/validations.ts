import { scanAll } from '../core/index.js';
import { run as runGouvernance } from './gouvernance.js';
import { chaineResultats } from './chaine.js';
import type { CheckContext, CheckResult } from './types.js';

export async function run(ctx: CheckContext): Promise<CheckResult[]> {
  const res: CheckResult[] = [...(await chaineResultats(ctx.root))];
  const { artifacts, problems } = await scanAll(ctx.root);
  for (const pb of problems) {
    res.push({
      categorie: 'validations',
      niveau: 'erreur',
      message: `Frontmatter invalide : ${pb.message}. Corrige l'en-tête YAML (entre les lignes ---) du fichier.`,
      fichier: pb.chemin,
    });
  }
  for (const a of artifacts) {
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
  res.push(...(await runGouvernance(ctx)));
  return res;
}
