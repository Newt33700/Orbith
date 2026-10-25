import { AGENTS as AGENT_DEFS } from '../adapters/agents.js';
import { mentions } from './trace-report.js';
import { hasGherkin, storyStatus, type Artifact, type FrontmatterProblem, type ArtifactType, type OrbithConfig } from '../core/index.js';

export interface Action {
  kind: 'probleme' | 'agent' | 'valider' | 'humain' | 'fini';
  /** Message court en français. */
  message: string;
  /** Slash commands (agents). */
  gemini?: string;
  claude?: string;
  /** Commande CLI à lancer. */
  cli?: string;
}

export interface NextResult {
  principal: Action;
  secondaires: Action[];
}

export type AgentKey = 'guide' | 'po' | 'sm' | 'ux' | 'architecte' | 'dev' | 'qa' | 'devops';

export function agent(key: AgentKey, message: string, arg?: string): Action {
  // Source unique des noms de commandes : src/adapters/agents.ts (ce que les adaptateurs génèrent vraiment).
  const def = AGENT_DEFS.find((a) => a.key === key);
  if (!def) throw new Error(`Agent inconnu : ${key}`);
  const suffix = arg ? ` ${arg}` : '';
  return { kind: 'agent', message, gemini: `/${def.gemini}${suffix}`, claude: `/${def.claude}${suffix}` };
}

function valider(a: Artifact, message: string): Action {
  return { kind: 'valider', message, cli: `npx orbith valider ${a.chemin}` };
}

function ofType(arts: Artifact[], type: ArtifactType): Artifact[] {
  return arts.filter((a) => a.type === type);
}

function label(a: Artifact): string {
  return a.id ?? a.chemin;
}

const status = storyStatus;

function problemes(arts: Artifact[]): Action[] {
  const out: Action[] = [];
  for (const a of arts) {
    if (a.etat === 'modifié') {
      out.push({
        kind: 'probleme',
        message: `${a.chemin} a été modifié après sa validation. Relis-le puis revalide-le.`,
        cli: `npx orbith valider ${a.chemin}`,
      });
    } else if (a.etat === 'non-tracé') {
      out.push({
        kind: 'probleme',
        message: `${a.chemin} est marqué « validé » sans trace de validation. Relis-le puis valide-le.`,
        cli: `npx orbith valider ${a.chemin}`,
      });
    }
  }
  return out;
}

/** Étape unique bloquante : document manquant (agent) ou non validé (valider). */
function gate(
  arts: Artifact[],
  type: ArtifactType,
  nom: string,
  who: AgentKey,
  missingMsg: string,
): Action | null {
  const found = ofType(arts, type);
  if (found.length === 0) return agent(who, missingMsg);
  const pending = found.find((a) => a.etat !== 'validé');
  if (pending) return valider(pending, `Relis ${nom} (${pending.chemin}) puis valide-le.`);
  return null;
}

function storyActions(arts: Artifact[]): Action[] {
  const stories = ofType(arts, 'story');
  const actions: Action[] = [];
  const open = stories.filter((s) => status(s) !== 'Terminée');

  for (const s of open) {
    if (!hasGherkin(s.body)) {
      actions.push(agent('po', `${label(s)} n'a pas de critères d'acceptation Gherkin : à compléter.`, label(s)));
    }
  }
  for (const s of open) {
    if (s.etat !== 'validé' && hasGherkin(s.body)) {
      actions.push(valider(s, `Relis ${label(s)} puis valide-la.`));
    }
  }
  for (const s of open) {
    if (s.etat === 'validé' && status(s) === 'À faire') {
      actions.push({
        kind: 'humain',
        message: `${label(s)} est validée : vérifie la DoR puis passe-la en « Prête ».`,
      });
    }
  }
  for (const s of open) {
    if (s.etat === 'validé' && status(s) === 'Prête') {
      actions.push(agent('dev', `${label(s)} est prête : lance le développement.`, label(s)));
    }
  }
  for (const s of open) {
    if (status(s) === 'En cours') {
      actions.push(agent('dev', `${label(s)} est en cours : continue le développement (ou ajoute les tests avec qa).`, label(s)));
    }
  }
  for (const s of open) {
    if (status(s) === 'En revue') {
      actions.push(agent('qa', `${label(s)} est en revue : lance la revue QA, puis relis le résultat toi-même.`, label(s)));
    }
  }
  if (stories.length > 0 && open.length === 0) {
    const notes = ofType(arts, 'release-notes');
    const ids = stories.map((s) => s.id).filter((i): i is string => !!i);
    const covered = notes.some((n) => ids.every((id) => mentions(n.body, id)));
    if (covered) {
      actions.push({ kind: 'fini', message: 'Tout est livré 🎉 Bravo !' });
    } else {
      actions.push(agent('sm', 'Toutes les US sont terminées : prépare les notes de livraison.'));
    }
  }
  return actions;
}

/** Piste projet : décrire les environnements (non identiques) puis les faire valider avant le pipeline. */
function devopsHints(arts: Artifact[]): Action[] {
  const envs = ofType(arts, 'environnements');
  if (envs.length === 0) {
    return [agent('devops', "Décris les environnements (dev, recette, prod…) avec l'agent DevOps avant de créer le pipeline.")];
  }
  const pending = envs.find((a) => a.etat !== 'validé');
  return pending ? [valider(pending, `Relis les environnements (${pending.chemin}) puis valide-les.`)] : [];
}

function archiHints(arts: Artifact[]): Action[] {
  const adrs = ofType(arts, 'adr').filter((a) => a.etat === 'validé');
  const out: Action[] = [];
  for (const s of ofType(arts, 'story')) {
    const labels = s.data['labels'];
    if (!Array.isArray(labels) || !labels.includes('impact-archi')) continue;
    const id = s.id;
    if (id && adrs.some((a) => mentions(a.body, id) || mentions(JSON.stringify(a.data), id))) continue;
    out.push(agent('architecte', `${label(s)} a un impact d'architecture : pense à un ADR.`));
  }
  return out;
}

export function computeNext(
  artifacts: Artifact[],
  config: OrbithConfig,
  frontmatterProblems: FrontmatterProblem[] = [],
): NextResult {
  const candidates: Action[] = [
    ...frontmatterProblems.map(
      (p): Action => ({
        kind: 'probleme',
        message: `Frontmatter invalide dans ${p.chemin} (${p.message}) : corrige l'en-tête YAML du fichier.`,
      }),
    ),
    ...problemes(artifacts),
  ];
  const piste = config.piste;
  let blocked: Action | null = null;

  if (piste === 'projet') {
    blocked =
      gate(artifacts, 'brief', 'le brief', 'po', 'Pas encore de brief : lance le PO pour le rédiger.') ??
      gate(artifacts, 'prd', 'le PRD', 'po', 'Pas encore de PRD : lance le PO pour le rédiger.') ??
      gate(artifacts, 'ux', 'le document UX', 'ux', 'Pas encore de document UX : lance l\'UX designer.') ??
      gate(
        artifacts,
        'architecture',
        "l'architecture",
        'architecte',
        "Pas encore d'architecture : lance l'architecte (conforme au CSR).",
      ) ??
      gate(artifacts, 'epic', "l'epic", 'po', 'Pas encore d\'epic : lance le PO pour découper le PRD.');
  }
  if (!blocked && ofType(artifacts, 'story').length === 0) {
    blocked =
      piste === 'correctif'
        ? agent('po', 'Pas encore de US : lance le PO pour écrire une US courte du correctif.')
        : agent('po', 'Pas encore de US : lance le PO pour écrire la première US.');
  }

  if (blocked) {
    candidates.push(blocked);
  } else {
    candidates.push(...storyActions(artifacts));
    if (piste === 'projet') candidates.push(...devopsHints(artifacts));
  }
  if (piste === 'evolution') candidates.push(...archiHints(artifacts));

  if (candidates.length === 0) {
    candidates.push(agent('guide', 'Rien de bloquant : demande conseil au guide.'));
  }
  const [principal, ...rest] = candidates as [Action, ...Action[]];
  return { principal, secondaires: rest.slice(0, 3) };
}
