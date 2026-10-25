import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  ORBITH_DIR,
  entreesPerdues,
  etatChaineRegistre,
  gitShowHead,
  isGitRepo,
  verifierChaine,
  type EtatChaine,
} from '../core/index.js';
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

function lireListe(texte: string | null, cle: 'validations' | 'deploiements'): object[] | null {
  if (texte === null) return null;
  try {
    const l = (JSON.parse(texte) as Record<string, unknown>)[cle];
    return Array.isArray(l) ? (l as object[]) : null;
  } catch {
    return null;
  }
}

function libelle(e: object): string {
  const o = e as { fichier?: unknown; version?: unknown; env?: unknown };
  if (typeof o.fichier === 'string') return o.fichier;
  return [o.version, o.env].filter((x) => typeof x === 'string').join(' / ') || 'entrée sans nom';
}

/**
 * Compare le registre de travail à sa version commitée (HEAD) : la chaîne seule ne voit pas qu'on retire
 * la DERNIÈRE entrée. Sans dépôt Git, sans commit ou registre non suivi : rien à comparer.
 */
async function suppressionsResultats(root: string): Promise<CheckResult[]> {
  if (!(await isGitRepo(root))) return [];
  const res: CheckResult[] = [];
  const cas = [
    { fichier: `${ORBITH_DIR}/validations.json`, cle: 'validations', mode: 'remplacement', nature: 'des validations' },
    { fichier: `${ORBITH_DIR}/deploiements.json`, cle: 'deploiements', mode: 'append-seul', nature: 'des déploiements' },
  ] as const;
  for (const c of cas) {
    const head = lireListe(await gitShowHead(root, c.fichier), c.cle);
    if (!head || head.length === 0) continue;
    let travail: object[] = [];
    try {
      travail = lireListe(await fs.readFile(path.join(root, c.fichier), 'utf8'), c.cle) ?? [];
    } catch {
      // fichier supprimé : toutes les entrées commitées sont perdues
    }
    const perdues = entreesPerdues(head, travail, c.mode);
    if (perdues.length === 0) continue;
    const noms = perdues.slice(0, 3).map((i) => libelle(head[i]!));
    res.push({
      categorie: 'validations',
      niveau: 'erreur',
      message:
        `Entrée supprimée ou modifiée dans le registre ${c.nature} par rapport au dernier commit (${perdues.length} : ${noms.join(', ')}${perdues.length > 3 ? ' …' : ''}). ` +
        `Un journal d'audit ne se réécrit pas : restaure ${c.fichier} depuis l'historique du dépôt (git restore ${c.fichier}).`,
      fichier: c.fichier,
    });
  }
  return res;
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
  res.push(...(await suppressionsResultats(root)));
  return res;
}
