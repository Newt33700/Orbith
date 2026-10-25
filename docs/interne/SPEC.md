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
src/checks/              # check rules used by `orbith check`
content/                 # THE CORE, copied to <project>/.orbith/ on install
  agents/                # guide.md po.md sm.md ux.md architecte.md dev.md qa.md
  workflows/             # correctif.md evolution.md projet.md atelier.md
  templates/             # brief.md prd.md ux.md architecture.md adr.md epic.md story.md release-notes.md
  rules/                 # validation-humaine.md confidentialite.md tracabilite.md nouvelle-session.md
  config/                # config.yaml (default) dor.md dod.md
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

Node binary for this machine: prefix every shell command with
`export PATH=/private/tmp/claude-501/-Users-fabjuly-Documents-Sources-Orbith/cf277e1f-dac4-4fd8-a1d9-865d0b936286/scratchpad/node/current/bin:$PATH`.

## 3. Installed project layout

```
mon-projet/
├── .orbith/
│   ├── agents/ workflows/ templates/ rules/     # copied from content/
│   ├── config.yaml                               # project config (§3.1)
│   ├── config/dor.md config/dod.md               # editable by the team
│   ├── csr/CSR.md                                # copy of CSR.exemple.md at install
│   ├── custom/                                   # local overrides, never touched by update
│   └── validations.json                          # human validation registry (§3.3)
├── GEMINI.md / CLAUDE.md                         # generated, reference .orbith/rules/*
├── .gemini/commands/orbith/*.toml                # generated
├── .claude/commands/orbith-*.md                  # generated
├── .claude/settings.json                         # generated/merged: deny reading secrets
├── .geminiignore                                 # generated
├── docs/produit/        brief.md prd.md ux.md epics/EPIC-001-*.md
├── docs/architecture/   architecture.md adr/ADR-001-*.md
├── docs/livraisons/     release-notes-<version>.md
├── backlog/tasks/       user stories (one file per US, Backlog.md compatible — §3.4)
├── src/ tests/
├── .gitlab-ci.yml                                # runs `npx orbith check`
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
# Optional keys (absent = feature off, see section 11 "Change requests and role matrix"):
changements: { exiger_pour_deploiement: false }
roles:
  quatre_yeux: false            # validator must not be the author of the file's last commit
  valideurs: { prd: [alice@corp.fr, "Bob Martin"], change: [ops@corp.fr] }   # type (or "*") -> emails / git names
```

### 3.2 Artifacts and the `statut` field

Every Orbith document has YAML frontmatter with at least:

```yaml
type: brief | prd | ux | architecture | adr | epic | story | release-notes | environnements | change | incident | menaces | strategie-test | retro
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
`## Notes techniques`, `## Definition of Ready` (checklist copied from dor.md).

### 3.5 Traceability conventions

- Commits: Conventional Commits with the story id as scope: `feat(US-012): ajoute le login`.
  Regex for detection: `/\b([A-Z][A-Z0-9]*-\d+)\b/` restricted to the configured prefix.
- Tests: Gherkin `.feature` files tagged `@US-012`; unit tests mention `US-012` in the test name or a comment.
- Release notes list delivered story ids.

## 4. CLI commands (French output)

All commands: run from anywhere inside a project (root = nearest dir containing `.orbith/`, except `install`).
Exit code 0 = OK, 1 = problem found / error. Colored output with `picocolors`, interactive prompts with
`@clack/prompts`. Every command supports `--cwd <dir>`. Non-interactive mode for CI/tests: `--yes`.

### 4.1 `orbith install [--plateformes gemini,claude] [--piste evolution] [--nom <nom>] [--yes]`
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
(plus up to 3 secondary items), each naming the exact slash command to run in Gemini (`/orbith:po`) and
Claude (`/orbith-po`) or the CLI command (`npx orbith valider …`). Always ends with the new-session reminder.
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
Each check lives in `src/checks/<name>.ts` and exports `run(ctx): Promise<CheckResult[]>`.

### 4.6 `orbith trace [ID] [--sortie <fichier.md>]`
Builds a markdown traceability matrix: per story → title, statut, board status, validated by/when, commits
(hash + subject), tests referencing it (files containing `@ID` or `ID`), release notes mentioning it.
With ID: detail for one story. Prints to stdout or writes file.

### 4.6b `orbith tests [ID] [--dossier tests/features] [--force]`
Deterministic (no AI) test skeletons: for each story with `statut: validé` and Gherkin acceptance criteria
(```gherkin blocks, else the « Critères d'acceptation » section), writes `<dossier>/<id>.feature`
(`<id>-2.feature`… for extra blocks), adding `@ID`, a `Fonctionnalité:` line and `# language: fr` when missing.
Existing files are kept unless `--force`. Non-validated stories are skipped (human validation first).

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
Re-copies `content/{agents,workflows,templates,rules}` into `.orbith/` (overwriting), never touches
`config.yaml`, `config/`, `csr/`, `custom/`, `validations.json`; bumps `orbith_version`; re-runs adapters.

### 4.9 `orbith plugin add <nom>` / `orbith plugin list`
Loads `plugins/<nom>/orbith-plugin.json`, runs its installer, adds name to `config.plugins`.

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
  csr: { fichier: string; source: string | null }; plugins: string[]; }
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
export async function loadRegistry(root: string): Promise<ValidationEntry[]>;
export async function recordValidation(root: string, entry: ValidationEntry): Promise<void>;
export async function etatValidation(root: string, file: string, doc?: Doc): Promise<EtatValidation>;

// artifacts.ts
export type ArtifactType = 'brief'|'prd'|'ux'|'architecture'|'adr'|'epic'|'story'|'release-notes';
export interface Artifact { type: ArtifactType; chemin: string /* posix relative */; id?: string; titre?: string;
  statut?: string; etat: EtatValidation; data: Record<string, unknown>; body: string; }
export async function scanArtifacts(root: string): Promise<Artifact[]>;
export function hasGherkin(body: string): boolean;   // ```gherkin block or Scénario:/Scenario: lines in AC section
export const STORY_STATUSES = ['À faire','Prête','En cours','En revue','Terminée'] as const;

// git.ts
export async function gitUser(root: string): Promise<{ name: string; email: string } | null>;
export async function isGitRepo(root: string): Promise<boolean>;
export async function gitLog(root: string, max: number): Promise<{ hash: string; subject: string }[]>;
export async function gitLsFiles(root: string): Promise<string[] | null>;

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
| atelier | workflows/atelier.md | /orbith:atelier | /orbith-atelier | Atelier : plusieurs agents discutent ensemble |
| securite | agents/securite.md | /orbith:securite | /orbith-securite | Sécurité : modélisation des menaces, revue des US sensibles |
| test-architect | agents/test-architect.md | /orbith:test-archi | /orbith-test-archi | Test Architect : stratégie de test par risque |
| retro | workflows/retro.md | /orbith:retro | /orbith-retro | Rétrospective après livraison, à partir des métriques et des constats QA |
| relecture-adverse | workflows/relecture-adverse.md | /orbith:relecture-adverse | /orbith-relecture-adverse | Relecture adverse : passe critique avant de valider PRD, architecture ou US |
| changement-de-cap | workflows/changement-de-cap.md | /orbith:changement-de-cap | /orbith-changement-de-cap | Changement de cap : impact d'un changement de besoin sur les epics et les US |

Advanced agents/workflows (securite, test-architect, retro, relecture-adverse, changement-de-cap) follow the §8
conventions. Their output documents (`docs/architecture/menaces.md`, `docs/architecture/strategie-test.md`,
`docs/livraisons/retro-<version>.md`) carry types unknown to `ARTIFACT_TYPES`, so they are working documents
ignored by `scanArtifacts` and not validatable via `orbith valider` (always `statut: brouillon`/`en-revue`).
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
if `.orbith/custom/agents/<name>.md` exists, the agent must read it and apply it on top.

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

Files: `src/cli/version-calc.ts` (SemVer + Conventional Commits logic), `src/cli/version.ts`, `src/cli/release.ts`,
`src/core/git-release.ts` (tags, commits since a tag, annotated tag, path-limited commit). Guide: `docs/guide/versions.md`.

- **`orbith version [--format texte|json]`**: base = latest `vX.Y.Z` tag (else 0.0.0); inputs = commits since that tag
  + pending stories (`Terminée`, no `mis_en_prod_le`, or cited by a commit since the tag), excluding stories cited by
  the release notes of a version that already has a tag (`storiesDejaLivrees`). Bump = max of:
  major = `type!:` / `BREAKING CHANGE:` footer / story label `breaking` (case-insensitive, constant `BREAKING_LABEL`);
  minor = `feat` / done non-bug story; patch = `fix` / done story labelled `bug`. Other types do not bump.
  Read-only; prints the reasons; nothing proposed when no signal.
- **`orbith release <version> [--yes] [--sans-tag] [--dry-run] [--date]`** (`vX.Y.Z` accepted):
  1. refuses a non-SemVer version, an existing tag, or a version ≤ the latest tag;
  2. no notes (`docs/livraisons/release-notes-<version>.md` or frontmatter `version`) → writes a draft (2 audiences)
     from the done pending stories, then fails (`--dry-run`: writes nothing; an existing unrecognized file at that
     path is never overwritten);
  3. guardrails, all reported together (exit 1): notes not `validé`; a story cited in the notes is not `Terminée`;
     any `orbith check` error;
  4. warnings only: notes cite no story, no « exploitation » part, major expected (breaking) but not chosen,
     changelog includes commits of stories not `Terminée`, a story cited in the notes has uncommitted changes;
  5. prints the CHANGELOG section; after confirmation (`--yes` or TTY prompt; non-TTY without `--yes` fails):
     prepends `## [X.Y.Z] - date` (local date) to `CHANGELOG.md`, keeping its line endings (Changements majeurs /
     Nouveautés / Corrections, from commits; breaking stories listed too), commits only that file plus the notes file
     and `.orbith/validations.json` when they have uncommitted changes (`chore(release): vX.Y.Z`, path-limited: other
     staged files stay staged) and creates the annotated local tag `vX.Y.Z`. A failed commit restores `CHANGELOG.md`
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

- **Chained audit journal** (`src/core/chaine.ts`): every entry of `.orbith/validations.json` and
  `.orbith/deploiements.json` carries `precedent` = SHA-256 of the previous entry's canonical JSON (sorted keys,
  `precedent` included); the first one uses `GENESE` (64 zeros). `recordValidation` replaces the file's entry, then
  rechains the whole registry; it throws on a broken chain (never launders a manual edit) and chains legacy
  registries (no `precedent` anywhere) on the fly. `runDeploiement` behaves the same. `check` (category
  `validations`, `src/checks/chaine.ts`): broken chain → erreur, legacy registry → avertissement.
  Known limit: dropping only the last entry is undetectable without git history.
- **`orbith sbom [--sortie f] [--cwd d]`** (`src/sbom/`): deterministic component inventory (package-lock v1–v3 else
  package.json; pom.xml; requirements*.txt, pyproject.toml), sorted by purl, rendered as minimal CycloneDX 1.5 JSON
  (no timestamp, content-derived `serialNumber`). stdout by default; summary on stderr in that case. Exit 0.
- **License policy**: forbidden/deprecated licenses from the CSR category "Licences" (statut interdit / déprécié) and
  `sbom.licences_interdites` in config.yaml. `check` category `sbom` (`src/checks/sbom.ts`): forbidden → erreur,
  deprecated → avertissement, unknown license → info. SPDX `OR` is lenient, `AND`/`WITH` strict. No policy → no results.
  Guide: `docs/guide/integrite-sbom.md`.

## 12. Advanced-agent documents (`menaces`, `strategie-test`, `retro`)

- Artifact types written by the Security agent (`docs/architecture/menaces.md`), the Test Architect
  (`docs/architecture/strategie-test.md`) and the `retro` workflow (`docs/livraisons/retro-<version>.md`).
  Templates: `content/templates/{menaces,strategie-test,retro}.md` (frontmatter `type` + `statut: brouillon`).
- They are validated like any other artifact (`orbith valider <file>`, hash recorded in the registry, `check`
  detects later edits). Agents never write `statut: validé`.
- `orbith next` appends a low-priority `valider` suggestion for each of these documents still not validated.
  `trace` and `audit` need no specific handling (no US link); `audit` lists them with the other artifacts.
