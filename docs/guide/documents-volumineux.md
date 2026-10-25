# Documents volumineux : les découper pour les agents

Un PRD ou une architecture de 40 pages tient dans le contexte d'un agent, mais il le remplit : l'agent devient lent,
imprécis et coûteux, et la règle « une tâche = une session » n'a plus de sens. Orbith sait donc **découper** un
document long en petits extraits par section, que les agents lisent à la place du document entier.

Le découpage est **déterministe et sans IA** : aucune donnée ne quitte votre poste, et le même document donne
toujours les mêmes extraits.

## Découper un document

```
npx orbith decouper docs/produit/prd.md
```

Options :

| Option | Rôle |
|---|---|
| `--niveau <n>` | Niveau de titre où couper, de 1 à 6 (défaut `2`, c'est-à-dire les titres `##`). |
| `--sortie <dossier>` | Dossier de sortie (défaut `.orbith/extraits/<nom du fichier>/`). |

Résultat, pour `docs/produit/prd.md` :

```
.orbith/extraits/prd/
  index.md                  sommaire : titres, taille approximative en jetons, lien vers chaque extrait
  00-mon-prd.md             le texte avant le premier titre `##` (introduction)
  01-contexte.md            une section de niveau 2, avec ses sous-sections
  02-exigences.md
```

- Un **jeton** est une unité de texte comptée par l'IA ; Orbith l'estime à « nombre de caractères divisé par 4 ».
  C'est une approximation, suffisante pour savoir si un document est long.
- Les titres écrits dans un **bloc de code** (entre des lignes ```` ``` ```` ou `~~~`) ne coupent jamais une section.
- Les titres sous-jacents (`###`…) restent dans la section de leur parent.
- Un document sans aucun titre ne peut pas être découpé : la commande l'indique sans rien écrire.

## Ce que le découpage ne fait jamais

- Il **ne modifie pas** le document source. Un document `validé` reste `validé` : la validation suit l'empreinte de son
  corps, et il n'est pas touché.
- Il **ne crée pas de document Orbith** : les extraits n'ont pas d'en-tête `type`, donc ils ne sont ni scannés, ni
  validables, ni comptés dans `orbith next`, `check` ou `trace`.
- Il ne supprime que des fichiers qu'un précédent `decouper` a créés. Un dossier qui contient autre chose est refusé.

Les extraits sont une **copie dérivée, en lecture seule**. Pour changer un contenu, modifiez le document source
(en repassant par sa validation si besoin), puis relancez `npx orbith decouper`. Chaque extrait commence par
une ligne de commentaire qui donne le fichier source et l'empreinte de son corps.

Dans un nouveau projet créé par `orbith install`, `.orbith/extraits/` est ajouté au `.gitignore` : ce dossier se
régénère à tout moment. Dans un projet existant, ajoutez cette ligne vous-même si vous ne voulez pas versionner les
extraits.

## Extraits périmés

Quand le document source change après le découpage, ses extraits sont périmés. `npx orbith check` le signale par un
**avertissement** (rubrique « Documentation »), jamais par une erreur :

```
⚠️  Les extraits de docs/produit/prd.md sont périmés (le document a changé). Relance `npx orbith decouper docs/produit/prd.md`.
```

Seul le corps du document compte : modifier son en-tête (par exemple le `statut`) ne périme pas les extraits. Si le
document source a été supprimé, l'avertissement indique que les extraits sont orphelins.

## Quand découper : le seuil

Un document est jugé volumineux au-delà de **4000 jetons** (environ 16 000 caractères, 8 à 10 pages). `npx orbith next`
et `npx orbith check` le signalent alors (information, pas d'avertissement) tant qu'il n'a pas d'extraits :

```
ℹ️  docs/produit/prd.md est volumineux (environ 9500 jetons, seuil 4000). Découpe-le : `npx orbith decouper docs/produit/prd.md`.
```

Pour changer le seuil, ajoutez dans `.orbith/config.yaml` :

```yaml
extraits:
  seuil_jetons: 6000
```

## Ce que font les agents

La règle `.orbith/rules/documents-volumineux.md` demande à tous les agents, et en particulier au Dev, à la QA, à l'UX,
à l'Architecte et au Scrum Master, de lire **d'abord l'index** des extraits, puis **seulement les sections utiles** à
leur tâche, jamais le document entier. Ils ne modifient pas les extraits et citent le document source, pas
l'extrait.

## Limites

- Seuls les titres ATX (`## Titre`) sont reconnus ; les titres soulignés (`Titre` puis `=====`) ne le sont pas.
- Les liens entre sections d'un même document (`#ancre`) ne sont pas réécrits dans les extraits.
- La taille en jetons est une estimation ; selon le modèle d'IA, le compte réel peut s'en écarter.
