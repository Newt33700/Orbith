import { AGENTS } from '../adapters/agents.js';
import { arg, ameliorationsLiees, avancement, dateJour, enRetard, type Artifact } from '../core/index.js';
import type { Action } from './next-rules.js';

// `orbith next` suggestions for continual improvement (AMEL-NNN). Low priority: appended after the other rules.

function commande(key: string, message: string): Action {
  const def = AGENTS.find((a) => a.key === key);
  if (!def) throw new Error(`Agent inconnu : ${key}`);
  return { kind: 'agent', message, gemini: `/${def.gemini}`, claude: `/${def.claude}` };
}

const nom = (a: Artifact): string => a.id ?? a.chemin;

export function ameliorationHints(arts: Artifact[], aujourdhui = new Date().toISOString().slice(0, 10)): Action[] {
  const out: Action[] = [];
  const actions = arts.filter((a) => a.type === 'amelioration');
  for (const a of actions) {
    if (enRetard(a, aujourdhui)) {
      out.push({
        kind: 'humain',
        message: `${nom(a)} est en retard (échéance ${dateJour(a.data['echeance'])}) : fais le point avec son responsable, puis mets à jour son avancement (${a.chemin}).`,
      });
    }
  }
  for (const a of actions) {
    const av = avancement(a);
    if (a.etat !== 'validé' && av !== 'abandonné') {
      out.push({ kind: 'valider', message: `Relis l'action d'amélioration ${nom(a)} puis valide-la.`, cli: `npx orbith valider ${arg(a.chemin)}` });
    }
  }
  // An incident with a restore date (or a validated post-mortem) and no linked action: suggest one.
  for (const i of arts.filter((a) => a.type === 'incident')) {
    const clos = i.etat === 'validé' || (i.data['retabli_le'] != null && String(i.data['retabli_le']).trim() !== '' && !String(i.data['retabli_le']).includes('<'));
    if (clos && ameliorationsLiees(arts, i).length === 0) {
      out.push(commande('devops', `${nom(i)} n'a engendré aucune action d'amélioration : propose-en (modèle amelioration.md, docs/amelioration/AMEL-NNN-*.md).`));
    }
  }
  for (const r of arts.filter((a) => a.type === 'retro')) {
    if (ameliorationsLiees(arts, r).length === 0) {
      out.push(commande('retro', `La rétrospective ${r.chemin} n'a engendré aucune action d'amélioration suivie : transforme les actions décidées en AMEL-NNN.`));
    }
  }
  return out;
}
