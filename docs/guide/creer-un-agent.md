# Créer un agent pour son projet

Orbith fournit une équipe d'agents (PO, architecte, dev, QA…). Votre projet a parfois besoin d'un rôle en plus :
un juriste RGPD, un rédacteur de documentation, un expert d'un métier. Ce guide explique comment créer un **agent
personnalisé**, propre à votre projet, avec ses commandes dans Gemini CLI, Claude Code et GitHub Copilot.

Ce guide décrit ce que fait le code (`src/cli/agent.ts`, `src/adapters/agents-perso.ts`, `src/checks/agents.ts`).
Pour ajouter une fonctionnalité optionnelle à Orbith lui-même, voyez plutôt [Créer un plugin](creer-un-plugin.md).

## 1. Compléter un agent ou en créer un nouveau

Tout se passe dans le dossier `.orbith/custom/agents/`, que `npx orbith update` ne touche jamais.

| Fichier | Ce que c'est | Commande générée |
|---|---|---|
| `.orbith/custom/agents/qa.md` (nom d'un agent du cœur : `guide`, `po`, `sm`, `ux`, `architecte`, `dev`, `qa`, `devops`, `securite`, `test-architect`) | **Complément** : l'agent du cœur le lit et l'applique en plus de ses consignes | Aucune (la commande du cœur reste) |
| `.orbith/custom/agents/juriste-rgpd.md` avec un en-tête qui contient `description:` | **Agent personnalisé** | `/orbith:juriste-rgpd` (Gemini), `/orbith-juriste-rgpd` (Claude, Copilot) |
| Autre fichier sans `description:` | Ignoré | Aucune ; `npx orbith check` le signale |

## 2. Créer le squelette : `npx orbith agent new`

```bash
npx orbith agent new juriste-rgpd --description "Juriste RGPD : registre des traitements, analyses d'impact" --nom Jade
```

La commande :

1. vérifie le nom (minuscules, chiffres et tirets, sans tiret au début) ;
2. refuse un nom d'agent du cœur, une commande déjà prise (par exemple `archi`, `retro`) ou un fichier qui existe
   déjà : **elle n'écrase jamais rien** ;
3. écrit `.orbith/custom/agents/juriste-rgpd.md`, un squelette qui suit les conventions des agents d'Orbith ;
4. génère tout de suite les commandes des plateformes de `.orbith/config.yaml`.

Options :

| Option | Rôle |
|---|---|
| `--description <texte>` | Rôle en une phrase, affiché dans la liste des commandes. Sans cette option, la commande la demande (ou, avec `--yes`, met « Agent personnalisé « … » (à compléter) »). |
| `--nom <nom>` | Prénom affiché de l'agent (par défaut : le nom du fichier). |
| `--yes` | Mode non interactif : aucune question. |
| `--cwd <dir>` | Dossier de travail. |

Le squelette contient, prêtes à compléter, les parties de tous les agents d'Orbith : persona, mission, ce que
l'agent lit, ce qu'il écrit, contrôles avant de commencer (portes de validation), procédure, règles de
comportement et fin de tâche. Il contient déjà les règles obligatoires (section 4). Les parties à remplir sont
marquées « À compléter ». Une fois fini, supprimez la ligne `<!-- orbith:a-completer -->` en haut du fichier.

## 3. Se faire guider : `/orbith:creer-agent`

Plutôt que de remplir le squelette seul, lancez `/orbith:creer-agent` (Gemini) ou `/orbith-creer-agent` (Claude,
Copilot). L'assistant pose **une question à la fois** : le besoin, le nom, la persona, la mission, les documents lus
et écrits, les portes de validation, les règles propres au rôle. Il n'invente aucune règle : ce qu'il ne sait pas,
il le marque « À confirmer ». Il vous montre le fichier complet et ne l'écrit qu'après votre accord. Il n'écrit
jamais `statut: validé`.

## 4. L'en-tête et les règles obligatoires

En-tête (frontmatter) du fichier :

```yaml
---
nom: Jade
description: "Juriste RGPD : registre des traitements, analyses d'impact"
commande: juriste-rgpd
persona: "Juriste bienveillante, explique le droit en mots simples"
---
```

| Champ | Obligatoire | Rôle |
|---|---|---|
| `description` | Oui | Fait du fichier un agent personnalisé ; texte affiché dans la liste des commandes. |
| `commande` | Non | Nom de la commande (par défaut : le nom du fichier). `commande: rgpd` donne `/orbith:rgpd` et `/orbith-rgpd`. |
| `nom` | Non | Prénom affiché. |
| `persona` | Non | Résumé de la persona (le texte complet est dans la partie « Persona »). |

Les commandes générées **renvoient** vers votre fichier (`@.orbith/custom/agents/juriste-rgpd.md`) : le contenu
n'est jamais recopié. Modifier le texte de l'agent suffit ; si vous changez `description` ou `commande`, relancez
`npx orbith update` pour régénérer les commandes.

Tout agent personnalisé doit contenir ces règles. `npx orbith check` affiche un **avertissement** (rubrique
« Agents personnalisés ») quand l'une manque :

| Règle | Ce que `check` cherche (accents et majuscules ignorés) |
|---|---|
| Validation humaine | `.orbith/rules/validation-humaine.md`, ou « jamais … `statut: validé` » sur une même ligne |
| Confidentialité | `.orbith/rules/confidentialite.md`, ou le mot « confidentialité » |
| Nouvelle session | `.orbith/rules/nouvelle-session.md`, ou « nouvelle session » (le bloc de fin de tâche) |
| Documentation | `.orbith/rules/documentation.md`, ou « documentation à jour » |

Ce contrôle cherche des mots : il ne prouve pas que l'agent applique la règle. Relisez le fichier.

`check` signale aussi, en **erreur**, un agent personnalisé invalide (nom ou commande mal formé, commande déjà
prise), en avertissement un fichier ignoré, et en information un squelette encore marqué « à compléter ».

## 5. Collisions : jamais d'écrasement du cœur

Une commande personnalisée ne peut pas reprendre une commande du cœur (`po`, `archi`, `test-archi`, `retro`,
`creer-agent`…), ni celle d'un autre agent personnalisé. Dans ce cas, `npx orbith update`, `npx orbith install` et
`npx orbith agent new` s'arrêtent avec un message qui nomme le fichier fautif et **ne génèrent aucune commande**
(`agent new` n'écrit alors pas non plus son squelette).
Changez `commande:` (ou renommez le fichier), puis relancez.

## 6. Voir les agents : `npx orbith agent list`

```bash
npx orbith agent list
```

Affiche les agents du cœur, puis les agents personnalisés du projet, avec leurs commandes Gemini et Claude, les
compléments, les fichiers ignorés et les erreurs (code de sortie 1 en cas d'erreur).

## 7. Mise à jour et suppression

- `npx orbith update` et `npx orbith install` régénèrent les commandes des agents personnalisés. Relancés, ils
  produisent les mêmes fichiers (idempotent) et ne touchent jamais `.orbith/custom/`.
- **Limite** : supprimer ou renommer un agent personnalisé ne supprime pas ses anciennes commandes. Supprimez-les à
  la main : `.gemini/commands/orbith/<commande>.toml`, `.claude/commands/orbith-<commande>.md` et
  `.github/prompts/orbith-<commande>.prompt.md`.
- Un agent personnalisé n'a pas de `statut` : on ne le valide pas avec `npx orbith valider`. Relisez-le et
  versionnez-le avec git, comme du code.
