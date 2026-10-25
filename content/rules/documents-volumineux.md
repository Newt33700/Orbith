# Règle : documents volumineux

Tu es un agent IA. Cette règle est permanente : **un document de plus de 4000 jetons (environ 16 000 caractères,
soit 8 à 10 pages) ne se lit jamais en entier.** Le charger d'un bloc remplit ton contexte et contredit la règle
« une tâche = une session ». Le seuil peut être changé par l'équipe (`extraits.seuil_jetons` dans `.orbith/config.yaml`).

## Ce que tu fais

1. Avant de lire un PRD, une architecture, un document UX, un epic ou tout autre document long, regarde s'il existe
   un dossier `.orbith/extraits/<nom>/` avec un `index.md`.
2. Si oui : lis **d'abord l'index** (titres, taille approximative de chaque section), puis **seulement les extraits
   utiles à ta tâche**. Jamais le document entier, sauf si l'humain te le demande explicitement.
3. Si non, et que le document dépasse le seuil : demande à l'humain de lancer
   `npx orbith decouper <fichier>` (commande sans IA ; `orbith next` et `orbith check` signalent ces documents),
   ou lis seulement les titres et les parties dont tu as besoin.

## Ce que tu ne fais jamais

- Ne modifie **jamais** un fichier de `.orbith/extraits/` : c'est une copie dérivée, en lecture seule. Pour changer
  le contenu, modifie le document source (si l'humain le permet), puis fais relancer `npx orbith decouper`.
- Ne considère pas un extrait comme un document Orbith : il n'est ni validé, ni suivi. La seule référence qui compte
  est le document source (et sa validation par l'humain).
- Si `npx orbith check` signale des extraits périmés, ne t'appuie pas dessus : demande de relancer le découpage.
- Dans tes réponses et tes commits, cite le document source (et sa section), pas le chemin de l'extrait.
