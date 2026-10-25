# Piste « Évolution »

> **Pour qui, pour quoi ?** Tu ajoutes une nouveauté ou une amélioration à un logiciel qui existe déjà : un nouvel
> écran, une nouvelle règle, une option supplémentaire. Le besoin est assez clair pour être décrit en quelques US,
> sans repartir de zéro. C'est la piste par défaut d'Orbith.

**Ne convient pas si** tu démarres un produit neuf ou un gros chantier à cadrer depuis le début : choisis la piste
**projet**. Pour un simple défaut à corriger, la piste **correctif** suffit.

Légende : 🔒 = **point de validation humaine** : rien n'avance tant qu'une personne n'a pas relu et validé.

## Les étapes

| # | Étape | Qui | Commande | Ce qui est produit |
|---|---|---|---|---|
| 1 | Rédiger la ou les US avec leurs **critères Gherkin** | PO | `/orbith:po` · `/orbith-po` | `backlog/tasks/us-NNN - <Titre>.md` (brouillon) |
| 1 🔒 | **Relire et valider** chaque US | Toi | `npx orbith valider "backlog/tasks/us-NNN - <Titre>.md"` | `statut: validé` |
| 2 | *Si la US est étiquetée `impact-archi`* : évaluer l'impact sur l'architecture | Architecte | `/orbith:archi` · `/orbith-archi` | ADR + mise à jour ciblée de `architecture.md` |
| 2 🔒 | **Relire et valider** l'ADR et l'architecture | Toi | `npx orbith valider docs/architecture/adr/ADR-NNN-….md` | `statut: validé` |
| 3 | *Si la US touche les environnements ou le pipeline* : décrire les environnements, puis le pipeline | DevOps | `/orbith:devops` · `/orbith-devops` | `docs/architecture/environnements.md`, `.gitlab-ci.yml` |
| 3 🔒 | **Relire et valider** les environnements (si modifiés), puis **relire la merge request** du pipeline | Toi | `npx orbith valider docs/architecture/environnements.md` | `statut: validé` ; merge request acceptée |
| 4 | Contrôler la DoR et passer la US en `Prête` | Toi (PO humain) | colonne du tableau → `Prête` | US prête |
| 5 | Tests puis développement (une US par session) | Dev | `/orbith:dev US-NNN` · `/orbith-dev US-NNN` | Tests `@US-NNN`, code, commits `feat(US-NNN): …` |
| 6 | Tests exécutables, couverture des critères, revue de code | QA | `/orbith:qa US-NNN` · `/orbith-qa US-NNN` | Rapport de QA |
| 6 🔒 | **Revue humaine** ; si c'est bon, la US passe en `Terminée` | Toi | colonne du tableau → `Terminée` | US terminée |
| 7 | Notes de version et traçabilité | SM | `/orbith:sm` · `/orbith-sm` | `docs/livraisons/release-notes-<version>.md` |
| 7 🔒 | **Relire et valider** les notes de version, puis livrer | Toi | `npx orbith valider docs/livraisons/release-notes-<version>.md` | Livraison décidée par l'humain |
| 8 🔒 | Après la mise en production réelle : enregistrer la date de mise en production | Toi | `npx orbith deploiement <version>` | Dates de mise en production des US livrées (pour les métriques) |

## Détail des étapes

**1. US et Gherkin.** Le PO te pose ses questions une par une (qui est concerné, pourquoi, que doit-il se passer),
puis écrit des US « En tant que… je veux… afin de… » avec des critères Gherkin : cas normal, cas d'erreur, cas limite.
Si une US est trop grosse, il te propose 2 ou 3 façons de la découper et attend ton choix.

**2. Impact architecture (seulement si besoin).** Si la nouveauté touche la structure du logiciel (nouvelle base de
données, nouvelle intégration, changement d'API…), la US porte le label `impact-archi`. L'architecte lit d'abord le
référentiel de l'entreprise (CSR), te propose 2 ou 3 options, **tu décides**, et il note la décision dans un ADR
(une fiche de décision) à ton nom. Sans ce label, on passe directement à l'étape suivante.

**3. Environnements et pipeline (seulement si besoin).** Si la US change un environnement (par exemple une nouvelle
configuration en préprod), ou le pipeline de livraison (par exemple un nouveau déploiement), le DevOps (Dora) met à
jour `docs/architecture/environnements.md`, qui doit être validé par toi, puis le pipeline, qui part dans une merge
request que tu relis. Sinon, cette étape ne s'applique pas. Tu crées toi-même les variables nouvelles dans GitLab.

**4. Prête.** Vérifie la « Definition of Ready » de la US. Quand tout est vrai **et** que la US est validée, passe la
carte en `Prête`.

**5. Développement.** Le développeur n'accepte qu'une US validée en `Prête` ou `En cours`. Il écrit d'abord les
squelettes de tests à partir du Gherkin, puis le code, puis lance les tests et `npx orbith check`. Il te propose de
passer la US en `En revue`, **tu déplaces la carte**.

**6. QA et revue.** La QA vérifie que chaque critère est couvert par un test qui s'exécute, relit le code selon la DoD
et le CSR, et te remet un rapport. Elle n'approuve jamais : **tu décides** d'accepter, de renvoyer au développeur ou
de compléter les critères.

**7. Livraison.** Quand toutes les US prévues sont `Terminée`, le Scrum Master prépare les notes de version et la
traçabilité (`npx orbith trace`). Tu relis, tu valides, tu décides de livrer.

## Règle d'or : une nouvelle session entre chaque étape

À la fin de chaque étape, **ouvre une nouvelle session** (ou tape `/clear`) avant de lancer la suivante. Chaque agent
repart ainsi avec un contexte propre et reste performant. Les documents du projet portent la mémoire, pas la
conversation. Pour plusieurs US : **une session par US** pour le développement et la QA.

En cas de doute à n'importe quel moment : `npx orbith next` t'indique l'étape suivante.

💡 Tâche terminée ? Ouvre une NOUVELLE session (ou tape `/clear`) avant la suivante : l'agent repart avec un contexte propre et reste performant.
