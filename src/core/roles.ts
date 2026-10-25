import type { OrbithConfig } from './config.js';

export interface Identite {
  name: string;
  email: string;
}

const norm = (s: string): string => s.normalize('NFC').trim().toLowerCase();

/** Une entrée de la matrice (email ou nom git) désigne-t-elle cette personne ? */
export function correspond(personne: Identite, entree: string): boolean {
  const e = norm(entree);
  return e !== '' && (e === norm(personne.email) || e === norm(personne.name));
}

/** Même personne, à l'email ou au nom près (insensible à la casse). */
export function memePersonne(a: Identite, b: Identite): boolean {
  return (!!a.email && norm(a.email) === norm(b.email)) || (!!a.name && norm(a.name) === norm(b.name));
}

/** Personnes autorisées à valider ce type de document (clé `*` = valeur par défaut), ou null si aucune restriction. */
export function valideursDuType(cfg: OrbithConfig | null, type: string): string[] | null {
  const matrice = cfg?.roles?.valideurs;
  if (!matrice) return null;
  const liste = matrice[type] ?? matrice['*'];
  return liste && liste.length > 0 ? liste : null;
}

/** Approbateurs nommés dans une demande de changement (frontmatter `approbateurs`). */
export function approbateursDuChangement(data: Record<string, unknown>): string[] {
  const v = data['approbateurs'];
  const items = Array.isArray(v) ? v : v == null ? [] : [v];
  return items.map((x) => String(x).trim()).filter((x) => x !== '' && !x.startsWith('<'));
}

/**
 * Vérifie que `personne` a le droit de valider ce document (matrice des rôles, et approbateurs pour un changement).
 * Retourne un message en français si ce n'est pas le cas, sinon null.
 */
export function refusRole(cfg: OrbithConfig | null, type: string, data: Record<string, unknown>, personne: Identite): string | null {
  const liste = valideursDuType(cfg, type);
  if (liste && !liste.some((e) => correspond(personne, e))) {
    return `${personne.name} (${personne.email}) n'est pas autorisé·e à valider un document de type « ${type} ». Valideurs prévus dans .orbith/config.yaml : ${liste.join(', ')}.`;
  }
  if (type === 'change') {
    const appro = approbateursDuChangement(data);
    if (appro.length > 0 && !appro.some((e) => correspond(personne, e))) {
      return `${personne.name} (${personne.email}) ne fait pas partie des approbateurs de cette demande de changement : ${appro.join(', ')}.`;
    }
  }
  return null;
}

/** Principe des quatre yeux : le valideur ne doit pas être l'auteur du dernier commit du fichier. */
export function refusQuatreYeux(cfg: OrbithConfig | null, auteur: Identite | null, valideur: Identite): string | null {
  if (cfg?.roles?.quatre_yeux !== true || !auteur) return null;
  if (!memePersonne(auteur, valideur)) return null;
  return `Principe des quatre yeux : ${valideur.name} est l'auteur du dernier commit de ce fichier et ne peut pas le valider. Fais-le relire par une autre personne.`;
}
