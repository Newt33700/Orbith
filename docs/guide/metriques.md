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

DORA a longtemps retenu **quatre indicateurs** : la vitesse de livraison (deux indicateurs) et la stabilité (deux
indicateurs). Orbith les calcule à partir des données déjà présentes dans votre projet : les user stories, les
commits et le registre des mises en production. Depuis son rapport 2024, DORA ajoute un **cinquième indicateur de
livraison**, le taux de reprise des déploiements, qu'Orbith calcule aussi (voir
[Taux de reprise des déploiements](#taux-de-reprise-des-déploiements)). Si vous fixez des objectifs de service, Orbith
les compare enfin aux incidents et aux bugs de production (voir [Objectifs de service](#objectifs-de-service-sla-et-slo)).

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
| `revue_le` | Frontmatter de la US (facultatif) | L'équipe, à la main | Fin de la revue, si vous voulez isoler cette étape de l'attente |
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

### Coûts mesurés (Claude Code)

Avec Claude Code, vous pouvez aussi importer les **compteurs de jetons réels** enregistrés sur votre poste :
`npx orbith couts importer --us US-012`. Les entrées importées s'ajoutent à la fin de `couts_ia` avec
`source: mesuré`, sans toucher aux estimations existantes. Le détail (options, calcul du cache, confidentialité,
limites, Gemini CLI non pris en charge) est dans [provenance-couts.md](provenance-couts.md).

Dès qu'une entrée mesurée existe, `npx orbith metriques` sépare les deux sources :

```markdown
## Coûts IA (estimations des agents et compteurs mesurés)

Total : 4,12 EUR sur 9 entrée(s). Ce sont des ordres de grandeur, pas une facture.

- estimé (auto-estimation des agents) : 3,31 EUR sur 7 entrée(s)
- mesuré (compteurs réels importés, `orbith couts importer`) : 0,81 EUR sur 2 entrée(s)
```

En JSON, la répartition est dans `couts.parSource.estime` et `couts.parSource.mesure` (`total`, `entrees`) ; en CSV,
dans les lignes de famille `couts`. Une entrée sans `source`, ou avec une autre valeur que `mesuré`, compte comme
une estimation.

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

Le rapport complet contient aussi les sections décrites ci-dessous (cibles, tendances, attente découpée, taille des
changements) et le rappel « DORA mesure une équipe, pas des personnes ». Extrait, sur le même projet avec des cibles
configurées :

```markdown
## Cibles

| Indicateur | Mesuré | Cible |
|---|---|---|
| Fréquence de déploiement | 0,23 par semaine | au moins 1 par semaine : non atteinte |
| Délai de mise en production | 5 jour(s) | au plus 7 jour(s) : atteinte |

## Tendances (période précédente : du 2026-04-27 au 2026-07-26)

| Indicateur | Cette période | Période précédente | Évolution |
|---|---|---|---|
| Fréquence de déploiement | 0,23 par semaine | non mesurable | non mesurable |
```

Pour un format exploitable par un outil, utilisez `npx orbith metriques --format json --sortie metriques.json`, ou
`--format csv` pour un tableur (voir plus bas).

## Aller plus loin dans la lecture

### Fixer des cibles

Une valeur seule dit peu : comparez-la à ce que l'équipe vise. Ajoutez, si vous le souhaitez, une section `dora` dans
`.orbith/config.yaml`. Toutes les clés sont facultatives :

```yaml
dora:
  cibles:
    frequence_par_semaine: 1     # au moins
    delai_jours: 7               # au plus
    taux_echec_pct: 10           # au plus
    retablissement_heures: 24    # au plus
```

Le rapport ajoute une section **Cibles** : pour chaque cible, la valeur mesurée et « atteinte » ou « non atteinte ». Si
l'indicateur n'est pas mesurable sur la période, la cible n'est ni atteinte ni manquée : le rapport écrit
« non mesurable ». Sans section `dora`, rien ne change. Une clé inconnue ou une valeur qui n'est pas un nombre est
refusée avec un message qui nomme la clé. Une cible est un repère choisi par l'équipe, pas un objectif imposé.

### Tendances

Les indicateurs sont aussi calculés sur la **période précédente de même durée** (avec `--jours 90`, le trimestre
d'avant). Le rapport affiche la flèche (↑ hausse, ↓ baisse, → stable), l'écart, et si l'évolution va dans le bon sens
(« en amélioration »), dans le mauvais (« à surveiller ») ou si elle est stable. Si l'une des deux périodes n'a pas de
donnée (par exemple aucun déploiement), la tendance est « non mesurable » : Orbith ne compare jamais à un zéro inventé.

### Où se perd l'attente

L'attente entre « Terminée » et la mise en production est découpée en trois étapes, **seulement quand les dates
existent** :

| Étape | De | À |
|---|---|---|
| Revue | `termine_le` | `revue_le` (facultatif) |
| Recette | `revue_le`, ou `termine_le` s'il est absent | première mise en recette de la US (`npx orbith deploiement <version> --env recette`) |
| Production | mise en recette | `mis_en_prod_le` |

Chaque étape est une médiane sur les US qui ont les deux dates. Sans `revue_le`, la revue est comprise dans la recette.
Sans déploiement en recette, les étapes recette et production sont « non mesurables » ; l'attente globale reste
affichée.

### Taille des changements

Le rapport indique, pour chaque mise en production de la période, le nombre de **US** livrées et le nombre de
**commits** qui mentionnent ces US, puis les médianes. Les petits lots sont une pratique clé de DORA : des versions
plus petites se relisent et se déploient plus facilement. Les commits ne sont comptés que s'ils portent l'identifiant de
la US ; sans historique Git, ce nombre est « non mesurable ».

### Export CSV

`npx orbith metriques --format csv --sortie metriques.csv` écrit une ligne par indicateur (valeur, unité, effectif,
niveau, période précédente, écart, cible), plus la taille de chaque version. Le fichier est en UTF-8 avec séparateur
point-virgule et virgule décimale, pour s'ouvrir directement dans un tableur français. Une donnée absente est écrite
« non mesurable », jamais 0. La dernière ligne rappelle que DORA mesure une équipe, pas des personnes.

### Taux de reprise des déploiements

DORA mesure aujourd'hui la livraison avec **cinq indicateurs** : délai, fréquence, temps de rétablissement après un
déploiement en échec, taux d'échec et **taux de reprise des déploiements** (*deployment rework rate*), ajouté dans le
rapport 2024. DORA le définit comme la part des déploiements des six derniers mois **non planifiés, faits pour corriger
un bug visible des utilisateurs**.

Orbith le calcule sur la période : une mise en production est une « reprise » quand elle livre une US qui porte le label
`bug` et `origine: production`. Le rapport affiche le pourcentage et le nombre de mises en production concernées.

- **Pas de niveau** (élite, élevé…) : DORA n'en publie pas pour cet indicateur, Orbith n'en invente pas.
- Sans mise en production, la valeur est « non mesurable ». Avec des mises en production mais aucun bug de production
  déclaré, 0 % est affiché avec la mention « aucun bug de production déclaré : à vérifier ».
- Limite : une version qui livre à la fois un correctif et des nouveautés compte comme une reprise.

### Objectifs de service (SLA et SLO)

Un **objectif de service** (SLO, *Service Level Objective*) est un engagement chiffré sur la qualité du service rendu,
par exemple « un incident critique est résolu en moins de 4 heures ». Un **SLA** (*Service Level Agreement*) est
l'accord, souvent contractuel, qui reprend ces objectifs. Ajoutez, si vous le souhaitez, une section `sla` dans
`.orbith/config.yaml`. Toutes les clés sont facultatives :

```yaml
sla:
  disponibilite_pct: 99.5        # au moins
  retablissement_heures:         # au plus, par gravité d'incident
    1: 4                         # critique (on peut aussi écrire « critique: 4 »)
    2: 24                        # majeure
    3: 72                        # mineure
  correction_bug_prod_jours: 5   # au plus
```

`npx orbith metriques` ajoute alors une section **Fiabilité et objectifs de service** : pour chaque objectif, la cible, la
mesure et le résultat « atteint », « non atteint » ou « non mesurable ».

| Objectif | Ce qu'Orbith mesure | Données utilisées |
|---|---|---|
| `disponibilite_pct` | 100 % moins la part de la période passée en incident | Incidents `docs/livraisons/incidents/INC-NNN-*.md` : `detecte_le`, `retabli_le` |
| `retablissement_heures` | Pour chaque incident rétabli dans la période : durée entre `detecte_le` et `retabli_le` ; l'objectif est atteint si **tous** respectent le délai | Incidents : `gravite` (1, 2 ou 3), `detecte_le`, `retabli_le` |
| `correction_bug_prod_jours` | Pour chaque bug de production corrigé dans la période : durée entre `detecte_le` et `mis_en_prod_le` | Bugs : `labels: [bug]`, `origine: production`, `detecte_le`, `mis_en_prod_le` |

Orbith n'invente rien :

- un incident ou un bug **sans date de fin** rend l'objectif « non mesurable », sauf s'il est déjà ouvert depuis plus
  longtemps que le délai visé à la fin de la période : l'objectif est alors « non atteint », c'est un fait ;
- sans aucun incident ni bug concerné, l'objectif est « non mesurable » ;
- la **disponibilité est une estimation** : chaque incident déclaré compte comme une indisponibilité totale entre
  `detecte_le` et `retabli_le`, quelle que soit sa gravité. Sans incident déclaré, elle vaut 100 % avec la mention
  « aucun incident déclaré : à vérifier ». Elle ne remplace pas une supervision de production ;
- un incident sans gravité reconnue ou sans date de détection est signalé, sans être compté.

Les dates d'incident s'écrivent `AAAA-MM-JJ HH:MM` (modèle `incident.md`). Une clé inconnue ou une valeur qui n'est pas
un nombre est refusée avec un message qui nomme la clé. Le JSON contient `sla.objectifs[]` (`cible`, `valeur`,
`atteint`, `remarque`) ; le CSV ajoute une ligne `sla` par objectif.

### La fiabilité, cinquième métrique ?

Beaucoup d'articles présentent la « fiabilité » comme la cinquième métrique DORA. Ce que disent les sources officielles :

- le rapport DORA 2021 a présenté la fiabilité (*reliability*) comme « la cinquième métrique », celle de la performance
  **opérationnelle** : la capacité d'une équipe à tenir ses promesses sur le logiciel qu'elle exploite (disponibilité,
  latence, performance, capacité à monter en charge). Elle était mesurée par **auto-évaluation** : les répondants
  notaient leur capacité à atteindre ou dépasser leurs objectifs de fiabilité ;
- DORA a depuis corrigé ce point : appeler la fiabilité « cinquième métrique » était inexact, c'est une mesure de
  performance opérationnelle, pas de performance de livraison. Le rapport 2024 la relie aux objectifs de service (SLO) ;
- aucun niveau (élite, élevé…) n'est publié pour la fiabilité.

Orbith en tire deux choses : vos objectifs de service, quand vous les fixez (section précédente), et une
**auto-évaluation facultative** de l'équipe. Pendant la rétrospective, l'équipe peut répondre à la question « tenons-nous
nos objectifs de fiabilité ? » ; sa réponse, notée dans l'en-tête de la rétrospective (`fiabilite_auto_evaluation`), est
affichée telle quelle par `npx orbith metriques`, sans note ni niveau.

Sources : [DORA, *DORA's software delivery performance metrics*](https://dora.dev/guides/dora-metrics/) (mis à jour le
5 janvier 2026) ; [DORA, *A history of DORA's software delivery metrics*](https://dora.dev/insights/dora-metrics-history/)
(2 janvier 2026) ; [*Accelerate State of DevOps Report 2024*](https://dora.dev/research/2024/dora-report/), pages 10 à 12
et 79 à 80 ; [*Accelerate State of DevOps Report 2021*](https://dora.dev/research/2021/dora-report/), « The fifth metric: from
availability to reliability ».

Pour transformer un objectif non atteint en action suivie, voir le guide
[Amélioration continue et liens de connaissance](amelioration-continue.md).

## Ce qu'il faut savoir

- **Un chiffre manquant n'est pas un zéro.** Si aucun déploiement n'est enregistré, la fréquence est vide. Si des
  déploiements existent mais qu'aucun bug n'est déclaré (`labels: [bug]`, `origine: production`), le rapport affiche
  « 0 % » suivi de la mention « aucun bug déclaré : à vérifier » (champ `tauxEchec.avertissement` du JSON). Ce 0 % n'est
  pas une mesure : déclarez les bugs de production pour que le taux soit fiable.
- **Les métriques mesurent l'équipe, pas les personnes.** Le rapport le rappelle à chaque fois. Les utiliser pour juger un individu va à l'encontre de leur
  objet. Une métrique sert à voir où le processus coince, puis à décider d'une amélioration en équipe.
- **La qualité des données compte.** Les dates sont fiables si les commits portent l'identifiant de la US
  (`feat(US-012): …`) et si les déploiements sont enregistrés le jour même.
- **Les décisions restent humaines.** Orbith et les agents présentent des chiffres et des pistes ; c'est l'équipe qui
  choisit ce qu'elle améliore.

## Voir aussi

- [Amélioration continue et liens de connaissance](amelioration-continue.md) : transformer un incident, une rétrospective ou un indicateur en action suivie ;
- [Guide du lead tech et du développeur](guide-dev.md) : la traçabilité par commit ;
- [Validation humaine](validation-humaine.md) : pourquoi les notes de version doivent être validées avant un déploiement ;
- [Produire un rapport d'audit](audit.md) : la trace complète pour les comités.
