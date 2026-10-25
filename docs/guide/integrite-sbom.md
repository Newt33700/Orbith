# Journal d'audit chaîné et SBOM

Deux garanties pour les équipes sécurité et conformité : savoir qu'**un registre n'a pas été retouché à la main**, et disposer de la **liste des composants** (SBOM) avec un contrôle des licences.

## Journal d'audit chaîné

Les registres `.orbith/validations.json` (qui a validé quoi) et `.orbith/deploiements.json` (mises en production) sont des journaux **chaînés**. Chaque entrée porte un champ `precedent` : l'empreinte SHA-256 de l'entrée qui la précède (la première pointe vers une valeur fixe de 64 zéros).

```json
{ "fichier": "docs/produit/prd.md", "sha256": "…", "par": "Jane Doe", "email": "jane@corp.fr",
  "le": "2026-10-25T10:00:00.000Z", "precedent": "9f2c…" }
```

Modifier, retirer ou insérer une entrée à la main change son empreinte et casse le chaînage de toutes les suivantes.

### Ce que fait `npx orbith check`

| Situation | Résultat |
|---|---|
| Chaîne intacte | rien à signaler |
| Entrée modifiée, retirée ou insérée | **erreur** : « Chaîne d'audit rompue à l'entrée N » |
| Entrée commitée disparue ou changée (dépôt Git) | **erreur** : « Entrée supprimée ou modifiée » |
| Ancien registre sans chaîne | **avertissement** : il sera chaîné au prochain `orbith valider` (ou `orbith deploiement`) |

`orbith valider` et `orbith deploiement` **refusent d'écrire** dans un registre à la chaîne rompue : rechaîner effacerait la trace de la retouche. Restaure le fichier depuis l'historique du dépôt, puis relance la commande.

### Migration d'un ancien registre

Rien à faire. Un registre sans `precedent` reste lisible et valable ; `check` prévient seulement qu'il ne détecte pas les éditions manuelles. Dès la prochaine validation, tout le registre est chaîné d'un coup.

### Limites à connaître

- Le chaînage seul détecte une retouche **au milieu** du journal. Retirer uniquement la **dernière** entrée est détecté par un second contrôle : dans un dépôt Git, `check` compare le registre à sa version commitée et signale en **erreur** « Entrée supprimée ou modifiée » toute entrée commitée qui a disparu. Committe donc régulièrement les registres. Sans Git, ou tant que le registre n'est pas commité, ce contrôle ne s'applique pas. Une réécriture qui garde chaque fichier validé (hash changé, chaîne recalculée) ressemble à une revalidation légitime.
- Quelqu'un qui recalcule toute la chaîne à la main produit un registre cohérent. La protection est un garde-fou contre l'erreur et la retouche discrète, pas une signature cryptographique.

## SBOM : `npx orbith sbom`

```bash
npx orbith sbom                      # JSON CycloneDX 1.5 sur la sortie standard
npx orbith sbom --sortie sbom.json   # ou dans un fichier
```

Options : `--sortie <fichier>`, `--cwd <dossier>`. La commande se termine toujours avec le code 0.

Les composants sont lus à la racine du projet :

| Écosystème | Sources | Remarques |
|---|---|---|
| npm | `package-lock.json` (v1, v2, v3), sinon `package.json` | le lock donne les versions exactes, la portée (dev) et les licences |
| Maven | `pom.xml` | propriétés `${…}` résolues ; `dependencyManagement`, plugins et profils ignorés ; `test`/`provided` = optionnel |
| Python | `requirements*.txt`, `pyproject.toml` (PEP 621 et Poetry) | version renseignée seulement si elle est épinglée (`==`) |

Le résultat est **déterministe** : composants triés par Package URL (purl), pas d'horodatage, numéro de série dérivé du contenu. Le même projet donne le même fichier, octet pour octet, ce qui permet de le versionner et de comparer deux livraisons.

## Contrôle des licences

Déclare les licences à éviter, de l'une ou des deux façons :

- dans le CSR (`.orbith/csr/CSR.md`), une catégorie « Licences » : `interdit` pour une licence bannie, `déprécié` pour une licence à revoir ;

  ```markdown
  ## Licences
  | Outil | Version min | Statut | Commentaire |
  |---|---|---|---|
  | AGPL-3.0 | | interdit | contaminante |
  | LGPL-3.0 | | déprécié | validation juridique requise |
  ```

- dans `.orbith/config.yaml` :

  ```yaml
  sbom:
    licences_interdites: [GPL-3.0, AGPL-3.0]
  ```

`npx orbith check` (rubrique « Licences (SBOM) ») signale alors :

- **erreur** pour un composant sous licence interdite ;
- **avertissement** pour une licence dépréciée ;
- **information** pour les composants sans licence connue (non contrôlables).

La correspondance ignore la casse et les suffixes SPDX (`GPL-3.0` couvre `GPL-3.0-only`, `GPL-3.0-or-later` et `GPL-3.0+`, mais pas `LGPL-3.0`). Une expression `MIT OR GPL-3.0` est tolérée (on peut choisir MIT) ; `MIT AND GPL-3.0` ne l'est pas. Sans politique déclarée, aucun contrôle n'est fait.

Les licences ne sont connues que pour les composants npm présents dans `package-lock.json` (v2 ou v3) : Maven et Python restent listés, mais sans licence.
