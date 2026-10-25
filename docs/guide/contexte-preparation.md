# Contexte projet et check de préparation

Ce guide présente deux outils qui évitent aux agents de « repartir de zéro » et à l'équipe de développer sur des
bases incohérentes : le **contexte projet** et le **check de préparation**. Aucun des deux n'utilise l'IA pour
contrôler : ce sont des vérifications déterministes.

## 1. Le contexte projet

Le fichier `.orbith/contexte-projet.md` est la mémoire durable du projet : conventions de code, patterns à suivre,
pièges connus, commandes utiles. Il est créé à l'installation (`npx orbith install`) à partir du modèle
`.orbith/templates/contexte-projet.md`, et il est référencé dans `GEMINI.md` et `CLAUDE.md` : les agents le lisent
avant d'écrire du code ou des documents. Il n'est **jamais écrasé** par `npx orbith update`.

Quand un agent découvre un piège ou une convention utile, il te propose de l'ajouter ; c'est toi qui relis.

### Projet existant : `npx orbith init-context`

Sur un projet qui existait avant Orbith, la commande produit un squelette **sans IA** :

- la stack détectée (Node.js, TypeScript, Java, Python, Go, Rust, PHP, .NET…), les outils de build et les frameworks ;
- les scripts disponibles (`package.json`), les outils de test et de qualité de code ;
- l'intégration continue et la conteneurisation (GitHub Actions, GitLab CI, Docker…) ;
- l'arborescence sur deux niveaux.

Ces informations sont écrites dans un bloc délimité (`orbith:auto-debut` / `orbith:auto-fin`) qui est remplacé à
chaque relance. **Ce que tu écris en dehors du bloc est conservé.**

Ensuite :

1. Demande à un agent (Dev ou Architecte) de compléter les sections *Conventions de code*, *Patterns à suivre* et
   *Pièges connus* en lisant le code.
2. Relis le résultat, corrige-le.
3. Supprime la ligne `<!-- orbith:a-completer -->` : le check de préparation cessera de la signaler.

Ne mets jamais de secret ni de donnée réelle dans ce fichier.

## 2. Le check de préparation : `npx orbith preparation`

Avant de lancer le premier développement, la commande vérifie la cohérence de la chaîne
brief → PRD → architecture → epics → user stories :

| Contrôle | Résultat si le point échoue |
|---|---|
| Brief, PRD, architecture, epic présents et validés (piste *projet*) | FAIL |
| Document UX absent ou non validé (piste *projet*) | CONCERNS |
| Document modifié après sa validation, ou marqué validé sans trace, ou frontmatter invalide | FAIL |
| Aucune user story | FAIL |
| Epic sans aucune US | CONCERNS |
| US rattachée à un epic qui n'existe pas | FAIL |
| US sans epic (piste *projet*, quand des epics existent) | CONCERNS |
| US non terminée sans critères Gherkin | FAIL |
| US non terminée pas encore validée | CONCERNS |
| Dépendance vers une US qui n'existe pas, ou dépendances circulaires | FAIL |
| US en cours dont une dépendance n'est pas terminée | CONCERNS |
| US avec le label `impact-archi` sans ADR validé qui la cite | FAIL |
| Contexte projet absent ou encore à compléter | CONCERNS |

Hors piste *projet*, les documents de cadrage (brief, PRD, architecture, epic) ne sont pas exigés : seules les
user stories comptent.

### Le verdict

- **PASS** : tout est cohérent, tu peux développer.
- **CONCERNS** : rien de bloquant, mais des points méritent ton attention.
- **FAIL** : au moins une incohérence bloquante. La commande se termine avec le code de sortie **1**, ce qui
  permet de l'utiliser en CI.

`npx orbith preparation --format json` produit le même résultat pour un outil externe.

`npx orbith next` te suggère cette commande juste après l'étape de développement tant qu'aucune US n'a encore
été commencée.
