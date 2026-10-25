# Plugin « mon-plugin »

Modèle de plugin Orbith. Il crée `docs/mon-plugin.md` s'il n'existe pas et ne modifie jamais un fichier existant.

## Créer ton plugin à partir de ce modèle

1. Copie le dossier dans `plugins/` sous le nom de ton plugin :
   `cp -r docs/guide/exemples/plugin-modele plugins/<nom>`
2. Remplace `mon-plugin` par `<nom>` dans `orbith-plugin.json` (champ `name`) et dans ce README.
3. Adapte `install.js` à ton besoin.
4. Vérifie la syntaxe : `node --check plugins/<nom>/install.js`.
5. Teste : `npx orbith plugin list`, puis `npx orbith plugin add <nom>` dans un projet Orbith.

## Installation

```bash
npx orbith plugin add <nom>
```

## Ce que fait le plugin

- Crée `docs/mon-plugin.md` avec le nom du projet, si le fichier est absent.
- Si le fichier existe déjà, il l'affiche comme conservé et ne fait rien d'autre.
- Ajoute `<nom>` à la liste `plugins` de `.orbith/config.yaml`.

## Désactiver le plugin

Orbith ne propose pas de commande pour désactiver un plugin : retire son nom de la liste `plugins` de `.orbith/config.yaml`.
