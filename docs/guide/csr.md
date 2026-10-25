# Le référentiel CSR

Le **CSR** (Cadre de Référence) est la liste des technologies que votre entreprise autorise, déconseille ou interdit,
avec leurs versions minimales. Orbith le met à disposition des agents et le contrôle dans vos projets.

## Ce qu'il faut savoir

- **Dans ce dépôt public**, le fichier `content/csr/CSR.exemple.md` est **un exemple**. Il sert à comprendre le format.
  Il ne représente pas les règles de votre entreprise.
- **Le vrai CSR** est maintenu dans le dépôt privé de votre entreprise, et importé dans chaque projet.
- Une fois installé, votre CSR est copié dans `.orbith/csr/CSR.md`. Vous pouvez le relire et l'adapter avec votre
  équipe architecture.

## Le format

Le CSR est un fichier Markdown. Chaque section correspond à une famille d'outils (langages, frameworks…). Chaque
section contient un tableau avec quatre colonnes.

```markdown
# Cadre de Référence (CSR)
> Source : référentiel interne — Mis à jour le 2026-10-01

## Langages
| Outil | Version min | Statut | Commentaire |
|---|---|---|---|
| Java | 21 | autorisé | |
| Node.js | 22 | autorisé | LTS uniquement |
| Python | 3.11 | autorisé | |

## Frameworks
| Outil | Version min | Statut | Commentaire |
|---|---|---|---|
| Spring Boot | 3.3 | autorisé | |
| AngularJS | | interdit | fin de vie |
| moment | | déprécié | utiliser date-fns |
```

### Les quatre colonnes

| Colonne | Rôle |
|---|---|
| **Outil** | Le nom de la technologie (Node.js, Spring Boot, moment…) |
| **Version min** | La version minimale acceptée. Vide si sans objet |
| **Statut** | `autorisé`, `déprécié` ou `interdit` (voir ci-dessous) |
| **Commentaire** | Une explication pour l'équipe. Facultatif |

### Les statuts

| Statut | Effet dans `npx orbith check` |
|---|---|
| `autorisé` | Conforme. Si une version minimale est indiquée, elle doit être respectée |
| `déprécié` | **Avertissement** : l'outil est toléré mais il faut prévoir de le remplacer |
| `interdit` | **Erreur** : le projet ne doit pas utiliser cet outil |

Orbith accepte aussi les formes sans accent (`autorise`, `deprecie`) et `obligatoire` (qui signifie « autorisé et
requis »).

Les versions sont comparées chiffre par chiffre : `22` est supérieur à `20.11`, et `3.10` est supérieur à `3.9`.

## Importer le CSR depuis Excel

Les équipes architecture tiennent souvent leur référentiel dans un classeur Excel. Vous pouvez l'importer directement :

```bash
npx orbith csr import fichier.xlsx
```

Par défaut, le résultat est écrit dans le fichier CSR du projet (réglage `csr.fichier` de `.orbith/config.yaml`, par défaut `.orbith/csr/CSR.md`). Pour un autre emplacement :

```bash
npx orbith csr import fichier.xlsx --sortie docs/autre-CSR.md
```

### Préparer le fichier Excel

- **Chaque onglet** devient une section `## <nom de l'onglet>` du CSR.
- Chaque onglet doit contenir les colonnes **Outil**, **Version min**, **Statut** et **Commentaire**.
- Les noms de colonnes sont reconnus sans tenir compte de la casse ni des accents. D'autres colonnes peuvent exister :
  elles sont conservées.
- Une ligne sans outil est ignorée.

La commande affiche le nombre d'outils importés. Si une colonne attendue manque, elle vous l'indique.

## Récupérer le vrai CSR depuis la source de l'entreprise

Le dépôt public d'Orbith ne contient qu'un **exemple** de CSR. Le vrai CSR vit dans le dépôt privé de l'entreprise.
Déclarez sa source dans `.orbith/config.yaml` :

```yaml
csr:
  fichier: .orbith/csr/CSR.md
  source: git+https://gitlab.entreprise.fr/archi/csr.git#CSR.md
```

Formes acceptées :

| Forme | Exemple |
|---|---|
| Chemin local (absolu ou relatif à la racine du projet) | `../referentiels/CSR.md` |
| Dépôt git (HTTPS ou SSH, `@ref` optionnel) | `git+https://hote/groupe/depot.git@v2#chemin/CSR.md` |
| Fichier Markdown brut en HTTPS | `https://intranet.entreprise.fr/csr/CSR.md` |

Commandes :

- `npx orbith csr sync` met à jour `.orbith/csr/CSR.md` depuis la source (vos identifiants git habituels sont utilisés).
- `npx orbith update` fait la même synchronisation automatiquement.
- `npx orbith install --csr-source <source>` enregistre la source et synchronise dès l'installation.

Si le fichier récupéré ne contient aucun outil reconnaissable, il est refusé et votre CSR local est conservé.

## Le contrôle en CI (GitLab)

Le contrôle du CSR se fait automatiquement à chaque modification, grâce à `npx orbith check` dans la pipeline
GitLab. Le fichier `.gitlab-ci.yml` généré par Orbith contient déjà une étape équivalente à :

```yaml
orbith-check:
  image: node:22
  script:
    - npx orbith check
```

Si la commande signale une erreur, la pipeline échoue : la merge request ne peut pas être fusionnée tant que le
problème n'est pas corrigé. Les avertissements n'échouent pas la pipeline, mais ils restent visibles dans les
journaux.

### Ce que le contrôle regarde

Orbith détecte automatiquement votre stack et la compare au CSR :

- **Node.js** : version déclarée dans `package.json` (`engines.node`), `.nvmrc` ou `.node-version`, et dépendances
  npm.
- **Java** : version dans `pom.xml` (Maven) ou `build.gradle` / `build.gradle.kts`, et dépendances Maven.
- **Python** : version dans `pyproject.toml`, `.python-version`, et paquets listés dans `requirements*.txt`.

Pour chaque élément :

- outil **interdit** utilisé : **erreur** ;
- version **inférieure** au minimum : **erreur** ;
- outil **déprécié** utilisé : **avertissement**.

### Exemple de sortie

```
Contrôle CSR
  ✖ Erreur : AngularJS est interdit (dépendance « angular » détectée dans package.json)
  ⚠ Avertissement : moment est déprécié, utiliser date-fns
  ✖ Erreur : Node.js 20.11 détecté, version minimale du CSR : 22

1 erreur, 1 avertissement
```

Le format exact peut varier légèrement. Pour une lecture automatique, utilisez `npx orbith check --format json`.

## Bonnes pratiques

- **Ne modifiez pas le CSR de l'entreprise** dans un projet : demandez une évolution à l'équipe architecture.
  Les changements locaux sont donc à éviter.
- **Faites l'import à chaque nouvelle version du CSR**, puis relancez `npx orbith check`.
- **Si une erreur bloque un besoin réel**, ne contournez pas le contrôle. Ouvrez une demande d'exception auprès de
  l'architecture, et notez la décision dans un ADR (voir le [glossaire du README](../../README.md#glossaire)).

## Pour aller plus loin

- [guide-dev.md](guide-dev.md) : où `check` s'intègre dans le travail quotidien.
- [validation-humaine.md](validation-humaine.md) : le contrôle des validations, autre volet de `check`.
