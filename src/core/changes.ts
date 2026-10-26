import type { Artifact } from './artifacts.js';
import { arg } from './fsutil.js';

export const CHANGE_TYPES = ['standard', 'normal', 'urgent'] as const;
export const CHANGE_RISQUES = ['faible', 'moyen', 'élevé'] as const;

const plat = (v: unknown): string =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Type de changement normalisé (`changement:` du frontmatter), ou undefined s'il est absent ou inconnu. */
export function changeType(a: { data: Record<string, unknown> }): (typeof CHANGE_TYPES)[number] | undefined {
  const t = plat(a.data['changement']);
  return (CHANGE_TYPES as readonly string[]).includes(t) ? (t as (typeof CHANGE_TYPES)[number]) : undefined;
}

export function changeRisque(a: { data: Record<string, unknown> }): (typeof CHANGE_RISQUES)[number] | undefined {
  const r = plat(a.data['risque']);
  return CHANGE_RISQUES.find((x) => plat(x) === r);
}

/** Contenu d'une section « ## <titre> » sans commentaires HTML ni espaces réservés (`<…>`), ou '' si vide. */
export function sectionUtile(body: string, titre: RegExp): string {
  const lines = body.replace(/<!--[\s\S]*?-->/g, '').replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let dedans = false;
  for (const line of lines) {
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) {
      dedans = titre.test(plat(h[1]));
      continue;
    }
    if (dedans) out.push(line);
  }
  return out
    .map((l) => l.replace(/^\s*(?:[-*]|\d+\.)\s*(?:\[[ xX]\]\s*)?/, '').trim())
    .filter((l) => l !== '' && !/^<[^>]*>$/.test(l))
    .join('\n');
}

export function planRetourArriere(a: Artifact): string {
  return sectionUtile(a.body, /plan de retour arriere|retour arriere|rollback/);
}

/** Demandes de changement qui concernent cette version (`version:` du frontmatter). */
export function changesPourVersion(arts: Artifact[], version: string): Artifact[] {
  return arts.filter((a) => a.type === 'change' && a.data['version'] != null && String(a.data['version']).trim() === version);
}

/** Message d'erreur si aucune demande de changement validée ne couvre cette version, sinon null. */
export function refusChangement(arts: Artifact[], version: string): string | null {
  const liees = changesPourVersion(arts, version);
  if (liees.length === 0) {
    return `Aucune demande de changement pour la version ${version} (exigée par .orbith/config.yaml). Crée docs/livraisons/changes/CHG-NNN-${version}.md avec l'agent DevOps (modèle .orbith/templates/change.md), puis fais-la valider.`;
  }
  if (!liees.some((c) => c.etat === 'validé')) {
    const c = liees[0]!;
    return `La demande de changement ${c.id ?? c.chemin} n'est pas validée. Relis-la puis lance : npx orbith valider ${arg(c.chemin)}`;
  }
  return null;
}
