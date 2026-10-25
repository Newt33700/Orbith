# Contribuer à Orbith

Merci de vouloir contribuer à Orbith ! Ce document explique comment installer le projet, comment il est
organisé, les règles à respecter et le processus de revue.

Avant de commencer, lisez [docs/interne/SPEC.md](docs/interne/SPEC.md) : c'est le contrat technique que suit
tout le projet.

## Mise en place de l'environnement

Prérequis :

- **Node.js 22 ou plus récent** (`node --version`).
- **Git**.

```bash
git clone https://github.com/Newt33700/Orbith.git
cd Orbith
npm ci            # installe les dépendances exactes du fichier package-lock.json
npm run build     # compile src/ vers dist/ (TypeScript)
npm test          # lance les tests (vitest)
```

Pour lancer la CLI pendant le développement, sans compilation préalable :

```bash
npm run dev -- <commande>      # par exemple : npm run dev -- next --help
```

Le binaire `bin/orbith.js` charge `dist/cli/index.js` : pensez à relancer `npm run build` après une
modification si vous testez avec `node bin/orbith.js`.

## Architecture

Orbith est un paquet npm (TypeScript, ESM) qui tient en trois couches :

- **Le cœur, `content/`** : les agents, workflows, modèles, règles et configuration par défaut. C'est le
  contenu copié dans `.orbith/` des projets lors de `orbith install`. Il ne contient aucune logique
  spécifique à un outil.
- **Les adaptateurs, `src/adapters/`** : ils génèrent les fichiers propres à chaque outil (commandes Gemini
  CLI dans `.gemini/`, commandes Claude Code dans `.claude/`). Ils ne font que référencer les fichiers du
  cœur. Le registre des agents est dans `src/adapters/agents.ts`.
- **La CLI, `src/cli/` et la bibliothèque commune `src/core/`** : une commande par fichier
  (`src/cli/<commande>.ts`), qui exporte une fonction `register(program)`. La logique partagée (lecture de
  la configuration, frontmatter, Git, chemins, interface) vit dans `src/core/`, et nulle part ailleurs.

Les vérifications (`orbith check`) sont dans `src/checks/`, les plugins optionnels dans `plugins/`, la
documentation utilisateur dans `docs/guide/`, et les tests dans `test/` (miroir de `src/`).

Le détail (formats de fichiers, API du cœur, contrats des adaptateurs) est dans
[docs/interne/SPEC.md](docs/interne/SPEC.md).

## Règles du projet

1. **Textes destinés aux utilisateurs en français** : messages de la CLI, prompts des agents, modèles,
   documentation dans `docs/guide/`. La documentation interne (`docs/interne/`) et le code (noms de
   variables, commentaires techniques) restent en anglais ou en français selon le contexte existant.
2. **Un seul cœur, zéro duplication** : une règle, un modèle ou une liste d'agents n'existe qu'à un endroit.
   Les adaptateurs et les commandes réutilisent `content/` et `src/core/` au lieu de recopier du texte ou
   du code.
3. **Principe de validation humaine** : l'IA propose, une personne décide. Aucun code ni aucun document ne
   doit pouvoir passer à l'état « validé » sans confirmation explicite d'une personne. Les agents ne
   modifient jamais un statut de validation.
4. **Les tests sont obligatoires** : toute fonctionnalité ou correction de bug s'accompagne d'un test qui
   échoue sans le changement et passe avec. `npm test` doit passer avant toute demande de revue.
5. **Commits au format Conventional Commits** : `type(portée): description`, par exemple
   `feat(csr): importe les onglets Excel` ou `fix(check): ignore les fichiers supprimés`. Quand le
   changement concerne une user story, indiquez son identifiant dans la portée : `feat(US-012): ...`.

## Ajouter un agent

Un agent est un fichier Markdown de prompt, exposé sous forme de commande dans Gemini CLI et Claude Code.

1. Créez le prompt dans `content/agents/<nom>.md` (en français, sur le modèle des agents existants).
2. Ajoutez une entrée dans le tableau `AGENTS` de `src/adapters/agents.ts` : clé, fichier, nom de commande
   Gemini, nom de commande Claude, description en français.
3. Si l'agent doit apparaître dans les recommandations de `orbith next`, mettez à jour
   `src/cli/next-rules.ts`.
4. Ajoutez les tests (adaptateurs et `next`) et lancez `npm test`.
5. Documentez l'agent dans le tableau « Les agents » du README si l'agent est destiné aux utilisateurs.

## Ajouter une commande de CLI

1. Créez `src/cli/<commande>.ts` qui exporte `register(program: Command)`, sur le modèle de
   `src/cli/check.ts`.
2. Déclarez-la dans `src/cli/index.ts` (import et ajout à la liste des `register`).
3. Placez la logique métier dans `src/core/` ou `src/checks/` : la commande ne fait que l'interface et
   l'appel.
4. Les messages sont en français. Les erreurs attendues doivent être des `OrbithError` avec un message
   qui indique la prochaine action à faire.
5. Ajoutez les tests dans `test/cli/<commande>.test.ts`, et la commande dans le tableau de la CLI du README.

## Ajouter un plugin

Les plugins sont des modules optionnels installés avec `npx orbith plugin add <nom>` (par exemple
`backlog-md`). Chaque plugin vit dans `plugins/<nom>/` avec un fichier `orbith-plugin.json` et un module
`install.js`.

La procédure complète est décrite dans
[docs/guide/creer-un-plugin.md](docs/guide/creer-un-plugin.md). Pour un exemple concret, regardez
`plugins/backlog-md/`.

## Processus de contribution

1. Ouvrez une branche depuis la branche principale : `feat/<sujet>` ou `fix/<sujet>`.
2. Faites vos modifications, avec tests, puis lancez `npm run build` et `npm test`.
3. Committez avec des messages Conventional Commits.
4. Ouvrez une pull request (ou merge request). Décrivez le besoin, la solution retenue et la manière de
   tester.
5. Une personne relit la proposition avant la fusion.
6. Les modifications de la documentation utilisateur (`docs/guide/`, README) se relisent aussi : vérifiez
   que le français est clair et que les commandes décrites existent.

## Intégration continue (CI)

Le workflow `.github/workflows/ci.yml` se lance à chaque push et à chaque pull request :

- **Build et tests** sur Ubuntu, Windows et macOS, avec Node 22 et Node 24 (`npm ci`, `npm run build`,
  `npm test`).
- **Test de fumée** sur Ubuntu : installation d'Orbith dans un projet temporaire, puis `orbith check` et
  `orbith next`.

La CI doit être verte avant la fusion d'une pull request.

La publication sur npm est gérée par `.github/workflows/release.yml`, déclenchée par un tag `v*`. Elle
nécessite le secret `NPM_TOKEN`. Les contributeurs n'ont pas à s'en occuper.
