import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { contentDir, exists, requireProjectRoot, ui } from '../core/index.js';
import { upsertBlock } from '../adapters/blocks.js';
import { CONTEXTE_PROJET } from '../adapters/contexte.js';

export const AUTO_DEBUT = '<!-- orbith:auto-debut -->';
export const AUTO_FIN = '<!-- orbith:auto-fin -->';

const IGNORED = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'target', 'coverage', '.next', '.nuxt', '.venv', 'venv',
  '__pycache__', '.gradle', '.idea', '.vscode', '.orbith', '.gemini', '.claude', 'bin', 'obj', '.cache',
]);

export interface Detection {
  /** Languages / ecosystems detected from manifest files. */
  stack: string[];
  /** Package manager or build tool. */
  outils: string[];
  frameworks: string[];
  scripts: Record<string, string>;
  tests: string[];
  qualite: string[];
  infra: string[];
  arborescence: string[];
}

async function readText(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return null;
  }
}

async function tree(dir: string, depth: number, prefix = ''): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  const sorted = entries
    .filter((e) => !IGNORED.has(e.name) && !(e.name.startsWith('.') && e.isDirectory()))
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  for (const e of sorted) {
    if (e.isDirectory()) {
      out.push(`${prefix}${e.name}/`);
      if (depth > 1) out.push(...(await tree(path.join(dir, e.name), depth - 1, `${prefix}  `)));
    } else if (prefix === '') {
      out.push(e.name);
    }
  }
  return out;
}

const JS_FRAMEWORKS = ['react', 'vue', 'svelte', '@angular/core', 'next', 'nuxt', 'express', 'fastify', '@nestjs/core', 'koa', 'hono'];
const JS_TESTS = ['vitest', 'jest', 'mocha', 'ava', '@playwright/test', 'cypress', '@cucumber/cucumber', 'jasmine'];
const JS_QUALITE = ['eslint', 'prettier', 'typescript', '@biomejs/biome', 'husky', 'lint-staged'];

/** Deterministic detection of the stack of an existing project. No AI, no network. */
export async function detect(root: string): Promise<Detection> {
  const d: Detection = { stack: [], outils: [], frameworks: [], scripts: {}, tests: [], qualite: [], infra: [], arborescence: [] };
  const has = (rel: string) => exists(path.join(root, rel));
  const add = (list: string[], v: string) => {
    if (!list.includes(v)) list.push(v);
  };

  const pkgRaw = await readText(path.join(root, 'package.json'));
  if (pkgRaw !== null) {
    add(d.stack, 'JavaScript / Node.js');
    try {
      const pkg = JSON.parse(pkgRaw) as {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        engines?: { node?: string };
        type?: string;
      };
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (pkg.engines?.node) add(d.stack, `Node.js ${pkg.engines.node}`);
      if (pkg.type === 'module') add(d.stack, 'modules ES (type: module)');
      for (const [k, v] of Object.entries(pkg.scripts ?? {})) d.scripts[k] = v;
      if (deps['typescript'] || (await has('tsconfig.json'))) add(d.stack, 'TypeScript');
      for (const f of JS_FRAMEWORKS) if (deps[f]) add(d.frameworks, f);
      for (const t of JS_TESTS) if (deps[t]) add(d.tests, t);
      for (const q of JS_QUALITE) if (deps[q]) add(d.qualite, q);
    } catch {
      add(d.qualite, 'package.json illisible');
    }
    if (await has('pnpm-lock.yaml')) add(d.outils, 'pnpm');
    else if (await has('yarn.lock')) add(d.outils, 'yarn');
    else if (await has('package-lock.json')) add(d.outils, 'npm');
  }
  if (await has('pom.xml')) {
    add(d.stack, 'Java');
    add(d.outils, 'Maven');
  }
  if ((await has('build.gradle')) || (await has('build.gradle.kts'))) {
    add(d.stack, 'Java / Kotlin');
    add(d.outils, 'Gradle');
  }
  const pyproject = await readText(path.join(root, 'pyproject.toml'));
  const requirements = await readText(path.join(root, 'requirements.txt'));
  if (pyproject !== null || requirements !== null || (await has('setup.py'))) {
    add(d.stack, 'Python');
    const text = `${pyproject ?? ''}\n${requirements ?? ''}`;
    if (/pytest/i.test(text)) add(d.tests, 'pytest');
    if (/ruff/i.test(text)) add(d.qualite, 'ruff');
    if (/black/i.test(text)) add(d.qualite, 'black');
    if (/django/i.test(text)) add(d.frameworks, 'django');
    if (/fastapi/i.test(text)) add(d.frameworks, 'fastapi');
    if (/flask/i.test(text)) add(d.frameworks, 'flask');
    if (/poetry/i.test(pyproject ?? '')) add(d.outils, 'Poetry');
    else add(d.outils, 'pip');
  }
  if (await has('go.mod')) {
    add(d.stack, 'Go');
    add(d.outils, 'go modules');
  }
  if (await has('Cargo.toml')) {
    add(d.stack, 'Rust');
    add(d.outils, 'Cargo');
  }
  if (await has('composer.json')) {
    add(d.stack, 'PHP');
    add(d.outils, 'Composer');
  }
  const rootFiles = await fs.readdir(root).catch(() => [] as string[]);
  if (rootFiles.some((f) => f.endsWith('.csproj') || f.endsWith('.sln'))) {
    add(d.stack, '.NET');
    add(d.outils, 'dotnet');
  }
  for (const [file, label] of [
    ['.eslintrc.json', 'eslint'], ['.eslintrc.js', 'eslint'], ['eslint.config.js', 'eslint'], ['eslint.config.mjs', 'eslint'],
    ['.prettierrc', 'prettier'], ['.editorconfig', 'editorconfig'],
  ] as const) {
    if (await has(file)) add(d.qualite, label);
  }
  if (await has('Dockerfile')) add(d.infra, 'Docker');
  if ((await has('docker-compose.yml')) || (await has('docker-compose.yaml')) || (await has('compose.yaml'))) add(d.infra, 'Docker Compose');
  if (await has('.github/workflows')) add(d.infra, 'GitHub Actions');
  if (await has('.gitlab-ci.yml')) add(d.infra, 'GitLab CI');
  if (await has('Jenkinsfile')) add(d.infra, 'Jenkins');
  if (await has('azure-pipelines.yml')) add(d.infra, 'Azure Pipelines');
  for (const dir of ['test', 'tests', '__tests__', 'spec', 'src/test']) {
    if (await has(dir)) add(d.tests, `dossier ${dir}/`);
  }
  d.arborescence = await tree(root, 2);
  return d;
}

function liste(titre: string, items: string[]): string[] {
  return [`**${titre}** : ${items.length > 0 ? items.join(', ') : 'non détecté'}`, ''];
}

/** Renders the auto-detected block (French, deterministic: no date). */
export function renderDetection(d: Detection): string {
  const out: string[] = [
    '_Squelette généré par `npx orbith init-context` (détection sans IA). À compléter et corriger par un agent ou un humain._',
    '',
    ...liste('Langages et runtime', d.stack),
    ...liste('Outils de build / paquets', d.outils),
    ...liste('Frameworks', d.frameworks),
    ...liste('Tests', d.tests),
    ...liste('Qualité de code', d.qualite),
    ...liste('Intégration et déploiement', d.infra),
  ];
  const scripts = Object.entries(d.scripts);
  out.push('**Scripts disponibles**' + (scripts.length === 0 ? ' : aucun détecté' : ' :'), '');
  for (const [k, v] of scripts) out.push(`- \`${k}\` : \`${v}\``);
  if (scripts.length > 0) out.push('');
  out.push('**Arborescence (2 niveaux)** :', '', '```text', ...(d.arborescence.length > 0 ? d.arborescence : ['(vide)']), '```');
  return out.join('\n');
}

export interface InitContextResult {
  fichier: string;
  detection: Detection;
}

export async function runInitContext(cwd: string): Promise<InitContextResult> {
  const root = await requireProjectRoot(cwd);
  const file = path.join(root, CONTEXTE_PROJET);
  let content: string;
  if (await exists(file)) {
    content = await fs.readFile(file, 'utf8');
  } else {
    content = await fs.readFile(path.join(contentDir(), 'templates', 'contexte-projet.md'), 'utf8');
  }
  const detection = await detect(root);
  const next = upsertBlock(content, AUTO_DEBUT, AUTO_FIN, renderDetection(detection));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, next, 'utf8');
  ui.ok(`Contexte projet écrit dans ${CONTEXTE_PROJET} (stack : ${detection.stack.join(', ') || 'non détectée'}).`);
  ui.info(
    'Demande maintenant à un agent (Dev ou Architecte) de compléter les conventions, patterns et pièges, puis relis-le et supprime la ligne « orbith:a-completer ».',
  );
  return { fichier: CONTEXTE_PROJET, detection };
}

export function register(program: Command): void {
  program
    .command('init-context')
    .description("Crée le contexte projet d'un projet existant (stack, arborescence, scripts, tests), à compléter par un agent")
    .option('--cwd <dir>', 'dossier de travail')
    .action(async (opts: { cwd?: string }) => {
      await runInitContext(opts.cwd ?? process.cwd());
    });
}
