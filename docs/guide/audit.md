# Produire un rapport d'audit

La commande `npx orbith audit` génère un **rapport d'audit** destiné aux équipes conformité : il prouve, à une date donnée, que les documents ont été validés par des humains, que le code est tracé jusqu'aux user stories et que les contrôles du cadre de référence (CSR) sont respectés.

## Utilisation

```bash
npx orbith audit
```

Le rapport est écrit dans `docs/livraisons/audit-AAAA-MM-JJ.html`. Ouvre-le simplement dans un navigateur : c'est un fichier unique, qui fonctionne hors ligne.

Options :

- `--sortie <fichier>` : choisit le fichier de sortie ;
- `--format html|json` : `json` produit les mêmes données de façon exploitable par un outil (sur la sortie standard, ou dans le fichier si `--sortie` est donné) ;
- `--cwd <dossier>` : dossier de travail.

La commande se termine toujours avec le code 0, même si des problèmes sont détectés : c'est un rapport, pas un contrôle bloquant (pour cela, utilise `npx orbith check`). Un court résumé est affiché dans la console.

## Contenu du rapport

1. **En-tête** : projet, date, version d'Orbith, branche et commit git, auteur (utilisateur git), piste.
2. **Synthèse** : nombre d'artefacts, pourcentage validé, user stories par colonne, erreurs et avertissements, et couverture de traçabilité (part des US « Terminée » ayant à la fois des commits et des tests).
3. **Validations humaines** : chaque artefact avec son état (validé, modifié après validation, non tracé, non validé), qui l'a validé et quand. Les problèmes sont surlignés en rouge.
4. **Matrice de traçabilité** : US, statut, colonne, commits, tests et notes de livraison.
5. **Provenance IA** : US et documents liés à des commits co-écrits par une IA (pied `Co-Authored-By:`), modèle,
   validation humaine et revue humaine du code ; en rouge, les US terminées sans contrôle humain tracé (voir
   [provenance-couts.md](provenance-couts.md)).
6. **Conformité CSR et contrôles** : résultats de `npx orbith check`, groupés par catégorie (CSR, validations,
   traçabilité, documentation, secrets, licences, provenance IA).
7. **Pied de page** : horodatage de génération.

## Bon à savoir

- Le rapport est un **instantané** : il reflète l'état du projet au moment de la génération. Régénère-le avant chaque livraison.
- Il s'imprime proprement (chaque section commence sur une nouvelle page) : utilise « Imprimer » puis « Enregistrer au format PDF » pour l'archiver.
- Pour une trace fiable, fais d'abord un `git commit` de ton travail, puis génère le rapport.
- Toutes les valeurs affichées sont échappées : un titre contenant du code n'est jamais exécuté.

## Voir aussi

- `npx orbith valider` pour valider un document ;
- `npx orbith trace` pour la matrice seule en markdown ;
- `npx orbith check` pour les contrôles seuls.
