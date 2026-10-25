import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Command } from 'commander';
import * as p from '@clack/prompts';
import { parse, parseDocument } from 'yaml';
import type { Document } from 'yaml';
import {
  contentDir,
  copyDir,
  defaultConfig,
  exists,
  loadConfig,
  OrbithError,
  ORBITH_DIR,
  saveConfig,
  syncCsr,
  masquer,
  parseSource,
  ui,
  writeFileSafe,
} from '../core/index.js';
import type { OrbithConfig, Piste, Plateforme } from '../core/index.js';
import { runAdapters } from '../adapters/index.js';

const execFileAsync = promisify(execFile);

const PLATEFORMES: Plateforme[] = ['gemini', 'claude'];
const PISTES: Piste[] = ['correctif', 'evolution', 'projet'];
export const CORE_DIRS = ['agents', 'workflows', 'templates', 'rules'] as const;
const SKELETON_DIRS = [
  'docs/produit/epics',
  'docs/architecture/adr',
  'docs/livraisons',
  'backlog/tasks',
  'src',
  'tests',
];

export interface InstallOptions {
  plateformes?: string;
  piste?: string;
  nom?: string;
  csrSource?: string;
  yes?: boolean;
  cwd?: string;
}

function setDeep(doc: Document, prefix: string[], values: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(values)) {
    const keyPath = [...prefix, key];
    if (value && typeof value === 'object' && !Array.isArray(value) && doc.hasIn(keyPath)) {
      setDeep(doc, keyPath, value as Record<string, unknown>);
    } else {
      doc.setIn(keyPath, value);
    }
  }
}

/** Updates keys of .orbith/config.yaml while keeping the comments of the file. */
export async function patchConfig(root: string, patch: Partial<OrbithConfig>): Promise<void> {
  const file = path.join(root, ORBITH_DIR, 'config.yaml');
  try {
    const doc = parseDocument(await fs.readFile(file, 'utf8'));
    if (doc.errors.length > 0) throw new Error('invalid');
    setDeep(doc, [], patch);
    await fs.writeFile(file, String(doc), 'utf8');
  } catch {
    const cfg = await loadConfig(root);
    await saveConfig(root, { ...cfg, ...patch });
  }
}

/** Copies the core directories of `content/` into `<root>/.orbith/`. Returns written files. */
export async function copyCore(root: string, overwrite: boolean): Promise<string[]> {
  const written: string[] = [];
  const content = contentDir();
  for (const dir of CORE_DIRS) {
    const src = path.join(content, dir);
    if (await exists(src)) written.push(...(await copyDir(src, path.join(root, ORBITH_DIR, dir), { overwrite })));
  }
  return written;
}

function skeletonName(name: string): string {
  let out = name.startsWith('_') ? '.' + name.slice(1) : name;
  if (out.endsWith('.tmpl')) out = out.slice(0, -'.tmpl'.length);
  return out;
}

async function copySkeleton(
  src: string,
  dest: string,
  nom: string,
  written: string[],
  skipped: string[],
): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, skeletonName(entry.name));
    if (entry.isDirectory()) {
      await copySkeleton(from, to, nom, written, skipped);
    } else if (entry.isFile()) {
      let text = await fs.readFile(from, 'utf8');
      if (entry.name.endsWith('.tmpl')) text = text.replaceAll('{{nom}}', nom);
      if (await writeFileSafe(to, text)) written.push(to);
      else skipped.push(to);
    }
  }
}

function parseList<T extends string>(raw: string, allowed: T[], what: string): T[] {
  const values = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const bad = values.filter((v) => !allowed.includes(v as T));
  if (values.length === 0 || bad.length > 0) {
    throw new OrbithError(`${what} invalide : ${bad.join(', ') || raw}. Valeurs possibles : ${allowed.join(', ')}.`);
  }
  return [...new Set(values)] as T[];
}

function cancelled(): never {
  throw new OrbithError('Installation annulée. Rien n\'a été modifié.');
}

export async function runInstall(opts: InstallOptions): Promise<void> {
  const root = path.resolve(opts.cwd ?? process.cwd());
  if (!(await exists(root))) throw new OrbithError(`Le dossier ${root} n'existe pas.`);

  const interactive = !opts.yes && Boolean(process.stdin.isTTY);
  const installed = await exists(path.join(root, ORBITH_DIR, 'config.yaml'));
  let existing: OrbithConfig | null = null;
  if (installed) existing = await loadConfig(root);

  let nom = opts.nom ?? existing?.projet.nom ?? path.basename(root);
  let plateformes: Plateforme[] | undefined = opts.plateformes
    ? parseList(opts.plateformes, PLATEFORMES, 'Plateforme')
    : existing?.plateformes;
  let piste: Piste | undefined = opts.piste
    ? (parseList(opts.piste, PISTES, 'Piste')[0] as Piste)
    : existing?.piste;

  if (interactive) {
    p.intro('Installation d\'Orbith');
    if (!opts.nom && !existing) {
      const r = await p.text({ message: 'Nom du projet ?', initialValue: nom });
      if (p.isCancel(r)) cancelled();
      nom = (r as string).trim() || nom;
    }
    if (!plateformes) {
      const r = await p.multiselect({
        message: 'Pour quelles plateformes d\'IA ? (espace pour cocher)',
        options: [
          { value: 'gemini', label: 'Gemini CLI' },
          { value: 'claude', label: 'Claude Code' },
        ],
        initialValues: ['gemini', 'claude'],
        required: true,
      });
      if (p.isCancel(r)) cancelled();
      plateformes = r as Plateforme[];
    }
    if (!piste) {
      const r = await p.select({
        message: 'Quelle piste par défaut ?',
        options: [
          { value: 'evolution', label: 'Évolution', hint: 'ajouter ou modifier une fonctionnalité' },
          { value: 'correctif', label: 'Correctif', hint: 'corriger un bug' },
          { value: 'projet', label: 'Projet', hint: 'démarrer un projet complet' },
        ],
        initialValue: 'evolution',
      });
      if (p.isCancel(r)) cancelled();
      piste = r as Piste;
    }
  }
  if (opts.csrSource) parseSource(opts.csrSource);
  const finalPlateformes = plateformes ?? ['gemini', 'claude'];
  const finalPiste: Piste = piste ?? 'evolution';

  const hasGit = await exists(path.join(root, '.git'));
  const entries = (await fs.readdir(root)).filter((e) => e !== '.git');
  // Nouveau projet : dossier vide uniquement (un projet existant hors Git n'est pas réinitialisé).
  const nouveau = !installed && entries.length === 0;

  ui.titre(nouveau ? `Installation d'Orbith : nouveau projet « ${nom} »` : `Installation d'Orbith : projet « ${nom} »`);
  if (installed) ui.info('Orbith est déjà installé ici : tes fichiers sont conservés (utilise `npx orbith update` pour mettre à jour les agents).');

  const written: string[] = [];
  const skipped: string[] = [];

  if (nouveau) {
    ui.etape('Création de la structure du projet');
    const skeleton = path.join(contentDir(), 'projet');
    if (await exists(skeleton)) await copySkeleton(skeleton, root, nom, written, skipped);
    for (const d of SKELETON_DIRS) {
      const dir = path.join(root, d);
      if (!(await exists(dir))) await fs.mkdir(dir, { recursive: true });
    }
    if (!hasGit) {
      try {
        await execFileAsync('git', ['init'], { cwd: root });
        ui.ok('Dépôt Git initialisé');
      } catch {
        ui.avert("Impossible d'initialiser Git (git est-il installé ?). Lance `git init` toi-même plus tard.");
      }
    }
  }

  ui.etape('Copie du cœur Orbith dans .orbith/');
  written.push(...(await copyCore(root, false)));
  const content = contentDir();
  const orb = path.join(root, ORBITH_DIR);
  for (const [from, to] of [
    ['config/dor.md', 'config/dor.md'],
    ['config/dod.md', 'config/dod.md'],
    ['csr/CSR.exemple.md', 'csr/CSR.md'],
  ] as const) {
    const src = path.join(content, from);
    if (!(await exists(src))) continue;
    const dest = path.join(orb, to);
    if (await writeFileSafe(dest, await fs.readFile(src, 'utf8'))) written.push(dest);
  }
  await fs.mkdir(path.join(orb, 'custom'), { recursive: true });
  if (await writeFileSafe(path.join(orb, 'custom', '.gitkeep'), '')) written.push(path.join(orb, 'custom', '.gitkeep'));
  if (await writeFileSafe(path.join(orb, 'validations.json'), JSON.stringify({ version: 1, validations: [] }, null, 2) + '\n')) {
    written.push(path.join(orb, 'validations.json'));
  }

  const base = defaultConfig(nom);
  const cfgPath = path.join(orb, 'config.yaml');
  if (!installed) {
    const template = path.join(content, 'config', 'config.yaml');
    const values = { ...base, plateformes: finalPlateformes, piste: finalPiste };
    if (await exists(template)) {
      const doc = parseDocument(await fs.readFile(template, 'utf8'));
      setDeep(doc, [], values);
      await fs.writeFile(cfgPath, String(doc), 'utf8');
    } else {
      await saveConfig(root, values);
    }
    written.push(cfgPath);
  } else if (opts.plateformes || opts.piste) {
    await patchConfig(root, { plateformes: finalPlateformes, piste: finalPiste });
  }
  // sanity check: the file we wrote must parse
  parse(await fs.readFile(cfgPath, 'utf8'));

  ui.etape('Génération des commandes pour tes plateformes');
  let cfg = await loadConfig(root);
  const adapterFiles = await runAdapters(root, cfg);

  if (opts.csrSource) {
    ui.etape('Synchronisation du CSR');
    await patchConfig(root, { csr: { ...cfg.csr, source: opts.csrSource } });
    cfg = await loadConfig(root);
    try {
      const r = await syncCsr(root, cfg);
      ui.ok(`CSR mis à jour depuis ${masquer(r.source)} (${r.outils} outils)`);
    } catch (e) {
      ui.avert(`CSR non synchronisé (le CSR d'exemple est conservé) : ${e instanceof Error ? e.message : String(e)}`);
      ui.info('Corrige la source dans .orbith/config.yaml puis lance `npx orbith csr sync`.');
    }
  }

  const rel = (f: string): string => path.relative(root, f).split(path.sep).join('/');
  ui.ok(`${written.length} fichier(s) créé(s) dans .orbith/ et dans le projet, ${adapterFiles.length} fichier(s) de plateforme générés.`);
  for (const f of skipped) ui.avert(`Fichier existant conservé : ${rel(f)}`);
  console.log('');
  ui.ok(`Orbith est prêt (plateformes : ${cfg.plateformes.join(', ')} ; piste : ${cfg.piste}).`);
  console.log('Prochaine étape : lance `npx orbith next`');
  ui.rappelNouvelleSession();
  if (interactive) p.outro('Installation terminée');
}

export function register(program: Command): void {
  program
    .command('install')
    .description('Installe Orbith dans le projet')
    .option('--plateformes <liste>', 'plateformes à générer (gemini,claude)')
    .option('--piste <piste>', 'piste par défaut (correctif, evolution, projet)')
    .option('--nom <nom>', 'nom du projet')
    .option('--csr-source <source>', 'source du CSR (chemin, git+https://…#fichier, URL https)')
    .option('--yes', 'mode non interactif')
    .option('--cwd <dir>', 'dossier de travail')
    .action(async (opts: InstallOptions) => {
      await runInstall(opts);
    });
}
