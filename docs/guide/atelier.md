# L'atelier : plusieurs agents ensemble

Certains sujets touchent plusieurs métiers à la fois : une nouvelle fonctionnalité concerne le produit, l'UX, la
technique et les tests. L'**atelier** permet de réunir plusieurs agents dans une même session, pour qu'ils
discutent, confrontent leurs points de vue, et vous proposent une décision commune.

Lancez-le avec `/orbith:atelier` dans Gemini CLI, ou `/orbith-atelier` dans Claude Code.

## À quoi ça sert ?

Un atelier est utile pour :

- cadrer une idée floue avant d'écrire le brief ;
- comparer des options techniques (par exemple deux façons de stocker les réservations) ;
- préparer une revue : le PO, le QA et le développeur relisent ensemble une story ;
- arbitrer un sujet qui touche à plusieurs domaines.

Ce n'est pas un outil pour produire un document final. Le résultat d'un atelier est une **synthèse** et des
**décisions proposées**. Les documents qui en découlent sont rédigés par l'agent compétent (le PO pour le PRD,
l'architecte pour un ADR), puis validés par une personne.

## Un exemple pas à pas

Imaginons que vous hésitiez à permettre la réservation de salles « à la volée », sans créneau fixe. Vous lancez :

```
/orbith-atelier sujet : faut-il autoriser la réservation de salles sans créneau fixe ?
Participants : PO, architecte, UX, QA.
```

L'atelier se déroule en plusieurs tours :

1. **Présentation du sujet** : l'atelier reformule la question et rappelle le contexte (brief, PRD, contraintes du
   CSR si elles sont pertinentes).
2. **Positions** : chaque agent donne son point de vue, dans son domaine.
   - Le **PO** met en avant la simplicité pour les utilisateurs et le risque de conflits de réservation.
   - L'**architecte** souligne la complexité technique et la nécessité d'une règle de non-chevauchement.
   - L'**UX** propose un écran avec un sélecteur de durée, et signale les cas d'erreur à prévoir.
   - Le **QA** liste les scénarios à tester : réservations simultanées, durée minimale, annulation.
3. **Échanges** : les agents se répondent, précisent les désaccords et les points à trancher.
4. **Synthèse** : l'atelier vous présente deux ou trois options, avec leurs avantages, leurs risques et les
   documents concernés.

Vous choisissez l'option. L'atelier **ne tranche jamais seul** : la décision vous appartient.

Une fois la décision prise, la suite se fait dans une **nouvelle session** :

```
/orbith-archi rédige un ADR pour la règle de non-chevauchement des réservations
```

## Comment s'y prendre

- **Donnez un sujet précis.** « Améliorer la réservation » est trop vague. « Faut-il permettre l'annulation
  jusqu'à la veille ? » est un bon sujet.
- **Limitez le nombre de participants.** Deux à quatre agents suffisent. Plus il y en a, plus le débat est long et
  moins il est lisible.
- **Précisez le contexte** utile : une contrainte, un chiffre, une décision déjà prise.
- **Demandez une synthèse écrite** à la fin si vous voulez la garder. Copiez-la ensuite dans le document concerné,
  en gardant à l'esprit qu'elle reste un brouillon à relire.

## Règles à respecter

- **Une session, un sujet.** Ne mélangez pas plusieurs sujets dans un même atelier. Ouvrez une nouvelle session
  (ou tapez `/clear`) pour chaque nouveau sujet.
- **Ne donnez pas de données sensibles** pendant l'atelier : noms de clients, données de production, secrets.
- **Un atelier n'est pas une validation.** Même si tout le monde est d'accord dans l'atelier, le document qui
  en sort doit être relu et validé avec `npx orbith valider`.
- **Lisez les positions**, pas seulement la conclusion. Un désaccord mal compris peut coûter cher plus tard.

## Pourquoi un atelier plutôt qu'une question à un seul agent ?

| Un agent seul | Un atelier |
|---|---|
| Répond depuis un seul point de vue | Croise plusieurs points de vue métier |
| Va vite pour une question simple | Plus long, mais mieux adapté à un arbitrage |
| Peut oublier un risque | Chaque agent pose les questions de son domaine |

Pour une question simple (« rédige-moi cette story »), un agent seul suffit. Réservez l'atelier aux décisions qui
engagent plusieurs métiers.

## En résumé

1. Donnez un **sujet précis** et les **participants** utiles.
2. Lisez les **positions** et les **options** proposées.
3. **Décidez** vous-même.
4. Passez au document concerné dans une **nouvelle session**, puis validez-le.
