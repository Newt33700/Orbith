import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runInstall } from '../../src/cli/install.js';
import { addPlugin, listPlugins } from '../../src/cli/plugin.js';
import type { Runner } from '../../src/cli/plugin.js';
import { loadConfig, OrbithError } from '../../src/core/index.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'orbith-plug-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await runInstall({ cwd: root, yes: true, nom: 'demo' });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

describe('orbith plugin', () => {
  it('liste le plugin backlog-md', async () => {
    const plugins = await listPlugins();
    expect(plugins.map((p) => p.name)).toContain('backlog-md');
  });

  it('refuse un plugin inconnu', async () => {
    await expect(addPlugin(root, '../etc')).rejects.toBeInstanceOf(OrbithError);
    await expect(addPlugin(root, 'inconnu')).rejects.toThrow(/introuvable/);
  });

  it('ajoute backlog-md : config Backlog.md, npm i -D et config Orbith', async () => {
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'demo' }));
    await mkdir(path.join(root, 'backlog/tasks'), { recursive: true });
    await writeFile(path.join(root, 'backlog/tasks/us-001 - Existante.md'), 'contenu');
    await writeFile(path.join(root, 'backlog/config.yml'), 'project_name: "Vieux"\nstatuses: ["To Do", "Done"]\nmax_column_width: 33\n');
    const run = vi.fn<Runner>(async () => ({ code: 0, stdout: '', stderr: '' }));

    await addPlugin(root, 'backlog-md', { run });

    expect(run).toHaveBeenCalledWith('npm', ['install', '--save-dev', 'backlog.md'], { cwd: root });
    const cfg = parse(await readFile(path.join(root, 'backlog/config.yml'), 'utf8'));
    expect(cfg.statuses).toEqual(['À faire', 'Prête', 'En cours', 'En revue', 'Terminée']);
    expect(cfg.default_status).toBe('À faire');
    expect(cfg.task_prefix).toBe('US');
    expect(cfg.project_name).toBe('Vieux');
    expect(cfg.max_column_width).toBe(33);
    expect(await readFile(path.join(root, 'backlog/tasks/us-001 - Existante.md'), 'utf8')).toBe('contenu');
    expect((await loadConfig(root)).plugins).toEqual(['backlog-md']);

    // idempotent : pas de doublon
    await addPlugin(root, 'backlog-md', { run });
    expect((await loadConfig(root)).plugins).toEqual(['backlog-md']);
  });

  it('sans package.json : crée la config et ne lance rien', async () => {
    const run = vi.fn<Runner>(async () => ({ code: 0, stdout: '', stderr: '' }));
    await addPlugin(root, 'backlog-md', { run });
    expect(run).not.toHaveBeenCalled();
    const cfg = parse(await readFile(path.join(root, 'backlog/config.yml'), 'utf8'));
    expect(cfg.project_name).toBe('demo');
    expect(cfg.statuses).toHaveLength(5);
    expect((await loadConfig(root)).plugins).toContain('backlog-md');
  });

  it('ne réinstalle pas backlog.md s\'il est déjà une dépendance', async () => {
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ devDependencies: { 'backlog.md': '^1.0.0' } }));
    const run = vi.fn<Runner>(async () => ({ code: 0, stdout: '', stderr: '' }));
    await addPlugin(root, 'backlog-md', { run });
    expect(run).not.toHaveBeenCalled();
  });
});
