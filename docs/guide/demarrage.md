# Démarrer avec Orbith

Ce guide vous accompagne pas à pas, de l'installation jusqu'à votre première question à un agent.
Comptez une vingtaine de minutes.

## Ce dont vous avez besoin

| Élément | Comment le vérifier | Remarque |
|---|---|---|
| Node.js 22 ou plus | `node --version` | Affiche par exemple `v22.11.0` |
| Git | `git --version` | Recommandé : sans Git, la validation ne peut pas identifier la personne |
| Gemini CLI **ou** Claude Code | `gemini --version` ou `claude --version` | Un seul suffit |

Si Git n'est pas encore configuré, indiquez votre nom et votre adresse une fois pour toutes :

```bash
git config --global user.name "Prénom Nom"
git config --global user.email "prenom.nom@entreprise.fr"
```

## Étape 1 : préparer le dossier du projet

**Nouveau projet** : créez un dossier vide, puis entrez dedans.

```bash
mkdir mon-projet
cd mon-projet
```

**Projet existant** : placez-vous dans le dossier du projet.

```bash
cd chemin/vers/mon-projet
```

## Étape 2 : installer Orbith

```bash
npx orbith install
```

Orbith vous pose quelques questions :

- **Nom du projet** : par défaut, le nom du dossier.
- **Plateformes** : Gemini CLI, Claude Code, ou les deux.
- **Piste par défaut** : `évolution` si vous ne savez pas encore (voir le [README](../../README.md#les-trois-pistes-de-travail)).

Pour éviter les questions :

```bash
npx orbith install --plateformes gemini,claude --piste evolution --nom mon-projet --yes
```

L'installation copie les agents dans `.orbith/`, crée les commandes Gemini et Claude, et ajoute un bloc Orbith à
`GEMINI.md` ou `CLAUDE.md`. Votre contenu existant est conservé. Pour un projet existant, Orbith ne remplace jamais
un fichier : il le laisse en place et vous prévient.

## Étape 3 : vérifier l'installation

```bash
npx orbith next
```

Sur un projet vide, vous devriez voir : « commencez par le brief, lancez `/orbith:po` (Gemini) ou `/orbith-po`
(Claude Code) ». C'est normal : la première étape est de définir le besoin.

## Étape 4 : premier lancement dans Gemini CLI

1. Dans un terminal, placez-vous dans le dossier du projet et lancez `gemini`.
2. Demandez au guide où vous en êtes :

   ```
   /orbith:guide
   ```

3. Répondez à ses questions, ou appelez directement un agent :

   ```
   /orbith:po j'aimerais une application pour réserver les salles de réunion de mon entreprise
   ```

## Étape 5 : premier lancement dans Claude Code

1. Dans un terminal, placez-vous dans le dossier du projet et lancez `claude`.
2. Demandez au guide où vous en êtes :

   ```
   /orbith
   ```

3. Ou appelez directement un agent :

   ```
   /orbith-po j'aimerais une application pour réserver les salles de réunion de mon entreprise
   ```

Claude Code peut vous demander d'autoriser certaines actions. Lisez la demande avant d'accepter.

## Étape 6 : la règle des sessions

Entre deux tâches, ouvrez une **nouvelle session** ou tapez `/clear`. L'agent repart avec une mémoire vide et reste
précis. Vos fichiers restent dans le projet.

## Étape 7 : valider votre premier document

Quand un agent a rédigé un document (par exemple `docs/produit/brief.md`), relisez-le. Si le contenu vous convient :

```bash
npx orbith valider docs/produit/brief.md
```

Orbith vous demande de confirmer que vous l'avez relu. Pour la suite, lisez
[validation-humaine.md](validation-humaine.md).

## En cas de problème

**Erreur sur `npx`, ou commande introuvable**
Vérifiez `node --version`. La version doit être 22 ou plus.

**« Aucun projet Orbith trouvé »**
Lancez les commandes depuis le dossier du projet (ou un sous-dossier). Vérifiez que le dossier `.orbith/` existe.

**Les commandes `/orbith…` n'apparaissent pas**
Relancez Gemini CLI ou Claude Code depuis le dossier du projet.

**« Git n'est pas configuré » lors de la validation**
Configurez votre nom et votre adresse (voir le début de ce guide), puis relancez `npx orbith valider`.

**Mettre Orbith à jour**
Lancez `npx orbith update`. Votre configuration, votre CSR et votre dossier `custom/` ne sont pas modifiés.

## Pour aller plus loin

- Product Owner ou chef de projet : [guide-po.md](guide-po.md).
- Lead tech ou développeur : [guide-dev.md](guide-dev.md).
- Comprendre les validations : [validation-humaine.md](validation-humaine.md).
