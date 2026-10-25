import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ORBITH_DIR, etatChaineRegistre, verifierChaine, type EtatChaine } from '../core/index.js';
import type { CheckResult } from './types.js';

function resultat(fichier: string, etat: EtatChaine, nature: string, commande: string): CheckResult | null {
  if (etat.etat === 'rompue') {
    return {
      categorie: 'validations',
      niveau: 'erreur',
      message: `Chaîne d'audit rompue à l'entrée ${etat.index + 1} : ${nature} a été modifié à la main (entrée altérée, retirée ou insérée). Restaure-le depuis l'historique du dépôt.`,
      fichier,
    };
  }
  if (etat.etat === 'sans-chaine') {
    return {
      categorie: 'validations',
      niveau: 'avertissement',
      message: `Registre sans chaîne d'audit (ancien format) : ${nature} ne détecte pas les éditions manuelles. Il sera chaîné au prochain \`${commande}\`.`,
      fichier,
    };
  }
  return null;
}

/** Contrôle l'intégrité des journaux chaînés (.orbith/validations.json et .orbith/deploiements.json). */
export async function chaineResultats(root: string): Promise<CheckResult[]> {
  const res: CheckResult[] = [];
  const vf = `${ORBITH_DIR}/validations.json`;
  try {
    const r = resultat(vf, await etatChaineRegistre(root), 'le registre des validations', 'orbith valider');
    if (r) res.push(r);
  } catch {
    // registre illisible : l'erreur est remontée par ailleurs
  }
  const df = `${ORBITH_DIR}/deploiements.json`;
  try {
    const json = JSON.parse(await fs.readFile(path.join(root, df), 'utf8')) as { deploiements?: unknown };
    if (Array.isArray(json.deploiements)) {
      const etat = verifierChaine(json.deploiements as { precedent?: unknown }[]);
      const r = resultat(df, etat, 'le registre des déploiements', 'orbith deploiement');
      if (r) res.push(r);
    }
  } catch {
    // absent : rien à contrôler
  }
  return res;
}
