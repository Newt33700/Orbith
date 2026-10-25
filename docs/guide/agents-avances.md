# Agents et workflows avancés

Cinq aides s'ajoutent aux agents de base. Elles sont **facultatives** : utilisez-les quand le projet le justifie
(données sensibles, risque de qualité, besoin qui bouge…). Comme tous les agents d'Orbith, elles **proposent**,
elles ne décident jamais : une personne relit et tranche.

| Aide | Quand l'utiliser | Gemini CLI | Claude Code |
|---|---|---|---|
| Sécurité (Salomé) | Après la validation de l'architecture, ou pour une US sensible | `/orbith:securite` | `/orbith-securite` |
| Test Architect (Tania) | Avant les tests, pour décider quoi tester et à quel niveau | `/orbith:test-archi` | `/orbith-test-archi` |
| Rétrospective | Après une livraison | `/orbith:retro` | `/orbith-retro` |
| Relecture adverse | Avant `npx orbith valider` d'un PRD, d'une architecture ou d'une US | `/orbith:relecture-adverse` | `/orbith-relecture-adverse` |
| Changement de cap | Quand le besoin change en cours de route | `/orbith:changement-de-cap` | `/orbith-changement-de-cap` |

## Sécurité : repérer les menaces tôt

Salomé étudie l'architecture validée : qui pourrait attaquer quoi, par où, avec quel impact. Elle écrit
`docs/architecture/menaces.md` (brouillon, à valider ensuite) avec un tableau de menaces et des parades proposées. Pour une US
sensible (connexion, droits, données personnelles…), elle suggère des scénarios Gherkin de sécurité à soumettre
au PO. Elle ne dit jamais qu'un système est « sûr ».

Exemple : `/orbith-securite modélise les menaces de l'architecture`

## Test Architect : tester là où ça compte

Tania liste les risques de qualité, puis choisit pour chacun le bon niveau de test (unitaire, intégration, bout
en bout…). Elle écrit `docs/architecture/strategie-test.md` (brouillon). Le QA applique ensuite ce cadre US par US.

Exemple : `/orbith-test-archi propose une stratégie de test pour le projet`

## Rétrospective : apprendre d'une livraison

À partir de `npx orbith metriques`, des notes de version et des constats de QA, l'animateur vous pose des
questions (ce qui a bien marché, ce qui a coincé), cherche les causes et propose des actions. Le résultat est
`docs/livraisons/retro-<version>.md` (brouillon). Les métriques servent à améliorer le processus, jamais à
juger des personnes.

## Relecture adverse : une passe critique obligatoire

Avant de valider un PRD, une architecture, un ADR, une epic ou une US, lancez cette passe : le relecteur joue
l'avocat du diable et classe ses constats (bloquant, à corriger, suggestion). Il n'approuve jamais et ne
corrige rien. Ensuite, vous décidez : faire corriger, ou valider en connaissance de cause.

Exemple : `/orbith-relecture-adverse backlog/tasks/us-003 - Annuler une réservation.md`

## Changement de cap : mesurer l'impact

Un client change d'avis ? L'analyste cartographie ce qui est touché (PRD, epics, US, architecture) et ce qui est
déjà construit, puis propose 2 ou 3 stratégies. Il ne modifie aucun document : les agents compétents s'en
chargent ensuite, dans de nouvelles sessions, et vous re-validez.

## À savoir

- Les documents produits (menaces, stratégie de test, rétrospective) sont d'abord des **brouillons** : relisez-les,
  puis validez-les vous-même avec `npx orbith valider <fichier>` (par exemple
  `npx orbith valider docs/architecture/menaces.md`). Les agents n'écrivent jamais « validé ». `npx orbith next`
  vous le rappelle tant qu'un de ces documents n'est pas validé.
- Comme toujours : ouvrez une **nouvelle session** entre deux tâches.

## Troisième plateforme : GitHub Copilot (facultative)

En plus de Gemini CLI et Claude Code, Orbith sait générer les commandes pour **GitHub Copilot dans VS Code**.
Cette plateforme n'est pas activée par défaut. Pour l'activer :

- à l'installation : `npx orbith install --plateformes gemini,claude,copilot` (ou seulement `claude,copilot`) ;
- sur un projet existant : ajoutez `copilot` à `plateformes` dans `.orbith/config.yaml`, puis `npx orbith update`.

Orbith génère alors :

- `.github/prompts/orbith.prompt.md`, `orbith-po.prompt.md`, … (les 14 commandes, mêmes noms que pour
  Claude Code) : dans le chat Copilot, tapez `/orbith-po` suivi de votre demande. Chaque fichier ne contient
  qu'un lien vers l'agent dans `.orbith/` ;
- un bloc balisé `<!-- orbith:debut -->` … `<!-- orbith:fin -->` dans `.github/copilot-instructions.md`, qui
  pointe vers les règles, le CSR et le contexte projet. Le reste du fichier vous appartient.

Limite : Copilot n'offre pas de fichier de projet pour interdire la lecture des fichiers sensibles (`.env`,
clés…). L'exclusion de contenu se règle dans les paramètres GitHub du dépôt ou de l'organisation ; à défaut,
seule la règle de confidentialité d'Orbith protège ces fichiers. `npx orbith next` affiche toujours les
commandes Gemini et Claude : sous Copilot, utilisez le nom de la commande Claude (`/orbith-…`).
