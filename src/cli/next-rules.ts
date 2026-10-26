import { AGENTS as AGENT_DEFS } from '../adapters/agents.js';
import { mentions } from './trace-report.js';
import { usEligibles } from './autopilote-plan.js';
import { ameliorationHints } from './next-amelioration.js';
import { arg, changesPourVersion, hasGherkin, storyStatus, type Artifact, type FrontmatterProblem, type ArtifactType, type OrbithConfig } from '../core/index.js';

export interface Action {
  kind: 'probleme' | 'agent' | 'valider' | 'humain' | 'fini';
  /** Message court en français. */
  message: string;
  /** Slash commands (agents). */
  gemini?: string;
  claude?: string;
  /** Copilot prompt files are named after the Claude command (`.github/prompts/orbith-po.prompt.md` -> `/orbith-po`). */
  copilot?: string;
  /** Commande CLI à lancer. */
  cli?: string;
}

export interface NextResult {
  principal: Action;
  secondaires: Action[];
}

export type AgentKey = 'guide' | 'po' | 'sm' | 'ux' | 'architecte' | 'dev' | 'qa' | 'devops' | 'analyste';

export function agent(key: AgentKey, message: string, arg?: string): Action {
  // Source unique des noms de commandes : src/adapters/agents.ts (ce que les adaptateurs génèrent vraiment).
  const def = AGENT_DEFS.find((a) => a.key === key);
  if (!def) throw new Error(`Agent inconnu : ${key}`);
  const suffix = arg ? ` ${arg}` : '';
  return { kind: 'agent', message, gemini: `/${def.gemini}${suffix}`, claude: `/${def.claude}${suffix}`, copilot: `/${def.claude}${suffix}` };
}

function valider(a: Artifact, message: string): Action {
  return { kind: 'valider', message, cli: `npx orbith valider ${arg(a.chemin)}` };
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
        cli: `npx orbith valider ${arg(a.chemin)}`,
      });
    } else if (a.etat === 'non-tracé') {
      out.push({
        kind: 'probleme',
        message: `${a.chemin} est marqué « validé » sans trace de validation. Relis-le puis valide-le.`,
        cli: `npx orbith valider ${arg(a.chemin)}`,
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

function storyActions(arts: Artifact[], config?: OrbithConfig): Action[] {
  const stories = ofType(arts, 'story');
  const actions: Action[] = [];
  const open = stories.filter((s) => !['Terminée', 'Abandonnée'].includes(status(s)));

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
    const covering = notes.filter((n) => ids.every((id) => mentions(n.body, id)));
    const aValider = covering.find((n) => n.etat !== 'validé');
    const aDeployer = covering.find((n) => n.etat === 'validé' && n.data['mis_en_prod_le'] == null);
    if (aValider && !covering.some((n) => n.data['mis_en_prod_le'] != null)) {
      actions.push(valider(aValider, `Relis les notes de version (${aValider.chemin}) puis valide-les avant de livrer.`));
    } else if (aDeployer) {
      const version = aDeployer.data['version'] != null ? String(aDeployer.data['version']) : '<version>';
      const changes = changesPourVersion(arts, version);
      if (config?.changements?.exiger_pour_deploiement === true && !changes.some((c) => c.etat === 'validé')) {
        const enAttente = changes[0];
        actions.push(
          enAttente
            ? valider(enAttente, `Relis la demande de changement (${enAttente.chemin}) puis valide-la : elle est exigée avant la mise en production.`)
            : agent('devops', `Prépare la demande de changement de la version ${version} (modèle change.md) : elle est exigée avant la mise en production.`),
        );
      }
      actions.push({
        kind: 'humain',
        message: 'Notes de version validées : après la mise en production réelle, enregistre-la (dates des US, indicateurs DORA).',
        cli: `npx orbith deploiement ${version}`,
      });
    } else if (covering.length > 0) {
      actions.push({ kind: 'fini', message: 'Tout est livré 🎉 Bravo !' });
    } else {
      actions.push(agent('sm', 'Toutes les US sont terminées : prépare les notes de livraison.'));
    }
  }
  return actions;
}

/**
 * Piste projet, étape 5 du workflow (avant les epics de l'étape 7) : les environnements sont décrits puis validés
 * avant de découper en epics. Ne s'applique que tant qu'aucun epic n'existe : un projet déjà découpé n'est pas bloqué.
 */
function environnementsGate(arts: Artifact[]): Action | null {
  if (ofType(arts, 'epic').length > 0) return null;
  const envs = ofType(arts, 'environnements');
  if (envs.length === 0) {
    return agent('devops', "Décris les environnements (dev, recette, prod…) avec l'agent DevOps avant de découper en epics (étape 5 du workflow projet).");
  }
  const pending = envs.find((a) => a.etat !== 'validé');
  return pending ? valider(pending, `Relis les environnements (${pending.chemin}) puis valide-les.`) : null;
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

/** Documents des agents avancés (menaces, stratégie de test, rétrospective, analyse) : rappelle de les valider une fois relus. */
function documentsAvancesHints(arts: Artifact[]): Action[] {
  const noms: Partial<Record<ArtifactType, string>> = {
    menaces: 'la modélisation des menaces',
    'strategie-test': 'la stratégie de test',
    retro: 'la rétrospective',
    analyse: "l'analyse",
  };
  return arts
    .filter((a) => a.type in noms && a.etat !== 'validé')
    .map((a) => valider(a, `Relis ${noms[a.type]} (${a.chemin}) puis valide-la.`));
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

/** Avant le premier développement du projet : suggère le check de préparation (juste après l'action dev). */
function insertPreparationHint(arts: Artifact[], candidates: Action[]): void {
  const stories = ofType(arts, 'story');
  if (stories.some((s) => ['En cours', 'En revue', 'Terminée'].includes(status(s)))) return;
  const i = candidates.findIndex((a) => a.kind === 'agent' && (a.claude ?? '').startsWith('/orbith-dev'));
  if (i < 0) return;
  candidates.splice(i + 1, 0, {
    kind: 'humain',
    message: "Avant le premier développement, vérifie la préparation (cohérence brief, PRD, architecture, epics, US).",
    cli: 'npx orbith preparation',
  });
}

/** At least two eligible stories (and nothing modified after validation): suggest the bounded autopilot after the dev action. */
function insertAutopiloteHint(arts: Artifact[], candidates: Action[]): void {
  if (arts.some((a) => a.etat === 'modifié')) return;
  const eligibles = usEligibles(arts);
  if (eligibles.length < 2) return;
  const def = AGENT_DEFS.find((a) => a.key === 'autopilote');
  let i = candidates.findIndex((a) => a.kind === 'agent' && (a.claude ?? '').startsWith('/orbith-dev'));
  if (i < 0 || !def) return;
  if (candidates[i + 1]?.cli === 'npx orbith preparation') i++;
  candidates.splice(i + 1, 0, {
    kind: 'agent',
    message: `${eligibles.length} US sont prêtes (${eligibles.map((s) => s.id).join(', ')}) : tu peux les enchaîner en autopilote borné (Dev puis QA, arrêt à chaque revue). Vois d'abord le plan.`,
    gemini: `/${def.gemini}`,
    claude: `/${def.claude}`,
    cli: 'npx orbith autopilote',
  });
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
      environnementsGate(artifacts) ??
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
    candidates.push(...storyActions(artifacts, config));
    insertPreparationHint(artifacts, candidates);
    insertAutopiloteHint(artifacts, candidates);
    if (piste === 'projet') candidates.push(...devopsHints(artifacts));
  }
  if (piste === 'evolution') candidates.push(...archiHints(artifacts));
  candidates.push(...documentsAvancesHints(artifacts));
  // Piste projet, avant le brief : l'analyse est facultative, donc seulement une suggestion secondaire.
  if (piste === 'projet' && ofType(artifacts, 'brief').length === 0 && ofType(artifacts, 'analyse').length === 0) {
    candidates.push(agent('analyste', "Facultatif : explore l'idée avec l'analyste (hypothèses, parties prenantes, risques) avant le brief."));
  }
  candidates.push(...ameliorationHints(artifacts));

  if (candidates.length === 0) {
    candidates.push(agent('guide', 'Rien de bloquant : demande conseil au guide.'));
  }
  const [principal, ...rest] = candidates as [Action, ...Action[]];
  return { principal, secondaires: rest.slice(0, 3) };
}
