# Gérer les versions

Orbith t'aide à numéroter et publier une version, **sans IA** et **sans jamais rien pousser**. Tu décides toujours.

Deux commandes :

| Commande | Rôle |
|---|---|
| `npx orbith version` (sans numéro) | Propose le prochain numéro de version (SemVer) et explique pourquoi |
| `npx orbith version <numéro>` | Crée la version (`.orbith/versions.json`) et son brouillon de notes : voir le guide PO. `release` reprend ensuite ces notes |
| `npx orbith release <version>` | Prépare la version : notes, `CHANGELOG.md`, tag Git local |

## 1. Choisir le numéro : `orbith version`

La proposition vient de deux sources :

- les **commits** (Conventional Commits) depuis le dernier tag `vX.Y.Z` ;
- les **US** terminées et pas encore mises en production. Une US déjà citée dans les notes d'une version publiée
  (tag existant) n'est plus comptée, même avant `orbith deploiement`.

| Signal | Effet |
|---|---|
| Commit `feat…` ou US terminée (non étiquetée `bug`) | version **mineure** (1.2.0 → 1.3.0) |
| Commit `fix…` ou US étiquetée `bug` | version **correctif** (1.2.0 → 1.2.1) |
| Commit avec `!` (`feat(US-012)!: …`), pied de commit `BREAKING CHANGE:` ou US étiquetée `breaking` | version **majeure** (1.2.0 → 2.0.0) |

Une US terminée étiquetée `bug` ne donne donc pas une mineure mais un correctif. Le plus fort l'emporte. Les autres types (`docs`, `chore`, `refactor`…) ne changent pas le numéro à eux seuls.
Sans tag existant, le calcul part de 0.0.0. Seuls les tags atteignables depuis la branche courante comptent : sur une branche de maintenance, un tag plus récent d'une autre branche est ignoré pour le calcul, mais il empêche toujours de recréer le même tag.

Pour marquer une rupture sur une US, ajoute l'étiquette `breaking` dans ses `labels` :

```yaml
labels: [breaking]
```

`npx orbith version --format json` donne le même résultat pour un script. C'est une **proposition** : rien n'est écrit.

## 2. Préparer la version : `orbith release <version>`

```bash
npx orbith release 1.3.0
```

1. **Notes de version.** Si `docs/livraisons/release-notes-1.3.0.md` n'existe pas, Orbith crée un brouillon à partir des
   US terminées, avec deux parties : **Pour les utilisateurs** (nouveautés, corrections, limites) et **Pour l'exploitation**
   (changements à connaître, déploiement et retour arrière, surveillance). Relis-le, complète-le, puis valide-le :
   `npx orbith valider docs/livraisons/release-notes-1.3.0.md`. La commande s'arrête là.
2. **Garde-fous.** Relancée, la commande **refuse** la version (et liste tous les blocages) si :
   - une US citée dans les notes n'est pas **Terminée** ;
   - `npx orbith check` signale une erreur ;
   - les notes de version ne sont **pas validées** par un humain ;
   - le numéro n'est pas supérieur au dernier tag, ou le tag existe déjà.
3. **Confirmation humaine.** Orbith montre la section du changelog et demande confirmation. Après ton accord, il :
   - ajoute la section en tête de `CHANGELOG.md` (créé si besoin, fins de ligne du fichier conservées) ;
   - enregistre dans un commit `chore(release): v1.3.0` `CHANGELOG.md` et, s'ils ne sont pas encore commités, les notes
     de version et `.orbith/validations.json` (le tag contient ainsi les notes et leur validation). Tes autres
     fichiers, modifiés ou indexés, ne sont pas touchés ;
   - crée le tag annoté `v1.3.0` **en local**.

   Si le commit échoue (hook `pre-commit`, par exemple), `CHANGELOG.md` est remis dans son état d'avant et aucun tag
   n'est créé : corrige le problème et relance. Si une US citée dans les notes a des modifications non commitées,
   Orbith te prévient (le tag contiendra sa dernière version commitée). Il te prévient aussi quand le changelog
   reprend des commits d'US pas encore terminées.

Le commit `chore(release): v1.3.0` ne porte pas d'identifiant d'US (`US-NNN`). Il peut donc apparaître comme
**avertissement** de traçabilité dans `npx orbith check` (« Commit … sans identifiant de story »). C'est attendu : c'est
un commit technique de version, rien à corriger ni à réécrire.

Orbith **ne pousse jamais**. Il t'indique la commande à lancer toi-même : `git push && git push origin v1.3.0`.

### Options

| Option | Effet |
|---|---|
| `--yes` | Pas de question (réservé à un humain qui lance un script) |
| `--sans-tag` | Écrit seulement `CHANGELOG.md` : ni commit ni tag. Orbith affiche ensuite les commandes `git add`, `git commit` et `git tag` à lancer toi-même (commite avant de taguer, sinon le tag ne contient pas le changelog) |
| `--dry-run` | Affiche le changelog prévu sans rien écrire (le brouillon de notes n'est pas créé non plus) |
| `--date AAAA-MM-JJ` | Date de la version (aujourd'hui par défaut, date locale) |
| `--cwd <dir>` | Dossier de travail (le projet Orbith à utiliser, au lieu du dossier courant) |

Orbith n'écrase jamais un fichier `docs/livraisons/release-notes-<version>.md` existant : s'il n'est pas reconnu
comme notes de cette version (en-tête `type: release-notes` et `version`), la commande s'arrête et te le dit.

## Ensuite

Après la vraie mise en production, enregistre-la : `npx orbith deploiement 1.3.0` (voir [métriques](metriques.md)).
