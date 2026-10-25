# Les plugins : Backlog.md

Un **plugin** ajoute une fonctionnalité optionnelle à Orbith. Le premier plugin officiel est **Backlog.md**, qui
affiche vos user stories dans un **tableau Kanban** dans votre navigateur.

## Qu'est-ce que Backlog.md ?

[Backlog.md](https://github.com/MrLesk/Backlog.md) est un outil libre de gestion de tâches. Il lit les fichiers de
votre projet (dans le dossier `backlog/`) et les affiche sous forme de tableau visuel. Les user stories d'Orbith
sont écrites dans le même format : aucune conversion n'est nécessaire.

Vous n'êtes pas obligé de l'utiliser. Sans lui, les stories restent des fichiers Markdown lisibles dans n'importe
quel éditeur.

## Installer le plugin

Dans le dossier du projet, lancez :

```bash
npx orbith plugin add backlog-md
```

La commande installe Backlog.md et enregistre le plugin dans la configuration du projet (`plugins: [backlog-md]`
dans `.orbith/config.yaml`).

## Ouvrir le tableau

```bash
backlog browser
```

Votre navigateur s'ouvre sur le tableau. Si ce n'est pas le cas, ouvrez l'adresse affichée dans le terminal
(elle se termine généralement par le port `6420`, par exemple `http://localhost:6420`).

Le tableau reste disponible tant que la commande tourne. Pour l'arrêter, revenez dans le terminal et tapez
`Ctrl+C`.

## Les cinq colonnes

Le tableau suit l'avancement de chaque user story :

| Colonne | Signification | Qui la déplace ? |
|---|---|---|
| **À faire** | La story est rédigée, pas encore prête à être développée | Le PO, à la création |
| **Prête** | La story est validée et sa Definition of Ready est complète : on peut la prendre | Le PO |
| **En cours** | Un développeur travaille dessus | Le développeur |
| **En revue** | Le code est prêt, il attend la revue humaine et les tests QA | Le développeur |
| **Terminée** | La story est fusionnée et livrée | Le développeur ou le lead tech |

Une story ne doit pas aller directement de **À faire** à **En cours** : elle doit d'abord être **Prête**. C'est la
règle qui garantit que l'équipe ne démarre pas une story incomplète.

## Déplacer une story

- **Dans le tableau** : glissez la carte vers la colonne voulue.
- **Dans le fichier** : modifiez la ligne `status` de l'en-tête de la story, par exemple `status: Prête`.

Les deux méthodes sont équivalentes. Orbith lit la colonne sans l'écraser.

## Où sont les stories ?

Les stories sont dans `backlog/tasks/`, un fichier par story, nommé par exemple :

```
backlog/tasks/us-012 - Connexion par email.md
```

Ne renommez pas l'identifiant (`US-012`) : Orbith et les commits s'en servent pour relier le travail à la story.

## Comment cela s'articule avec Orbith

| Action | Où la faire |
|---|---|
| Rédiger une story | Avec l'agent PO (`/orbith-po`) |
| Valider une story | `npx orbith valider backlog/tasks/us-012 - Connexion par email.md` |
| Passer une story en Prête | Dans le tableau, ou dans le fichier |
| Voir la prochaine action | `npx orbith next` |
| Vérifier la cohérence | `npx orbith check` |

La validation et la colonne sont deux choses différentes. Une story peut être **validée** (le contenu est approuvé)
et rester dans **À faire** tant que l'équipe n'a pas confirmé sa DoR. Inversement, déplacer une story dans **Prête**
sans validation n'a pas de sens : `npx orbith next` vous le signalera.

## Dépannage

**Le tableau ne s'ouvre pas.**
Vérifiez que `backlog browser` tourne toujours dans le terminal. Ouvrez manuellement l'adresse affichée. Si le port
`6420` est occupé par un autre programme, arrêtez-le ou relancez la commande après l'avoir libéré.

**Une story n'apparaît pas dans le tableau.**
Vérifiez qu'elle est bien dans `backlog/tasks/` et que son en-tête contient `type: story`. Orbith retrouve les stories
grâce à ce champ, pas grâce au nom du fichier.

**Une story est dans la mauvaise colonne.**
Vérifiez la valeur de `status` : elle doit être exactement l'une des cinq colonnes (`À faire`, `Prête`, `En cours`,
`En revue`, `Terminée`), avec les accents.

**`npx orbith plugin add backlog-md` échoue.**
Vérifiez votre connexion et la version de Node.js (22 ou plus). Relancez la commande. Si l'erreur persiste, copiez le
message complet et transmettez-le à votre référent technique.

## En résumé

- Installez le plugin : `npx orbith plugin add backlog-md`.
- Ouvrez le tableau : `backlog browser`.
- Les **personnes** déplacent les cartes, les **agents** les lisent.
- Une story passe à **Prête** seulement quand elle est validée et que sa DoR est complète.
