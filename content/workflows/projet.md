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
| 5 | Epics puis user stories avec Gherkin | PO | `/orbith:po` · `/orbith-po` | `docs/produit/epics/`, `backlog/tasks/` | Architecture |
| 5 🔒 | Valider les **Epics** et les **US** | Toi | `npx orbith valider <fichier>` | | |
| 6 | Proposition de sprint | SM | `/orbith:sm` · `/orbith-sm` | (dans la conversation) | US validées et `Prête` |
| 6 🔒 | **Décider** le contenu du sprint | Toi / l'équipe | cartes → `Prête` / `En cours` | | |
| 7 | Tests puis développement (une US par session) | Dev | `/orbith:dev US-NNN` · `/orbith-dev US-NNN` | code, tests `@US-NNN`, commits | US validée |
| 8 | Tests exécutables, couverture, revue de code | QA | `/orbith:qa US-NNN` · `/orbith-qa US-NNN` | rapport de QA | |
| 8 🔒 | **Revue humaine** ; US → `Terminée` | Toi | colonne du tableau → `Terminée` | | |
| 9 | Notes de version, traçabilité | SM | `/orbith:sm` · `/orbith-sm` | `docs/livraisons/release-notes-<version>.md` | US `Terminée` |
| 9 🔒 | Valider les **notes de version** et décider de **livrer** | Toi | `npx orbith valider docs/livraisons/release-notes-<version>.md` | | |

Les étapes 7 et 8 se répètent pour chaque US du sprint. Ensuite, on recommence un sprint (étape 6) jusqu'à ce que
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

**5. Epics et US.** Le PO découpe en epics (grands blocs de valeur), puis en US avec critères Gherkin. Chaque US doit
satisfaire la DoR (liste « prête à développer »). Les US restent en colonne `À faire` ; une fois validées et la DoR
confirmée, tu les passes en `Prête`.

**6. Sprint.** Le SM te propose 2 ou 3 lots d'US avec leurs risques. **Tu décides** du lot retenu.

**7 à 8. Développement et QA.** Une US par session. Le dev écrit les tests depuis le Gherkin, puis le code ; la QA
vérifie couverture et conformité et ne valide jamais elle-même. **Tu fais la revue finale.**

**9. Livraison.** Le SM rédige les notes de version et la traçabilité. Tu relis, tu valides, tu décides de livrer.

## Règle d'or : une nouvelle session entre chaque étape

À la fin de chaque étape, **ouvre une nouvelle session** (ou tape `/clear`) avant de lancer la suivante. Chaque agent
repart ainsi avec un contexte propre et reste performant. Les documents portent la mémoire du projet, pas la
conversation.

Si un document validé est modifié, `npx orbith next` te le signale en priorité : il faut le relire et le valider de
nouveau. En cas de doute à n'importe quel moment : `npx orbith next`.

💡 Tâche terminée ? Ouvre une NOUVELLE session (ou tape `/clear`) avant la suivante : l'agent repart avec un contexte propre et reste performant.
