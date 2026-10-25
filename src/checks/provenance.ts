import { etatChaineProvenance, isGitRepo } from '../core/index.js';
import { collecterProvenance, sansControleHumain } from '../cli/provenance.js';
import type { CheckContext, CheckResult } from './types.js';

/**
 * Avertit quand du code co-écrit par une IA (pied `Co-Authored-By:`) est lié à une US passée en « Terminée »
 * sans validation humaine tracée de la US et sans mention de revue humaine du code. Vérifie aussi la chaîne du
 * registre `.orbith/provenance.json` s'il existe.
 */
export async function run(ctx: CheckContext): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  const chaine = await etatChaineProvenance(ctx.root);
  if (chaine.etat === 'rompue') {
    out.push({
      categorie: 'provenance',
      niveau: 'erreur',
      message: `Registre de provenance modifié à la main (chaîne rompue à l'entrée ${chaine.index + 1}) : restaure-le depuis git.`,
      fichier: '.orbith/provenance.json',
    });
  }
  if (!(await isGitRepo(ctx.root)) && chaine.etat === 'vide') return out;
  const r = await collecterProvenance(ctx.root);
  for (const l of r.lignes.filter(sansControleHumain)) {
    out.push({
      categorie: 'provenance',
      niveau: 'avertissement',
      message: `${l.cle} est terminée avec du code co-écrit par une IA (${l.commits.length} commit(s)), sans validation humaine tracée ni revue humaine du code : fais relire le code et indique \`revue_par\` / \`revue_le\` dans la US, ou valide la US avec \`npx orbith valider\`.`,
      fichier: l.chemin,
    });
  }
  return out;
}
