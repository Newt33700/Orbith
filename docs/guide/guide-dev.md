# Guide du lead tech et du développeur

Ce guide décrit votre parcours : prendre une user story validée et prête, la développer, la tester, la livrer, avec
une trace complète. Il s'adresse aux leads tech et aux développeurs.

Vous travaillez avec les agents **Dev** (Dani, `/orbith:dev` ou `/orbith-dev`) et **QA** (Quentin, `/orbith:qa` ou `/orbith-qa`).

## Le parcours en un coup d'œil

```
Story Prête  →  Branche  →  Tests (Gherkin)  →  Code + commits  →  check  →  En revue  →  Revue humaine  →  Terminée
                                                                                  🔒
```

Le 🔒 est la **revue humaine** : une personne relit le code et les tests avant la fusion.

## Étape 1 : choisir une story Prête

Une story est prête lorsqu'elle est dans la colonne **Prête** du tableau (ou que son statut est `Prête`) et
qu'elle est **validée** (`statut: validé`). Vérifiez-le :

```bash
npx orbith next
```

Orbith indique la story à prendre et la commande à lancer. Avant le premier développement, vérifiez aussi la
cohérence de la chaîne brief → PRD → architecture → epics → stories (voir
[contexte-preparation.md](contexte-preparation.md)) :

```bash
npx orbith preparation
```

## Étape 2 : passer la story en « En cours »

Déplacez la story dans la colonne **En cours** (ou changez son `status` en `En cours`). Cela indique à l'équipe
que vous la prenez.

Créez une branche Git dédiée, avec l'identifiant de la story :

```bash
git checkout -b feat/US-012-connexion-email
```

## Étape 3 : lancer l'agent Dev

Ouvrez une nouvelle session (ou `/clear`), puis :

```
/orbith-dev US-012
```

L'agent Dev commence par lire la story et vérifie la **Definition of Ready**. Si une condition manque, il s'arrête
et vous le dit. Il ne développe jamais une story non validée.

Ensuite, il vous propose un plan (fichiers à modifier, approche). Relisez-le. Vous pouvez demander des
alternatives : l'agent présente souvent deux options pour les choix structurants et attend votre décision.

## Étape 4 : écrire les tests à partir du Gherkin

Les critères d'acceptation de la story sont la base des tests. Commencez par générer les squelettes, sans IA :

```bash
npx orbith tests US-012
```

La commande crée `tests/features/us-012.feature`, copie fidèle des critères Gherkin. Elle ne traite que les
stories **validées** et ne réécrit jamais un fichier existant (sauf avec `--force`). Sans identifiant, elle
traite toutes les stories validées.

Demandez ensuite à l'agent QA (ou dev) d'écrire les définitions d'étapes qui rendent ces scénarios exécutables :

```
/orbith-qa écris les définitions d'étapes de US-012
```

Chaque scénario devient un test. Les fichiers portent le marqueur de la story (`@US-012`), ce qui permet la
traçabilité.

Un exemple de scénario traduit en test automatisé :

```gherkin
@US-012
Fonctionnalité: Connexion par email

  Scénario: Mot de passe incorrect
    Étant donné un employé inscrit avec l'email "prenom.nom@entreprise.fr"
    Quand il saisit cet email et un mot de passe erroné
    Alors un message d'erreur s'affiche
```

Lancez les tests **avant** de coder : ils doivent échouer, puisque la fonctionnalité n'existe pas encore. Ils
réussiront au fil de votre développement.

## Étape 5 : développer et committer

Développez par petites étapes. À chaque étape utile, faites un commit dont le message commence par le type de
changement et l'identifiant de la story, entre parenthèses :

```bash
git commit -m "feat(US-012): ajoute le formulaire de connexion"
git commit -m "feat(US-012): vérifie le mot de passe côté serveur"
git commit -m "test(US-012): ajoute les scénarios de connexion"
```

Pourquoi ? Orbith relie chaque commit à sa story. `npx orbith trace US-012` affichera la liste.

**Mettez à jour la documentation dans la même story** : README, guides, documentation technique, commentaires du
code, et ce qui doit figurer dans les notes de version (section `## Notes techniques` de la story). L'agent Dev le
fait systématiquement (règle `.orbith/rules/documentation.md`) et vous indique les fichiers modifiés, ou pourquoi
aucune documentation n'est concernée :

```bash
git commit -m "docs(US-012): documente la connexion par email dans le README"
```

## Étape 6 : contrôler le projet

Avant de demander une revue, lancez les contrôles :

```bash
npx orbith check
```

La commande vérifie :

- le **CSR** : les outils, bibliothèques et versions sont conformes au référentiel de l'entreprise ;
- les **validations** : aucun document validé n'a été modifié depuis, les registres n'ont pas été retouchés à la
  main (voir [integrite-sbom.md](integrite-sbom.md)) et, si elles sont activées, les règles de rôles sont
  respectées (voir [changements-roles.md](changements-roles.md)) ;
- la **traçabilité** : les commits récents mentionnent une story ;
- la **documentation** : une story dont les commits modifient du code (`src/`) sans aucun fichier de documentation
  est signalée (avertissement ; `documentation: non-concernée` dans l'en-tête de la story si rien n'est à
  documenter) ;
- les **secrets** : aucun mot de passe ou clé d'API n'est versionné ;
- les **licences** des dépendances, si une politique est déclarée (voir [integrite-sbom.md](integrite-sbom.md)).

Une **erreur** fait échouer la commande (code de sortie 1). Un **avertissement** est signalé, sans bloquer.
Corrigez les erreurs avant de continuer. Pour les règles de référentiel, lisez [csr.md](csr.md).

## Étape 7 : passer en revue

Quand tous les tests passent et que `npx orbith check` ne signale pas d'erreur :

1. Poussez votre branche et ouvrez une **merge request** (ou pull request) dans GitLab.
2. Déplacez la story dans la colonne **En revue**.
3. Demandez à l'agent QA de vérifier la couverture des critères :

   ```
   /orbith-qa vérifie que US-012 couvre tous ses critères d'acceptation
   ```

4. Un **relecteur humain** (un autre développeur ou le lead tech) relit le code. C'est la 🔒 revue humaine :
   personne ne fusionne seul son propre travail.

Si la revue demande des changements, corrigez, committez, et relancez `npx orbith check`.

## Étape 8 : livrer

Une fois la merge request fusionnée :

- la story passe en **Terminée** ;
- le Scrum Master (`/orbith-sm`) peut préparer les **notes de version**, qui listent les stories livrées ;
- `npx orbith version` propose le numéro de version et `npx orbith release <version>` prépare le `CHANGELOG.md` et
  le tag Git (voir [versions.md](versions.md)) ;
- après la mise en production réelle, un humain lance `npx orbith deploiement <version>` (voir
  [metriques.md](metriques.md)).

Lancez `npx orbith trace US-012` pour vérifier que la chaîne est complète : story, validation, commits, tests,
notes de version.

## Ce qu'il faut éviter

- **Coder une story non validée.** L'agent Dev refuse, et c'est une bonne chose.
- **Un commit sans identifiant** de story sur le travail en cours : il sera signalé par `npx orbith check`.
- **Demander à l'agent Dev de pousser** (`git push`) : il refuse, même sur demande. C'est vous qui poussez et ouvrez la
  merge request, après votre revue ; l'agent peut vous donner la commande.
- **Un secret dans le code** (mot de passe, clé), même « temporairement ».
- **Enchaîner plusieurs stories dans la même session.** Ouvrez une nouvelle session (`/clear`) pour chaque story.
- **Livrer du code sans sa documentation** : un README ou un guide qui décrit l'ancien comportement induit l'équipe en
  erreur.

## Pour aller plus loin

- [validation-humaine.md](validation-humaine.md) : statuts et validations.
- [csr.md](csr.md) : le référentiel technique et son contrôle en CI.
- [plugins.md](plugins.md) : le tableau Kanban Backlog.md.
- [agents-avances.md](agents-avances.md) : Sécurité, Test Architect, relecture adverse, rétrospective.
