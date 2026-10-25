# Guide du Product Owner et du chef de projet

Ce guide décrit votre parcours : transformer une idée en user stories prêtes à être développées. Il s'adresse
aux Product Owners (PO) et aux chefs de projet.

Vous travaillez avec l'agent **PO** (Paola) : `/orbith:po` dans Gemini CLI, `/orbith-po` dans Claude Code.

## Le parcours en un coup d'œil

```
Brief  →  PRD  →  Epics  →  User stories  →  Critères Gherkin  →  DoR  →  Prête
  🔒       🔒       🔒            🔒
```

Chaque 🔒 est une **validation humaine** : l'agent rédige, vous relisez, puis vous validez avec
`npx orbith valider <fichier>`. Tant qu'une étape n'est pas validée, l'agent ne passe pas à la suivante.

Pour une fonctionnalité dans un produit existant, vous commencez directement aux epics ou aux stories.

## Étape 1 : le brief

Le **brief** résume l'idée : pourquoi, pour qui, quel résultat attendu. Décrivez votre besoin en vos mots :

```
/orbith-po je veux une application pour réserver les salles de réunion. Nous sommes 400 salariés
sur trois sites. Aujourd'hui on réserve par email et c'est le chaos.
```

L'agent vous pose des questions, **une à la fois**. Quand il a assez d'éléments, il rédige
`docs/produit/brief.md` avec le statut `brouillon`. Relisez-le, demandez des corrections, puis validez :

```bash
npx orbith valider docs/produit/brief.md
```

## Étape 2 : le PRD

Le **PRD** (document des besoins produit) détaille ce que le produit doit faire, ce qui est prioritaire et ce
qui est hors périmètre.

```
/orbith-po rédige le PRD à partir du brief validé
```

L'agent refuse de commencer tant que le brief n'est pas validé. Pour les choix importants, il propose deux ou
trois options : **vous décidez**. Validez ensuite `docs/produit/prd.md`.

## Étape 3 : les epics

Un **epic** regroupe des user stories autour d'un même objectif. Pour un PRD, on obtient en général 3 à 6 epics.

```
/orbith-po découpe le PRD en epics
```

Chaque epic est un fichier dans `docs/produit/epics/`, par exemple `EPIC-001-reservation.md`.

## Étape 4 : les user stories

Une **user story** (US) est une petite fonctionnalité vue par l'utilisateur, au format « En tant que… je veux…
afin de… ».

```
/orbith-po écris les user stories de l'epic EPIC-001
```

Les stories sont créées dans `backlog/tasks/` avec le statut `brouillon`. Une bonne story est **petite** (réalisable
en quelques jours), **claire** (un lecteur non technique la comprend) et **testable** (on sait dire si elle réussit).

## Étape 5 : les critères d'acceptation en Gherkin

Les **critères d'acceptation** disent quand la story est réussie. Orbith les écrit en **Gherkin** : chaque scénario
se lit comme une phrase (Étant donné, Quand, Alors). Voici une story complète, telle que l'agent la rédige.

````markdown
---
type: story
id: US-012
title: Connexion par email
status: À faire
statut: brouillon
epic: EPIC-001
---

## Description

En tant qu'employé, je veux me connecter avec mon adresse email professionnelle,
afin d'accéder à mon espace de réservation.

## Critères d'acceptation

```gherkin
Fonctionnalité: Connexion par email

  Scénario: Connexion réussie
    Étant donné un employé inscrit avec l'email "prenom.nom@entreprise.fr"
    Quand il saisit cet email et le bon mot de passe
    Alors il accède à la page d'accueil de son espace

  Scénario: Mot de passe incorrect
    Étant donné un employé inscrit avec l'email "prenom.nom@entreprise.fr"
    Quand il saisit cet email et un mot de passe erroné
    Alors un message d'erreur s'affiche
    Et il reste sur la page de connexion
```

## Definition of Ready

- [ ] La story est validée par le PO
- [ ] Les critères d'acceptation sont en Gherkin
- [ ] Les dépendances sont identifiées
````

Ce qu'il faut remarquer :

- Le **titre** est court et parle du résultat.
- Chaque **scénario** couvre un cas nominal (tout va bien) et au moins un cas d'erreur.
- Les phrases restent **observables** : « un message d'erreur s'affiche », jamais « le code vérifie le hash ».

## Étape 6 : la Definition of Ready (DoR)

La **DoR** est la liste des conditions à remplir avant qu'un développeur prenne une story. Elle est définie dans
`.orbith/config/dor.md`, que votre équipe peut adapter. Vérifiez-la avec l'agent :

```
/orbith-po vérifie la DoR de US-012
```

## Étape 7 : passer la story en « Prête »

Quand la story est validée **et** que sa DoR est complète, un humain la déplace dans la colonne **Prête**. C'est le
signal donné à l'équipe technique.

- Avec le plugin Backlog.md : glissez la carte dans la colonne **Prête** (voir [plugins.md](plugins.md)).
- Sans plugin : changez la valeur `status` de l'en-tête en `Prête`.

Pour connaître la prochaine action à tout moment, lancez `npx orbith next`.

## Avant de passer la main à l'équipe technique

- **Une passe critique** avant de valider un PRD, une epic ou une story : `/orbith-relecture-adverse <fichier>`
  (voir [agents-avances.md](agents-avances.md)).
- **Vérifiez la cohérence de l'ensemble** (brief, PRD, architecture, epics, stories, dépendances), sans IA :
  `npx orbith preparation`. Le verdict est PASS, CONCERNS ou FAIL (voir
  [contexte-preparation.md](contexte-preparation.md)).
- **Le besoin change en cours de route ?** `/orbith-changement-de-cap` mesure l'impact sur les epics et les stories
  avant toute modification.

## Points de vigilance

- **Pas de données réelles** dans les échanges : noms de clients, adresses, données de production. Utilisez des
  exemples fictifs.
- **Un sujet par session.** Pour une nouvelle demande, ouvrez une nouvelle session ou tapez `/clear`.
- **Relisez avant de valider.** La validation engage l'équipe. Si un document change après validation, Orbith le
  signale.

Suite du parcours : [guide-dev.md](guide-dev.md).
