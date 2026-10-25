# Cadre de Référence (CSR)

> **EXEMPLE : ce fichier n'est pas le vrai référentiel.**
> Le vrai CSR de l'entreprise vit dans son dépôt privé. Ce modèle montre seulement le format attendu
> par `npx orbith check`. Remplace toutes les lignes par celles de ton entreprise.
>
> Source : exemple fictif — Mis à jour le 2026-01-15

Statuts possibles : `autorisé`, `déprécié` (à migrer, avertissement), `interdit` (erreur bloquante).
Un outil `obligatoire` doit être présent dans le projet. La version minimale est comparée par segments
numériques (`22` est supérieur à `20.11`).

## Langages

| Outil | Version min | Statut | Commentaire |
|---|---|---|---|
| Java | 21 | autorisé | LTS uniquement |
| Java | 17 | déprécié | migrer vers Java 21 avant fin 2026 |
| Node.js | 22 | autorisé | LTS uniquement |
| Node.js | 20 | déprécié | fin de support prévue |
| Python | 3.11 | autorisé | |
| Python | 2.7 | interdit | fin de vie |
| TypeScript | 5.4 | autorisé | |

## Frameworks

| Outil | Version min | Statut | Commentaire |
|---|---|---|---|
| Spring Boot | 3.3 | autorisé | |
| Angular | 18 | autorisé | |
| AngularJS | | interdit | fin de vie, sécurité non maintenue |
| React | 18 | autorisé | |
| Express | 4.19 | autorisé | |

## Bibliothèques

| Outil | Version min | Statut | Commentaire |
|---|---|---|---|
| axios | 1.7 | autorisé | |
| date-fns | 3.0 | autorisé | remplace moment |
| moment | | déprécié | utiliser date-fns |
| request | | interdit | package npm abandonné |
| log4j-core | 2.17.1 | autorisé | versions antérieures interdites (faille critique) |
| log4j | 1.x | interdit | fin de vie |
| jQuery | 3.7 | déprécié | ne pas utiliser pour de nouveaux développements |

## Outils (CI, qualité)

| Outil | Version min | Statut | Commentaire |
|---|---|---|---|
| GitLab CI | | obligatoire | pipelines de build et de tests |
| Jenkins | | déprécié | migrer vers GitLab CI |
| SonarQube | 10 | autorisé | analyse de qualité sur chaque merge request |
| ESLint | 9 | autorisé | |
| Docker | 24 | autorisé | images de base validées par la sécurité |
| Selenium IDE | | interdit | utiliser Playwright |

## Bases de données

| Outil | Version min | Statut | Commentaire |
|---|---|---|---|
| PostgreSQL | 15 | autorisé | base de référence |
| MySQL | 8.0 | autorisé | pour les applications existantes uniquement |
| MySQL | 5.7 | interdit | fin de vie |
| MongoDB | 6 | déprécié | demander une dérogation à l'architecte |
| Oracle Database | | interdit | licences non renouvelées |
