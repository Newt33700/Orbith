# Guide DevOps : environnements et pipeline

Ce guide décrit votre parcours avec l'agent **DevOps** : décrire vos environnements, puis faire écrire le pipeline
qui teste et déploie l'application. Il s'adresse aux personnes qui gèrent l'infrastructure, aux leads tech et à
toute personne qui prépare les déploiements.

Vous travaillez avec l'agent **DevOps** (Dora, `/orbith:devops` ou `/orbith-devops`).

## Pourquoi cette étape ?

Vos environnements ne sont presque jamais identiques : la **recette** n'a pas les mêmes données que la production,
la **préprod** n'a pas les mêmes accès, et seule la **production** exige une validation humaine avant chaque
déploiement. Si on ne le note nulle part, chaque déploiement devient une surprise.

Dora commence donc par **décrire** ces différences, vous les **validez**, et seulement ensuite elle écrit le pipeline.

## Le parcours en un coup d'œil

```
Architecture validée  →  Environnements (brouillon)  →  Relecture  →  Validation 🔒  →  Pipeline (merge request)  →  Relecture 🔒
                                                                                                                  ↓
                                                                              Variables et environnements protégés dans GitLab
```

Les 🔒 sont les **validations humaines** : aucun document n'est validé à votre place et aucun pipeline n'est fusionné
sans une personne qui le relit.

## Ce qu'il faut avant de commencer

- Une **architecture validée** (`docs/architecture/architecture.md` avec `statut: validé`). Sinon, Dora s'arrête et
  vous renvoie vers l'architecte.
- Un **référentiel technique** (CSR) renseigné : il dit quel outil d'intégration continue vous utilisez (par exemple
  GitLab CI) et quelles versions sont autorisées.
- Un accès à **GitLab** (ou à l'outil CI de votre CSR) avec les droits de configurer les variables et les
  environnements du projet.

## Étape 1 : décrire les environnements

Ouvrez une nouvelle session (ou tapez `/clear`), puis lancez l'agent :

```
/orbith-devops
```

Dora pose **une question à la fois**. Pour chaque environnement, elle vous demande notamment :

- son nom et son rôle, et qui l'utilise ;
- où il tourne (hébergement, infrastructure) et son adresse d'accès ;
- ce qui le **différencie** : configuration, fonctionnalités activées ;
- ses **données** : réelles, ou fictives et anonymisées ;
- où sont stockés les **secrets** (elle ne demande jamais les valeurs, seulement les noms) ;
- ce qui déclenche le **déploiement** (une fusion, un tag de version, un lancement manuel) ;
- **qui valide** ce déploiement ;
- comment revenir en arrière (le **retour arrière**, ou *rollback*).

Si vous ne savez pas répondre, dites-le : Dora écrit « À confirmer » et ne devine rien.

Elle vous propose ensuite 2 ou 3 options pour les choix structurants, par exemple « déploiement à chaque fusion sur la
branche principale » ou « déploiement seulement sur un tag de version ». **C'est vous qui décidez.**

Dora écrit alors `docs/architecture/environnements.md` avec `statut: brouillon`, puis le passe en `en-revue`.

## Étape 2 : relire et valider les environnements

Relisez le document, en particulier les points marqués « À confirmer ». Puis, dans votre terminal :

```bash
npx orbith valider docs/architecture/environnements.md
```

Orbith vous demande de confirmer que vous avez relu. Tant que cette commande n'a pas été lancée par une personne, la
suite est bloquée : **Dora ne touche jamais au pipeline d'un document non validé.**

Si vous modifiez ce document après sa validation, Orbith vous le signalera (`npx orbith next`) : il faudra le
re-valider.

## Étape 3 : faire écrire le pipeline

Une fois les environnements validés, ouvrez **une nouvelle session** et relancez l'agent :

```
/orbith-devops
```

Dora propose d'abord 2 ou 3 structures de pipeline (un seul fichier, un fichier avec des modèles partagés, ou un
pipeline par environnement), avec leurs avantages et leurs limites. Vous choisissez.

Elle écrit ensuite `.gitlab-ci.yml`, avec quelques règles qui ne se discutent pas :

- le job **`orbith-check`** reste en place : il vérifie la conformité, les validations et l'absence de secrets ;
- **aucun déploiement** si un test ou `orbith-check` échoue ;
- **la production est déployée à la main**, dans un environnement protégé ;
- **aucun secret et aucune adresse réelle** dans le fichier : il utilise des variables (`$NOM_DE_LA_VARIABLE`).

Elle ne pousse rien. Le commit reste local jusqu'à ce que vous décidiez de le pousser et d'ouvrir une
**merge request**.

## Étape 4 : relire la merge request

C'est votre deuxième validation humaine. Relisez le fichier `.gitlab-ci.yml` et vérifiez :

- que les déploiements de production sont bien **manuels** ;
- qu'aucune valeur sensible n'apparaît dans le fichier ;
- que le job `orbith-check` n'a pas été modifié.

## Étape 5 : configurer GitLab vous-même

Dora ne peut pas le faire à votre place. À la fin de sa réponse, elle liste :

1. **Les variables à créer** (Settings > CI/CD > Variables), **noms seulement** dans la liste. Pour chaque variable,
   cochez **masquée** (elle n'apparaît pas dans les journaux) et **protégée** quand elle concerne la production.
   Les valeurs, vous les saisissez vous-même ; elles ne sont jamais écrites dans un fichier ni dans une conversation.
2. **Les environnements protégés** (Settings > CI/CD > Protected environments) : qui a le droit de déployer en
   production.

Sans ces étapes, les déploiements échoueront, ou pire, ne seront pas contrôlés.

## Exemple de dialogue

Voici à quoi ressemble un début d'échange :

> **Dora** — Bonjour, je suis Dora, l'ingénieure DevOps d'Orbith. Je vais décrire vos environnements avec vous, une
> question à la fois. Combien d'environnements utilisez-vous aujourd'hui, et comment s'appellent-ils ?
>
> **Vous** — Trois : dev, recette et production.
>
> **Dora** — Merci. Pour *dev*, qui l'utilise : uniquement l'équipe de développement ?
>
> **Vous** — Oui, et seulement l'équipe.
>
> **Dora** — Je note : *dev*, utilisé par l'équipe de développement. Sur quelle infrastructure tourne-t-il ?
>
> **Vous** — Je ne sais pas, c'est un prestataire qui gère ça.
>
> **Dora** — D'accord, j'écris « À confirmer » et j'ajoute la question à la liste des points à confirmer, avec le nom
> du prestataire comme personne à interroger.

## Ce qui n'est jamais fait par l'agent

- Déployer, ou lancer une commande de déploiement.
- Pousser du code ou valider un document à votre place.
- Écrire un mot de passe, un jeton, une clé ou une adresse de production dans un fichier.
- Décider seul de la stratégie de déploiement.

💡 Tâche terminée ? Ouvrez une **nouvelle session** (ou tapez `/clear`) avant la suivante : l'agent repart avec un
contexte propre et reste performant.
