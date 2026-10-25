---
id: INC-XXX
title: <titre court de l'incident, par exemple « Indisponibilité du paiement le 12 mars »>
type: incident
statut: brouillon
gravite: <1 critique | 2 majeure | 3 mineure>
detecte_le: <AAAA-MM-JJ HH:MM>
retabli_le: <AAAA-MM-JJ HH:MM>
change: CHG-XXX              # demande de changement à l'origine de l'incident, si elle est connue
liens: []                    # facultatif : identifiants liés (AMEL-001, ADR-002, US-012…)
---

# Incident et post-mortem : <titre>

<!-- Post-mortem SANS BLÂME : on cherche ce qui, dans le système, a rendu l'erreur possible, pas qui l'a commise.
     N'écris aucun nom de personne dans les causes. Aucun secret ni donnée client réelle. -->

## Résumé

<!-- Trois phrases : ce qui s'est passé, l'impact, comment le service a été rétabli. -->

## Impact

<!-- Qui a été touché, pendant combien de temps, quelles données ou transactions. -->

## Chronologie

| Heure | Événement |
|---|---|
|  |  |

## Causes

<!-- Cause directe, puis facteurs contributifs (process, outils, alertes manquantes…). Pose la question « pourquoi ? » cinq fois. -->

- 

## Ce qui a bien fonctionné

- 

## Ce qui a mal fonctionné

- 

## Actions d'amélioration

<!-- Chaque action retenue par l'humain devient une action suivie docs/amelioration/AMEL-NNN-*.md
     (modèle .orbith/templates/amelioration.md, `source: incident`, `source_ref: INC-XXX`). -->

| Action | Responsable | Échéance | AMEL, US ou ticket |
|---|---|---|---|
|  |  |  |  |
