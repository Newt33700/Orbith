import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import * as p from '@clack/prompts';
import { stringify as stringifyYaml } from 'yaml';
import { exists, loadConfig, OrbithError, requireProjectRoot, ui } from '../core/index.js';
import { AGENTS, type AgentDef } from '../adapters/agents.js';
import {
  CLE_RE,
  clesComplements,
  collisionAvecCoeur,
  DOSSIER_AGENTS_PERSO,
  inventaireAgentsPerso,
  type InventaireAgentsPerso,
} from '../adapters/agents-perso.js';
import { MARQUEUR_A_COMPLETER } from '../adapters/contexte.js';
import { runAdapters } from '../adapters/index.js';

export interface SqueletteOptions {
  cle: string;
  description: string;
  nom?: string;
}

/**
 * Skeleton of a custom agent, following SPEC §8 (same sections as content/agents/*.md). It already contains the
 * mandatory rules checked by `orbith check` (human validation, confidentiality, new session, documentation).
 */
export function squeletteAgent(o: SqueletteOptions): string {
  const nom = o.nom ?? o.cle;
  const entete = stringifyYaml(
    { nom, description: o.description, commande: o.cle, persona: 'À compléter : qui est cet agent, son ton, son expertise.' },
    { lineWidth: 0 },
  );
  const gemini = `/orbith:${o.cle}`;
  const claude = `/orbith-${o.cle}`;
  return `---
${entete}---
${MARQUEUR_A_COMPLETER}
# Agent ${nom}

> Agent personnalisé du projet, créé par \`npx orbith agent new ${o.cle}\`. Complète chaque partie marquée
> « À compléter » (ou lance /orbith:creer-agent ou /orbith-creer-agent pour être guidé), puis
> supprime la ligne de marquage placée juste au-dessus du titre. Commandes : \`${gemini}\` (Gemini), \`${claude}\` (Claude, Copilot).

## Persona

Tu es **${nom}, agent du projet**. À compléter : ton rôle en une phrase, ton ton (bienveillant, pédagogue…),
ton expertise. Tu écris en français simple et tu expliques chaque terme technique en une phrase.
**Tu proposes ; l'humain décide et valide.**

## Mission

À compléter : ce que tu fais, en 2 à 4 points numérotés.

1. …

## Ce que tu lis

- \`.orbith/config.yaml\`
- \`.orbith/contexte-projet.md\` : conventions, patterns et pièges du projet
- \`.orbith/csr/CSR.md\` si ta mission touche la technique (outils autorisés, interdits, dépréciés)
- À compléter : les documents dont tu as besoin (chemins exacts)

## Ce que tu écris

- À compléter : les fichiers que tu produis (chemins exacts) et le modèle utilisé (\`.orbith/templates/…\`).
- Un document que tu crées porte \`statut: brouillon\` ; tu n'écris **jamais** \`statut: validé\`.
- Tu ne modifies rien d'autre sans l'accord explicite de l'humain.

## Contrôles avant de commencer (portes de validation)

Au premier échec, **arrête-toi** et explique quoi faire :

1. À compléter : les documents qui doivent être validés avant que tu commences. Si l'un d'eux n'a pas
   \`statut: validé\` : « Fais-le relire puis lance \`npx orbith valider "<fichier>"\`. Reviens dans une nouvelle
   session. »

## Procédure

1. **Cadrage** : reformule la demande et pose tes questions, une à la fois.
2. À compléter : les étapes de ton travail.
3. **Choix structurant** : propose 2 ou 3 options avec avantages et limites, puis attends la décision humaine.
4. **Documentation** (règle \`.orbith/rules/documentation.md\`) : si tu modifies ou proposes du code, mets à jour
   la documentation qu'il rend fausse ou incomplète, et dis-le dans ton bilan.

## Règles de comportement

- **Validation humaine** (\`.orbith/rules/validation-humaine.md\`) : tu n'écris jamais \`statut: validé\` et tu ne
  modifies jamais \`.orbith/validations.json\`. Seul l'humain valide, avec \`npx orbith valider <fichier>\`.
- **Une seule question à la fois.**
- Jamais de décision à la place de l'humain. N'invente aucun fait, chiffre, nom ou date : écris « À confirmer ».
- **Confidentialité** (\`.orbith/rules/confidentialite.md\`) : jamais de secret, mot de passe, donnée personnelle
  ou donnée client dans tes réponses ou tes fichiers.
- **Documentation à jour** (\`.orbith/rules/documentation.md\`) : une modification de code met à jour la
  documentation dans le même commit, ou au plus tard dans la même user story.
- À compléter : les règles propres à ce rôle.

## Fin de tâche

\`\`\`
✅ <ce qui a été fait>
   Fichiers produits ou modifiés : <liste> (statut : brouillon)
   Documentation : <mise à jour / non concernée, et pourquoi>
👉 Prochaine étape : relis, puis valide avec npx orbith valider <fichier>

💡 Tâche terminée ? Ouvre une NOUVELLE session (ou tape /clear) avant la suivante : l'agent repart
   avec un contexte propre et reste performant.
\`\`\`
`;
}

/** Throws a French, actionable error if `cle` cannot be used for a new custom agent. */
export function verifierCle(cle: string, inv: InventaireAgentsPerso): void {
  if (!CLE_RE.test(cle)) {
    throw new OrbithError(
      `Nom d'agent invalide : « ${cle} ». Utilise des minuscules, des chiffres et des tirets, sans tiret au début (ex. juriste-rgpd).`,
    );
  }
  if (clesComplements().has(cle)) {
    throw new OrbithError(
      `« ${cle} » est un agent du cœur Orbith. Pour le compléter, écris tes consignes dans ${DOSSIER_AGENTS_PERSO}/${cle}.md (sans en-tête) ; pour un nouvel agent, choisis un autre nom.`,
    );
  }
  const conflit = collisionAvecCoeur(cle);
  if (conflit) throw new OrbithError(`Impossible de créer « ${cle} » : ${conflit}. Choisis un autre nom.`);
  const autre = inv.agents.find((a) => a.commande === cle);
  if (autre) throw new OrbithError(`Impossible de créer « ${cle} » : la commande est déjà déclarée par ${autre.chemin}.`);
}

export interface AgentNewOptions {
  description?: string;
  nom?: string;
  yes?: boolean;
  cwd?: string;
}

/** Writes `.orbith/custom/agents/<cle>.md` (never overwrites) then regenerates the platform commands. */
export async function runAgentNew(cle: string, opts: AgentNewOptions): Promise<{ fichier: string; commandes: string[] }> {
  const root = await requireProjectRoot(path.resolve(opts.cwd ?? process.cwd()));
  const cfg = await loadConfig(root);
  const inv = await inventaireAgentsPerso(root);
  const rel = `${DOSSIER_AGENTS_PERSO}/${cle}.md`;
  const file = path.join(root, rel);
  if (CLE_RE.test(cle) && (await exists(file))) {
    throw new OrbithError(`${rel} existe déjà : il n'est jamais écrasé. Modifie-le, ou choisis un autre nom.`);
  }
  verifierCle(cle, inv);
  if (inv.erreurs.length > 0) {
    throw new OrbithError(
      "Corrige d'abord les agents personnalisés invalides (rien n'a été écrit) :\n" +
        inv.erreurs.map((e) => `  - ${e.chemin} : ${e.message}`).join('\n'),
    );
  }

  let description = opts.description?.trim();
  let nom = opts.nom?.trim();
  if (!opts.yes && process.stdin.isTTY) {
    if (!description) {
      const r = await p.text({ message: 'Décris le rôle de cet agent en une phrase (affichée dans la liste des commandes) :' });
      if (p.isCancel(r)) throw new OrbithError("Création annulée. Rien n'a été écrit.");
      description = String(r ?? '').trim();
    }
    if (!nom) {
      const r = await p.text({ message: "Prénom ou nom affiché de l'agent (laisser vide pour garder le nom du fichier) :" });
      if (p.isCancel(r)) throw new OrbithError("Création annulée. Rien n'a été écrit.");
      nom = String(r ?? '').trim();
    }
  }
  if (!description) description = `Agent personnalisé « ${cle} » (à compléter)`;
  description = description.replace(/\s+/g, ' ');

  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, squeletteAgent({ cle, description, ...(nom ? { nom } : {}) }), 'utf8');
  const commandes = await runAdapters(root, cfg);

  ui.ok(`Agent créé : ${rel}`);
  ui.ok(`Commandes générées : /orbith:${cle} (Gemini), /orbith-${cle} (Claude${cfg.plateformes.includes('copilot') ? ', Copilot' : ''}).`);
  console.log(
    `Prochaine étape : complète les parties « À compléter » de ${rel}, ou fais-toi guider avec /orbith:creer-agent (Gemini) ou /orbith-creer-agent (Claude).`,
  );
  console.log('Puis lance `npx orbith check` : il signale les règles obligatoires manquantes.');
  ui.rappelNouvelleSession();
  return { fichier: rel, commandes };
}

export interface LigneAgent {
  origine: 'cœur' | 'projet';
  cle: string;
  gemini: string;
  claude: string;
  description: string;
  fichier: string;
}

export async function listeAgents(root: string): Promise<{ lignes: LigneAgent[]; inventaire: InventaireAgentsPerso }> {
  const inventaire = await inventaireAgentsPerso(root);
  const ligne = (a: AgentDef, origine: LigneAgent['origine']): LigneAgent => ({
    origine,
    cle: a.key,
    gemini: `/${a.gemini}`,
    claude: `/${a.claude}`,
    description: a.description,
    fichier: `.orbith/${a.file}`,
  });
  return { lignes: [...AGENTS.map((a) => ligne(a, 'cœur')), ...inventaire.agents.map((a) => ligne(a, 'projet'))], inventaire };
}

export async function runAgentList(opts: { cwd?: string }): Promise<void> {
  const root = await requireProjectRoot(path.resolve(opts.cwd ?? process.cwd()));
  const { lignes, inventaire } = await listeAgents(root);
  for (const origine of ['cœur', 'projet'] as const) {
    const l = lignes.filter((x) => x.origine === origine);
    ui.titre(origine === 'cœur' ? `Agents du cœur Orbith (${l.length})` : `Agents personnalisés du projet (${l.length})`);
    if (l.length === 0) console.log('  Aucun. Pour en créer un : npx orbith agent new <cle>');
    for (const x of l) console.log(`  ${x.gemini} | ${x.claude} — ${x.description}${origine === 'projet' ? ` [${x.fichier}]` : ''}`);
  }
  if (inventaire.complements.length > 0) {
    ui.info(`Compléments d'agents du cœur (lus par l'agent, sans nouvelle commande) : ${inventaire.complements.join(', ')}`);
  }
  for (const f of inventaire.ignores) {
    ui.avert(`${f} : ni complément d'un agent du cœur, ni agent personnalisé (ajoute \`description:\` dans l'en-tête) : ignoré.`);
  }
  for (const e of inventaire.erreurs) ui.erreur(`${e.chemin} : ${e.message}`);
  if (inventaire.erreurs.length > 0) process.exitCode = 1;
}

export function register(program: Command): void {
  const agent = program.command('agent').description('Crée et liste les agents (cœur et personnalisés du projet)');
  agent
    .command('new <cle>')
    .description('Crée le squelette d\'un agent personnalisé dans .orbith/custom/agents/ et génère ses commandes')
    .option('--description <texte>', 'rôle de l\'agent en une phrase')
    .option('--nom <nom>', 'prénom ou nom affiché de l\'agent')
    .option('--yes', 'mode non interactif')
    .option('--cwd <dir>', 'dossier de travail')
    .action(async (cle: string, opts: AgentNewOptions) => {
      await runAgentNew(cle, opts);
    });
  agent
    .command('list')
    .description('Liste les agents du cœur et les agents personnalisés du projet')
    .option('--cwd <dir>', 'dossier de travail')
    .action(async (opts: { cwd?: string }) => {
      await runAgentList(opts);
    });
}
