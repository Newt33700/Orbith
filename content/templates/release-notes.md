---
type: release-notes
statut: brouillon
version: <X.Y.Z>
date: <AAAA-MM-JJ>
---

# Notes de livraison : version <X.Y.Z>

<!-- Ce document liste ce qui a été livré dans une version. Il s'adresse à deux publics, dans deux parties
     séparées : les utilisateurs (ce qui change pour eux) et l'exploitation (ce qu'il faut savoir pour déployer,
     surveiller et revenir en arrière). Le humain qui valide la livraison relit les deux.
     `npx orbith release <version>` crée un brouillon de ce document à partir des US terminées. -->

## Résumé

<!-- Deux ou trois phrases : ce qui change pour l'utilisateur dans cette version. -->

## Pour les utilisateurs

<!-- Langage simple, sans jargon technique. Une ligne par story livrée : l'identifiant (US-XXX) permet de
     retrouver les commits et les tests. -->

### Nouveautés

- US-XXX : <ce que l'utilisateur peut faire désormais>

### Corrections

- US-XXX : <problème corrigé>

### Limites connues

- 

## Pour l'exploitation

<!-- Public : équipe d'exploitation, support, DevOps. Précis et actionnable. -->

### Changements à connaître

<!-- Une US étiquetée `breaking` impose une version majeure : décris ici la rupture, la migration et la
     compatibilité. Indique aussi tout changement de comportement ou action requise. -->

- 

### Déploiement et retour arrière

- Migrations, nouvelles variables de configuration, ordre de déploiement :
- Procédure de retour arrière :

### Surveillance

<!-- Indicateurs, journaux ou alertes à surveiller après la mise en production. -->

- 

## Stories livrées

<!-- Liste exhaustive des identifiants de cette version, utile pour `npx orbith trace`.
     Toutes ces US doivent être « Terminée » : sinon `npx orbith release` refuse la version. -->

| ID | Titre | Epic |
|---|---|---|
| US-XXX |  | EPIC-XXX |
