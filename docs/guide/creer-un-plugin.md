# Créer un plugin Orbith

Ce guide décrit ce que fait le code (`src/cli/plugin.ts`). Pour utiliser un plugin : [Les plugins : Backlog.md](plugins.md).

> **Limite actuelle** : Orbith ne charge que les plugins du dossier `plugins/` de son propre dépôt. Installer un
> plugin tiers depuis npm ou une URL **n'est pas encore supporté**. Pour ajouter un plugin, ouvre une MR sur Orbith.

## 1. À quoi sert un plugin

Un plugin ajoute une fonctionnalité **optionnelle** à un projet (installer un outil, préparer un fichier, configurer un
tableau). Il ne s'active que sur demande, avec `npx orbith plugin add <nom>`. Il ne peut pas ajouter d'agent ni de template (section 5).

## 2. Anatomie (modèle prêt à copier : `docs/guide/exemples/plugin-modele/`)

```
plugins/mon-plugin/
├── orbith-plugin.json   manifeste (obligatoire)
├── install.js           installeur, désigné par le manifeste
└── README.md            documentation pour les utilisateurs
```

## 3. Le manifeste

`orbith-plugin.json` :

```json
{
  "name": "mon-plugin",
  "description": "Une phrase affichée par `npx orbith plugin list`.",
  "install": "install.js"
}
```

| Champ | Rôle |
|---|---|
| `name` | Nom utilisé par `plugin add`. Format `a-z`, `0-9` et tirets, sans tiret au début (ex. `backlog-md`). Le nom est ajouté à `plugins` dans `.orbith/config.yaml`. |
| `description` | Texte affiché par `plugin list`. |
| `install` | Chemin du module d'installation, relatif au dossier du plugin. Ce module est de l'ESM et exporte `install`. |

Le nom du dossier doit être identique à `name`. Un manifeste au JSON invalide est ignoré par `plugin list`.

## 4. L'installeur

Signature :

```js
export async function install({ root, config, run, log }) { /* ... */ }
```

| Argument | Contenu |
|---|---|
| `root` | Dossier racine du projet (celui qui contient `.orbith/`). |
| `config` | Configuration chargée avant l'installation : `projet.nom`, `plateformes`, `piste`, `backlog.prefixe`, `csr`, `plugins`. |
| `run(cmd, args, { cwd })` | Lance une commande (ex. `npm`). Renvoie `{ code, stdout, stderr }` sans lever d'erreur : il faut tester `code`. |
| `log` | `info`, `ok` et `avert` : messages console, à écrire en français. |

Cycle de vie, tel que `addPlugin` l'exécute :

1. Orbith vérifie que `install` est une fonction, sinon il s'arrête.
2. Il appelle `install(ctx)`, même si le plugin est déjà actif : l'installeur doit supporter d'être relancé.
3. Si l'installeur réussit, `name` est ajouté à `plugins` dans `.orbith/config.yaml`. Sinon, rien n'est ajouté.
   Ne modifie pas `config.yaml` toi-même.

Bonnes pratiques :

- **Idempotent** : relancer l'installeur ne duplique ni ne casse rien.
- **Ne jamais écraser ni supprimer** : lis l'existant et complète-le. Pour un fichier neuf, écris avec `flag: 'wx'`
  (échec si le fichier existe). `backlog-md` conserve les clés déjà présentes dans `backlog/config.yml`.
- **Messages en français**, avec la commande de secours en cas d'échec : `log.avert("… Lance toi-même : npm i -D outil")`.
- **Rien d'installé globalement** : préfère une installation locale au projet (`npm i -D`, via `run`). Une installation
  globale (`npm i -g`) se propose à la personne, elle ne se lance jamais.
- **Validation humaine** : un plugin ne valide jamais une story ou un artefact à la place d'une personne. La validation
  passe par `npx orbith valider`.
- **Confidentialité** : n'envoie aucune donnée du projet vers l'extérieur, n'écris aucun secret (clé, mot de passe)
  dans un fichier versionné, et annonce par `log.info` chaque commande avant de la lancer.

## 5. Ajouter des agents ou des templates : non supporté

Aujourd'hui, un plugin ne peut fournir ni agent ni template. L'installeur ne reçoit ni accès au dossier `content/`
ni fonction de copie. Les agents, workflows, templates et règles viennent de `content/` (dossiers `agents`,
`workflows`, `templates`, `rules`), copiés par `npx orbith install`.

Pour proposer un agent ou un template, ouvre une MR qui ajoute le fichier dans `content/` et décris le besoin.

## 6. Tester son plugin

Modèle : `test/cli/plugin.test.ts`. Exemple pour le plugin `changelog` (section 8), dans `test/cli/plugin-changelog.test.ts` :

```ts
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { addPlugin } from '../../src/cli/plugin.js';
import { loadConfig } from '../../src/core/index.js';
import { makeProject } from './helpers.js';

let root: string;
beforeEach(async () => {
  root = await makeProject();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

it('crée CHANGELOG.md, active le plugin, et ne réécrit pas un fichier existant', async () => {
  await addPlugin(root, 'changelog');
  expect((await loadConfig(root)).plugins).toEqual(['changelog']);

  await writeFile(path.join(root, 'CHANGELOG.md'), 'mon contenu');
  await addPlugin(root, 'changelog');
  expect(await readFile(path.join(root, 'CHANGELOG.md'), 'utf8')).toBe('mon contenu');
});
```

Si le plugin lance des commandes, passe un faux `run` dans `addPlugin(root, nom, { run })`, comme dans le test de `backlog-md`.

## 7. Check-list avant une MR

- [ ] `plugins/<nom>/` contient les trois fichiers ; `name` = nom du dossier ; `install` pointe vers un fichier existant.
- [ ] `node --check plugins/<nom>/install.js` passe, et un test vitest couvre l'installation et sa relance (`npm test`).
- [ ] Aucun fichier existant n'est écrasé ni supprimé ; messages en français ; rien d'global, de sortant ni de secret.
- [ ] Le README indique quoi est créé ou modifié, et comment désactiver le plugin.

## 8. Exemple complet : le plugin `changelog`

Objectif : créer `CHANGELOG.md` à la racine du projet, s'il n'existe pas.

**Étape 1 : le dossier et le manifeste.** Dans le dépôt Orbith :

```bash
mkdir plugins/changelog
```

`plugins/changelog/orbith-plugin.json` :

```json
{
  "name": "changelog",
  "description": "Crée CHANGELOG.md à la racine du projet s'il n'existe pas.",
  "install": "install.js"
}
```

**Étape 2 : l'installeur.** `plugins/changelog/install.js` :

```js
import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function install({ root, config, log }) {
  const cible = path.join(root, 'CHANGELOG.md');
  try {
    await fs.writeFile(cible, `# Journal des modifications\n\n## Non publié\n\n_Projet : ${config.projet.nom}_\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    log.ok('CHANGELOG.md créé à la racine du projet.');
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    log.info('CHANGELOG.md existe déjà : il est conservé tel quel.');
  }
}
```

**Étape 3 : la documentation.** `plugins/changelog/README.md` : ce que fait le plugin, la commande d'installation, et
comment le désactiver (retirer `changelog` de `plugins` dans `.orbith/config.yaml`).

**Étape 4 : le test.** Ajoute le fichier de la section 6 dans `test/cli/`, puis lance `npm test`.

**Étape 5 : l'essai.** Depuis le dépôt Orbith, sur un projet de test :

```bash
npm run dev -- plugin add changelog --cwd /chemin/du/projet
```

Vérifie que `plugins` de `.orbith/config.yaml` contient `changelog`, relance la commande : rien ne doit changer.
Puis passe la check-list de la section 7 et ouvre la MR.
