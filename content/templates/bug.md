---
id: US-XXX
title: <titre court du bug, par exemple « Le total du panier est faux après une remise »>
status: À faire
assignee: []
labels: [bug]
dependencies: []
created_date: <AAAA-MM-JJ>
updated_date: <AAAA-MM-JJ>
type: story
statut: brouillon
epic: EPIC-XXX
origine: production        # production | recette | interne
cause: US-XXX              # la US dont la livraison a introduit le bug (laisse vide si inconnue)
detecte_le: <AAAA-MM-JJ>   # date à laquelle le bug a été constaté
couts_ia: []
---

<!-- Un bug est une user story avec le label `bug`. Il suit le même cycle (brouillon, validé, Prête, Terminée).
     Ne remplis pas `cause` et `detecte_le` sans demander à l'humain : ce sont des faits, pas des suppositions.
     Champs remplis automatiquement, à ne pas écrire à la main :
     - debut_dev_le : premier commit qui mentionne ce bug, écrit par `npx orbith deploiement`.
     - termine_le : date du commit qui a passé la carte en « Terminée » (déplacement dans Backlog.md compris),
       écrite par `npx orbith deploiement`.
     - mis_en_prod_le : date de mise en production du correctif, écrite par `npx orbith deploiement <version>`
       (lancé par un humain). Il sert à mesurer le temps de rétablissement.
     - couts_ia : une entrée par tâche, ajoutée par les agents (voir la règle couts-ia). -->

## Description

**Constaté :** <ce qui se passe aujourd'hui, concrètement>

**Attendu :** <ce qui devrait se passer>

**Impact :** <qui est touché, à quel point, et depuis quand si on le sait>

<!-- Pas de donnée personnelle ni de donnée client réelle : utilise des exemples fictifs. -->

## Reproduction

<!-- Étapes précises pour que n'importe qui voie le bug. Un bug qu'on ne sait pas reproduire se décrit « À confirmer ». -->

1. <étape 1>
2. <étape 2>
3. <étape 3>

**Environnement :** <version, navigateur, environnement (production, recette…)>

## Critères d'acceptation

<!-- Un bloc Gherkin qui reproduit le bug comme scénario en échec : le scénario doit passer une fois le bug corrigé.
     Ajoute un scénario « cas voisin » si le correctif peut en casser un autre. -->

```gherkin
# language: fr
@US-XXX
Fonctionnalité: <nom du comportement corrigé>

  Scénario: <le bug ne se produit plus>
    Étant donné <la situation qui provoquait le bug>
    Quand <l'utilisateur fait l'action qui provoquait le bug>
    Alors <le comportement attendu est observable>
```

## Notes techniques

<!-- Pour l'équipe de développement : pistes, fichiers touchés, cause trouvée, contraintes du CSR.
     Pas de secret, pas de mot de passe, pas de donnée réelle. -->

- 

## Definition of Ready

<!-- Checklist copiée depuis .orbith/config/dor.md. Coche chaque point avant de passer la story en "Prête". -->

- [ ] Comportement attendu clair
- [ ] Étapes de reproduction connues
- [ ] Critères d'acceptation en Gherkin (scénario qui reproduit le bug)
- [ ] Estimable par l'équipe
- [ ] Dépendances identifiées
- [ ] Validée par le PO
