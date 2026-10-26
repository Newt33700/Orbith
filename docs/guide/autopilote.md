# Mode autopilote borné

Quand plusieurs user stories (US) sont validées et prêtes, les lancer une à une avec `/orbith-dev` puis
`/orbith-qa` devient répétitif. L'**autopilote** enchaîne ces deux étapes pour toi, mais **il ne franchit jamais une
porte de validation humaine** : il s'arrête à chacune.

Le principe d'Orbith ne change pas : **l'IA propose, l'humain décide**. Seul `npx orbith valider` valide un
document, seul un humain passe une carte en `Terminée`, et une tâche = une session.

## En deux temps

1. **Le plan, sans IA** : `npx orbith autopilote` calcule ce que l'autopilote a le droit de faire.
2. **L'exécution, par un agent** : `/orbith:autopilote` (Gemini) ou `/orbith-autopilote` (Claude) suit ce plan,
   US par US, et s'arrête pour ta revue.

## 1. Le plan : `npx orbith autopilote`

```bash
npx orbith autopilote                      # tout le projet
npx orbith autopilote EPIC-002             # les US de l'epic EPIC-002
npx orbith autopilote US-012 US-014        # des US précises
npx orbith autopilote EPIC-002 --max-us 2 --budget 15
npx orbith autopilote --format json        # pour un script ou pour l'agent
```

La commande lit le backlog, les validations, la configuration et le résultat de `npx orbith check`. Elle affiche :

- **les US retenues, dans l'ordre** : chacune passera par Dev, puis QA, puis 🔒 ta revue ;
- **les US écartées**, avec la raison (pas encore validée, Definition of Ready incomplète, dépendance non terminée…) ;
- **le plafond** : le nombre maximum de US en attente de ta revue ;
- **le budget IA** : consommé, plafond et reste, en estimation ;
- **les portes humaines** qui arrêteront l'exécution.

### Quelles US sont éligibles ?

Une US est retenue seulement si **tout** est vrai :

| Condition | Comment la remplir |
|---|---|
| Elle est validée (et pas modifiée depuis) | `npx orbith valider "<fichier>"` |
| Sa Definition of Ready est remplie | toutes les cases de la section « Definition of Ready » sont cochées |
| Elle est dans la colonne `Prête` | c'est toi qui déplaces la carte |
| Elle a au moins un scénario Gherkin | section « Critères d'acceptation » |
| Ses dépendances (`dependencies`) sont `Terminée` | une US qui attend une autre US reste en dehors du plan |
| Étiquette `impact-archi` : un ADR validé la cite | demande un ADR à l'architecte |

L'ordre suit le champ `ordinal` (tableau Backlog.md), puis la priorité (`priority`), puis le numéro de la US.

### Le plafond de US

Par défaut, l'autopilote ne laisse jamais plus de **3 US** en attente de ta revue. Les US déjà `En cours` ou
`En revue` de **tout le projet** (pas seulement des cibles que tu donnes) comptent dans ce plafond : si deux US attendent ta revue, il ne reste qu'une place. Ainsi,
même en relançant l'autopilote plusieurs fois, ou en réduisant le périmètre, le travail non relu ne s'accumule pas.

Change la valeur avec `--max-us`, ou dans `.orbith/config.yaml` :

```yaml
autopilote:
  max_us: 3      # US en attente de ta revue, au plus
  budget: 20     # plafond de coût IA estimé du périmètre, dans la devise finops.devise
```

### Le budget

Le budget est un **plafond de coût IA estimé** pour le périmètre (l'epic ou les US visées, sinon tout le projet).
Le consommé est la somme des entrées `couts_ia` déjà enregistrées par les agents dans les US du périmètre (règle
couts-ia). Une entrée sans montant est calculée avec les prix `finops.prix`. Si le projet a déjà des US terminées
avec des coûts, la commande calcule le **coût moyen constaté par US** et réduit le plan au nombre de US que le
budget restant peut couvrir.

Le plafond de budget reste calculé sur le périmètre visé ; le plan affiche aussi le **total du projet** (`consomme_projet`
dans le JSON) quand il diffère. Les montants des messages utilisent tous la virgule décimale.

Ce sont des **estimations, pas une facture**. Sans budget (ni `--budget`, ni `autopilote.budget`), seul le plafond
de US arrête l'autopilote ; la commande le signale.

### Quand la commande refuse

La commande s'arrête avec le code 1 et un message clair, sans proposer de plan, si :

- `npx orbith check` signale au moins une erreur ;
- un document a été **modifié après sa validation** (il faut le relire et le revalider) ;
- le **budget est épuisé**, ou insuffisant pour une US de plus au coût moyen constaté ;
- le **plafond est atteint** (assez de US attendent déjà ta revue) ;
- une cible est inconnue, ou une valeur de `--max-us` / `--budget` est invalide.

## 2. L'exécution : `/orbith-autopilote`

L'agent :

1. lance `npx orbith autopilote --format json` et s'arrête si la commande refuse ;
2. te montre le plan et te demande **une seule confirmation**, que tu donnes **après** l'avoir vu (un « oui » donné d'avance ne compte pas ; l'agent reprend aussi tes options `--max-us` et `--budget`) (commits locaux, carte `Prête` → `En cours` →
   `En revue`) ;
3. pour la **première US** du plan : applique l'agent Dev (tests d'abord, code, documentation, commits locaux), lance
   les tests et `npx orbith check`, estime le coût, puis applique l'agent QA et estime le coût ;
4. **s'arrête** : la carte reste `En revue`, c'est à toi de relire.

Il s'arrête aussi **au moindre doute** : critère ambigu, choix technique structurant (il te propose 2 ou 3 options),
sujet d'architecture, test qui échoue, budget atteint.

### Ce que l'autopilote ne fait jamais

- passer une carte en `Terminée` ;
- écrire `statut: validé` ou lancer `npx orbith valider` ;
- pousser (`git push`), ouvrir une merge request, créer une version ou un tag ;
- traiter une US qui n'est pas dans le plan, ou dépasser le plafond ou le budget.

### Une US par session

Par défaut, l'autopilote traite **une seule US par session**. Après ta revue, ouvre une nouvelle session (ou tape
`/clear`) et relance-le : le plan est recalculé à chaque fois. Si tu lui demandes explicitement d'enchaîner dans la
même session, il relance la commande avant chaque US, mais le contexte s'alourdit : une session par US reste
recommandée.

## `npx orbith next` et l'autopilote

Quand au moins **deux** US sont éligibles, `npx orbith next` propose l'autopilote juste après le développement de la
première US. Avec une seule US prête, il propose simplement `/orbith-dev`.

## Exemple

```text
$ npx orbith autopilote EPIC-001 --max-us 2 --budget 5
Plan de l'autopilote (borné, sans IA)

  Périmètre : EPIC-001
  Plafond : 2 US en attente de revue au plus
  Budget IA : 0 EUR consommés sur 5 EUR (reste 5 EUR) (estimations, pas une facture)

US retenues, dans l'ordre :
  1. US-001 : Story 1 (EPIC-001)
     Dev /orbith-dev US-001 · QA /orbith-qa US-001 · puis 🔒 ta revue
  2. US-002 : Story 2 (EPIC-001)
     Dev /orbith-dev US-002 · QA /orbith-qa US-002 · puis 🔒 ta revue

US écartées :
  • US-003 : au-delà du plafond de cette exécution
```
