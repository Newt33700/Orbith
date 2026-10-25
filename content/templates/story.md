---
id: US-XXX
title: <titre court de la story>
status: À faire
assignee: []
labels: []
dependencies: []
created_date: <AAAA-MM-JJ>
type: story
statut: brouillon
epic: EPIC-XXX
---

## Description

En tant que <type d'utilisateur>
je veux <action ou fonctionnalité>
afin de <bénéfice métier>.

<!-- Une seule valeur par story. Si tu écris "et" plusieurs fois, découpe la story. -->

## Critères d'acceptation

<!-- Un ou plusieurs blocs Gherkin. Chaque scénario vérifie un comportement observable.
     Mots-clés français : Fonctionnalité, Scénario, Étant donné, Quand, Alors. -->

```gherkin
# language: fr
@US-XXX
Fonctionnalité: <nom de la fonctionnalité>

  Scénario: <cas nominal décrit simplement>
    Étant donné <une situation de départ>
    Quand <l'utilisateur fait une action>
    Alors <le résultat attendu est observable>

  Scénario: <cas d'erreur ou cas limite>
    Étant donné <une situation de départ>
    Quand <l'utilisateur fait une action incorrecte>
    Alors <un message clair est affiché>
```

## Notes techniques

<!-- Pour l'équipe de développement : contraintes du CSR, API concernées, impacts sur la base de données,
     ADR liés. Pas de secret, pas de mot de passe, pas de donnée réelle. -->

- 

## Definition of Ready

<!-- Checklist copiée depuis .orbith/config/dor.md. Coche chaque point avant de passer la story en "Prête". -->

- [ ] Valeur métier claire
- [ ] Critères d'acceptation en Gherkin
- [ ] Estimable par l'équipe
- [ ] Dépendances identifiées
- [ ] Maquette UX disponible (si besoin)
- [ ] Validée par le PO
