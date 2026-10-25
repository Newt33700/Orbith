import {
  AVANCEMENTS,
  SOURCES_AMELIORATION,
  avancement,
  dateJour,
  enRetard,
  liensCasses,
  scanArtifacts,
  sourceAmelioration,
} from '../core/index.js';
import type { CheckContext, CheckResult } from './types.js';

/**
 * Continual improvement (AMEL-NNN, category `amelioration`) and knowledge links (category `tracabilite`).
 * Warnings only: these checks never fail `orbith check`.
 */
export async function run(ctx: CheckContext, aujourdhui = new Date().toISOString().slice(0, 10)): Promise<CheckResult[]> {
  const arts = await scanArtifacts(ctx.root);
  const res: CheckResult[] = [];
  const warn = (categorie: CheckResult['categorie'], message: string, fichier: string): void => {
    res.push({ categorie, niveau: 'avertissement', message, fichier });
  };

  for (const a of arts.filter((x) => x.type === 'amelioration')) {
    const nom = a.id ?? a.chemin;
    if (!a.id || !/^AMEL-\d+$/.test(a.id)) {
      warn('amelioration', `Action d'amélioration sans identifiant AMEL-NNN (id : ${a.id ?? 'absent'}).`, a.chemin);
    }
    const av = avancement(a);
    if (!av) {
      warn('amelioration', `${nom} : avancement inconnu « ${String(a.data['avancement'])} » (attendu : ${AVANCEMENTS.join(', ')}).`, a.chemin);
    }
    if (a.data['source'] != null && !sourceAmelioration(a)) {
      warn('amelioration', `${nom} : source inconnue « ${String(a.data['source'])} » (attendu : ${SOURCES_AMELIORATION.join(', ')}).`, a.chemin);
    }
    const ouverte = av === 'ouvert' || av === 'en cours';
    if (ouverte) {
      const manque = [
        String(a.data['responsable'] ?? '').trim() ? null : 'responsable',
        dateJour(a.data['echeance']) ? null : 'échéance (AAAA-MM-JJ)',
      ].filter(Boolean);
      if (manque.length) warn('amelioration', `${nom} : à compléter par l'équipe : ${manque.join(', ')}.`, a.chemin);
    }
    if (enRetard(a, aujourdhui)) {
      warn('amelioration', `${nom} est en retard : échéance ${dateJour(a.data['echeance'])} dépassée (avancement : ${av}).`, a.chemin);
    }
  }

  for (const a of arts) {
    const l = a.data['liens'];
    if (l != null && !Array.isArray(l) && typeof l !== 'string') {
      warn('tracabilite', `${a.id ?? a.chemin} : le champ \`liens\` doit être une liste d'identifiants (par exemple [ADR-001, INC-002]).`, a.chemin);
    }
  }
  for (const c of liensCasses(arts)) {
    warn('tracabilite', `${c.artefact.id ?? c.artefact.chemin} : lien vers « ${c.cible} » (champ ${c.champ}), identifiant introuvable.`, c.artefact.chemin);
  }
  return res;
}
