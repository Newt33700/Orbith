# Amélioration continue et liens de connaissance

Ce guide explique comment Orbith aide l'équipe à **ne pas perdre ses leçons** : chaque rétrospective, chaque incident
ou chaque indicateur décevant peut produire une **action d'amélioration suivie**, avec un responsable, une échéance et
un indicateur de succès. Il explique aussi comment relier entre eux les incidents, les bugs, les décisions
d'architecture (ADR), les actions et les user stories, pour retrouver « pourquoi on a fait ça ». Il s'adresse aux Scrum
Masters, aux chefs de projet, aux DevOps et aux leads tech.

Tout est **facultatif** : un projet sans action ni lien fonctionne exactement comme avant.

## Pourquoi suivre les actions

Une rétrospective ou un post-mortem qui décide d'actions sans les suivre ne change rien. Les bonnes pratiques de
gestion des services (ITIL : amélioration continue) et DORA disent la même chose : on mesure, on choisit **une**
amélioration, on la fait, on vérifie qu'elle a marché, et on recommence. Orbith rend ce cycle visible :

1. une **source** : une rétrospective, un post-mortem d'incident, ou un indicateur de `npx orbith metriques` ;
2. une **action** décidée par l'équipe (les agents proposent, l'humain choisit) ;
3. un **suivi** : `npx orbith check` signale les actions en retard, `npx orbith next` rappelle les rétrospectives et
   incidents qui n'ont produit aucune action ;
4. un **indicateur de succès** pour savoir si l'action a marché.

## Une action d'amélioration (AMEL-NNN)

Chaque action est un fichier `docs/amelioration/AMEL-NNN-<titre-court>.md`, créé à partir du modèle
`.orbith/templates/amelioration.md`. L'en-tête :

```yaml
---
id: AMEL-003
title: Alerter quand la file des paiements dépasse 100 messages
type: amelioration
statut: brouillon          # validation humaine, comme tout document Orbith
source: incident           # retro | incident | metrique
source_ref: INC-002        # document ou indicateur à l'origine de l'action
responsable: Équipe exploitation
echeance: 2026-11-15
avancement: ouvert         # ouvert | en cours | fait | abandonné
liens: [ADR-004, US-031]   # facultatif
---
```

Le corps a quatre parties : **Constat** (le fait observé, avec sa source), **Action** (ce qui sera fait),
**Indicateur de succès** (comment on saura que ça a marché) et **Suivi** (dates et avancement).

Deux champs différents, à ne pas confondre :

- `statut` dit si un humain a **relu et validé** le document (`npx orbith valider docs/amelioration/AMEL-003-alerte.md`) ;
- `avancement` dit où en est **l'action** elle-même. Il se modifie à la main (ou par un agent, sur votre réponse) sans
  invalider la validation : seul le corps du document est protégé, pas l'en-tête.

Une action qui demande du développement devient aussi une US (agent PO) : citez-la dans `liens`.

## Qui crée les actions

- **Rétrospective** (`/orbith:retro` ou `/orbith-retro`) : pour chaque action que vous retenez, l'animateur propose un
  fichier AMEL avec `source: retro` et `source_ref: retro-<version>`. Il reprend aussi les actions encore ouvertes et
  vous demande où elles en sont.
- **Post-mortem d'incident** (agent DevOps, `/orbith:devops` ou `/orbith-devops`) : après le post-mortem sans blâme, l'agent
  propose une à trois actions ; pour chaque action retenue, il écrit un fichier AMEL avec `source: incident` et
  `source_ref: INC-NNN`.
- **Indicateur** : après `npx orbith metriques` (un objectif de service non atteint, un taux d'échec qui monte), créez
  l'action vous-même ou avec le Scrum Master, avec `source: metrique` et le nom de l'indicateur dans `source_ref`.

Les agents ne devinent jamais le responsable ni l'échéance : ils vous les demandent. Ils n'écrivent jamais
`statut: validé`.

## Ce que font les commandes

| Commande | Ce qu'elle fait pour l'amélioration continue |
|---|---|
| `npx orbith check` | Rubrique « Amélioration continue » (affichée seulement si elle a quelque chose à dire) : action en retard (échéance dépassée et avancement `ouvert` ou `en cours`), responsable ou échéance manquants, avancement ou source inconnus. Ce sont des **avertissements** : ils ne font pas échouer le contrôle. |
| `npx orbith next` | Suggestions de faible priorité : faire le point sur une action en retard, valider une action, proposer une action pour un incident rétabli ou une rétrospective qui n'en a produit aucune. |
| `npx orbith trace` | Tableau « Actions d'amélioration » (source, responsable, échéance, retard, avancement, validation). |
| `npx orbith audit` | Section « Amélioration continue et liens de connaissance » du rapport HTML (actions en retard surlignées). |
| `npx orbith valider` | Valide une action comme tout autre document. |

Un incident ou une rétrospective est relié à une action quand l'action le cite (`source_ref` ou `liens`), ou quand il
cite l'action dans ses propres `liens`. Une rétrospective se désigne par le nom de son fichier sans `.md`
(`retro-1.2.0`).

## Les liens de connaissance

Ajoutez dans l'en-tête de n'importe quel document Orbith (US, bug, incident, ADR, action, demande de changement…) un
champ facultatif `liens` : la liste des identifiants auxquels il se rapporte.

```yaml
liens: [ADR-001, INC-002, US-012]
```

Orbith reprend aussi les liens déjà présents : la `cause` d'un bug (la US qui l'a introduit), la demande de changement
(`change`) d'un incident et la `source_ref` d'une action.

- `npx orbith trace` ajoute une section **Liens de connaissance** : pour chaque élément relié, ce vers quoi il mène et
  qui le cite. Elle n'apparaît que si au moins un lien existe.
- `npx orbith trace INC-002` (ou tout autre identifiant qui n'est pas une US : `ADR-001`, `AMEL-003`…) affiche le détail
  des liens de cet élément.
- `npx orbith check` signale, en avertissement (rubrique « Traçabilité »), un identifiant de `liens` ou de `source_ref`
  qui ne correspond à aucun document. Les valeurs de modèle comme `US-XXX` sont ignorées.

Exemple : le bug US-031 a pour `cause` US-012 et cite INC-002 ; le post-mortem INC-002 cite l'ADR-004 ; l'action
AMEL-003 vient de INC-002. Six mois plus tard, `npx orbith trace INC-002` retrouve toute la chaîne.

## Ce qu'il faut savoir

- **Une action se juge à son indicateur de succès**, pas à son avancement : « fait » ne veut pas dire « efficace ».
  Vérifiez l'indicateur lors de la rétrospective suivante.
- **Peu d'actions, mais suivies.** Une ou deux actions par rétrospective valent mieux que dix oubliées.
- **Sans blâme.** Une action améliore le système (processus, outils, alertes), jamais en désignant une personne.
- **Abandonner est permis.** `avancement: abandonné` arrête les rappels ; notez pourquoi dans la partie Suivi.

## Voir aussi

- [Mesurer la livraison : métriques DORA, objectifs de service et coûts IA](metriques.md) ;
- [Agents et workflows avancés](agents-avances.md) : la rétrospective ;
- [Changements et rôles](changements-roles.md) : incidents et post-mortems ;
- [Produire un rapport d'audit](audit.md).
