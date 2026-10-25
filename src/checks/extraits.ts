import { EXTRAITS_SEUIL_DEFAUT, documentsVolumineux, extraitsPerimes, scanArtifacts } from '../core/index.js';
import type { CheckContext, CheckResult } from './types.js';

/**
 * Extraits de documents volumineux (SPEC §15), rattachés à la catégorie `documentation` :
 * - avertissement : un extrait est périmé (le corps du source a changé, ou le source a disparu) ;
 * - info : un document dépasse `extraits.seuil_jetons` (défaut 4000) sans aucun extrait.
 * Jamais une erreur. Ne lève pas : un échec de lecture est ignoré (contrôle de confort).
 */
export async function run(ctx: CheckContext): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  try {
    for (const p of await extraitsPerimes(ctx.root)) {
      out.push({
        categorie: 'documentation',
        niveau: 'avertissement',
        message:
          p.raison === 'absent'
            ? `Les extraits de ${p.source} sont orphelins (document source introuvable). Supprime le dossier ${p.dossier}.`
            : `Les extraits de ${p.source} sont périmés (le document a changé). Relance \`npx orbith decouper ${p.source}\`.`,
        fichier: p.dossier,
      });
    }
    const seuil = ctx.config?.extraits?.seuil_jetons ?? EXTRAITS_SEUIL_DEFAUT;
    for (const d of await documentsVolumineux(ctx.root, await scanArtifacts(ctx.root), seuil)) {
      out.push({
        categorie: 'documentation',
        niveau: 'info',
        message: `${d.chemin} est volumineux (environ ${d.jetons} jetons, seuil ${seuil}). Découpe-le : \`npx orbith decouper ${d.chemin}\`.`,
        fichier: d.chemin,
      });
    }
  } catch {
    // contrôle de confort : jamais bloquant
  }
  return out;
}
