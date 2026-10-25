---
id: CHG-XXX
title: <titre court du changement, par exemple « Mise en production de la version 1.4.0 »>
type: change
statut: brouillon
changement: normal            # standard (pré-approuvé, routine) | normal (évalué et approuvé) | urgent (correctif pressé)
risque: moyen                 # faible | moyen | élevé
version: <X.Y.Z>              # version concernée : doit correspondre aux notes de version (release-notes)
fenetre_debut: <AAAA-MM-JJ HH:MM>
fenetre_fin: <AAAA-MM-JJ HH:MM>
approbateurs: []              # noms git ou emails des personnes qui doivent approuver, par exemple [alice@societe.fr]
demandeur: <nom>
---

# Demande de changement : <titre>

<!-- Une demande de changement (RFC, en ITIL) décrit une modification de la production AVANT qu'elle ait lieu.
     Elle est rédigée par l'agent DevOps avec l'équipe, puis relue et validée par un humain
     (`npx orbith valider <fichier>`). Si la configuration l'exige (`changements.exiger_pour_deploiement`),
     `npx orbith deploiement <version>` refuse de continuer sans demande validée pour la version.
     Tout ce qui n'est pas connu reste « À confirmer ». Aucun secret, mot de passe ni donnée réelle ici. -->

## Description et motif

<!-- Que change-t-on, pourquoi, et pour qui ? Cite les user stories livrées (US-XXX) et les notes de version. -->

- US concernées : US-XXX

## Évaluation du risque

<!-- Ce qui peut mal tourner, qui serait touché, quelle serait la durée d'indisponibilité. Justifie le niveau de risque choisi. -->

- 

## Plan de déploiement

<!-- Étapes dans l'ordre, avec qui fait quoi. Mentionne les environnements traversés avant la production. -->

1. 
2. 

## Plan de retour arrière

<!-- OBLIGATOIRE : comment revenir à la version précédente, en combien de temps, et sur quel critère on décide de le faire.
     Pense aux données (migrations réversibles ?). -->

1. 

## Tests et vérifications après déploiement

- [ ] 

## Communication

<!-- Qui est prévenu avant et après (support, utilisateurs, exploitation) ? -->

- 
