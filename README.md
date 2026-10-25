# Orbith

[![CI](https://github.com/Newt33700/Orbith/actions/workflows/ci.yml/badge.svg)](https://github.com/Newt33700/Orbith/actions/workflows/ci.yml)

**Orbith** est une équipe d'agents IA experts qui vous accompagne dans une méthode agile, du besoin
jusqu'à la livraison du code. Chaque agent joue un rôle précis : Product Owner, Scrum Master, UX Designer,
Architecte, Développeur, QA, DevOps, Sécurité, Test Architect. Orbith fonctionne avec **Gemini CLI** et **Claude Code**.

Le principe clé : **l'IA propose, l'humain décide.** Aucun document ne passe à l'état « validé » sans
qu'une personne l'ait relu et confirmé explicitement.

Orbith s'inspire de [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD), un projet open source
de méthode agile pilotée par agents IA, auquel nous devons beaucoup. Orbith en reprend les idées et les
adapte à un contexte d'entreprise : validation humaine, référentiel technique (CSR), traçabilité.

> **Licence :** MIT. Voir le fichier [LICENSE](LICENSE).

---

## Sommaire

- [Pour qui ?](#pour-qui)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Démarrage rapide](#démarrage-rapide)
- [Les agents](#les-agents)
- [Les trois pistes de travail](#les-trois-pistes-de-travail)
- [Commandes de la CLI](#commandes-de-la-cli)
- [Une tâche = une session](#une-tâche--une-session)
- [Validation humaine](#validation-humaine)
- [Le référentiel CSR](#le-référentiel-csr)
- [Traçabilité](#traçabilité)
- [Documentation à jour](#documentation-à-jour)
- [Confidentialité](#confidentialité)
- [Plugin Backlog.md](#plugin-backlogmd)
- [Structure d'un projet généré](#structure-dun-projet-généré)
- [Glossaire](#glossaire)
- [Documentation détaillée](#documentation-détaillée)
- [Feuille de route](#feuille-de-route)
- [Contribuer](#contribuer)

---

## Pour qui ?

- **Product Owners et chefs de projet** : vous transformez un besoin en brief, PRD, epics et user stories
  avec critères d'acceptation.
- **Leads tech et développeurs** : vous prenez une user story validée, la développez, la testez et la
  livrez avec une trace claire.

Vous n'avez pas besoin d'être expert en IA. Les agents vous posent des questions, expliquent le jargon
et indiquent toujours la prochaine action à faire.

## Prérequis

- **Node.js 22 ou plus récent** (vérifiez avec `node --version`).
- **Gemini CLI** ou **Claude Code**, installé et connecté à votre compte (ou, en option, **GitHub Copilot**
  dans VS Code : `npx orbith install --plateformes claude,copilot`).
- **Git** (recommandé : il permet la traçabilité et l'identification de la personne qui valide).

## Installation

Dans le dossier de votre projet (nouveau ou existant) :

```bash
npx github:Newt33700/Orbith install
```

Une fois Orbith publié sur npm, la même commande s'écrit `npx orbith install`.

La commande copie les agents dans votre projet, génère les commandes pour Gemini CLI et Claude Code, et
affiche un résumé avec la prochaine étape.

## Démarrage rapide

1. **Installez Orbith** : `npx github:Newt33700/Orbith install` (ou `npx orbith install` une fois publié sur npm).
2. **Ouvrez votre projet** dans Gemini CLI ou Claude Code.
3. **Demandez où vous en êtes** : `/orbith:guide` (Gemini) ou `/orbith` (Claude Code).
4. **Suivez la recommandation** : l'agent indique le prochain agent à solliciter, par exemple le PO.
5. **Validez chaque document** avec `npx orbith valider <fichier>` avant de passer à l'étape suivante.

Pour un premier pas détaillé, lisez [docs/guide/demarrage.md](docs/guide/demarrage.md).

## Les agents

Orbith installe 16 commandes : 12 agents et 4 workflows (atelier, rétrospective, relecture adverse, changement de
cap). Chaque commande existe en deux syntaxes, selon l'outil utilisé. Si vous avez activé GitHub Copilot
(facultatif, voir [agents avancés](docs/guide/agents-avances.md)), utilisez dans son chat le nom de la colonne
Claude Code (`/orbith-po`, etc.).

| Agent | Rôle | Gemini CLI | Claude Code |
|---|---|---|---|
| Orbi (guide) | Vous dit où vous en êtes et quoi faire ensuite | `/orbith:guide` | `/orbith` |
| Paola (Product Owner) | Brief, PRD, epics, user stories, critères Gherkin | `/orbith:po` | `/orbith-po` |
| Samir (Scrum Master) | Chef de projet : sprints, definition of done, livraisons | `/orbith:sm` | `/orbith-sm` |
| Uma (UX Designer) | Parcours, écrans, accessibilité | `/orbith:ux` | `/orbith-ux` |
| Arthur (Architecte) | Architecture conforme au CSR, décisions (ADR) | `/orbith:archi` | `/orbith-archi` |
| Dani (Développeur) | Implémente une user story validée | `/orbith:dev` | `/orbith-dev` |
| Quentin (QA) | Tests à partir des critères Gherkin, revue, couverture | `/orbith:qa` | `/orbith-qa` |
| Dora (DevOps) | Environnements non identiques (dev, recette, prod…) et pipelines CI/CD | `/orbith:devops` | `/orbith-devops` |
| Alix (Analyste) | Explore l'idée avant le brief : hypothèses, risques, alternatives | `/orbith:analyste` | `/orbith-analyste` |
| Rémi (Rédacteur technique) | README, guides, schémas Mermaid, exactitude vérifiée dans le code | `/orbith:redacteur` | `/orbith-redacteur` |
| Atelier | Plusieurs agents discutent ensemble sur un sujet | `/orbith:atelier` | `/orbith-atelier` |
| Salomé (Sécurité) | Modélisation des menaces, revue des US sensibles | `/orbith:securite` | `/orbith-securite` |
| Tania (Test Architect) | Stratégie de test par risque | `/orbith:test-archi` | `/orbith-test-archi` |
| Rétrospective | Bilan après une livraison, à partir des métriques et des constats QA | `/orbith:retro` | `/orbith-retro` |
| Relecture adverse | Passe critique avant de valider un PRD, une architecture ou une US | `/orbith:relecture-adverse` | `/orbith-relecture-adverse` |
| Changement de cap | Impact d'un changement de besoin sur les epics et les US | `/orbith:changement-de-cap` | `/orbith-changement-de-cap` |

Exemple : pour demander au PO de rédiger le brief, tapez `/orbith:po rédige le brief de mon appli de
réservation de salles` dans Gemini CLI, ou `/orbith-po rédige le brief de mon appli de réservation de
salles` dans Claude Code.

## Les trois pistes de travail

Orbith adapte le parcours à la nature de votre demande. Chaque piste contient des **🔒 portes de
validation humaine** : l'agent ne peut pas avancer tant qu'une personne n'a pas validé l'étape.

### Correctif

Pour corriger un bug ou une anomalie, sans nouvelle fonctionnalité.

1. PO : rédige une user story courte (le bug et le comportement attendu).
2. 🔒 Validation humaine de la user story.
3. Dev : corrige, ajoute un test qui reproduit le bug, committe avec l'identifiant de la story.
4. 🔒 Revue humaine du code.
5. Livraison : notes de version.

### Évolution

Pour ajouter ou modifier une fonctionnalité dans un projet existant.

1. PO : précise le besoin en user stories avec critères Gherkin.
2. 🔒 Validation humaine des user stories.
3. Architecte (si la story a un impact sur l'architecture) : propose une décision (ADR).
4. 🔒 Validation humaine de la décision.
5. Dev : implémente la story validée.
6. QA : écrit ou vérifie les tests à partir du Gherkin.
7. 🔒 Revue humaine.
8. Livraison : notes de version.

### Projet

Pour démarrer un nouveau produit de zéro.

1. PO : rédige le brief, puis le PRD (document des besoins produit).
2. 🔒 Validation du brief, 🔒 validation du PRD.
3. UX : décrit les parcours et les écrans.
4. 🔒 Validation UX.
5. Architecte : rédige l'architecture et les ADR, conformes au CSR.
6. 🔒 Validation de l'architecture.
7. DevOps : décrit les environnements (souvent différents entre eux), puis 🔒 validation, puis crée le pipeline,
   relu en merge request.
8. PO : découpe le PRD en epics, puis en user stories.
9. 🔒 Validation des epics et des user stories.
10. Dev, QA, puis livraison, comme dans l'évolution.

Pour savoir quelle est la prochaine étape, lancez `npx orbith next`. La commande lit l'état du projet et
indique l'action recommandée, avec les commandes des seules plateformes configurées (Gemini, Claude, Copilot).

## Commandes de la CLI

Toutes les commandes se lancent avec `npx orbith <commande>`, depuis n'importe quel dossier du projet.

| Commande | Ce qu'elle fait |
|---|---|
| `npx orbith install` | Installe Orbith dans le projet (agents, commandes Gemini et Claude, configuration) |
| `npx orbith next` | Indique la prochaine action recommandée (sans IA) |
| `npx orbith valider <fichier>` | Marque un document comme validé, après confirmation humaine |
| `npx orbith check` | Vérifie le projet : CSR, validations (et chaîne d'audit des registres, rôles), traçabilité, documentation, secrets, licences. Échoue en cas d'erreur |
| `npx orbith trace [ID]` | Produit la matrice de traçabilité (une user story ou toutes) |
| `npx orbith version <numéro>` | Crée une version (exemple : `1.1.0.0`) : y ajoute les user stories fusionnées depuis la version précédente et prépare le brouillon des notes de version |
| `npx orbith deploiement <version>` | Enregistre une mise en production réelle (lancée par un humain, après un vrai déploiement) : dates des US livrées, registre `.orbith/deploiements.json` |
| `npx orbith version` (sans numéro) / `npx orbith release <version>` | Propose le prochain numéro SemVer (commits, US, étiquette `breaking`), puis prépare la version : `CHANGELOG.md`, notes validées, tag Git local après confirmation, sans jamais pousser (voir [versions.md](docs/guide/versions.md)) |
| `npx orbith metriques` | Calcule les métriques DORA (fréquence, délai, taux d'échec, rétablissement) et les coûts IA estimés, avec cibles, tendances, découpage de l'attente, taille des changements et export `--format csv` (voir [metriques.md](docs/guide/metriques.md)) |
| `npx orbith valider <fichier>` (rôles) | Avec `roles` et `changements` dans `.orbith/config.yaml` (facultatifs) : matrice des rôles, quatre yeux et demande de changement exigée avant `deploiement` (voir [changements-roles.md](docs/guide/changements-roles.md)) |
| `npx orbith tests [ID]` | Crée les squelettes de tests (`tests/features/*.feature`) à partir des critères Gherkin des user stories validées, sans IA |
| `npx orbith init-context` | Crée le contexte projet d'un projet existant (stack, arborescence, scripts, tests), à compléter par un agent (voir [contexte-preparation.md](docs/guide/contexte-preparation.md)) |
| `npx orbith preparation` | Vérifie la préparation à l'implémentation (brief, PRD, architecture, epics, US) : PASS, CONCERNS ou FAIL (voir [contexte-preparation.md](docs/guide/contexte-preparation.md)) |
| `npx orbith audit` | Produit un rapport d'audit HTML, prêt à présenter en comité (voir [audit.md](docs/guide/audit.md)) |
| `npx orbith decouper <fichier>` | Découpe un document Markdown volumineux en extraits par section (`.orbith/extraits/<nom>/`, sans IA, sans toucher au document) ; les agents lisent l'index puis les sections utiles, et `check` signale les extraits périmés (voir [documents-volumineux.md](docs/guide/documents-volumineux.md)) |
| `npx orbith sbom` | Produit la liste des composants (SBOM CycloneDX JSON) ; `check` contrôle les licences interdites et la chaîne d'audit des registres (voir [integrite-sbom.md](docs/guide/integrite-sbom.md)) |
| `npx orbith csr import <fichier.xlsx>` | Importe le référentiel CSR depuis un fichier Excel |
| `npx orbith csr sync` | Récupère le CSR depuis la source interne déclarée dans `.orbith/config.yaml` |
| `npx orbith update` | Met à jour les agents, workflows, modèles et règles (et les commandes Gemini et Claude), sans toucher à votre configuration, à votre CSR, à `custom/`, au contexte projet ni aux registres |
| `npx orbith plugin add <nom>` | Installe un plugin, par exemple `backlog-md` |
| `npx orbith plugin list` | Liste les plugins disponibles et ceux déjà activés |

Options utiles : `--yes` (sans question, pour les scripts ; réservé à un usage humain pour `valider`, `deploiement` et
`release`), `--cwd <dossier>` (travailler sur un autre dossier, accepté par toutes les commandes), `--format json`
pour `next`, `check`, `version`, `preparation`, `metriques` (aussi `csv`) et `audit`, `--sortie <fichier>` pour
`trace`, `metriques`, `audit`, `sbom` et `csr import`. `npx orbith <commande> --help` liste toutes les options.

## Une tâche = une session

> ### ⚠️ Une tâche = une session
> **Ouvre une nouvelle session ou tape `/clear` entre deux tâches.**
>
> **Pourquoi ?** Un agent IA se souvient de tout ce qui a été dit dans la conversation. Plus la
> conversation s'allonge, plus son « contexte » se remplit, et plus ses réponses deviennent lentes,
> moins précises, et parfois incohérentes avec ce qui a été fait avant. Repartir d'une session propre
> garantit un agent concentré sur la tâche du moment. Les fichiers du projet, eux, restent là : rien
> n'est perdu.

Chaque agent rappelle cette consigne en fin de tâche.

## Validation humaine

Orbith repose sur une règle simple : **seule une personne peut valider un document.** Les agents
peuvent rédiger, proposer, corriger, mais jamais déclarer un document « validé ».

Chaque document porte un statut dans son en-tête :

| Statut | Signification |
|---|---|
| `brouillon` | Rédigé par l'IA, pas encore relu |
| `en-revue` | Prêt à être relu par une personne |
| `validé` | Relu et approuvé par une personne, avec `npx orbith valider` |

Pour valider un document :

```bash
npx orbith valider docs/produit/prd.md
```

La commande affiche un résumé (type, identifiant, titre), vous demande de confirmer que vous avez relu le
document, puis enregistre votre nom et votre adresse (récupérés depuis la configuration Git) ainsi que la
date. Si Git n'est pas configuré, la commande vous l'indique clairement.

**Que se passe-t-il si le document change après validation ?** Orbith calcule une empreinte du contenu
(son « hash », une sorte d'empreinte digitale). Si le contenu change après validation, la validation n'est
plus valable : `npx orbith check` signale le document comme **modifié après validation**. Il faut alors le
relire et le revalider. Les modifications de l'en-tête (statut, nom du validateur) ne comptent pas.

Pour plus de détails, lisez [docs/guide/validation-humaine.md](docs/guide/validation-humaine.md).

## Le référentiel CSR

Le **CSR** (Cadre de Référence) est la liste des langages, frameworks et outils autorisés, déconseillés ou
interdits dans votre entreprise, avec leurs versions minimales.

- **Dans ce dépôt public**, le fichier `content/csr/CSR.exemple.md` est **un exemple** pour comprendre le
  format. Ce n'est pas le référentiel réel.
- **Le vrai CSR** vit dans le dépôt privé de votre entreprise. Vous l'importez dans votre projet avec un
  fichier Excel :

```bash
npx orbith csr import fichier.xlsx
```

Le fichier Excel doit contenir les colonnes **Outil**, **Version min**, **Statut** et **Commentaire**.
Chaque onglet devient une section du CSR.

Lors de `npx orbith check`, Orbith compare votre projet (versions de Node.js, Java, Python, dépendances) au
CSR. Un outil interdit ou une version trop ancienne est une **erreur**, un outil déprécié est un
**avertissement**.

Pour plus de détails, lisez [docs/guide/csr.md](docs/guide/csr.md).

## Traçabilité

La traçabilité permet de répondre à la question : « qu'est-ce qui a été livré, pour quelle demande, par qui,
et avec quels tests ? »

Elle repose sur trois conventions simples :

- **Les commits** commencent par le type et l'identifiant de la story :
  `feat(US-012): ajoute la connexion par email`.
- **Les tests** mentionnent l'identifiant de la story (`@US-012` dans un fichier Gherkin).
- **Les notes de version** listent les stories livrées.

`npx orbith trace` assemble tout cela dans un tableau par user story : statut, validation, commits, tests et
notes de version. `npx orbith check` signale les stories « Terminée » sans commit associé.

## Documentation à jour

Une règle permanente (`.orbith/rules/documentation.md`, chargée dans `GEMINI.md` et `CLAUDE.md`) impose aux agents
de mettre à jour, dans le même commit ou la même user story, la documentation que leur code rend fausse : README,
guides, documentation technique et ADR, commentaires, notes de version. Le Dev l'applique, la QA signale les écarts,
le Scrum Master le vérifie dans la Definition of Done.

`npx orbith check` ajoute un filet de sécurité (avertissement, rubrique « Documentation ») : une US dont les commits
modifient du code (`src/` par défaut) sans aucun fichier de documentation (README, `docs/`, CHANGELOG, `*.md`) est
signalée. Si rien n'est à documenter, indiquez `documentation: non-concernée` dans l'en-tête de la US. Le contrôle se
règle dans `.orbith/config.yaml` :

```yaml
documentation:
  controle: false        # désactive le contrôle
  code: [src/, lib/]     # dossiers considérés comme du code (défaut : src/)
```

## Confidentialité

- **Ne mettez jamais de secrets dans les prompts** : mots de passe, clés d'API, jetons, identifiants.
- **Ne mettez pas de données personnelles ou client** (noms, adresses, données de production) dans les
  documents ou les demandes adressées aux agents. Utilisez des exemples fictifs.
- Orbith configure Claude Code pour interdire la lecture des fichiers sensibles (`.env`, clés privées,
  dossier `secrets/`).
- `npx orbith check` recherche des secrets oubliés dans les fichiers suivis par Git (mots de passe, clés
  AWS, clés privées) et signale les fichiers `.env` versionnés.

Les règles complètes sont dans `.orbith/rules/confidentialite.md` une fois Orbith installé.

## Plugin Backlog.md

[Backlog.md](https://github.com/MrLesk/Backlog.md) est un outil libre qui affiche vos user stories dans un
**tableau Kanban** dans votre navigateur.

```bash
npx orbith plugin add backlog-md
backlog browser
```

Le tableau comporte cinq colonnes, qui suivent l'avancement d'une story :

| Colonne | Quand la story y est placée |
|---|---|
| À faire | La story est rédigée (et éventuellement validée), mais pas encore prête à être développée |
| Prête | La story est validée et sa Definition of Ready est remplie : on peut la prendre |
| En cours | Un développeur travaille dessus |
| En revue | Le code est prêt, il attend la relecture et les tests QA |
| Terminée | La story est livrée |

Les colonnes sont déplacées par les humains (le PO passe la story en « Prête », le développeur la passe en
« En cours », etc.). Les agents les lisent mais ne les modifient pas. Voir
[docs/guide/plugins.md](docs/guide/plugins.md).

## Structure d'un projet généré

Après installation, votre projet ressemble à ceci :

```
mon-projet/
├── .orbith/                      # Le cœur d'Orbith : agents, workflows, modèles, règles, configuration
│   ├── agents/  workflows/  templates/  rules/
│   ├── config.yaml               # Configuration du projet
│   ├── config/dor.md dod.md      # Definition of Ready et Definition of Done (modifiables par l'équipe)
│   ├── csr/CSR.md                # Votre référentiel technique
│   ├── contexte-projet.md        # Mémoire durable : conventions, patterns, pièges (jamais écrasé par update)
│   ├── custom/                   # Vos adaptations locales (jamais écrasées par update)
│   ├── validations.json          # Registre chaîné des validations humaines
│   ├── versions.json             # Registre des versions (US incluses)
│   └── deploiements.json         # Registre chaîné des mises en production (créé par `orbith deploiement`)
├── GEMINI.md  CLAUDE.md          # Générés : pointent vers les règles d'Orbith, le CSR et le contexte projet
├── .gemini/commands/orbith/      # Commandes Gemini CLI (14)
├── .claude/commands/orbith*.md   # Commandes Claude Code (14)
├── .claude/settings.json  .geminiignore   # Interdisent la lecture des fichiers sensibles
├── docs/
│   ├── produit/                  # brief.md, prd.md, ux.md, epics/EPIC-001-*.md
│   ├── architecture/             # architecture.md, environnements.md, menaces.md, strategie-test.md, adr/ADR-001-*.md
│   └── livraisons/               # release-notes-<version>.md, retro-<version>.md, changes/CHG-001-*.md,
│                                 # incidents/INC-001-*.md, audit-AAAA-MM-JJ.html
├── backlog/tasks/                # Les user stories (us-001 - Titre.md, une par fichier)
├── src/  tests/                  # Votre code et vos tests (tests/features/ : squelettes de `orbith tests`)
├── .gitlab-ci.yml                # Lance `npx orbith check` ; complété par l'agent DevOps (environnements)
├── CHANGELOG.md                  # Créé par `orbith release`
└── README.md  .gitignore  .editorconfig
```

Les dossiers `docs/` et `backlog/` sont remplis au fil du travail ; seul leur squelette est créé à l'installation
d'un nouveau projet. Vous pouvez modifier `.orbith/config/`, `.orbith/csr/`, `.orbith/custom/` et
`.orbith/contexte-projet.md` : `npx orbith update` ne les écrase jamais (le CSR est seulement resynchronisé depuis
`csr.source` si elle est déclarée).

## Glossaire

Les termes ci-dessous reviennent souvent dans Orbith et dans les équipes agiles. Chacun est accompagné d'un
exemple.

**Agile**
Façon de travailler par petites étapes, avec des retours fréquents, plutôt que de tout définir au départ.
*Exemple : on livre une première version de la page de connexion en deux semaines, puis on l'améliore selon les retours.*

**Scrum**
Une méthode agile précise, organisée autour de sprints, de réunions courtes et d'un backlog priorisé.
*Exemple : l'équipe s'engage sur un lot de travail pour les deux prochaines semaines.*

**Sprint**
Période courte et fixe (souvent deux semaines) pendant laquelle l'équipe réalise un lot de travail défini.
*Exemple : le sprint 14 couvre la connexion par email et la réinitialisation du mot de passe.*

**Backlog**
Liste ordonnée de tout ce qui reste à faire. Le plus prioritaire est en haut.
*Exemple : « créer un compte », « exporter en PDF », « corriger le bouton retour » sont trois éléments du backlog.*

**Epic**
Grand chantier qui regroupe plusieurs user stories autour d'un même objectif.
*Exemple : « Gestion des comptes utilisateurs » contient l'inscription, la connexion et la modification du profil.*

**User Story (US)**
Petite fonctionnalité décrite du point de vue de l'utilisateur, au format « En tant que… je veux… afin de… ».
*Exemple : « En tant que client, je veux me connecter avec mon email, afin d'accéder à mon espace. » (US-012)*

**Tâche**
Étape technique concrète qu'un développeur réalise pour réaliser une user story.
*Exemple : « créer le formulaire de connexion », « ajouter le contrôle du mot de passe ».*

**Critères d'acceptation**
Conditions précises qui disent quand une user story est bien réalisée. Ils sont vérifiables, donc testables.
*Exemple : « le message d'erreur s'affiche si le mot de passe est faux ».*

**Gherkin (Étant donné / Quand / Alors)**
Langage simple pour écrire les critères d'acceptation sous forme de scénarios. Chaque scénario se lit comme une
phrase : le contexte (Étant donné), l'action (Quand) et le résultat attendu (Alors).

```gherkin
Fonctionnalité: Connexion
  Scénario: Mot de passe incorrect
    Étant donné un client inscrit avec l'email "client@exemple.fr"
    Quand il saisit un mot de passe erroné
    Alors un message d'erreur s'affiche et il reste sur la page de connexion
```

**Definition of Ready (DoR)**
Liste de conditions à remplir avant qu'une user story puisse être prise par un développeur.
*Exemple : la story est validée, ses critères sont en Gherkin, les dépendances sont connues.*

**Definition of Done (DoD)**
Liste de conditions à remplir pour considérer une user story comme terminée.
*Exemple : le code est relu, les tests passent, la documentation est à jour, la story est livrée.*

**PRD (Product Requirements Document)**
Document qui décrit le produit : le problème à résoudre, les besoins, les priorités et ce qui est hors périmètre.
*Exemple : « l'application de réservation de salles permet de réserver une salle en moins de trois clics ».*

**Brief**
Document court qui résume une idée de produit : pourquoi, pour qui, et quel résultat attendu.
*Exemple : « Un brief d'une page pour une appli mobile de réservation de salles de réunion ».*

**ADR (Architecture Decision Record)**
Note courte qui garde la trace d'une décision technique importante, avec les options étudiées et le choix retenu.
*Exemple : « ADR-001 : utiliser PostgreSQL plutôt que MongoDB, pour la cohérence des données de facturation ».*

**Product Owner (PO)**
Personne qui décide de ce qui doit être fait, dans quel ordre, et pourquoi. Elle rédige ou valide le backlog.
*Exemple : une cheffe de produit qui arbitre entre deux fonctionnalités demandées par les clients.*

**Scrum Master**
Personne qui veille au bon fonctionnement de l'équipe et de la méthode, et qui retire les obstacles.
*Exemple : un chef de projet qui organise la revue de sprint et prépare les livraisons.*

**Lead tech**
Développeur expérimenté qui guide l'équipe technique et valide les choix de conception.
*Exemple : il relit le code d'un collègue avant la fusion dans la branche principale.*

**Kanban**
Tableau visuel où chaque tâche avance de colonne en colonne (À faire, En cours, Terminée).
*Exemple : le tableau Backlog.md du plugin Orbith.*

**CI/CD (intégration et livraison continues)**
Automatisation qui, à chaque modification du code, lance les tests, les vérifications et, si tout va bien, la mise en ligne.
*Exemple : GitLab exécute `npx orbith check` à chaque commit et bloque la fusion si une erreur est trouvée.*

**MR / PR (Merge Request / Pull Request)**
Proposition de fusion de vos modifications dans la branche principale du projet, soumise à relecture.
*Exemple : un développeur ouvre une MR pour la story US-012, un collègue la relit et la valide.*

**Traçabilité**
Capacité à relier une demande (user story) à son code, ses tests et sa livraison.
*Exemple : « US-012 » apparaît dans le commit, dans le fichier de test et dans les notes de version.*

**CSR (Cadre de Référence)**
Liste des technologies autorisées dans l'entreprise, avec leurs versions minimales.
*Exemple : « Node.js 22 : autorisé ; AngularJS : interdit ».*

**Agent IA**
Programme qui utilise un modèle d'IA pour accomplir une tâche en plusieurs étapes, par exemple rédiger un document
ou écrire du code, en s'appuyant sur des instructions précises.
*Exemple : l'agent PO d'Orbith, qui rédige un brief à partir de vos réponses à ses questions.*

**Prompt**
Texte que vous envoyez à un agent IA pour lui demander quelque chose. Plus il est précis, meilleur est le résultat.
*Exemple : « Rédige le brief d'une appli de réservation de salles, pour les équipes de 5 à 20 personnes. »*

**Contexte / fenêtre de contexte**
Ensemble de ce que l'agent peut « voir » à un instant donné : vos messages, ses réponses, les fichiers lus.
Cette mémoire a une taille limitée et se remplit au fil de la conversation.
*Exemple : après une longue discussion sur un autre sujet, l'agent peut mélanger deux demandes. D'où la règle « une tâche = une session ».*

**Session**
Une conversation avec un agent, de son ouverture à sa fermeture. Une nouvelle session repart avec un contexte vide.
*Exemple : ouvrir un nouveau terminal Claude Code, ou taper `/clear`.*

**Slash command**
Commande qui commence par `/` et lance une action prédéfinie dans l'outil d'IA.
*Exemple : `/orbith-po` (Claude Code) ou `/orbith:po` (Gemini CLI) appelle l'agent Product Owner.*

**MCP (Model Context Protocol)**
Standard qui permet à un agent IA de se connecter à des outils externes (bases de données, tableaux de bord,
services) de façon sûre et normalisée.
*Exemple : un agent qui lit l'état d'un ticket dans un outil de suivi grâce à un serveur MCP.*

**DORA (DevOps Research and Assessment)**
Programme de recherche qui étudie depuis plusieurs années ce qui rend une équipe performante dans la livraison de logiciels. Il définit quatre indicateurs de performance.
*Exemple : une équipe qui livre une version par jour, avec peu de retours arrière, est classée « élite » pour la fréquence de déploiement.*

**Accelerate**
Livre qui présente les résultats de DORA et explique les pratiques qui les accompagnent (petits lots, tests automatisés, livraison continue).
*Exemple : le livre montre que mesurer la livraison aide une équipe à décider où s'améliorer.*

**Fréquence de déploiement**
Nombre de mises en production sur une période donnée. Plus il est élevé, plus l'équipe livre souvent de petites améliorations.
*Exemple : 4 mises en production par semaine, sur les 90 derniers jours.*

**Délai de mise en production (lead time)**
Temps écoulé entre le premier commit d'une user story et sa mise en production. Il mesure la rapidité à transformer une idée en valeur pour l'utilisateur.
*Exemple : la US-012 a son premier commit le 4 août et est en production le 2 septembre : délai de 29 jours.*

**Taux d'échec des changements**
Part des mises en production qui provoquent un bug en production, qui demande un correctif ou un retour arrière.
*Exemple : sur 25 mises en production, 3 ont provoqué un bug : taux de 12 %.*

**Temps de rétablissement (MTTR)**
Temps entre la détection d'un bug en production et la mise en production de son correctif.
*Exemple : un bug détecté le lundi à 9 h, corrigé et remis en production le lundi à 15 h : rétablissement en 6 heures.*

**FinOps**
Pratique qui consiste à suivre les dépenses liées aux services numériques (ici, l'IA) pour les rendre visibles, comprises et maîtrisées par l'équipe.
*Exemple : l'équipe sait que la rédaction d'une user story coûte quelques centimes d'IA, et que la phase de développement en coûte davantage.*

**Coût IA estimé**
Estimation du prix de l'utilisation d'un agent IA pour une tâche, calculée à partir de la taille des textes lus et écrits et des tarifs de `.orbith/config.yaml`. C'est un ordre de grandeur, pas une facture.
*Exemple : « 0,58 EUR (estimé) » pour l'implémentation de deux scénarios, notée dans la US.*

**SemVer (versionnage sémantique)**
Numérotation des versions en trois nombres, majeur.mineur.correctif : on augmente le premier pour un changement incompatible, le deuxième pour une nouveauté, le troisième pour une correction.
*Exemple : après la 1.4.0, une simple correction donne la 1.4.1 ; une nouvelle fonctionnalité, la 1.5.0.*

**Demande de changement (ITIL)**
Fiche qui décrit une mise en production avant qu'elle ait lieu : ce qui change, le risque, la fenêtre, qui approuve et comment revenir en arrière.
*Exemple : CHG-001, risque moyen, déploiement de la 1.4.0 mardi entre 20 h et 22 h, plan de retour arrière vers la 1.3.2.*

**Principe des quatre yeux**
Règle selon laquelle la personne qui écrit un document ne le valide pas elle-même : une deuxième personne relit.
*Exemple : Bob a écrit la demande de changement, c'est Alice qui la valide.*

**Post-mortem sans blâme**
Analyse d'un incident qui cherche ce que le système a rendu possible, et non qui s'est trompé.
*Exemple : « le déploiement a pu partir sans test de fumée » plutôt que « Paul a oublié le test ».*

**SBOM (Software Bill of Materials)**
Liste de tous les composants logiciels d'un projet, avec leur version et leur licence, dans un format standard (ici CycloneDX).
*Exemple : le SBOM montre que le projet utilise `express` 4.19.2 sous licence MIT.*

**Contexte projet**
Fichier `.orbith/contexte-projet.md` qui garde les conventions, les patterns et les pièges du projet, lu par les agents avant d'écrire.
*Exemple : « les dates sont toujours stockées en UTC » ; « ne pas appeler l'API de facturation dans les tests ».*

## Documentation détaillée

| Guide | Pour qui | Contenu |
|---|---|---|
| [demarrage.md](docs/guide/demarrage.md) | Tout le monde | Installation pas à pas, premier lancement |
| [versions.md](docs/guide/versions.md) | Leads tech, chefs de projet | Numéro de version (SemVer), CHANGELOG, tag Git |
| [guide-po.md](docs/guide/guide-po.md) | PO, chefs de projet | Du brief à une user story prête |
| [guide-dev.md](docs/guide/guide-dev.md) | Leads tech, développeurs | Prendre une story, la développer, la livrer |
| [guide-devops.md](docs/guide/guide-devops.md) | Leads tech, DevOps | Décrire les environnements et créer les pipelines |
| [validation-humaine.md](docs/guide/validation-humaine.md) | Tout le monde | Statuts, validation, modifications détectées |
| [csr.md](docs/guide/csr.md) | Leads tech, équipes CI | Format du CSR, import Excel, contrôle en CI |
| [atelier.md](docs/guide/atelier.md) | Tout le monde | Faire travailler plusieurs agents ensemble |
| [agents-avances.md](docs/guide/agents-avances.md) | Tout le monde | Sécurité, Test Architect, rétrospective, relecture adverse, changement de cap |
| [plugins.md](docs/guide/plugins.md) | Tout le monde | Plugin Backlog.md et tableau Kanban |
| [audit.md](docs/guide/audit.md) | Chefs de projet, comités | Rapport d'audit HTML |
| [integrite-sbom.md](docs/guide/integrite-sbom.md) | Sécurité, conformité | Journal d'audit chaîné, SBOM, licences |
| [metriques.md](docs/guide/metriques.md) | Chefs de projet, leads tech | Métriques DORA, enregistrer une mise en production, coûts IA |
| [contexte-preparation.md](docs/guide/contexte-preparation.md) | Leads tech, POs | Contexte projet, projet existant, check de préparation |
| [changements-roles.md](docs/guide/changements-roles.md) | Chefs de projet, DevOps, auditeurs | Demandes de changement (ITIL), matrice des rôles, quatre yeux |
| [documents-volumineux.md](docs/guide/documents-volumineux.md) | Tout le monde | Découper un PRD ou une architecture trop long pour les agents |
| [creer-un-plugin.md](docs/guide/creer-un-plugin.md) | Développeurs de plugins | Créer son propre plugin |

## Feuille de route

La version 0.1 couvre le parcours complet (du brief à la mise en production), avec la gouvernance (changements,
rôles), les métriques DORA, la gestion des versions, le journal d'audit chaîné et le SBOM. Prochaines étapes prévues :

- **Connecteurs Jira et Confluence** via le serveur MCP « IT for IT », pour lire et publier sans copier-coller.
- **D'autres écosystèmes CSR**, au-delà de Node.js, Java et Python.

## Contribuer

Les contributions sont les bienvenues.

1. Lisez [docs/interne/SPEC.md](docs/interne/SPEC.md) : c'est le contrat technique que suit tout le projet.
2. Les textes destinés aux utilisateurs (messages de la CLI, prompts des agents, modèles, documentation) sont
   **en français**. La documentation interne est en anglais.
3. Ouvrez une branche, faites vos modifications et proposez une merge request.

Avant de proposer une modification, exécutez les tests (`npm test`) et mettez à jour la documentation concernée
(README, `docs/guide/`, `docs/interne/SPEC.md`) dans la même merge request : voir [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

Orbith est distribué sous licence **MIT**. Voir le fichier [LICENSE](LICENSE).
