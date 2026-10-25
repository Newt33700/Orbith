# Plugin Backlog.md

Affiche tes stories sur un tableau Kanban grâce à [Backlog.md](https://github.com/MrLesk/Backlog.md).
Les stories d'Orbith utilisent déjà le format de Backlog.md : le tableau les montre sans conversion.

## Installation

```bash
npx orbith plugin add backlog-md
```

Ce que fait le plugin :

1. Crée ou complète `backlog/config.yml` avec les colonnes `À faire`, `Prête`, `En cours`, `En revue`, `Terminée`,
   le statut par défaut `À faire` et le préfixe d'identifiant de `.orbith/config.yaml` (`backlog.prefixe`, `US` par défaut).
   Les réglages et les stories déjà présents dans `backlog/` ne sont jamais supprimés.
2. Si ton projet a un `package.json`, installe `backlog.md` en dépendance de développement (`npm i -D backlog.md`).
   Sinon, il te demande de l'installer une fois : `npm i -g backlog.md`.
3. Ajoute `backlog-md` à la liste `plugins` de `.orbith/config.yaml`.

Ensuite : `npx backlog browser` ouvre le tableau (port 6420).

## Points d'attention (vérifiés avec Backlog.md 1.55)

- Le préfixe ne peut contenir que des lettres (`US`, `BUG`…).
- Le nom du fichier d'une story doit commencer par l'identifiant **en minuscules** : `us-001 - Connexion par email.md`.
  Sinon Backlog.md ignore le fichier.
- Les champs Orbith (`type`, `statut`, `epic`) sont conservés par Backlog.md quand tu déplaces une carte.

## Organisation technique

- `orbith-plugin.json` : manifeste (nom, description, module d'installation).
- `install.js` : installeur en JavaScript pur (le dossier `plugins/` n'est pas compilé). Il exporte `install({ root, config, run, log })`.
