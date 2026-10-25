---
type: environnements
statut: brouillon
id: ENV
title: Environnements et pipeline CI/CD
---

# Environnements : <nom du produit>

<!-- Ce document décrit les environnements de l'application (dev, recette, préprod, prod…) et ce qui les différencie.
     Il est rédigé par l'agent DevOps à partir de tes réponses. Tout ce qui n'est pas connu reste « À confirmer ».
     Aucun secret, mot de passe, adresse interne sensible ni valeur de variable ici : seulement leurs NOMS. -->

## Vue d'ensemble

<!-- Un paragraphe : combien d'environnements, pourquoi ils ne sont pas identiques, qui les utilise. -->

| Environnement | Rôle | Utilisateurs | Déclenchement du déploiement | Validation humaine |
|---|---|---|---|---|
|  |  |  |  | oui / non |

## Détail par environnement

<!-- Une section par environnement, dans le même ordre que le tableau ci-dessus.
     Copie le bloc « ### » ci-dessous autant de fois qu'il y a d'environnements. -->

### <nom de l'environnement>

| Élément | Valeur |
|---|---|
| Rôle et utilisateurs | |
| Infrastructure et hébergement | <!-- où tourne l'application : serveur, cloud, prestataire. Pas d'adresse IP. --> |
| Adresse d'accès | <!-- « À confirmer » ou un nom de domaine public. Pas d'adresse interne sensible. --> |
| Configuration et fonctionnalités activées | <!-- ce qui change par rapport aux autres environnements (feature flags, options). --> |
| Données | <!-- en production : données réelles. Ailleurs : données fictives ou anonymisées. --> |
| Source des secrets | <!-- ex. variables GitLab masquées et protégées, coffre de secrets. Noms seulement. --> |
| Déploiement déclenché par | <!-- ex. fusion sur la branche principale, tag de version, lancement manuel. --> |
| Qui valide le déploiement | <!-- un rôle ou une personne. Jamais un agent. --> |
| Retour arrière | <!-- comment revenir à la version précédente, et qui le décide. --> |
| Tests de fumée après déploiement | <!-- quelques contrôles rapides : la page d'accueil répond, la connexion fonctionne… --> |

## Variables et secrets

<!-- Noms seulement. Jamais de valeur. Chaque variable indique où elle est créée et par qui. -->

| Nom de la variable | Environnements concernés | Masquée | Protégée | Créée par | Rôle |
|---|---|---|---|---|---|
|  |  | oui / non | oui / non |  |  |

## Stratégie de promotion

<!-- Comment une version passe d'un environnement à l'autre. Par défaut : on construit l'application une seule fois
     et on déploie la même version partout (« construire une fois, déployer plusieurs fois »). Dis-le si ce n'est pas le cas. -->

- 

## Retour arrière (rollback)

<!-- Procédure générale : quelle version revenir, en combien de temps, qui décide, comment le vérifier. -->

- 

## Points à confirmer

<!-- Tout ce qui n'est pas connu. Pour chaque point : la question et la personne qui peut y répondre. -->

- À confirmer :
