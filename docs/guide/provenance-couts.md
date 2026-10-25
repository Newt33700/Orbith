# Provenance IA et coûts IA réels

Ce guide explique deux suivis complémentaires :

- **les coûts IA réels** : importer les vrais compteurs de jetons laissés par Claude Code sur votre poste, au lieu
  de vous fier seulement aux estimations des agents ;
- **la provenance IA** : savoir quel code et quels documents ont été co-écrits par une IA, avec quel modèle, et
  quel humain les a validés ou relus.

Il s'adresse aux chefs de projet, aux leads tech, aux équipes FinOps et aux auditeurs. Les deux suivis sont
facultatifs : sans eux, Orbith fonctionne comme avant.

## Coûts IA réels : `npx orbith couts importer`

Par défaut, chaque agent **estime** sa consommation à la fin d'une tâche (règle `couts-ia` : 1 jeton ≈ 4
caractères, `source: estimé`). Ces estimations donnent un ordre de grandeur, mais elles sont souvent loin de la
réalité, en particulier à cause du cache des modèles.

Claude Code enregistre localement chaque session dans un fichier de transcription (JSONL) qui contient les
**compteurs de jetons réels** de chaque appel au modèle. La commande `couts importer` lit ces compteurs et les ajoute
à la US :

```bash
# Aperçu : affiche les jetons et le coût mesurés, n'écrit rien
npx orbith couts importer

# Enregistre dans la US
npx orbith couts importer --us US-012 --agent dev
```

| Option | Rôle |
|---|---|
| `--us US-NNN` | US à laquelle ajouter les coûts. Sans cette option, la commande affiche un aperçu et n'écrit rien |
| `--chemin <fichier ou dossier>` | Transcription `.jsonl` ou dossier à lire (tous les `.jsonl` qu'il contient, sous-dossiers compris). Par défaut : `~/.claude/projects/<chemin du projet>` |
| `--session <id>` | Ne lit qu'une session (début de son identifiant, affiché dans l'aperçu) |
| `--depuis AAAA-MM-JJ` | Ne lit que les appels de cette date ou après |
| `--agent <nom>` | Nom de l'agent Orbith à noter dans l'entrée (défaut : `inconnu`) |
| `--source claude` | Seule source prise en charge pour l'instant (voir « Gemini CLI » plus bas) |

Le dossier par défaut est celui où Claude Code range les sessions lancées depuis le dossier du projet : le chemin
absolu du projet, chaque caractère autre qu'une lettre ou un chiffre étant remplacé par `-` (par exemple
`/home/jane/monprojet` donne `~/.claude/projects/-home-jane-monprojet`). Si vous avez lancé Claude Code depuis un
autre dossier, ou si la variable `CLAUDE_CONFIG_DIR` est définie, indiquez le bon dossier avec `--chemin`.

### Ce qui est ajouté à la US

Une entrée par session et par modèle, **à la fin** de la liste `couts_ia`. Les entrées existantes ne sont jamais
modifiées ni supprimées, et le corps de la US n'est pas touché (sa validation reste valable).

```yaml
couts_ia:
  - date: 2026-10-25
    agent: dev
    outil: claude-code
    modele: claude-sonnet-5-5
    tache: "Import des compteurs réels (session 0f8e2c4a, 42 appel(s))"
    tokens_entree: 1510
    tokens_cache_ecriture: 12000
    tokens_cache_lecture: 50000
    tokens_sortie: 510
    cout: 0.08
    devise: EUR
    source: mesuré
    session: 0f8e2c4a-1111-4222-8333-944455556666
    du: 2026-10-20T10:00:05.000Z
    au: 2026-10-20T10:05:00.000Z
```

- `tokens_entree` : jetons d'entrée **hors cache** ; `tokens_cache_lecture` et `tokens_cache_ecriture` : jetons lus
  depuis le cache et écrits dans le cache ; `tokens_sortie` : jetons produits par le modèle.
- `du` / `au` : premier et dernier appel compté. Un nouvel import ne compte que les appels postérieurs à `au` pour
  la même session : relancer la commande ne compte jamais deux fois le même appel.
- Une même réponse du modèle est écrite sur plusieurs lignes de la transcription : elle n'est comptée qu'une fois.
  Les transcriptions des sous-agents (`<session>/subagents/*.jsonl`) sont lues avec la session principale.

### Calcul du coût

Le coût utilise `finops.prix` de `.orbith/config.yaml`, comme les estimations. Le prix choisi est celui de la clé
égale au nom du modèle, sinon de la plus longue clé par laquelle le nom commence (`claude-sonnet` pour
`claude-sonnet-5-5`), sinon `defaut`. Sans prix applicable, la commande s'arrête et le dit.

Les jetons du cache ne coûtent pas le prix d'entrée. Par défaut, Orbith applique les coefficients publiés par
Anthropic : lecture du cache à 0,1 × `entree`, écriture à 1,25 × `entree` (cache de 5 minutes) ou 2 × `entree`
(cache d'une heure). Si votre contrat prévoit d'autres tarifs, ajoutez-les à la clé du modèle :

```yaml
finops:
  prix:
    claude-sonnet: { entree: 3, sortie: 15, cache_lecture: 0.3, cache_ecriture: 3.75 }
```

`cache_ecriture` s'applique alors aux deux durées de cache.

### Ce que ces chiffres sont, et ce qu'ils ne sont pas

- Les **jetons** viennent des compteurs renvoyés par l'API et enregistrés par Claude Code : ce sont des mesures.
- Le **coût** reste un calcul avec vos prix : ce n'est **pas une facture**. La facture du fournisseur fait foi.
- C'est un **minimum** : Claude Code n'écrit pas tous ses appels dans la transcription (par exemple certains appels
  annexes à un petit modèle). Le total réel peut être un peu plus élevé.
- Les sessions sont attribuées à la US que vous indiquez avec `--us` : si une session a servi à plusieurs US,
  utilisez `--session` et `--depuis` pour répartir, ou acceptez l'approximation.

### Confidentialité

La commande lit seulement, ligne par ligne, le type de ligne, l'identifiant de session, l'horodatage, l'identifiant
de la réponse, le nom du modèle et les compteurs `usage`. Elle **ne lit ni ne recopie jamais le contenu des
conversations** (vos messages, les réponses, les fichiers lus). Elle n'écrit ni le dossier de travail ni la branche.
Rien n'est envoyé sur le réseau.

### Gemini CLI

`--source gemini` n'est **pas encore pris en charge**. Gemini CLI peut écrire une télémétrie locale
(`telemetry.outfile`, événement `gemini_cli.api_response` avec `input_token_count`, `output_token_count`,
`cached_content_token_count`, `thoughts_token_count`), mais la documentation ne précise pas la structure exacte du
fichier écrit, et le format des fichiers de session varie selon les versions. Plutôt que de deviner, Orbith refuse
cette source ; continuez avec les estimations (`source: estimé`) pour Gemini.

### Dans les métriques

`npx orbith metriques` distingue désormais les deux sources dans la rubrique des coûts dès qu'une entrée mesurée
existe (en JSON : `couts.parSource.estime` et `couts.parSource.mesure` ; en CSV : lignes `couts`). Voir
[metriques.md](metriques.md).

## Provenance IA : `npx orbith provenance`

Les outils d'IA ajoutent souvent un pied `Co-Authored-By:` au message de commit, par exemple :

```text
feat(US-012): connexion par lien magique

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

`npx orbith provenance` relit l'historique Git et dresse, par US et par document, la liste des commits co-écrits par
une IA, le modèle quand il est connu, et le contrôle humain associé :

```bash
npx orbith provenance              # tableau Markdown
npx orbith provenance --format json
npx orbith provenance --enregistrer   # ajoute les nouveaux commits au registre .orbith/provenance.json
```

Exemple de sortie :

```markdown
# Provenance IA

2 commit(s) portent un pied `Co-Authored-By:` désignant une IA.

| US / document | Colonne | Commits IA | Modèle(s) | Validation humaine | Revue humaine du code |
|---|---|---|---|---|---|
| US-001 : Connexion | Terminée | 3f2a1bc | Claude Opus 5.5 | non validé | aucune ⚠️ |
| US-002 : Export | Terminée | 9c4d2e1 | Claude Opus 5.5 | non validé | Jane Doe (2026-10-21) |

⚠️ : US terminée, code co-écrit par une IA, sans validation humaine ni revue humaine tracées.
```

### Comment Orbith relie et reconnaît

| Élément | Source |
|---|---|
| Commit co-écrit par une IA | Pied `Co-Authored-By:` dont le nom ou l'adresse désigne une IA connue (Claude, Gemini, Copilot, Codex, ChatGPT, GPT-…, adresses `@anthropic.com`, `@openai.com`, comptes robots GitHub de ces outils). « Claude » seul, ou suivi d'un modèle (« Claude Opus 5.5 », « Claude Code ») ; un humain prénommé Claude n'est pas compté |
| Modèle | Le nom du pied, s'il contient un numéro de version (« Claude Opus 5.5 ») ; sinon `inconnu` |
| US liée | Identifiant de US (`US-012`) dans le message du commit, hors pieds |
| Document lié | Fichier Markdown modifié dans `docs/produit/`, `docs/architecture/`, `docs/livraisons/` ou `backlog/tasks/` |
| Validation humaine | Registre `.orbith/validations.json` (`npx orbith valider`) : nom et date, si le document est toujours `validé` |
| Revue humaine du code | Champs `revue_par` et/ou `revue_le` de la US, ou pied `Reviewed-by:` sur un commit lié |
| Revue QA | Titre « Revue QA » dans la US : signalé, mais ce n'est pas une revue humaine (elle est faite par l'agent QA) |

### Le registre `.orbith/provenance.json`

`--enregistrer` ajoute au registre les commits co-écrits par une IA qu'il ne contient pas encore. Le registre est
un **journal en ajout seul et chaîné**, comme `validations.json` (voir [integrite-sbom.md](integrite-sbom.md)) :
chaque entrée porte l'empreinte de la précédente. Il garde la trace même si l'historique Git est réécrit plus tard
(fusion écrasée, rebase). `orbith provenance` réunit le registre et l'historique courant.

Une entrée ne contient que l'empreinte et la date du commit, le nom de l'IA, le modèle s'il est connu, les US et
documents liés, et les noms des relecteurs (`Reviewed-by:`). Aucune adresse électronique, aucun diff, aucun contenu de
conversation. Commitez le registre avec le reste de `.orbith/`.

Un registre retouché à la main (chaîne rompue) est refusé par `--enregistrer` et signalé en **erreur** par
`npx orbith check` : restaurez-le depuis Git.

### Ce que vérifie `npx orbith check`

Rubrique « Provenance IA » : un **avertissement** quand une US en colonne `Terminée` a du code co-écrit par une IA,
**sans** validation humaine tracée de la US **et sans** revue humaine du code (`revue_par` / `revue_le`, ou
`Reviewed-by:`). Pour le lever : faites relire le code par un humain et notez-le dans la US, par exemple :

```yaml
revue_par: Jane Doe
revue_le: 2026-10-21
```

Ces deux champs sont dans l'en-tête : les ajouter ne casse pas la validation de la US.

### Dans le rapport d'audit

`npx orbith audit` ajoute une rubrique « Provenance IA » : même tableau, lignes en rouge pour les US terminées sans
contrôle humain tracé (voir [audit.md](audit.md)).

### Limites

- Un commit co-écrit par une IA **sans** pied `Co-Authored-By:` n'est pas détecté : la provenance dépend de la
  discipline de l'équipe et des réglages de l'outil (Claude Code ajoute ce pied par défaut).
- La liste des noms d'IA reconnus est fixe ; un outil absent de la liste n'est pas compté.
- Le contrôle ne dit pas que le code est bon : il dit seulement si un humain a laissé une trace de son contrôle.
