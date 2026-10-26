# Orbith — Internal technical specification (v0.1 / MVP)

This is the **contract** every contributor (human or AI agent) follows. Internal docs are in English.
**All user-facing text (CLI messages, agent prompts, templates, README, docs/guide) MUST be in French.**

## 1. Product summary

Orbith is an npm package run with `npx orbith <command>`. It installs, into a software project, a team of
AI agents (prompt files) usable from **Gemini CLI** and **Claude Code**, plus a deterministic Node CLI that
guides the user, enforces **human validation**, checks compliance with the company standard (**CSR**,
"Cadre de Référence"), and produces traceability reports.

Target users are AI beginners: PO / project managers (epics, US, acceptance criteria) and tech leads / devs
(development, delivery). Messages must be simple, friendly, explicit about the next action.

Core principles (non-negotiable):
1. **Human validation at the center.** The AI proposes, the human decides. Only the human (via
   `npx orbith valider`) can mark an artifact as validated. Agents never write `statut: validé`.
2. **One core, thin adapters.** Agents/workflows/templates/rules are written once in `.orbith/`.
   Platform files (Gemini, Claude) only *reference* core files. No duplicated prompt content.
3. **Fresh session per task.** Users must be told, at the end of every task, to start a new session
   (`/clear`) before the next task so the agent keeps a clean, performant context.
4. **Confidentiality.** Never put secrets, credentials, personal or client data into prompts.
5. **Traceability.** US → commits → tests → delivery.

## 2. Repository layout (this package)

```
bin/orbith.js            # imports dist/cli/index.js
src/cli/index.ts         # commander program, registers all commands
src/cli/<command>.ts     # one file per command, exports `register(program: Command)`
src/core/                # shared library (see §5) — the ONLY place for shared logic
src/adapters/gemini/     # generates Gemini CLI files
src/adapters/claude/     # generates Claude Code files
src/adapters/index.ts    # adapter registry
src/adapters/agents.ts   # agent registry (§6), RULES, deny/ignore lists
src/adapters/contexte.ts # creates .orbith/contexte-projet.md (§10.2)
src/checks/              # check rules used by `orbith check` (§4.5)
src/audit/               # `orbith audit` (collect + HTML render)
src/sbom/                # `orbith sbom` (collect, CycloneDX, licence policy) (§12)
content/                 # THE CORE, copied to <project>/.orbith/ on install
  agents/                # guide po sm ux architecte dev qa devops securite test-architect analyste redacteur-technique (.md)
  workflows/             # correctif evolution projet atelier retro relecture-adverse changement-de-cap creer-agent autopilote (.md)
  templates/             # brief prd ux architecture adr epic story release-notes environnements bug change incident
                         # menaces strategie-test retro analyse contexte-projet (.md)
  rules/                 # validation-humaine confidentialite tracabilite nouvelle-session couts-ia documentation documents-volumineux (.md)
  config/                # config.yaml (default, commented) dor.md dod.md
  csr/CSR.exemple.md     # example only — the real CSR lives in the company's private repo
  projet/                # files copied at project init (see §4.2)
plugins/backlog-md/      # orbith-plugin.json + install logic
docs/guide/              # French user documentation
docs/interne/            # internal docs (this file)
test/                    # vitest tests, mirror src/ (test/core/*.test.ts, test/cli/*.test.ts…)
```

Tech: Node ≥ 22, TypeScript strict, ESM (`"type": "module"`, NodeNext → **import paths end in `.js`**).
Dependencies already installed (do NOT add others without asking the orchestrator):
`commander`, `@clack/prompts`, `gray-matter`, `yaml`, `exceljs`, `picocolors`; dev: `typescript`, `vitest`,
`@types/node`, `tsx`. Use `node:fs/promises`, `node:path`, `node:crypto`, `node:child_process`.

## 3. Installed project layout

```
mon-projet/
├── .orbith/
│   ├── agents/ workflows/ templates/ rules/     # copied from content/
│   ├── config.yaml                               # project config (§3.1)
│   ├── config/dor.md config/dod.md               # editable by the team
│   ├── csr/CSR.md                                # copy of CSR.exemple.md at install
│   ├── contexte-projet.md                        # project memory (§10.2), created if missing, never overwritten
│   ├── custom/                                   # local overrides, never touched by update
│   ├── validations.json                          # human validation registry (§3.3), chained (§12)
│   └── deploiements.json                         # deployment registry (§4.6c), chained (§12), created on first use
├── GEMINI.md / CLAUDE.md                         # generated, reference .orbith/rules/*, CSR, project context
├── .gemini/commands/orbith/*.toml                # generated
├── .claude/commands/orbith-*.md                  # generated
├── .claude/settings.json                         # generated/merged: deny reading secrets
├── .geminiignore                                 # generated
├── docs/produit/        brief.md prd.md ux.md epics/EPIC-001-*.md
├── docs/architecture/   architecture.md environnements.md menaces.md strategie-test.md adr/ADR-001-*.md
├── docs/livraisons/     release-notes-<version>.md retro-<version>.md changes/ incidents/ audit-*.html
├── docs/amelioration/   AMEL-NNN-*.md (optional, §15)
├── backlog/tasks/       user stories (one file per US, Backlog.md compatible — §3.4)
├── src/ tests/
├── .gitlab-ci.yml                                # runs `npx orbith check`
├── CHANGELOG.md                                  # written by `orbith release` (§10.1)
└── README.md .gitignore .editorconfig
```

### 3.1 `.orbith/config.yaml`

```yaml
version: 1
orbith_version: 0.1.0
projet:
  nom: mon-projet
plateformes: [gemini, claude]   # adapters to generate
piste: evolution                # correctif | evolution | projet (default track)
backlog:
  prefixe: US                   # story id prefix → US-001
csr:
  fichier: .orbith/csr/CSR.md
  source: null                  # git+https/git+ssh repo, https URL or local file (`orbith csr sync`)
plugins: []                     # e.g. [backlog-md]
finops:
  devise: EUR
  prix: { defaut: { entree: 3, sortie: 15 } }   # price per million tokens, per model family (§4.6d)
# Optional keys (absent = default behaviour):
changements: { exiger_pour_deploiement: false }   # §11
roles:                                            # §11
  quatre_yeux: false            # validator must not be the author of the file's last commit
  valideurs: { prd: [alice@corp.fr, "Bob Martin"], change: [ops@corp.fr] }   # type (or "*") -> emails / git names
dora: { cibles: { frequence_par_semaine: 1, delai_jours: 7, taux_echec_pct: 10, retablissement_heures: 24 } }  # §4.6d
sbom: { licences_interdites: [AGPL-3.0] }         # §12
documentation: { controle: true, code: [src/] }   # §14 (check on by default; `controle: false` disables it)
extraits: { seuil_jetons: 4000 }                  # §15 (large-document threshold, estimated tokens)
autopilote: { max_us: 3, budget: 20 }             # §17 (bounded autopilot; no budget ceiling when absent)
sla: { disponibilite_pct: 99.5, retablissement_heures: { 1: 4, 2: 24 }, correction_bug_prod_jours: 5 }  # §19
```

### 3.2 Artifacts and the `statut` field

Every Orbith document has YAML frontmatter with at least:

```yaml
type: brief | prd | ux | architecture | adr | epic | story | release-notes | environnements | change | incident | menaces | strategie-test | retro | analyse | amelioration
statut: brouillon | en-revue | validé
```

- Agents create docs with `statut: brouillon`, may set `en-revue` when they ask the human to review.
- Only `orbith valider <file>` sets `statut: validé`, plus `valide_par` (git user.name) and `valide_le` (ISO date).
- Additional per-type ids: `id: EPIC-001`, `id: ADR-001`, `id: US-001`.

Canonical locations (used by `next`, `check`, `trace`):

| type | path |
|---|---|
| brief | docs/produit/brief.md |
| prd | docs/produit/prd.md |
| ux | docs/produit/ux.md |
| epic | docs/produit/epics/EPIC-NNN-*.md |
| architecture | docs/architecture/architecture.md |
| adr | docs/architecture/adr/ADR-NNN-*.md |
| story | backlog/tasks/*.md (frontmatter `type: story`) |
| release-notes | docs/livraisons/release-notes-*.md |
| change | docs/livraisons/changes/CHG-NNN-*.md |
| incident | docs/livraisons/incidents/INC-NNN-*.md |
| menaces | docs/architecture/menaces.md |
| strategie-test | docs/architecture/strategie-test.md |
| retro | docs/livraisons/retro-<version>.md |
| analyse | docs/produit/analyse.md |
| amelioration | docs/amelioration/AMEL-NNN-*.md (§19) |

Scanning uses the frontmatter `type` (files without it are ignored), the table above is where agents write.

### 3.3 Validation registry `.orbith/validations.json`

```json
{ "version": 1, "validations": [
  { "fichier": "docs/produit/prd.md", "sha256": "…", "par": "Jane Doe", "email": "jane@corp.fr", "le": "2026-10-25T10:00:00.000Z" }
] }
```

- `fichier` is POSIX, relative to project root.
- `sha256` = SHA-256 of the **body** (markdown after frontmatter), normalized: CRLF→LF, trimmed.
  Frontmatter is excluded so writing `statut`/`valide_par` doesn't change the hash, and the board column
  (`status`) of a story can move without invalidating it.
- A file is **validated** iff its frontmatter says `statut: validé` AND the registry has an entry whose hash
  equals the current body hash. If frontmatter says validé but hash differs → **modifié après validation**.
- Stories (`type: story`, bugs included) only: `orbith valider` records the hash of the body **without** its
  `## Journal de réalisation` sections (`retirerJournal`: from that level-2 heading to the next level-1/2 heading or
  the end; `empreinteValidation(body, type)`). Agents log their work and reviews there without voiding the human
  validation; every other body change is still detected (a journal heading inserted mid-section hides the text it
  swallows, so the hash changes). Backward compatible: `empreinteCorrespond(sha, body, type)` accepts the full-body
  hash (older registry entries, unchanged) or the hash without the journal. Other types: full body, as before.
  If frontmatter says validé but no registry entry → **validation non tracée** (someone/AI edited by hand).

### 3.4 User stories (Backlog.md compatible)

Stories always use Backlog.md's task format so the optional Backlog.md board shows them with no conversion.
Orbith-specific fields are added to the frontmatter. See §9 for the exact Backlog.md field names (filled
after research). Orbith fields on a story:

```yaml
type: story
statut: brouillon | en-revue | validé     # human validation of the story content
epic: EPIC-001
```

Board column (`status` in Backlog.md) values, in French: `À faire`, `Prête`, `En cours`, `En revue`, `Terminée`.
`status` is moved by humans (PO moves to `Prête` once DoR is met and the story is validated).

Body sections (French headings):
`## Description` (En tant que… je veux… afin de…), `## Critères d'acceptation` (one or more fenced
```gherkin blocks: Fonctionnalité/Scénario/Étant donné/Quand/Alors, or English keywords — both accepted),
`## Notes techniques`, `## Definition of Ready` (checklist copied from dor.md, ticked **before** validation; no
« Validée par le PO » box: validation is proven by `statut: validé` + registry), `## Journal de réalisation` (last,
excluded from the validation hash, written by agents: dev/QA/security/test notes, release-note input).

### 3.5 Traceability conventions

- Commits: Conventional Commits with the story id as scope: `feat(US-012): ajoute le login`.
  Regex for detection: `/\b([A-Z][A-Z0-9]*-\d+)\b/` restricted to the configured prefix.
- Tests: Gherkin `.feature` files tagged `@US-012`; unit tests mention `US-012` in the test name or a comment.
- Release notes list delivered story ids.

## 4. CLI commands (French output)

All commands: run from anywhere inside a project (root = nearest dir containing `.orbith/`, except `install`).
Exit code 0 = OK, 1 = problem found / error. Colored output with `picocolors`, interactive prompts with
`@clack/prompts`. Every command supports `--cwd <dir>`. Non-interactive mode for CI/tests: `--yes`.

### 4.1 `orbith install [--plateformes gemini,claude] [--piste evolution] [--nom <nom>] [--csr-source <source>] [--yes]`
1. Detect if target dir is empty (ignoring `.git`) → "nouveau projet" (also copy `content/projet/*` skeleton,
   run `git init` if no `.git`) else "projet existant" (never overwrite existing user files; skip with a warning).
2. Copy `content/{agents,workflows,templates,rules}` → `.orbith/`, `content/config/{dor,dod}.md` → `.orbith/config/`,
   `content/csr/CSR.exemple.md` → `.orbith/csr/CSR.md`, write `.orbith/config.yaml`, create `.orbith/custom/`,
   empty `validations.json`.
3. Run every selected adapter (§6).
4. Print a French summary + "Prochaine étape : lance `npx orbith next`" + the new-session reminder.

### 4.2 Project skeleton (`content/projet/`, new projects only)
`README.md` (French template with `{{nom}}`), `.gitignore`, `.editorconfig`, `.gitlab-ci.yml`,
`docs/produit/.gitkeep`, `docs/produit/epics/.gitkeep`, `docs/architecture/adr/.gitkeep`,
`docs/livraisons/.gitkeep`, `backlog/tasks/.gitkeep`, `src/.gitkeep`, `tests/.gitkeep`.
Files named `*.tmpl` get `{{nom}}` substituted and the `.tmpl` suffix removed. Note: `.gitignore` is stored as
`gitignore.tmpl` and `.gitlab-ci.yml` as `gitlab-ci.yml.tmpl`… → **rule: a leading `_` in a skeleton file name
becomes `.`** (e.g. `_gitignore` → `.gitignore`, `_gitlab-ci.yml.tmpl` → `.gitlab-ci.yml`), because npm strips
some dotfiles from published packages.

### 4.3 `orbith next`
Deterministic (no AI). Reads config + artifacts + validations and prints ONE main recommended action
(plus up to 3 secondary items), each naming the exact slash command to run, only for the platforms of `config.plateformes` (Gemini `/orbith:po`,
Claude `/orbith-po`, Copilot `/orbith-po` = name of its `.github/prompts/*.prompt.md`; default config: Gemini + Claude) or the CLI command (`npx orbith valider …`). Always ends with the new-session reminder.
Rules by track (first matching wins):
- **projet**: brief missing → po | brief not validated → review+valider | prd missing → po | prd not validated |
  ux missing → ux | ux not validated | architecture missing → architecte | not validated | no epic → po |
  epic not validated | no story → po | then story rules.
- **evolution**: (if no story) → po; then story rules. Suggest architecte if a story has label `impact-archi`
  and no validated ADR references it (keep simple: mention only).
- **correctif**: no story → po (short story) ; then story rules.
- **story rules** (scan all stories): story without gherkin block in "Critères d'acceptation" → po;
  story not validated → valider; validated story in `À faire` → "vérifie la DoR puis passe-la en Prête";
  story `Prête` → dev (`/orbith-dev US-xxx`); story `En cours` → dev continue / qa for tests;
  story `En revue` → qa + human review; all `Terminée` → sm (release notes) then "tout est livré 🎉".
- Also surface problems: artifacts "modifié après validation" (top priority).
- When at least 2 stories are eligible for the autopilot (§17) and nothing is "modifié après validation", a
  secondary action suggesting `/orbith-autopilote` / `npx orbith autopilote` is inserted right after the dev action.

### 4.4 `orbith valider <fichier> [--yes]`
Shows file summary (type, id, title), asks confirmation ("Je confirme avoir relu et valider ce document"),
reads git `user.name`/`user.email` (fails with a clear message if missing), sets frontmatter
`statut: validé`, `valide_par`, `valide_le`, writes registry entry (replace existing entry for that file).
Refuses files without Orbith frontmatter `type`. `--yes` skips the prompt (for scripted use; the docs warn it
must only be used by a human).

### 4.5 `orbith check [--format texte|json]`
Runs all checks, prints a French report grouped by category, exit 1 if any **erreur** (avertissements don't fail):
- **csr**: parse CSR.md (§7) and compare with detected stack: Node (`package.json` engines.node, `.nvmrc`,
  `.node-version`, dependencies vs forbidden libs), Java (`pom.xml` `maven.compiler.release`/`java.version`,
  `build.gradle(.kts)` toolchain/sourceCompatibility), Python (`pyproject.toml` requires-python,
  `.python-version`, `requirements*.txt` package names). Forbidden tool used → erreur; version below minimum →
  erreur; deprecated → avertissement.
- **validations**: for every artifact: modifié après validation → erreur; validation non tracée → erreur.
- **tracabilite**: last 50 commits (`git log`) without a story id → avertissement (skip if not a git repo);
  stories `Terminée` with no commit referencing them → avertissement.
- **secrets**: scan tracked text files (git ls-files, else walk excluding node_modules/.git/dist) for common
  patterns (AWS keys, private key headers, `password\s*=\s*['"][^'"]+`, generic tokens, `.env` committed) → erreur.
- **validations** also includes the chained-registry check (`src/checks/chaine.ts`, §12) and governance
  (`src/checks/gouvernance.ts`, §11); **documentation** (`src/checks/documentation.ts`, §14); **sbom** (licence policy,
  `src/checks/sbom.ts`, §12).
Each check lives in `src/checks/<name>.ts` and exports `run(ctx): Promise<CheckResult[]>`. Categories, in output
order: `csr`, `validations`, `tracabilite`, `documentation`, `secrets`, `sbom` (`CheckCategorie` in
`src/checks/types.ts`; titles in `src/cli/check.ts` and `src/audit/render.ts`). `--format json` prints
`{ conforme, erreurs, avertissements, resultats[] }`.

### 4.6 `orbith trace [ID] [--sortie <fichier.md>]`
Builds a markdown traceability matrix: per story → title, statut, board status, validated by/when, commits
(hash + subject), tests referencing it (files containing `@ID` or `ID`), release notes mentioning it.
With ID: detail for one story. Prints to stdout or writes file.

### 4.6b `orbith tests [ID] [--dossier tests/features] [--force]`
Deterministic (no AI) test skeletons: for each story with `statut: validé` and Gherkin acceptance criteria
(```gherkin blocks, else the « Critères d'acceptation » section), writes `<dossier>/<id>.feature`
(`<id>-2.feature`… for extra blocks), adding `@ID`, a `Fonctionnalité:` line and `# language: fr` when missing.
Existing files are kept unless `--force`. Non-validated stories are skipped (human validation first).

### 4.6b2 `orbith version <numero> [--depuis <ref>]`
PO command. Number: digits and dots (`1.1.0.0`), optional `-suffix`. Stories = those whose id is mentioned
(boundary-aware) in commit messages (subject and body, merge commits included) in `<prev>..HEAD`, where
`<prev>` = `--depuis` or the `commit` of the last entry of `.orbith/versions.json` (whole history for the first).
Appends `{numero, date, commit: HEAD, par, us[]}` to `.orbith/versions.json` and writes the draft
`docs/livraisons/release-notes-<numero>.md` (`statut: brouillon`, Nouveautés / Corrections split on the `bug`
label, Stories livrées table). Refuses duplicates and an existing notes file. Warns (does not exclude) stories
not « Terminée » or not validated. `orbith deploiement <numero>` then dates every story listed in the notes.

### 4.6c `orbith deploiement <version> [--env production] [--date AAAA-MM-JJ] [--yes]`
Human command run after a real deployment. Requires validated release notes for the version (frontmatter
`version`, else `release-notes-<version>.md`). Appends `{version, env, date, par, email, us[]}` to
`.orbith/deploiements.json` (idempotent per version+env); `us` = story ids mentioned in the notes. For
`production`: writes `mis_en_prod_le` (and, if missing, `debut_dev_le` from the first commit mentioning the id and
`termine_le` from the last commit that changed the `status:` line, when it set the story to « Terminée »)
in each story, and `mis_en_prod_le` in the notes. Frontmatter only: body hashes, hence validations, are unchanged.
`orbith next` asks for it once validated notes cover all done stories and have no `mis_en_prod_le`.

### 4.6d `orbith metriques [--jours 90] [--format texte|json|csv] [--sortie f]`
DORA metrics over the period, production deployments only:
- deployment frequency (per week); lead time = median(`mis_en_prod_le` − `debut_dev_le` or first commit) of
  non-bug stories deployed in the period;
- change failure rate = production deployments containing a story named in the `cause` of a bug
  (`labels: [bug]`, `origine: production`) / production deployments.
  With ≥1 production deployment and no declared production bug, the value stays 0 % (level and target still computed)
  but is flagged: text report appends « : aucun bug déclaré : à vérifier », and JSON
  `tauxEchec.avertissement` carries that string (`null` otherwise);
- time to restore = median(bug `mis_en_prod_le` − `detecte_le`), in hours.
Also « attente » = median(`mis_en_prod_le` − `termine_le`). Levels (élite/élevé/moyen/faible) use DORA-report thresholds. Also a per-story table (created_date,
updated_date, début dev, mise en prod, lead time, AI cost) and AI costs: sum of `couts_ia[].cout`, per agent.
`couts_ia` entries are appended by the agents (rule `couts-ia`), self-estimated with `finops.prix` from config.

Enriched DORA (all additive; absent data is reported « non mesurable », never 0):
- optional config `dora.cibles` = `{frequence_par_semaine (min), delai_jours, taux_echec_pct, retablissement_heures (max)}`;
  unknown key or non-numeric value → `OrbithError` at `loadConfig`. Output: `cibles[]` `{cle, cible, valeur, atteinte}`
  (`atteinte: null` when the value is not measurable); absent when no target is configured.
- trends: same metrics over the previous window of equal length (ends the day before the current start) →
  `precedent` + `tendances[]` `{valeur, precedent, ecart, fleche ↑↓→, favorable}`; null if either side is unmeasurable.
  A period with no production deployment has no frequency value.
- `decoupageAttente`: `revue` = `revue_le` − `termine_le`; `recette` = first non-production registry deployment listing
  the story − (`revue_le` ?? `termine_le`); `production` = `mis_en_prod_le` − recette date. Each = median over stories
  having both dates (`{medianeJours, us}`, null when none). `revue_le` is an optional, human-written frontmatter field.
- `taille`: per production deployment of the period `{version, date, us, commits}` (commits whose subject mentions one of
  its stories; null without git) and medians `usParVersion`, `commitsParVersion`.
- `--format csv`: one row per indicator, UTF-8 BOM, `;` separator, decimal comma. JSON/text/CSV all carry the reminder
  that DORA measures a team, not individuals (JSON key `rappel`).

### 4.7 `orbith csr import <fichier.xlsx> [--sortie <fichier>]` (default: `csr.fichier` from config)
Reads an Excel workbook with exceljs. Each sheet → a `## <sheet name>` section and a markdown table.
Expected columns (case/accents-insensitive matching): Outil, Version min, Statut, Commentaire (extra columns kept).
Writes CSR.md with a header (source file, date). Prints how many tools imported.

### 4.8 `orbith update [--yes]`
Re-copies `content/{agents,workflows,templates,rules}` (`CORE_DIRS` in `src/cli/install.ts`, whole directories, so new
agents/templates/rules propagate) into `.orbith/` (overwriting), never touches `config.yaml`, `config/`, `csr/`
(except a `csr.source` sync), `custom/`, `contexte-projet.md`, `validations.json`, `deploiements.json`; bumps
`orbith_version`; re-runs adapters (all `AGENTS` commands regenerated).

### 4.9 `orbith plugin add <nom>` / `orbith plugin list`
Loads `plugins/<nom>/orbith-plugin.json`, runs its installer, adds name to `config.plugins`. `list` shows available
and enabled plugins.

### 4.10 Other commands
`orbith csr sync` (§10), `orbith audit` (§10), `orbith version` / `orbith release` (§10.1), `orbith init-context` /
`orbith preparation` (§10.2), `orbith sbom` (§12), `orbith decouper` (§15), `orbith agent new` / `orbith agent list` (§16). Every command also accepts `--cwd <dir>`; `--help` is the
reference for options.

## 5. Core library API (`src/core/`) — shared by all commands

```ts
// paths.ts
export const ORBITH_DIR = '.orbith';
export function packageRoot(): string;               // dir containing package.json of orbith (from import.meta.url)
export function contentDir(): string;                // packageRoot()/content
export function pluginsDir(): string;                // packageRoot()/plugins
export async function findProjectRoot(start: string): Promise<string | null>;
export async function requireProjectRoot(start: string): Promise<string>; // throws OrbithError (French msg) if none
export function toPosixRelative(root: string, file: string): string;

// errors.ts
export class OrbithError extends Error {}            // message in French, shown without stack trace

// config.ts
export interface OrbithConfig { version: 1; orbith_version: string; projet: { nom: string };
  plateformes: Plateforme[]; piste: Piste; backlog: { prefixe: string };
  csr: { fichier: string; source: string | null }; plugins: string[];
  finops: { devise: string; prix: Record<string, { entree: number; sortie: number }> };
  dora?: { cibles?: DoraCibles }; changements?: { exiger_pour_deploiement: boolean };
  roles?: { quatre_yeux: boolean; valideurs: Record<string, string[]> };
  sbom?: { licences_interdites: string[] }; documentation?: { controle: boolean; code: string[] }; }
export const DORA_CIBLES_CLES; export const DOCUMENTATION_CODE_DEFAUT; // ['src/']
export type Plateforme = 'gemini' | 'claude';
export type Piste = 'correctif' | 'evolution' | 'projet';
export function defaultConfig(nom: string): OrbithConfig;
export async function loadConfig(root: string): Promise<OrbithConfig>;
export async function saveConfig(root: string, cfg: OrbithConfig): Promise<void>;

// frontmatter.ts
export interface Doc { data: Record<string, unknown>; body: string; }
export async function readDoc(file: string): Promise<Doc>;
export async function writeDoc(file: string, doc: Doc): Promise<void>;

// validations.ts
export type EtatValidation = 'validé' | 'non-validé' | 'modifié' | 'non-tracé';
export interface ValidationEntry { fichier: string; sha256: string; par: string; email: string; le: string; }
export function hashBody(body: string): string;
export function retirerJournal(body: string): string;             // drops `## Journal de réalisation` sections
export function empreinteValidation(body: string, type: unknown): string; // hash recorded by `valider`
export function empreinteCorrespond(sha256: string, body: string, type: unknown): boolean;
export async function loadRegistry(root: string): Promise<ValidationEntry[]>;
export async function recordValidation(root: string, entry: ValidationEntry): Promise<void>;
export async function etatValidation(root: string, file: string, doc?: Doc): Promise<EtatValidation>;

// artifacts.ts
export type ArtifactType = 'brief'|'prd'|'ux'|'architecture'|'adr'|'epic'|'story'|'release-notes'|'environnements'
  |'change'|'incident'|'menaces'|'strategie-test'|'retro'|'analyse';
export const ARTIFACT_TYPES: readonly ArtifactType[];
export interface Artifact { type: ArtifactType; chemin: string /* posix relative */; id?: string; titre?: string;
  statut?: string; etat: EtatValidation; data: Record<string, unknown>; body: string; }
export async function scanAll(root: string): Promise<{ artifacts: Artifact[]; problems: FrontmatterProblem[] }>;
export async function scanArtifacts(root: string): Promise<Artifact[]>;
export function storyStatus(a: { data: Record<string, unknown> }): string; // board column, accent/case-insensitive
export function hasGherkin(body: string): boolean;   // ```gherkin block or Scénario:/Scenario: lines in AC section
export const STORY_STATUSES = ['À faire','Prête','En cours','En revue','Terminée'] as const;

// git.ts
export async function gitUser(root: string): Promise<{ name: string; email: string } | null>;
export async function isGitRepo(root: string): Promise<boolean>;
export async function gitLog(root: string, max: number): Promise<{ hash: string; subject: string }[]>;
export async function gitLsFiles(root: string): Promise<string[] | null>;
export async function gitLogFiles(root: string, max: number): Promise<{ hash: string; subject: string; files: string[] }[]>;
export async function gitLogDated(root: string): Promise<{ hash: string; date: string; subject: string }[]>;
export async function gitLastAuthor(root: string, rel: string): Promise<{ name: string; email: string } | null>;
// also: gitLastStatusChange (git.ts); git-release.ts (§10.1), roles.ts and changes.ts (§11), chaine.ts (§12),
// csr-source.ts (§10).

// fsutil.ts
export async function exists(p: string): Promise<boolean>;
export async function copyDir(src: string, dest: string, opts?: { overwrite?: boolean }): Promise<string[]>; // returns written files
export async function writeFileSafe(p: string, content: string, opts?: { overwrite?: boolean }): Promise<boolean>;

// ui.ts  — French console helpers
export const ui: { titre(s:string):void; ok(s:string):void; info(s:string):void; avert(s:string):void;
  erreur(s:string):void; etape(s:string):void; rappelNouvelleSession():void; };
// rappelNouvelleSession prints:
// "💡 Tâche terminée ? Ouvre une NOUVELLE session (ou tape /clear) avant la suivante : l'agent repart
//    avec un contexte propre et reste performant."

// index.ts re-exports everything.
```

`src/cli/index.ts` registers commands, catches `OrbithError` → `ui.erreur(msg)` + exit 1.

## 6. Adapters (`src/adapters/`)

```ts
export interface Adapter { id: Plateforme; nom: string; generate(root: string, cfg: OrbithConfig): Promise<string[]>; }
export const adapters: Record<Plateforme, Adapter>;
```

Agent registry (single source, `src/adapters/agents.ts`):

| key | file | Gemini command | Claude command | description (FR) |
|---|---|---|---|---|
| guide | agents/guide.md | /orbith:guide | /orbith | Guide Orbith : où j'en suis, quoi faire ensuite, aide |
| po | agents/po.md | /orbith:po | /orbith-po | Product Owner : brief, PRD, epics, US, critères Gherkin |
| sm | agents/sm.md | /orbith:sm | /orbith-sm | Scrum Master / chef de projet : sprints, DoD, livraisons |
| ux | agents/ux.md | /orbith:ux | /orbith-ux | UX Designer : parcours, écrans, accessibilité |
| architecte | agents/architecte.md | /orbith:archi | /orbith-archi | Architecte : architecture conforme au CSR, ADR |
| dev | agents/dev.md | /orbith:dev | /orbith-dev | Développeur : implémente une US validée |
| qa | agents/qa.md | /orbith:qa | /orbith-qa | QA : tests Gherkin, revue, couverture des critères |
| devops | agents/devops.md | /orbith:devops | /orbith-devops | DevOps : pipelines CI/CD, environnements non identiques |
| atelier | workflows/atelier.md | /orbith:atelier | /orbith-atelier | Atelier : plusieurs agents discutent ensemble |
| securite | agents/securite.md | /orbith:securite | /orbith-securite | Sécurité : modélisation des menaces, revue des US sensibles |
| test-architect | agents/test-architect.md | /orbith:test-archi | /orbith-test-archi | Test Architect : stratégie de test par risque |
| analyste | agents/analyste.md | /orbith:analyste | /orbith-analyste | Analyste : brainstorming, hypothèses, risques et alternatives avant le brief |
| redacteur-technique | agents/redacteur-technique.md | /orbith:redacteur | /orbith-redacteur | Rédacteur technique : README, guides, schémas Mermaid, exactitude vérifiée dans le code |
| retro | workflows/retro.md | /orbith:retro | /orbith-retro | Rétrospective après livraison, à partir des métriques et des constats QA |
| relecture-adverse | workflows/relecture-adverse.md | /orbith:relecture-adverse | /orbith-relecture-adverse | Relecture adverse : passe critique avant de valider PRD, architecture ou US |
| changement-de-cap | workflows/changement-de-cap.md | /orbith:changement-de-cap | /orbith-changement-de-cap | Changement de cap : impact d'un changement de besoin sur les epics et les US |
| creer-agent | workflows/creer-agent.md | /orbith:creer-agent | /orbith-creer-agent | Créer un agent : concevoir, question par question, un agent personnalisé du projet |
| autopilote | workflows/autopilote.md | /orbith:autopilote | /orbith-autopilote | Autopilote borné : enchaîne Dev puis QA sur les US éligibles, s'arrête à chaque porte humaine |

18 entries: 12 agents and 6 workflows (atelier, retro, relecture-adverse, changement-de-cap, creer-agent, autopilote); `orbith install`
and `orbith update` generate one Gemini and one Claude command per entry, **plus one per custom agent of the project**
(`.orbith/custom/agents/<key>.md` with a `description` frontmatter, see §16): adapters iterate over
`agentsDuProjet(root)` (core `AGENTS` followed by the custom ones, `src/adapters/agents-perso.ts`), which throws an
`OrbithError` on any collision with a core command, so a core command is never overwritten.

Opt-in third platform `copilot` (GitHub Copilot in VS Code; not in the default `plateformes`): one workspace prompt
file `.github/prompts/<claude command>.prompt.md` per entry (frontmatter `description`, `argument-hint`; body is a
Markdown link to `../../.orbith/<file>`, no copied content) and a marked block in `.github/copilot-instructions.md`
linking the rules, CSR and project context. Copilot has no project-level read-deny file, so none is generated.
Format source: code.visualstudio.com/docs/agent-customization/prompt-files and …/custom-instructions.
`config.yaml` rejects unknown platforms, listing the allowed values (`gemini, claude, copilot`). Advanced agents/workflows (securite,
test-architect, analyste, redacteur-technique, retro, relecture-adverse, changement-de-cap) follow the §8 conventions; their output documents are
regular artifacts (§13).
A third platform is deliberately not implemented: `Plateforme` is a closed union validated in `core/config.ts`
and `cli/install.ts`, so an adapter is not trivial (see docs/guide/agents-avances.md).

Generated files only **reference** core files, e.g. Gemini `.gemini/commands/orbith/po.toml`:

```toml
description = "Product Owner : brief, PRD, epics, US, critères Gherkin"
prompt = """
@{.orbith/agents/po.md}

Demande de l'utilisateur : {{args}}
"""
```

Claude `.claude/commands/orbith-po.md`:

```markdown
---
description: Product Owner : brief, PRD, epics, US, critères Gherkin
argument-hint: [ta demande]
---
@.orbith/agents/po.md

Demande de l'utilisateur : $ARGUMENTS
```

`GEMINI.md` / `CLAUDE.md`: generated inside markers so user content is preserved:
```
<!-- orbith:debut -->
# Orbith
Ce projet utilise Orbith. Règles permanentes :
@.orbith/rules/validation-humaine.md
@.orbith/rules/confidentialite.md
@.orbith/rules/tracabilite.md
@.orbith/rules/nouvelle-session.md
@.orbith/rules/couts-ia.md
@.orbith/rules/documentation.md
@.orbith/rules/documents-volumineux.md
Référentiel technique (CSR) : @.orbith/csr/CSR.md
Contexte projet (conventions, patterns, pièges) : @.orbith/contexte-projet.md
<!-- orbith:fin -->
```
If the file exists, replace only the marked block (or append it). Same marker approach for `.geminiignore`
(`# orbith:debut` / `# orbith:fin`). `.claude/settings.json`: merge (never drop user keys) adding
`permissions.deny` entries for `Read(./.env)`, `Read(./.env.*)`, `Read(./**/*.pem)`, `Read(./**/*.key)`,
`Read(./secrets/**)`.
The guide command also injects `!{npx orbith next}` output for Gemini (shell injection) — Claude: the guide
prompt tells the agent to run `npx orbith next`.

## 7. CSR markdown format

```markdown
# Cadre de Référence (CSR)
> Source : … — Mis à jour le …

## Langages
| Outil | Version min | Statut | Commentaire |
|---|---|---|---|
| Java | 21 | autorisé | |
| Node.js | 22 | autorisé | LTS uniquement |
| Python | 3.11 | autorisé | |

## Frameworks
| Outil | Version min | Statut | Commentaire |
| Spring Boot | 3.3 | autorisé | |
| AngularJS | | interdit | fin de vie |
| moment | | déprécié | utiliser date-fns |
```
Statut values: `autorisé`, `déprécié`, `interdit` (accent-insensitive; also accept `autorise`, `deprecie`,
`interdit`, `obligatoire` = autorisé + must be present). Tool names are matched case-insensitively against
detected runtimes (Node.js/node, Java, Python) and dependency names (npm, maven artifactId, pip names).
Versions compared numerically by dotted segments (`22` ≥ `20.11`). Parser in `src/checks/csr-parser.ts`,
exported for reuse by `csr import` tests and the architect agent docs.

## 8. Agent prompt conventions (content/agents/*.md, French)

Each agent file: role, mission, what it reads (paths), what it produces (paths + template to use),
step-by-step procedure, **validation gates** (refuse to proceed if prerequisite not `validé`; tell the user to
run `npx orbith valider <file>`), behavior rules (propose 2-3 options for structuring choices and wait; never
decide alone; never write `statut: validé`; ask one question at a time; simple French for beginners; explain
jargon), and an end-of-task block: summary of what was produced, the next command, and the new-session
reminder. Agents read `.orbith/config.yaml`, `.orbith/csr/CSR.md`, DoR/DoD files when relevant. Overrides:
if `.orbith/custom/agents/<name>.md` exists, the agent must read it and apply it on top. A file there whose name is
not a core agent and that has a `description` frontmatter is a custom agent (§16) and follows these same conventions. Agents that change code or
pipelines (`dev`, `devops`) apply the documentation rule (§14) and report it in their end-of-task block.

## 9. Backlog.md compatibility (verified with backlog.md v1.55.3)

- Tasks live in `backlog/tasks/`. **File name: `<prefix lowercase>-NNN - <Titre>.md`**, e.g. `us-001 - Connexion par email.md`.
  A file named `US-001 - X.md` (uppercase) is ignored by Backlog.md.
- Frontmatter: `id: US-001` (uppercase in the field), `title`, `status`, `assignee: []`, `created_date`, `labels: []`,
  `dependencies: []`, optional `ordinal`, `updated_date`. Unknown fields (`type`, `statut`, `epic`) are preserved
  when the board edits a card.
- Body: Backlog.md writes `<!-- SECTION:DESCRIPTION:BEGIN/END -->` and `<!-- AC:BEGIN/END -->` markers when it edits;
  a hand-written body without markers is displayed as the description. Orbith writes plain sections (§3.4).
- `backlog/config.yml` keys are snake_case: `statuses`, `default_status`, `task_prefix`, `zero_padded_ids: 3`,
  `auto_commit`. Accented statuses (`À faire`, `Prête`…) work. The prefix must be letters only.
- Non-interactive init: `backlog init "Nom" --defaults --task-prefix US --integration-mode none --no-git`
  (the Orbith plugin writes `backlog/config.yml` itself instead). Board: `backlog browser` (port 6420).
- Orbith code locates stories by frontmatter `type: story` in `backlog/tasks/**/*.md`, never by filename.

## 10. Additions after MVP

- **CSR source** (`src/core/csr-source.ts`): `csr.source` accepts a local path, `git+https://`, `git+ssh://`,
  `git+file://` (`…repo.git[@ref]#path/CSR.md`, shallow clone via execFile, `GIT_TERMINAL_PROMPT=0`), or an
  `https://` raw file (`http://` refused). Content must parse to ≥1 CSR entry, otherwise the local file is kept.
  Used by `orbith csr sync`, `orbith update` (warning on failure) and `orbith install --csr-source`.
- **Invalid frontmatter**: `scanAll(root) → { artifacts, problems }`; `check` reports "Frontmatter invalide"
  (erreur); `computeNext(arts, cfg, problems?)` shows them first.
- **`orbith audit [--sortie f.html] [--format html|json]`** (`src/audit/`): self-contained, print-friendly,
  accessible French HTML report (synthèse, validations humaines, matrice de traçabilité, contrôles). Default
  output `docs/livraisons/audit-YYYY-MM-DD.html`. Always exit 0.
- **Distribution**: `prepare` builds on git install → `npx github:Newt33700/Orbith install`. npm publish via
  `.github/workflows/release.yml` on `v*` tags (secret `NPM_TOKEN`).
- **CI**: `.github/workflows/ci.yml` — build + tests on ubuntu/windows/macos × Node 22/24, plus a smoke job.
- **Plugins**: authoring guide `docs/guide/creer-un-plugin.md`, template `docs/guide/exemples/plugin-modele/`.

### 10.1 Version management (`orbith version`, `orbith release`) — no AI, never pushes

Files: `src/cli/version-calc.ts` (W.X.Y.Z version + Conventional Commits logic), `src/cli/version.ts`, `src/cli/release.ts`,
`src/core/git-release.ts` (tags, commits since a tag, annotated tag, path-limited commit). Guide: `docs/guide/versions.md`.

- **`orbith version` (no argument; with a number it is §4.6b2) `[--format texte|json]`**: base = highest `vW.X.Y.Z` tag reachable (legacy 3-part tags read as `W.X.Y.0`) from HEAD (`git tag --merged HEAD`, annotated or lightweight; tags only on other branches are ignored; else 0.0.0.0); inputs = commits since that tag
  + pending stories (`Terminée`, no `mis_en_prod_le`, or cited by a commit since the tag), excluding stories cited by
  the release notes of a version that already has a tag (`storiesDejaLivrees`). Bump = max of:
  major = `type!:` / `BREAKING CHANGE:` footer / story label `breaking` (case-insensitive, constant `BREAKING_LABEL`);
  minor = `feat` / done non-bug story; patch = `fix` / done story labelled `bug`. Other types do not bump.
  Read-only; prints the reasons; nothing proposed when no signal.
- **`orbith release <version> [--yes] [--sans-tag] [--dry-run] [--date]`** (`vW.X.Y.Z` accepted; exactly four digits required, `1.2.0` is refused):
  1. refuses a version that is not `W.X.Y.Z`, an existing tag (checked against all tags, reachable or not; a tag only on another branch gets a dedicated message), or a version ≤ the highest tag reachable from HEAD;
  2. no notes (`docs/livraisons/release-notes-<version>.md` or frontmatter `version`) → writes a draft (2 audiences)
     from the done pending stories, then fails (`--dry-run`: writes nothing; an existing unrecognized file at that
     path is never overwritten);
  3. guardrails, all reported together (exit 1): notes not `validé`; a story cited in the notes is not `Terminée`;
     any `orbith check` error;
  4. warnings only: notes cite no story, no « exploitation » part, major expected (breaking) but not chosen,
     changelog includes commits of stories not `Terminée`, a story cited in the notes has uncommitted changes;
  5. prints the CHANGELOG section; after confirmation (`--yes` or TTY prompt; non-TTY without `--yes` fails):
     prepends `## [W.X.Y.Z] - date` (local date) to `CHANGELOG.md`, keeping its line endings (Changements majeurs /
     Nouveautés / Corrections, from commits; breaking stories listed too), commits only that file plus the notes file
     and `.orbith/validations.json` when they have uncommitted changes (`chore(release): vW.X.Y.Z`, path-limited: other
     staged files stay staged) and creates the annotated local tag `vW.X.Y.Z`. A failed commit restores `CHANGELOG.md`
     and the index and reports git's message; a failed tag reports the manual `git tag` command.
     `--sans-tag` stops after the changelog and prints the `git add` / `git commit` / `git tag` commands;
     `--dry-run` writes nothing. **Never pushes**.
- **Release-notes template** (`content/templates/release-notes.md`): parts `Résumé`, `Pour les utilisateurs`
  (Nouveautés, Corrections, Limites connues), `Pour l'exploitation` (Changements à connaître, Déploiement et retour
  arrière, Surveillance), `Stories livrées`. `orbith deploiement` still reads story ids from the whole body.
- **Recognized story labels**: `bug`, `impact-archi`, `breaking`.

### 10.2 Project context and readiness check (`docs/guide/contexte-preparation.md`)
- **Project context**: template `content/templates/contexte-projet.md`; adapters (`src/adapters/contexte.ts`,
  `ensureContexteProjet`) create `.orbith/contexte-projet.md` from it when missing (never overwritten, not in
  `CORE_DIRS`, so untouched by `update`). The generated GEMINI.md/CLAUDE.md block references it. The marker
  `<!-- orbith:a-completer -->` stays until a human/agent has filled the file. Agents (`po sm ux architecte dev qa
  devops`) read it and may *propose* additions.
- **`orbith init-context`** (`src/cli/init-context.ts`): deterministic detection (manifests, lockfiles, scripts,
  test/quality tools, CI/Docker, 2-level tree) written between `<!-- orbith:auto-debut/fin -->` in the context
  file (created from the template if absent); hand-written text outside the block is preserved; idempotent.
- **`orbith preparation [--format texte|json]`** (`src/cli/preparation.ts`, pure `evaluerPreparation`): no AI.
  FAIL (exit 1): missing/unvalidated brief, prd, architecture, epic (track `projet` only), modified/untraced docs,
  invalid frontmatter, no story, story → unknown epic, open story without Gherkin, unknown or circular
  dependency, `impact-archi` story without a validated ADR citing it. CONCERNS: ux missing/unvalidated, epic
  without story, story without epic (`projet`), open story not validated, in-progress story with unfinished
  dependency, context file absent or still marked `a-completer`. Otherwise PASS.
- `orbith next` inserts a secondary action `npx orbith preparation` right after the `dev` action while no story
  is `En cours`/`En revue`/`Terminée`.

## 11. Change requests and role matrix (all optional, off by default)

- **Artifact `change`** (`content/templates/change.md`, `docs/livraisons/changes/CHG-NNN-*.md`, id `CHG-NNN`).
  Frontmatter: `changement: standard|normal|urgent`, `risque: faible|moyen|élevé`, `version` (release version
  concerned), `fenetre_debut`/`fenetre_fin`, `approbateurs` (emails or git names), `demandeur`. Body section
  « Plan de retour arrière » is mandatory. Helpers in `src/core/changes.ts` (`changeType`, `changeRisque`,
  `planRetourArriere`, `changesPourVersion`, `refusChangement`).
- **Artifact `incident`** (`content/templates/incident.md`, `docs/livraisons/incidents/INC-NNN-*.md`): blameless
  post-mortem template; scanned and validated like any other artifact, no other behaviour.
- **Config `changements.exiger_pour_deploiement: true`**: `orbith deploiement <version>` (env `production` only)
  fails unless a `change` with that `version` is `validé`; the id is stored as `change` in `deploiements.json`.
  `orbith next` suggests creating/validating the change once release notes are validated.
- **Config `roles.valideurs`** (map type or `*` -> list of emails / git names, case-insensitive): `orbith valider`
  refuses anyone else. For a `change`, a non-empty `approbateurs` list is an additional restriction.
- **Config `roles.quatre_yeux: true`**: `orbith valider` refuses when the validator is the author (name or email)
  of the last commit touching the file (`gitLastAuthor`); unknown author (untracked file) = allowed. The author is
  recorded in the registry (`auteur`, `auteur_email`, optional fields) so that `check` can report violations later.
- **`orbith check`** (category `validations`, `src/checks/gouvernance.ts`): warnings for incomplete change requests
  (type, risk, version, rollback plan, window and approvers unless `standard`); errors for a validation recorded by
  someone outside the role matrix / approvers, or breaking the four-eyes principle.
- **`orbith trace`** appends a « Demandes de changement » table; `orbith audit` lists changes with other artifacts.
- Logic: `src/core/roles.ts` (`valideursDuType`, `refusRole`, `refusQuatreYeux`).

## 12. Chained audit journal and SBOM

- **Chained audit journal** (`src/core/chaine.ts`): every entry of `.orbith/validations.json` and
  `.orbith/deploiements.json` carries `precedent` = SHA-256 of the previous entry's canonical JSON (sorted keys,
  `precedent` included); the first one uses `GENESE` (64 zeros). `recordValidation` replaces the file's entry, then
  rechains the whole registry; it throws on a broken chain (never launders a manual edit) and chains legacy
  registries (no `precedent` anywhere) on the fly. `runDeploiement` behaves the same. `check` (category
  `validations`, `src/checks/chaine.ts`): broken chain → erreur, legacy registry → avertissement.
  Removal check (`entreesPerdues`, `gitShowHead`): when the project is a git repository, `check` compares each registry
  with `git show HEAD:<path>`. An entry committed but missing/altered in the working copy = erreur "Entrée supprimée ou
  modifiée" (this catches dropping only the last entry). `deploiements.json` is append-only (committed entries must be an
  unchanged prefix); `validations.json` ignores `precedent` and tolerates the legitimate replacement of a file's entry by
  `recordValidation` (an entry whose `fichier` is still present). No git, no commit or untracked registry: skipped.
  Residual limit: a rewrite that keeps every `fichier` (altered hash, rechained by hand) looks like a revalidation.
- **`orbith sbom [--sortie f] [--cwd d]`** (`src/sbom/`): deterministic component inventory (package-lock v1–v3 else
  package.json; pom.xml; requirements*.txt, pyproject.toml), sorted by purl, rendered as minimal CycloneDX 1.5 JSON
  (no timestamp, content-derived `serialNumber`). stdout by default; summary on stderr in that case. Exit 0.
- **License policy**: forbidden/deprecated licenses from the CSR category "Licences" (statut interdit / déprécié) and
  `sbom.licences_interdites` in config.yaml. `check` category `sbom` (`src/checks/sbom.ts`): forbidden → erreur,
  deprecated → avertissement, unknown license → info. SPDX `OR` is lenient, `AND`/`WITH` strict. No policy → no results.
  Guide: `docs/guide/integrite-sbom.md`.

## 13. Advanced-agent documents (`menaces`, `strategie-test`, `retro`, `analyse`)

- Artifact types written by the Security agent (`docs/architecture/menaces.md`), the Test Architect
  (`docs/architecture/strategie-test.md`) and the `retro` workflow (`docs/livraisons/retro-<version>.md`).
  Templates: `content/templates/{menaces,strategie-test,retro}.md` (frontmatter `type` + `statut: brouillon`).
- `analyse` (`docs/produit/analyse.md`, template `content/templates/analyse.md`) is written by the Analyst agent before the
  brief; `orbith next` (piste `projet`, no brief yet) suggests the Analyst as a secondary action. The Technical Writer
  agent produces no typed artifact (it edits README/guides, never production code or validated documents). Templates
  architecture, ux, environnements and epic carry commented Mermaid examples.
- They are validated like any other artifact (`orbith valider <file>`, hash recorded in the registry, `check`
  detects later edits). Agents never write `statut: validé`.
- `orbith next` appends a low-priority `valider` suggestion for each of these documents still not validated.
  `trace` and `audit` need no specific handling (no US link); `audit` lists them with the other artifacts.

## 14. Documentation kept up to date (rule + check)

- **Rule** `content/rules/documentation.md` (in `RULES`, hence in the GEMINI.md/CLAUDE.md block): any code change made
  or proposed by an agent updates, in the same commit or at the latest in the same story, the documentation it makes
  wrong or incomplete (README, user guides, technical docs/ADR, code comments, documented config, release-note input
  in `## Journal de réalisation`, runnable examples), with a checklist; an agent never says "done" without reporting it.
  Applied by `dev` (procedure step + end-of-task line), `qa` (gap = « À corriger » finding), `devops` (pipeline
  docs), `sm` (DoD proof, release notes); DoD item « Documentation à jour » is made verifiable.
- **Check** `src/checks/documentation.ts`, category `documentation`, level `avertissement` only (never fails `check`):
  over the last 50 commits (same window as `tracabilite`), commits are grouped by story id found in the subject; a
  story whose commits touch a code path (prefixes `documentation.code`, default `src/`) and no documentation file
  (`docs/**`, `README*`, `CHANGELOG*`, any `*.md|*.mdx|*.adoc|*.rst`, excluding `backlog/**` and `.orbith/**` except
  `.orbith/contexte-projet.md`) is reported. Skipped when the story frontmatter has `documentation: non-concernée`
  (accent/case-insensitive; also `aucune`), when `documentation.controle: false`, or outside a git repository.

## 15. Large documents: sharding (`orbith decouper`)

Goal: a 40-page PRD/architecture must not be loaded whole into an agent context ("one task = one session").
Deterministic, no AI. Code: `src/core/extraits.ts` (logic), `src/cli/decouper.ts`, `src/checks/extraits.ts`.

- **Command** `orbith decouper <fichier> [--niveau 2] [--sortie <dossier>] [--cwd]`. Reads a Markdown file
  (`.md`, inside the project), strips frontmatter (`parseDoc`), splits the body at ATX headings of level <= N
  (N in 1..6, default 2). Headings inside fenced code blocks (``` / ~~~, fence length honoured, unterminated fence
  runs to EOF) are ignored; setext headings are not recognised. Text before the first heading is an
  `Introduction` section (level 0); a heading with a lower level than N and no own content is not a section. No
  heading <= N at all -> `OrbithError` (nothing written).
- **Output** (default `.orbith/extraits/<slug of file name>/`): `index.md` (table: section, estimated tokens,
  link) and one `NN-<slug>.md` per section (numbering starts at `00`). Tokens = `ceil(chars / 4)`
  (`estimerJetons`). Output is derived, read-only for agents, listed in the generated project's ignore file
  (`content/projet/_gitignore`). Same input -> byte-identical output.
- **Never an artifact**: extracts and index have no frontmatter; line 1 is an HTML comment
  `<!-- orbith-extrait source="<posix path>" sha256=<hash> [niveau=N] -->` followed by a visible read-only notice.
  `scanAll` only reads `docs/produit|architecture|livraisons` and `backlog/tasks` and requires a `type`, so an
  extract is never scanned even when `--sortie` points inside those folders.
- **Hash**: `hashBody(corpsMarkdown(file))`, the very function used by the validation registry (§3.3), so the
  extract hash equals the validated hash. The source is never written; a `validé` document stays `validé`.
- **Safety**: the command only deletes files carrying the marker in a folder whose `index.md` has the same
  `source`; a foreign or non-empty unmarked folder, a folder holding another document's shards, the source's own
  folder, a path outside the project, or an extract used as input are refused (`OrbithError`).
- **Check** (`src/checks/extraits.ts`, category `documentation`, run in `runAll` after the documentation check):
  `avertissement` when an index's `sha256` differs from the current source body hash (or the source no longer
  exists: orphan); `info` when an artifact body exceeds `extraits.seuil_jetons` (default 4000,
  `EXTRAITS_SEUIL_DEFAUT`) and no index references it. Never an `erreur`; never throws. Changing only the
  frontmatter (e.g. `statut`) does not make extracts stale.
- **`orbith next`**: prints the same large-document hint under "À savoir :" (and `documents_volumineux` in
  `--format json`, only when non-empty). `computeNext` is unchanged.
- **Config** `extraits.seuil_jetons` (number >= 1, otherwise `loadConfig` throws); commented example in
  `content/config/config.yaml`.
- **Rule** `content/rules/documents-volumineux.md` (in `RULES`): above the threshold, read `index.md` first and
  only the useful sections, never the whole document; never edit extracts; cite the source. Pointer added to
  "Ce que tu lis" of `dev`, `qa`, `ux`, `architecte`, `sm`.
- **Guide** `docs/guide/documents-volumineux.md`. Tests: `test/core/extraits.test.ts`, `test/cli/decouper.test.ts`.

## 16. Custom agents of a project (`orbith agent`, workflow `creer-agent`)

- **Declaration**: `.orbith/custom/agents/<key>.md` (never touched by `update`). Classification
  (`inventaireAgentsPerso`, `src/adapters/agents-perso.ts`): basename of a core `agents/*.md` file (`guide`, `po`,
  `sm`, `ux`, `architecte`, `dev`, `qa`, `devops`, `securite`, `test-architect`) → **complement** (read by that core
  agent, no command); otherwise frontmatter with a non-empty `description` → **custom agent**; otherwise **ignored**.
  Frontmatter: `description` (required; whitespace collapsed), `commande` (optional, default = key), `nom`,
  `persona` (optional, display only). Key and `commande` must match `^[a-z0-9][a-z0-9-]*$`.
- **Commands**: Gemini `.gemini/commands/orbith/<commande>.toml` (`/orbith:<commande>`), Claude
  `.claude/commands/orbith-<commande>.md`, Copilot `.github/prompts/orbith-<commande>.prompt.md`; same generators as
  core entries with `file = custom/agents/<key>.md`, so the body only references the file (no duplicated content).
- **Collisions**: a `commande` equal to the suffix of any core Gemini or Claude command (e.g. `archi`, `retro`,
  `creer-agent`), or already declared by another custom file (alphabetical order wins), is an error. Any error makes
  `agentsDuProjet` throw: `install`/`update` stop before writing any command (French message listing each file).
  Idempotent: writes go through `writeIfChanged`. Known limit: commands of a deleted/renamed custom agent are not
  removed.
- **`orbith agent new <cle> [--description t] [--nom n] [--yes] [--cwd d]`** (`src/cli/agent.ts`): refuses an invalid
  key, a core complement key, a core command, an existing file (never overwrites) or a project with invalid custom
  agents; writes `squeletteAgent()` (§8 sections, mandatory rules, end-of-task new-session block, marker
  `<!-- orbith:a-completer -->`, no `statut`), then runs the adapters. Prompts for description/name when interactive.
- **`orbith agent list [--cwd d]`**: core then custom agents with their commands, complements, ignored files, errors
  (exit code 1 on error).
- **Workflow** `content/workflows/creer-agent.md` (core entry `creer-agent`): guides a human one question at a time,
  invents no rule, writes only `.orbith/custom/agents/<key>.md`, never `statut: validé`.
- **Check** `src/checks/agents.ts`, category `agents` (« Agents personnalisés »): invalid declaration → erreur;
  ignored file → avertissement; custom agent body missing a mandatory rule → avertissement (accent/case-insensitive:
  validation humaine = `rules/validation-humaine.md` or « jamais … statut: validé » on one line; confidentialité;
  « nouvelle session »; `rules/documentation.md` or « documentation à jour »); marker still present → info. Keyword
  detection only. Guide: `docs/guide/creer-un-agent.md`.

## 17. Bounded autopilot (`orbith autopilote` + `workflows/autopilote.md`)

Principle: the AI proposes, the human decides. The autopilot only chains steps that need **no** human gate
(Dev, then QA) and stops at **every** gate. It never moves a card to `Terminée`, never writes `statut: validé`,
never runs `valider`/`deploiement`/`release`/`version`, never pushes.

### 15.1 `orbith autopilote [cibles...] [--max-us N] [--budget <montant>] [--format texte|json]`

Deterministic, no AI (`src/cli/autopilote-plan.ts`, pure `calculerPlan`; I/O in `src/cli/autopilote.ts`).
- **Scope**: each target is matched (case-insensitive) against the story `epic` field or the story `id`; none =
  whole project. An unknown target is a refusal.
- **Eligible story**: `type: story`, has an `id`, `etat === 'validé'`, column `Prête`, a Gherkin block, a
  `## Definition of Ready` section with ≥1 checkbox and all ticked (a « Validée par le PO » box of older templates is
  ignored), every `dependencies` entry exists and is
  `Terminée`, and (label `impact-archi`) a validated ADR mentions it. Non-eligible open stories of the scope are
  listed in `ecartees` with a French reason.
- **Order**: Backlog.md `ordinal`, then `priority` (high/medium/low, also haute/moyenne/basse), then id number.
- **Bound `max_us`**: `--max-us`, else `autopilote.max_us`, else 3 (integer ≥ 1). It is a WIP limit of stories
  awaiting human review: stories of the scope already `En cours`/`En revue` use up places
  (`places = max_us − en_attente`), so successive sessions can never pile up more than `max_us` unreviewed stories.
- **Budget**: ceiling `--budget` (accepts `2,5`), else `autopilote.budget`, else none (warning). `consomme` = sum of
  the scope stories' `couts_ia` entries in `finops.devise` (entry without `cout` is priced from `tokens_entree`/
  `tokens_sortie` with `finops.prix`, key = longest prefix of `modele`, else `defaut`; other currency or no price →
  ignored and counted). `cout_moyen_us` = mean recorded cost of `Terminée` stories (whole project); when known, the
  plan is reduced to `floor(restant / cout_moyen_us)` stories.
- **Refusals** (`ok: false`, exit code 1, empty plan): `orbith check` has errors; any artifact `modifié` (after
  validation); invalid frontmatter; budget exhausted (`restant ≤ 0`) or insufficient for one story at the average
  cost; places = 0 (`Plafond atteint`); invalid `--max-us`/`--budget`/config values; unknown target. The config key
  is read loosely by `loadConfig` (never throws) and validated here, so other commands are unaffected.
- **Output**: per story, steps `dev` and `qa` (exact slash commands from the agent registry) then
  `revue-humaine` (`porte: true`); a `portes` list (start confirmation, review after each story's QA, structuring
  choice, ambiguity/revalidation, failing tests/check, bound or budget reached, push/MR/release always human).
  JSON: the `PlanAutopilote` object plus `erreurs_check`. Text ends with the new-session reminder.

### 15.2 Workflow `content/workflows/autopilote.md`

Registered in `AGENTS` (`autopilote`), hence one Gemini/Claude command and one Copilot prompt file. It runs
`npx orbith autopilote <cibles> --format json`, stops on any refusal, shows the plan and asks **one** explicit
confirmation (local commits, card moves `Prête → En cours → En revue` only). One task = one session: by default it
handles the first story of the plan only; chaining in the same session requires an explicit human request and a
fresh `orbith autopilote` run before each story. Per story: Dev (`agents/dev.md`), tests + `orbith check`, cost
entry (`couts-ia` rule) checked against the remaining budget, QA (`agents/qa.md`), cost entry, then stop for human
review.

## 18. AI provenance and measured AI costs (optional, backward compatible)

- **`orbith couts importer [--source claude|gemini] [--chemin <file|dir>] [--us US-NNN] [--agent <nom>] [--session <id>] [--depuis AAAA-MM-JJ]`**
  (`src/cli/couts.ts`, parser `src/cli/couts-import.ts`). Reads real token counters left locally by Claude Code.
  - **Format (verified on real local files, envelope undocumented by Anthropic)**: JSONL transcripts under
    `~/.claude/projects/<abs project path with every non-alphanumeric char replaced by "-">/<sessionId>.jsonl`, plus
    `<sessionId>/subagents/agent-*.jsonl`. `CLAUDE_CONFIG_DIR` replaces `~/.claude`. Only lines with
    `type: "assistant"` and `message.usage` are used; fields read: `sessionId`, `timestamp`, `requestId`, `uuid`,
    `message.id`, `message.model`, `message.usage.{input_tokens, output_tokens, cache_creation_input_tokens,
    cache_read_input_tokens, cache_creation.ephemeral_5m_input_tokens, cache_creation.ephemeral_1h_input_tokens}`
    (the `usage` object is the documented Messages API object). One response is written once per content block with
    the same `message.id` and identical `usage`: deduplicated by `message.id` (fallback `requestId`, `uuid`), also
    across files. Model `<synthetic>` and unparsable lines are skipped. Message content is never read.
  - Aggregated per (session, model) into one `couts_ia` entry appended at the end of the story frontmatter
    (`writeDoc`; body untouched, so the validation hash is unchanged; existing entries never modified):
    `date, agent, outil: claude-code, modele, tache, tokens_entree (non-cached input), tokens_cache_ecriture,
    tokens_cache_lecture, tokens_sortie, cout, devise, source: mesuré, session, du, au` (`du`/`au` = ISO timestamps of
    first/last counted call). Re-import only counts calls with `timestamp > max(au)` of the same session across all
    stories (`bornesImportees`).
  - Price (`prixPour`): exact `finops.prix` key, else the longest key the model name starts with, else `defaut`, else
    error. Cost = (input×entree + output×sortie + cacheRead×(cache_lecture ?? 0.1×entree) + write5m×(cache_ecriture ??
    1.25×entree) + write1h×(cache_ecriture ?? 2×entree)) / 1e6, rounded to 2 decimals. `cache_lecture` /
    `cache_ecriture` are optional extra keys of a price entry (read from the raw config object; `OrbithConfig` type
    unchanged).
  - Without `--us`: preview only, nothing written. Measured totals are a lower bound (Claude Code does not log every
    request in the transcript).
  - `--source gemini` → `OrbithError` (not implemented: Gemini CLI documents telemetry attribute names but not the
    exact local outfile structure; session-file format not confirmed). Unknown source → error.
- **`orbith metriques`**: `couts.parSource = { estime: {total, entrees}, mesure: {total, entrees} }` (`estMesure`:
  `source` equal to `mesuré`, accent/case-insensitive; anything else = estimate). Text output adds the split when a
  measured entry exists; CSV adds two `couts` rows.
- **Provenance** (`src/core/provenance.ts`): a commit is AI co-authored when a `Co-Authored-By:` trailer names an AI
  (`coAuteurIa`: names Claude alone or followed by Code/Opus/Sonnet/Haiku/digit, Anthropic, Gemini, Copilot, Codex,
  ChatGPT, OpenAI, GPT-n, CodeWhisperer, Codestral, Windsurf, Tabnine; e-mails `@anthropic.com`, `@openai.com`; GitHub
  bot noreply addresses of those tools). Model = trailer name when it contains a digit. Linked stories = ids in the
  message without trailers; documents = changed `.md` under `docs/produit|architecture|livraisons/`, `backlog/tasks/`;
  `relu_par` = names (no e-mail) from non-AI `Reviewed-by:` trailers. Git read: `log --reverse --name-only` with full body.
- **Registry `.orbith/provenance.json`**: `{ version: 1, commits: [{ commit, date, ia[], modele?, us[], documents[],
  relu_par[], precedent }] }`, append-only, chained with `src/core/chaine.ts` (same rules as validations.json; broken
  chain → refuse to write). Written only by `orbith provenance --enregistrer`. Reports use registry ∪ live git log
  (by hash), so squashed/rebased history keeps its trace. No e-mails, diffs or conversation content are stored.
- **`orbith provenance [--format texte|json] [--enregistrer]`** (`src/cli/provenance.ts`): one row per story/document
  linked to AI commits: commits, models, human validation (validations registry entry when state is `validé`),
  human code review (`revue_par` / `revue_le` frontmatter or `Reviewed-by:` on a linked commit), `revueQa` (a
  « Revue QA » heading: reported, not counted as human review). JSON shape `RapportProvenance`.
- **`orbith check`** category `provenance` (`src/checks/provenance.ts`): avertissement for a story in column
  `Terminée` with AI co-authored commits, no traced human validation (state ≠ `validé`) and no human review mention;
  erreur when `.orbith/provenance.json` chain is broken.
- **`orbith audit`**: optional `AuditData.provenance`; HTML section `#provenance` « Provenance IA » after the
  traceability matrix; flagged rows use class `pb`. Guide: `docs/guide/provenance-couts.md`.

## 19. Service levels, continual improvement, knowledge links and DORA reliability (all optional)

Guides: `docs/guide/metriques.md` (SLA, rework rate, reliability), `docs/guide/amelioration-continue.md`.

- **Config `sla`** (`src/core/sla-config.ts`, `lireSla`, called by `loadConfig`): `disponibilite_pct` (min, 0–100),
  `retablissement_heures` (map severity → max hours; keys `1|2|3` or `critique|majeure|mineure`, read by `lireGravite`,
  which also parses incident `gravite` such as `1 critique`), `correction_bug_prod_jours` (max days). Unknown key,
  unknown severity or non-numeric value → `OrbithError`. Absent → no `sla` in the output.
- **`orbith metriques`** (`src/cli/fiabilite-calc.ts` pure, `src/cli/fiabilite-render.ts`), current period only:
  - `sla.objectifs[]` `{cle, gravite?, sens, cible, unite, valeur, mesures, respectes, incomplets[], atteint, remarque}`,
    `sla.bilan`, `sla.avertissements[]` (incidents without usable severity/detection date, prod bugs without `detecte_le`).
    Dates: `AAAA-MM-JJ[ HH:MM[:SS]]` or ISO, read as UTC when no zone (`instant`).
  - availability = 100 × (1 − union of incident intervals `[detecte_le, retabli_le]` clipped to the period / period),
    all severities; an overlapping incident without `retabli_le` → `valeur: null`; no incident → 100 with remarque
    « aucun incident déclaré : à vérifier ».
  - per-item objectives (restore per severity: incidents with `retabli_le` in the period; prod-bug fix: `labels: [bug]`,
    `origine: production`, `mis_en_prod_le` in the period): `valeur` = worst duration; `atteint` = false if one exceeds
    the target or an item still open at period end is already older than the target, else null if an item of the period
    is still open (no end date) or none exists, else true.
  - `reprise` `{deploiements, deploiementsDeReprise, pourcentage, avertissement}` (always present): DORA *deployment
    rework rate*, production deployments of the period shipping a production bug story / production deployments; null
    without deployment; no performance level (DORA publishes none).
  - `fiabilite[]` (present only if some `retro` has `fiabilite_auto_evaluation`): the team's reliability self-assessment,
    shown verbatim, no level.
  - Text: sections « Taux de reprise des déploiements » and « Fiabilité et objectifs de service » (before the trends);
    CSV: one `dora` row for the rework rate, one `sla` row per objective.
- **DORA sources checked** (dora.dev source repository `dora-team/dora.dev`, 2024 and 2021 report PDFs): five delivery
  metrics since 2024 (change lead time, deployment frequency, failed deployment recovery time, change fail rate,
  deployment rework rate = "percentage of deployments that are unplanned work to fix bugs"; survey question: deployments
  in the last six months "not planned but performed to address a user-facing bug"). Reliability was called "the fifth
  metric" in the 2021 report (self-rated ability to meet or exceed reliability targets); dora.dev's metrics history
  (2026-01-02) states this was inaccurate: reliability measures operational, not delivery, performance. Hence: rework
  rate is computed, reliability is only the optional SLA comparison plus the verbatim self-assessment.
- **Artifact `amelioration`** (`content/templates/amelioration.md`, `docs/amelioration/AMEL-NNN-*.md`, scanned dir
  added to `SCAN_DIRS`): frontmatter `source` (`retro|incident|metrique`), `source_ref` (e.g. `INC-002`, `retro-1.2.0`),
  `responsable`, `echeance` (AAAA-MM-JJ), `avancement` (`ouvert|en cours|fait|abandonné`, default `ouvert`;
  `statut` stays the validation field), `liens`. Body: Constat, Action, Indicateur de succès, Suivi. Validated like any
  artifact. Helpers in `src/core/connaissance.ts` (`avancement`, `sourceAmelioration`, `enRetard`, `ameliorationsLiees`).
- **Knowledge links** (`src/core/connaissance.ts`): optional `liens` (list or comma string) on any artifact. Graph
  (`grapheConnaissance`) edges = `liens` + bug `cause` + incident `change` + improvement `source_ref`; node key = `id`,
  else file name without `.md`; matching is case-insensitive; template placeholders (`US-XXX`, `<…>`) are ignored.
- **`orbith check`** (`src/checks/amelioration.ts`, warnings only): category `amelioration` (new, shown only when it has
  results, in `check` and `audit`): missing/invalid `AMEL-NNN` id, unknown `avancement`/`source`, open action without
  `responsable`/`echeance`, overdue open action. Category `tracabilite`: malformed `liens`, `liens`/`source_ref` target
  not found (`cause`/`change` are not checked, for backward compatibility).
- **`orbith trace`** (`src/cli/trace-connaissance.ts`): appends « Actions d'amélioration » and « Liens de connaissance »
  sections when non-empty; `orbith trace <ID>` for a non-story id prints that artifact's links.
- **`orbith audit`**: `AuditData.connaissance` `{ameliorations[], liens[]}` (present only when non-empty) and an HTML section.
- **`orbith next`** (`src/cli/next-amelioration.ts`, appended last): overdue action (humain), unvalidated action
  (valider), restored (`retabli_le`) or validated incident with no linked action (devops), retro with no linked action
  (`/orbith-retro`). Linked = the action cites it (`source_ref`/`liens`) or it cites the action in `liens`.
- **Prompts**: `workflows/retro.md` and `agents/devops.md` propose one AMEL file per action retained by the human;
  `incident.md` and `retro.md` templates reference AMEL; `retro.md` has optional `fiabilite_auto_evaluation`.
