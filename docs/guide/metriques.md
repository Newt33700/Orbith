# Mesurer la livraison : métriques DORA et coûts IA

Ce guide explique comment Orbith mesure la façon dont votre équipe livre les logiciels : les quatre indicateurs DORA,
d'où viennent les dates, comment enregistrer une mise en production et déclarer un bug, et comment suivre le coût de
l'IA (FinOps). Il s'adresse aux chefs de projet, aux leads tech et aux personnes qui pilotent l'équipe.

Vous travaillez surtout avec les commandes `npx orbith metriques` et `npx orbith deploiement`, et avec l'agent
**Scrum Master** (`/orbith:sm` ou `/orbith-sm`), qui présente les résultats.

## DORA et *Accelerate*

**DORA** (*DevOps Research and Assessment*) est un programme de recherche qui étudie depuis plusieurs années les équipes
qui livrent bien des logiciels. Son livre, ***Accelerate***, explique ses résultats : les équipes performantes ne
sacrifient pas la vitesse à la qualité, elles mesurent leur livraison et s'améliorent par petites étapes.

DORA retient **quatre indicateurs**. Ils mesurent la vitesse de livraison (deux indicateurs) et la stabilité (deux
indicateurs). Orbith les calcule à partir des données déjà présentes dans votre projet : les user stories, les
commits et le registre des mises en production.

## Les quatre métriques

| Métrique | Ce qu'elle répond | Calcul dans Orbith | Élite | Élevé | Moyen | Faible |
|---|---|---|---|---|---|---|
| **Fréquence de déploiement** | À quel rythme met-on une version en production ? | Mises en production par semaine, sur la période | Au moins 7 par semaine | Au moins 1 par semaine | Au moins 12 par an | Moins de 12 par an |
| **Délai de mise en production** (*lead time*) | Combien de temps entre le premier commit d'une US et sa mise en production ? | Médiane des délais, en jours | Moins d'1 jour | Jusqu'à 7 jours | Jusqu'à 30 jours | Plus de 30 jours |
| **Taux d'échec des changements** | Quelle part des mises en production a provoqué un bug en production ? | Déploiements ayant une US-cause de bug, en % | 5 % ou moins | Jusqu'à 10 % | Jusqu'à 15 % | Plus de 15 % |
| **Temps de rétablissement** (MTTR) | Combien de temps pour corriger un bug en production ? | Médiane des délais entre la détection du bug et la mise en production de son correctif, en heures | Moins d'1 heure | Moins de 24 heures | Moins de 7 jours | 7 jours ou plus |

Ces seuils sont des repères inspirés des rapports DORA. Ils aident à situer l'équipe, sans la juger. Une équipe
« moyenne » qui progresse est en bonne voie.

**Le niveau global** (élite, élevé, moyen ou faible) est donné par la commande, à partir des quatre indicateurs.

## D'où viennent les dates

Orbith n'invente aucune date. Chaque date vient d'un fait précis et a un auteur précis :

| Champ | Où | Qui l'écrit | Quand |
|---|---|---|---|
| `created_date` | Frontmatter de la US | L'agent PO, à la création | Création de la US |
| `updated_date` | Frontmatter de la US | L'agent qui modifie le contenu | Chaque modification du contenu |
| `debut_dev_le` | Frontmatter de la US | `npx orbith deploiement` (automatique) | Date du premier commit qui mentionne la US (par exemple `feat(US-012): …`) |
| `termine_le` | Frontmatter de la US | `npx orbith deploiement` (automatique) | Date du commit qui a passé la carte en « Terminée », y compris un déplacement dans Backlog.md |
| `mis_en_prod_le` | Frontmatter de la US et des notes de version | `npx orbith deploiement <version>` (lancé par un humain) | Date de la mise en production réelle |
| `origine`, `cause`, `detecte_le` | Frontmatter d'un bug | L'agent PO, sur réponse de l'humain | Déclaration du bug |
| `couts_ia` | Frontmatter de la US ou du bug | Les agents, une entrée par tâche | Fin de chaque tâche |

**Règle simple :** un agent n'écrit jamais `mis_en_prod_le`, `termine_le` ni `debut_dev_le`. La date de mise en
production n'existe que lorsqu'un humain confirme qu'un déploiement a eu lieu.

> **Passer une carte en « Terminée » ne la met pas en production.** « Terminée » veut dire développée, relue et
> acceptée ; la mise en production peut venir plus tard. Orbith garde donc deux dates distinctes : `termine_le`
> (retrouvée dans l'historique Git, dès que le changement de colonne est commité) et `mis_en_prod_le` (enregistrée
> par `npx orbith deploiement`). L'écart entre les deux est l'**attente avant mise en production**, affichée par
> `npx orbith metriques` : elle montre si le temps se perd en développement ou en attente de livraison.

## Enregistrer une mise en production

Une fois la version **réellement déployée** en production, lancez dans votre terminal :

```bash
npx orbith deploiement 1.4.0
```

La commande :

1. vérifie que les notes de version `docs/livraisons/release-notes-1.4.0.md` existent et sont **validées** (`npx orbith valider`) ;
2. enregistre le déploiement dans `.orbith/deploiements.json`, le **registre des mises en production** ;
3. écrit `mis_en_prod_le` dans chaque US listée dans les notes, et `debut_dev_le` et `termine_le` s'ils sont absents ;
4. écrit `mis_en_prod_le` dans les notes de version.

Options utiles :

- `--date AAAA-MM-JJ` : la date du déploiement, si ce n'est pas aujourd'hui (par exemple un déploiement fait la veille) ;
- `--env <nom>` : l'environnement. Par défaut, c'est `production`. Les autres environnements (recette, préprod) sont
  seulement enregistrés, sans écrire de dates dans les US ;
- `--yes` : pas de question de confirmation. Réservé à un usage humain dans un script.

**Ne lancez la commande qu'après un vrai déploiement.** Lancée trop tôt, elle enregistre une date fausse, et les
indicateurs restent faux jusqu'à correction à la main.

L'agent DevOps et l'agent Scrum Master vous rappellent cette étape, mais c'est vous qui la lancez.

## Déclarer un bug de production

Le **taux d'échec** et le **temps de rétablissement** ne peuvent être calculés que si les bugs sont déclarés. Quand un
défaut est découvert après une livraison :

1. Demandez à l'agent PO de créer un bug avec le modèle `bug.md` (`/orbith-po`) : c'est une user story avec le label `bug`.
2. Renseignez les trois champs suivants, que l'agent vous demandera un par un :
   - `origine` : `production`, `recette` ou `interne` (où le défaut a été vu) ;
   - `detecte_le` : la date à laquelle le défaut a été constaté ;
   - `cause` : l'identifiant de la US dont la livraison a introduit le défaut (par exemple `US-012`). Si vous ne le savez
     pas, laissez vide : l'agent ne le devinera pas.
3. Corrigez le bug en suivant la piste **correctif** (`/orbith-dev`, puis la revue humaine).
4. Après la mise en production du correctif, lancez `npx orbith deploiement <version>`. Cette date de mise en production
   du correctif sert au calcul du temps de rétablissement.

Exemple de bug, tel qu'il apparaît dans `backlog/tasks/` :

```yaml
---
id: US-031
title: Le total du panier est faux après une remise
labels: [bug]
origine: production
cause: US-012
detecte_le: 2026-10-20
---
```

Un bug sans `cause` compte dans le MTTR, mais pas dans le taux d'échec : la commande ne sait pas quelle livraison
l'a provoqué.

## Coûts IA (FinOps)

**FinOps** désigne la discipline qui surveille les dépenses liées au cloud et aux services numériques, pour qu'elles
restent maîtrisées et utiles. Ici, il s'agit du coût des agents IA.

Orbith suit le **coût IA estimé** : à la fin de chaque tâche liée à une US ou à un bug, l'agent estime sa
consommation de jetons (les petits morceaux de texte que le modèle lit et écrit) et ajoute une entrée dans `couts_ia`.
Exemple :

```yaml
couts_ia:
  - date: 2026-10-25
    agent: dev
    outil: claude-code
    modele: inconnu
    tache: "Implémentation des scénarios 1 et 2"
    tokens_entree: 120000
    tokens_sortie: 15000
    cout: 0.59
    devise: EUR
    source: estimé
```

**Ce que ces chiffres sont, et ce qu'ils ne sont pas :**

- ce sont des **estimations faites par les agents eux-mêmes**, à partir de la taille des textes lus et écrits (1 jeton
  environ égal à 4 caractères) ;
- ils donnent un **ordre de grandeur** pour comparer des tâches, des US et des agents entre eux ;
- ce ne sont **pas une facture**. La facture de votre fournisseur d'IA fait foi ;
- `source: estimé` indique qu'il s'agit d'une estimation.

### Régler les prix

Les coûts se calculent avec les prix de `.orbith/config.yaml`, par million de jetons (entrée et sortie) :

```yaml
finops:
  devise: EUR
  prix:
    defaut: { entree: 3, sortie: 15 }
    claude-sonnet: { entree: 3, sortie: 15 }
    claude-opus: { entree: 15, sortie: 75 }
    gemini-pro: { entree: 1.25, sortie: 10 }
    gemini-flash: { entree: 0.3, sortie: 2.5 }
```

Les valeurs ci-dessus sont **indicatives**. Faites-les remplacer par les tarifs réels de votre contrat, avec l'équipe
FinOps. Un agent qui ne reconnaît pas son modèle utilise la clé `defaut`.

## Exemple de sortie

Voici la sortie de `npx orbith metriques` sur un petit projet d'exemple (3 mises en production en 90 jours, dont un
correctif après un bug de production causé par US-019). Le résultat est en Markdown : vous pouvez le coller tel quel
dans un wiki ou l'écrire dans un fichier avec `--sortie`.

```markdown
# Indicateurs DORA : reservation-salles

Période : du 2026-07-27 au 2026-10-25 (90 jours).

| Indicateur | Valeur |
|---|---|
| Fréquence de déploiement | 3 mise(s) en production, 0,23 par semaine (niveau DORA : faible) |
| Délai de mise en production (médiane) | 5 jour(s) sur 2 US (niveau DORA : élevé) |
| Attente avant mise en production (médiane) | 2,5 jour(s) sur 2 US |
| Taux d'échec des changements | 33,3 % (1 déploiement(s) suivi(s) d'un bug de production) (niveau DORA : faible) |
| Temps de rétablissement (médiane) | 24 heure(s) sur 1 incident(s) (niveau DORA : moyen) |

## Coûts IA (estimations des agents)

Total : 3,31 EUR sur 7 estimation(s). Ce sont des ordres de grandeur, pas une facture.

- dev : 2,07 EUR
- po : 0,7 EUR
- qa : 0,54 EUR

## User stories

| US | Type | Colonne | Créée | Modifiée | Début dev | Terminée | Mise en prod | Délai (j) | Coût IA |
|---|---|---|---|---|---|---|---|---|---|
| US-012 | US | Terminée | 2026-08-03 | 2026-08-20 | 2026-08-25 | 2026-08-29 | 2026-09-02 | 8 | 1,84 EUR |
| US-019 | US | Terminée | 2026-09-01 | 2026-09-03 | 2026-09-08 | 2026-09-09 | 2026-09-10 | 2 | 0,72 EUR |
| US-021 | US | En cours | 2026-10-02 | 2026-10-06 | — | — | — | — | 0,3 EUR |
| BUG-003 | bug | Terminée | 2026-09-12 | — | — | — | 2026-09-13 | — | 0,45 EUR |
```

Pour un format exploitable par un outil, utilisez `npx orbith metriques --format json --sortie metriques.json`.

## Ce qu'il faut savoir

- **Un chiffre manquant n'est pas un zéro.** Si aucun déploiement n'est enregistré, la fréquence est vide. Si aucun bug
  n'est déclaré, le taux d'échec n'est pas « 0 % » : il faut déclarer les bugs pour que la mesure soit fiable.
- **Les métriques mesurent l'équipe, pas les personnes.** Les utiliser pour juger un individu va à l'encontre de leur
  objet. Une métrique sert à voir où le processus coince, puis à décider d'une amélioration en équipe.
- **La qualité des données compte.** Les dates sont fiables si les commits portent l'identifiant de la US
  (`feat(US-012): …`) et si les déploiements sont enregistrés le jour même.
- **Les décisions restent humaines.** Orbith et les agents présentent des chiffres et des pistes ; c'est l'équipe qui
  choisit ce qu'elle améliore.

## Voir aussi

- [Guide du lead tech et du développeur](guide-dev.md) : la traçabilité par commit ;
- [Validation humaine](validation-humaine.md) : pourquoi les notes de version doivent être validées avant un déploiement ;
- [Produire un rapport d'audit](audit.md) : la trace complète pour les comités.
