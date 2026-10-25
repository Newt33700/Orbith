---
id: AMEL-XXX
title: <titre court de l'action, par exemple « Alerter quand la file des paiements dépasse 100 messages »>
type: amelioration
statut: brouillon            # validation humaine (brouillon | en-revue | validé) : jamais écrit « validé » par un agent
source: <retro | incident | metrique>
source_ref: <INC-XXX | retro-<version> | nom de l'indicateur>   # document ou indicateur à l'origine de l'action
responsable: <nom ou rôle donné par l'humain>
echeance: <AAAA-MM-JJ>       # date donnée par l'humain
avancement: ouvert           # ouvert | en cours | fait | abandonné
liens: []                    # identifiants liés, par exemple [INC-002, ADR-003, US-012]
---

# Action d'amélioration : <titre>

<!-- Une action = un changement concret du processus, de l'outillage ou du produit, décidé par l'équipe.
     L'agent propose ; l'humain choisit l'action, le responsable et l'échéance. Rien n'est inventé : « À confirmer ».
     On améliore le système, jamais en désignant une personne. Aucun secret ni donnée personnelle ou client. -->

## Constat

<!-- Le fait observé, avec sa source (post-mortem INC-NNN, rétrospective, résultat de `npx orbith metriques`). -->

## Action

<!-- Ce qui sera fait, concrètement. Si l'action demande du développement, elle devient une US (agent PO) citée dans `liens`. -->

## Indicateur de succès

<!-- Comment saura-t-on que l'action a marché ? Un fait vérifiable : un indicateur et sa valeur visée, une alerte en place,
     un contrôle automatique… Par exemple « temps de rétablissement des incidents de gravité 1 inférieur à 4 h sur le trimestre ». -->

## Suivi

<!-- Date, avancement, ce qui a été fait. Quand l'action est terminée : `avancement: fait` et le résultat de l'indicateur. -->

| Date | Avancement | Commentaire |
|---|---|---|
|  |  |  |
