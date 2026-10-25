# Gérer les versions

Orbith t'aide à numéroter et publier une version, **sans IA** et **sans jamais rien pousser**. Tu décides toujours.

Deux commandes :

| Commande | Rôle |
|---|---|
| `npx orbith version` | Propose le prochain numéro de version (SemVer) et explique pourquoi |
| `npx orbith release <version>` | Prépare la version : notes, `CHANGELOG.md`, tag Git local |

## 1. Choisir le numéro : `orbith version`

La proposition vient de deux sources :

- les **commits** (Conventional Commits) depuis le dernier tag `vX.Y.Z` ;
- les **US** terminées et pas encore mises en production.

| Signal | Effet |
|---|---|
| Commit `feat…` ou US terminée | version **mineure** (1.2.0 → 1.3.0) |
| Commit `fix…` ou US étiquetée `bug` | version **correctif** (1.2.0 → 1.2.1) |
| Commit avec `!` (`feat(US-012)!: …`), pied de commit `BREAKING CHANGE:` ou US étiquetée `breaking` | version **majeure** (1.2.0 → 2.0.0) |

Le plus fort l'emporte. Les autres types (`docs`, `chore`, `refactor`…) ne changent pas le numéro à eux seuls.
Sans tag existant, le calcul part de 0.0.0.

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
   - ajoute la section en tête de `CHANGELOG.md` (créé si besoin) ;
   - enregistre ce seul fichier dans un commit `chore(release): v1.3.0` ;
   - crée le tag annoté `v1.3.0` **en local**.

Orbith **ne pousse jamais**. Il t'indique la commande à lancer toi-même : `git push && git push origin v1.3.0`.

### Options

| Option | Effet |
|---|---|
| `--yes` | Pas de question (réservé à un humain qui lance un script) |
| `--sans-tag` | Écrit seulement `CHANGELOG.md` : ni commit ni tag |
| `--dry-run` | Affiche le changelog prévu sans rien écrire (le brouillon de notes n'est pas créé non plus) |
| `--date AAAA-MM-JJ` | Date de la version (aujourd'hui par défaut) |

## Ensuite

Après la vraie mise en production, enregistre-la : `npx orbith deploiement 1.3.0` (voir [métriques](metriques.md)).
