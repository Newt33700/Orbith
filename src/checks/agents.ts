import { inventaireAgentsPerso } from '../adapters/agents-perso.js';
import { MARQUEUR_A_COMPLETER } from '../adapters/contexte.js';
import type { CheckContext, CheckResult } from './types.js';

function normaliser(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Mandatory rules every custom agent must carry (SPEC §15), detected on the accent-insensitive, lowercase body:
 * a reference to the rule file, or the usual wording of content/agents/*.md.
 */
export const REGLES_OBLIGATOIRES: { id: string; libelle: string; re: RegExp }[] = [
  {
    id: 'validation-humaine',
    libelle: 'validation humaine (« tu n\'écris jamais `statut: validé` »)',
    re: /rules\/validation-humaine\.md|jamais[^\n]{0,80}statut\s*:\s*valide/,
  },
  { id: 'confidentialite', libelle: 'confidentialité', re: /rules\/confidentialite\.md|confidentialite/ },
  { id: 'nouvelle-session', libelle: 'rappel de nouvelle session en fin de tâche', re: /rules\/nouvelle-session\.md|nouvelle session/ },
  { id: 'documentation', libelle: 'documentation à jour', re: /rules\/documentation\.md|documentation a jour/ },
];

/** Missing mandatory rules of a custom agent body. */
export function reglesManquantes(corps: string): string[] {
  const t = normaliser(corps);
  return REGLES_OBLIGATOIRES.filter((r) => !r.re.test(t)).map((r) => r.libelle);
}

/**
 * Instructions a custom agent must never carry (SPEC §15): ordering a validation with `--yes`, a push, or writing
 * `statut: validé`. Checked line by line on the normalised body; a line holding a negation (« ne … jamais … ») is the
 * prohibition itself and is allowed.
 */
export const CONSIGNES_INTERDITES: { id: string; libelle: string; re: RegExp }[] = [
  { id: 'valider-yes', libelle: 'ordonne `orbith valider … --yes` (seul un humain valide)', re: /orbith\s+valider[^\n]*--yes/ },
  { id: 'push', libelle: 'ordonne un `git push` (seul un humain pousse)', re: /\bgit\s+push\b/ },
  {
    id: 'ecrire-valide',
    libelle: "ordonne d'écrire `statut: validé` (réservé à `orbith valider`)",
    re: /(ecris|ecrire|mets|mettre|passe|passer)[^\n]{0,40}statut\s*:\s*valide/,
  },
];

const NEGATION = /\b(jamais|ne|n|interdit|interdite|pas|aucun|aucune|sans)\b/;

/** Forbidden instructions found in a custom agent body (labels). */
export function consignesInterdites(corps: string): string[] {
  const lignes = normaliser(corps).split(/\r?\n/);
  return CONSIGNES_INTERDITES.filter((r) => lignes.some((l) => r.re.test(l) && !NEGATION.test(l))).map((r) => r.libelle);
}

/** Custom agents (`.orbith/custom/agents/`): invalid declarations (erreur), missing rules (avertissement). */
export async function run(ctx: CheckContext): Promise<CheckResult[]> {
  const inv = await inventaireAgentsPerso(ctx.root);
  const res: CheckResult[] = [];
  for (const e of inv.erreurs) {
    res.push({ categorie: 'agents', niveau: 'erreur', message: `Agent personnalisé invalide : ${e.message}.`, fichier: e.chemin });
  }
  for (const f of inv.ignores) {
    res.push({
      categorie: 'agents',
      niveau: 'avertissement',
      message:
        "Fichier ignoré : ce n'est ni le complément d'un agent du cœur, ni un agent personnalisé. Pour en faire un agent, ajoute un en-tête avec `description:` (voir `npx orbith agent new`).",
      fichier: f,
    });
  }
  for (const a of inv.agents) {
    const manquantes = reglesManquantes(a.corps);
    if (manquantes.length > 0) {
      res.push({
        categorie: 'agents',
        niveau: 'avertissement',
        message: `Agent « ${a.key} » : règle(s) obligatoire(s) absente(s) : ${manquantes.join(', ')}. Ajoute-les dans « Règles de comportement » et « Fin de tâche » (modèle : \`npx orbith agent new\`).`,
        fichier: a.chemin,
      });
    }
    const interdites = consignesInterdites(a.corps);
    if (interdites.length > 0) {
      res.push({
        categorie: 'agents',
        niveau: 'erreur',
        message: `Agent « ${a.key} » : consigne interdite : ${interdites.join(' ; ')}. Retire-la : l'IA propose, l'humain décide.`,
        fichier: a.chemin,
      });
    }
    if (a.corps.includes(MARQUEUR_A_COMPLETER)) {
      res.push({
        categorie: 'agents',
        niveau: 'info',
        message: `Agent « ${a.key} » : squelette encore à compléter (retire \`${MARQUEUR_A_COMPLETER}\` une fois fini).`,
        fichier: a.chemin,
      });
    }
  }
  return res;
}
