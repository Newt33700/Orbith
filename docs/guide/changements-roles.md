# Changements et rôles : demande de changement, matrice des rôles, quatre yeux

Ce guide explique trois garde-fous **facultatifs** qui renforcent la gouvernance d'un projet Orbith : la **demande de
changement** (inspirée d'ITIL), la **matrice des rôles** (qui peut valider quoi) et le **principe des quatre yeux**.
Ils s'adressent aux chefs de projet, aux équipes DevOps et aux auditeurs. **Tout est désactivé par défaut** : un projet
existant continue de fonctionner exactement comme avant tant que vous n'ajoutez pas les clés décrites ici.

## La demande de changement

Une **demande de changement** (en anglais *RFC*, *request for change*) décrit une modification de la production
**avant** qu'elle ait lieu : ce qu'on change, le risque, la fenêtre de déploiement, qui approuve et comment revenir en
arrière si cela se passe mal.

### Créer la demande

Demandez à l'agent **DevOps** (`/orbith:devops` ou `/orbith-devops`) de la rédiger à partir du modèle
`.orbith/templates/change.md`. Elle se range dans `docs/livraisons/changes/CHG-NNN-*.md`, par exemple
`docs/livraisons/changes/CHG-001-1.4.0.md`.

| Champ | Valeurs | Rôle |
|---|---|---|
| `changement` | `standard`, `normal`, `urgent` | `standard` : routine déjà approuvée une fois pour toutes. `normal` : évalué et approuvé cas par cas. `urgent` : correctif pressé. |
| `risque` | `faible`, `moyen`, `élevé` | Niveau de risque évalué par l'équipe |
| `version` | `1.4.0` | Version concernée, la même que dans les notes de version |
| `fenetre_debut`, `fenetre_fin` | dates et heures | Fenêtre de déploiement (inutile pour un changement `standard`) |
| `approbateurs` | noms git ou emails | Personnes qui doivent approuver (inutile pour `standard`) |

Le corps du document contient la description, l'évaluation du risque, le plan de déploiement, le **plan de retour
arrière** (obligatoire), les vérifications après déploiement et la communication.

### La faire approuver

L'approbation est une **validation humaine** comme les autres :

```bash
npx orbith valider docs/livraisons/changes/CHG-001-1.4.0.md
```

Si `approbateurs` n'est pas vide, seules ces personnes peuvent la valider.

### Exiger une demande avant la mise en production

Ajoutez dans `.orbith/config.yaml` :

```yaml
changements:
  exiger_pour_deploiement: true
```

Désormais `npx orbith deploiement <version>` (environnement `production`) refuse d'enregistrer la mise en production
tant qu'aucune demande de changement **validée** ne porte la même `version`. Le numéro de la demande est conservé dans
`.orbith/deploiements.json`. `npx orbith next` vous indique quand créer ou valider la demande.

### Contrôles et traçabilité

- `npx orbith check` signale (avertissements) une demande incomplète : type ou risque inconnu, version absente, plan de
  retour arrière vide, fenêtre ou approbateurs manquants.
- `npx orbith trace` ajoute un tableau « Demandes de changement » (type, risque, version, fenêtre, validée par, US
  concernées si le texte cite leur identifiant).
- `npx orbith audit` liste les demandes avec les autres documents validés.

## Incident et post-mortem sans blâme

Le modèle `.orbith/templates/incident.md` (à ranger dans `docs/livraisons/incidents/INC-NNN-*.md`) structure un
post-mortem **sans blâme** : on cherche ce que le système a rendu possible, pas qui s'est trompé. Il se valide comme
tout autre document et peut citer la demande de changement à l'origine de l'incident (`change: CHG-001`).

## La matrice des rôles

Par défaut, n'importe quelle personne disposant d'une identité git peut valider un document. La matrice limite chaque
type de document à une liste de personnes, désignées par leur **email** ou leur **nom git** (sans tenir compte des
majuscules) :

```yaml
roles:
  valideurs:
    prd: [alice@societe.fr, "Bob Martin"]
    architecture: [carole@societe.fr]
    change: [exploitation@societe.fr]
    "*": [direction@societe.fr]      # tous les autres types (facultatif)
```

Les types sont ceux du champ `type` des documents : `brief`, `prd`, `ux`, `architecture`, `adr`, `epic`, `story`,
`release-notes`, `environnements`, `change`, `incident`. Un type absent de la matrice (et sans entrée `"*"`) reste
libre.

- `npx orbith valider` refuse la validation si la personne n'est pas dans la liste.
- `npx orbith check` signale en **erreur** un document validé par quelqu'un qui n'est pas (ou plus) dans la liste.

## Le principe des quatre yeux

Une personne ne devrait pas valider ce qu'elle a elle-même écrit. Activez :

```yaml
roles:
  quatre_yeux: true
```

`npx orbith valider` compare alors la personne qui valide à l'**auteur du dernier commit** du fichier (même email ou même
nom git) et refuse s'il s'agit de la même personne : le document doit être relu par quelqu'un d'autre. Si le fichier
n'a encore aucun commit, la validation est acceptée (l'auteur est inconnu). Orbith note l'auteur dans le registre
`.orbith/validations.json`, ce qui permet à `npx orbith check` de signaler plus tard (erreur) une validation qui
aurait contourné la règle.

## Bon à savoir

- Les trois garde-fous sont indépendants : activez seulement ce dont votre organisation a besoin.
- Pensez à **valider les modifications de `.orbith/config.yaml` en revue de code** : c'est lui qui porte les règles.
- Ces contrôles s'appuient sur l'identité git (`git config user.name`, `user.email`) : ils renforcent un processus
  humain, ils ne remplacent pas le contrôle d'accès de votre plateforme (branches protégées, revues obligatoires).
