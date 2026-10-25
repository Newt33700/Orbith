# Piste « Projet »

> **Pour qui, pour quoi ?** Tu démarres un produit neuf, ou un chantier assez gros pour être cadré depuis le
> début : plusieurs fonctionnalités, plusieurs personnes, des choix techniques à faire. Cette piste est la plus
> complète : on avance du « pourquoi » vers le « comment », document par document, **avec ta validation à chaque
> palier**.

**Ne convient pas si** tu ajoutes une petite nouveauté à un logiciel existant (piste **évolution**) ou si tu
corriges un défaut (piste **correctif**).

Légende : 🔒 = **point de validation humaine** : rien n'avance tant qu'une personne n'a pas relu et validé.
On valide avec `npx orbith valider <fichier>`.

## Les étapes

| # | Étape | Qui | Commande | Fichier produit | Prérequis validé |
|---|---|---|---|---|---|
| 1 | Brief : pourquoi, pour qui | PO | `/orbith:po` · `/orbith-po` | `docs/produit/brief.md` | — |
| 1 🔒 | Valider le **Brief** | Toi | `npx orbith valider docs/produit/brief.md` | | |
| 2 | PRD : les besoins produit | PO | `/orbith:po` · `/orbith-po` | `docs/produit/prd.md` | Brief |
| 2 🔒 | Valider le **PRD** | Toi | `npx orbith valider docs/produit/prd.md` | | |
| 3 | UX : parcours, écrans, accessibilité | UX | `/orbith:ux` · `/orbith-ux` | `docs/produit/ux.md` | PRD |
| 3 🔒 | Valider l'**UX** | Toi | `npx orbith valider docs/produit/ux.md` | | |
| 4 | Architecture conforme au CSR + ADR | Architecte | `/orbith:archi` · `/orbith-archi` | `docs/architecture/architecture.md`, `adr/` | PRD, UX |
| 4 🔒 | Valider l'**Architecture** et les **ADR** | Toi | `npx orbith valider docs/architecture/architecture.md` | | |
| 5 | Environnements : ce qui différencie dev, recette, préprod, prod | DevOps | `/orbith:devops` · `/orbith-devops` | `docs/architecture/environnements.md` | Architecture |
| 5 🔒 | Valider les **Environnements** | Toi | `npx orbith valider docs/architecture/environnements.md` | | |
| 6 | Pipeline CI/CD : intégration et déploiement automatiques | DevOps | `/orbith:devops` · `/orbith-devops` | `.gitlab-ci.yml` (commit `ci:`) | Environnements |
| 6 🔒 | **Relire la merge request** du pipeline ; créer les variables et environnements protégés dans GitLab | Toi | revue de la merge request | | |
| 7 | Epics puis user stories avec Gherkin | PO | `/orbith:po` · `/orbith-po` | `docs/produit/epics/`, `backlog/tasks/` | Architecture |
| 7 🔒 | Valider les **Epics** et les **US** | Toi | `npx orbith valider <fichier>` | | |
| 8 | Proposition de sprint | SM | `/orbith:sm` · `/orbith-sm` | (dans la conversation) | US validées et `Prête` |
| 8 🔒 | **Décider** le contenu du sprint | Toi / l'équipe | cartes → `Prête` / `En cours` | | |
| 9 | Tests puis développement (une US par session) | Dev | `/orbith:dev US-NNN` · `/orbith-dev US-NNN` | code, tests `@US-NNN`, commits | US validée |
| 10 | Tests exécutables, couverture, revue de code | QA | `/orbith:qa US-NNN` · `/orbith-qa US-NNN` | rapport de QA | |
| 10 🔒 | **Revue humaine** ; US → `Terminée` | Toi | colonne du tableau → `Terminée` | | |
| 11 | **Créer la version** (US fusionnées depuis la précédente ajoutées automatiquement) | Toi (PO humain) | `npx orbith version <numéro>` | `docs/livraisons/release-notes-<numéro>.md` (brouillon) | US fusionnées |
| 11 | Notes de version, traçabilité | SM | `/orbith:sm` · `/orbith-sm` | `docs/livraisons/release-notes-<version>.md` | US `Terminée` |
| 11 🔒 | Valider les **notes de version** et décider de **livrer** | Toi | `npx orbith valider docs/livraisons/release-notes-<version>.md` | | |
| 12 🔒 | Après la mise en production réelle : enregistrer la date de mise en production | Toi | `npx orbith deploiement <version>` | | |

Les étapes 9 et 10 se répètent pour chaque US du sprint. Ensuite, on recommence un sprint (étape 8) jusqu'à ce que
tout soit livré.

## Détail des étapes

**1 à 2. Brief et PRD.** Le PO te pose des questions, une à la fois. Le *brief* tient en une page (problème,
utilisateurs, valeur, hors périmètre). Le *PRD* (cahier des besoins produit) détaille les fonctionnalités et leurs
priorités. Quand plusieurs façons de prioriser existent, il te propose 2 ou 3 options et attend ton choix.

**3. UX.** L'UX dessine les parcours et les écrans en texte, avec des critères d'accessibilité (RGAA / WCAG) que tu
pourras vérifier.

**4. Architecture.** L'architecte lit **d'abord** le référentiel de l'entreprise (CSR) et ne propose aucun outil
interdit. Chaque décision importante est présentée en 2 ou 3 options ; **la décision est la tienne**, enregistrée à
ton nom dans un ADR. Il lance `npx orbith check`.

**5 à 6. Environnements et pipeline.** Le DevOps (Dora) te demande d'abord ce qui rend chaque environnement
**différent** : hébergement, configuration, données, accès, qui valide un déploiement. Il ne suppose rien : ce que
tu ne sais pas est noté « À confirmer ». Tu valides le document **avant** que le pipeline soit écrit. Ensuite, il
écrit le pipeline (`.gitlab-ci.yml`) : une étape de déploiement par environnement, **jamais de secret dans le
fichier**, et un déploiement de production toujours manuel et protégé. Tu relis la merge request, puis tu crées toi-même
les variables et les environnements protégés dans GitLab (l'agent te donne la liste).

**7. Epics et US.** Le PO découpe en epics (grands blocs de valeur), puis en US avec critères Gherkin. Chaque US doit
satisfaire la DoR (liste « prête à développer »). Les US restent en colonne `À faire` ; une fois validées et la DoR
confirmée, tu les passes en `Prête`.

**8. Sprint.** Le SM te propose 2 ou 3 lots d'US avec leurs risques. **Tu décides** du lot retenu.

**9 à 10. Développement et QA.** Une US par session. Le dev écrit les tests depuis le Gherkin, puis le code ; la QA
vérifie couverture et conformité et ne valide jamais elle-même. **Tu fais la revue finale.**

**11. Livraison.** Le SM rédige les notes de version et la traçabilité. Tu relis, tu valides, tu décides de livrer.

## Règle d'or : une nouvelle session entre chaque étape

À la fin de chaque étape, **ouvre une nouvelle session** (ou tape `/clear`) avant de lancer la suivante. Chaque agent
repart ainsi avec un contexte propre et reste performant. Les documents portent la mémoire du projet, pas la
conversation.

Si un document validé est modifié, `npx orbith next` te le signale en priorité : il faut le relire et le valider de
nouveau. En cas de doute à n'importe quel moment : `npx orbith next`.

💡 Tâche terminée ? Ouvre une NOUVELLE session (ou tape `/clear`) avant la suivante : l'agent repart avec un contexte propre et reste performant.
