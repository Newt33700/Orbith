import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Command } from 'commander';
import {
  exists,
  findProjectRoot,
  loadConfig,
  OrbithError,
  pluginsDir,
  requireProjectRoot,
  ui,
} from '../core/index.js';
import { patchConfig } from './install.js';

export interface PluginManifest {
  name: string;
  description: string;
  /** Installer module, relative to the plugin folder (ESM, exports `install(ctx)`). */
  install: string;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}
export type Runner = (cmd: string, args: string[], opts: { cwd: string }) => Promise<RunResult>;

export interface PluginContext {
  root: string;
  config: Awaited<ReturnType<typeof loadConfig>>;
  run: Runner;
  log: { info(s: string): void; ok(s: string): void; avert(s: string): void };
}

export const defaultRunner: Runner = (cmd, args, opts) =>
  new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { cwd: opts.cwd, shell: process.platform === 'win32' },
      (err, stdout, stderr) => {
        const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? ((err as { code: number }).code) : 1) : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });

export async function listPlugins(dir = pluginsDir()): Promise<PluginManifest[]> {
  if (!(await exists(dir))) return [];
  const out: PluginManifest[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifest = path.join(dir, entry.name, 'orbith-plugin.json');
    if (!(await exists(manifest))) continue;
    try {
      out.push(JSON.parse(await fs.readFile(manifest, 'utf8')) as PluginManifest);
    } catch {
      // manifest illisible : ignoré
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function addPlugin(
  root: string,
  nom: string,
  deps: { run?: Runner; dir?: string } = {},
): Promise<void> {
  const dir = deps.dir ?? pluginsDir();
  const disponibles = (await listPlugins(dir)).map((m) => m.name);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(nom) || !disponibles.includes(nom)) {
    throw new OrbithError(
      `Plugin « ${nom} » introuvable. Plugins disponibles : ${disponibles.join(', ') || 'aucun'}.`,
    );
  }
  const pluginDir = path.join(dir, nom);
  const manifest = JSON.parse(await fs.readFile(path.join(pluginDir, 'orbith-plugin.json'), 'utf8')) as PluginManifest;
  const config = await loadConfig(root);

  ui.titre(`Plugin « ${manifest.name} »`);
  const mod = (await import(pathToFileURL(path.join(pluginDir, manifest.install)).href)) as {
    install?: (ctx: PluginContext) => Promise<void>;
  };
  if (typeof mod.install !== 'function') {
    throw new OrbithError(`Le plugin « ${nom} » est invalide (fonction install manquante).`);
  }
  await mod.install({
    root,
    config,
    run: deps.run ?? defaultRunner,
    log: { info: ui.info, ok: ui.ok, avert: ui.avert },
  });

  if (!config.plugins.includes(manifest.name)) {
    await patchConfig(root, { plugins: [...config.plugins, manifest.name] });
  }
  ui.ok(`Plugin « ${manifest.name} » activé dans .orbith/config.yaml.`);
}

export function register(program: Command): void {
  const plugin = program.command('plugin').description('Gère les plugins optionnels d\'Orbith');

  plugin
    .command('add <nom>')
    .description('Installe un plugin (ex. backlog-md)')
    .option('--cwd <dir>', 'dossier de travail')
    .action(async (nom: string, opts: { cwd?: string }) => {
      const root = await requireProjectRoot(path.resolve(opts.cwd ?? process.cwd()));
      await addPlugin(root, nom);
    });

  plugin
    .command('list')
    .description('Liste les plugins disponibles et ceux déjà activés')
    .option('--cwd <dir>', 'dossier de travail')
    .action(async (opts: { cwd?: string }) => {
      const root = await findProjectRoot(path.resolve(opts.cwd ?? process.cwd()));
      const actifs = root ? (await loadConfig(root)).plugins : [];
      const plugins = await listPlugins();
      ui.titre('Plugins Orbith');
      if (plugins.length === 0) ui.info('Aucun plugin disponible.');
      for (const m of plugins) {
        console.log(`${actifs.includes(m.name) ? '✔' : '○'} ${m.name} : ${m.description}`);
      }
      if (!root) ui.info("Pas de projet Orbith ici : l'état d'activation n'est pas affiché.");
      else console.log('\nPour en ajouter un : npx orbith plugin add <nom>');
    });
}
