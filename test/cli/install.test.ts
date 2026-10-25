import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runInstall } from '../../src/cli/install.js';
import { exists, loadConfig } from '../../src/core/index.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'orbith-inst-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});
const read = (rel: string) => readFile(path.join(root, rel), 'utf8');
const has = (rel: string) => exists(path.join(root, rel));

describe('orbith install', () => {
  it('installe un nouveau projet', async () => {
    const dir = path.join(root, 'mon-appli');
    await mkdir(dir);
    await runInstall({ cwd: dir, yes: true });
    const r = (rel: string) => readFile(path.join(dir, rel), 'utf8');
    expect(await exists(path.join(dir, '.git'))).toBe(true);
    for (const f of [
      '.gitignore', '.editorconfig', '.gitlab-ci.yml', 'README.md',
      '.orbith/agents/po.md', '.orbith/rules/validation-humaine.md', '.orbith/templates/story.md',
      '.orbith/config/dor.md', '.orbith/csr/CSR.md', '.orbith/custom', '.orbith/validations.json',
      '.orbith/config.yaml', 'GEMINI.md', 'CLAUDE.md', '.claude/settings.json', '.geminiignore',
      '.gemini/commands/orbith/po.toml', '.claude/commands/orbith-po.md',
      'docs/produit/epics', 'docs/architecture/adr', 'docs/livraisons', 'backlog/tasks', 'src', 'tests',
    ]) {
      expect(await exists(path.join(dir, f)), f).toBe(true);
    }
    expect(await r('README.md')).toContain('mon-appli');
    expect(await r('README.md')).not.toContain('{{nom}}');
    expect(await r('.claude/commands/orbith-po.md')).toContain('@.orbith/agents/po.md');
    expect(JSON.parse(await r('.orbith/validations.json'))).toEqual({ version: 1, validations: [] });
    const cfg = await loadConfig(dir);
    expect(cfg.projet.nom).toBe('mon-appli');
    expect(cfg.plateformes).toEqual(['gemini', 'claude']);
    expect(cfg.piste).toBe('evolution');
  });

  it('respecte les options et ne génère que la plateforme choisie', async () => {
    await runInstall({ cwd: root, yes: true, plateformes: 'claude', piste: 'projet', nom: 'Super Projet' });
    const cfg = await loadConfig(root);
    expect(cfg).toMatchObject({ plateformes: ['claude'], piste: 'projet', projet: { nom: 'Super Projet' } });
    expect(await has('.claude/commands/orbith-po.md')).toBe(true);
    expect(await has('.gemini')).toBe(false);
    expect(await has('GEMINI.md')).toBe(false);
  });

  it('refuse une plateforme inconnue', async () => {
    await expect(runInstall({ cwd: root, yes: true, plateformes: 'cursor' })).rejects.toThrow(
      /Plateforme invalide : cursor.*gemini, claude, copilot/,
    );
  });

  it('installe GitHub Copilot sur demande (opt-in)', async () => {
    await runInstall({ cwd: root, yes: true, plateformes: 'claude,copilot' });
    expect(await exists(path.join(root, '.github/prompts/orbith-po.prompt.md'))).toBe(true);
    expect(await exists(path.join(root, '.github/copilot-instructions.md'))).toBe(true);
    expect(await exists(path.join(root, 'GEMINI.md'))).toBe(false);
  });

  it('est idempotent', async () => {
    await runInstall({ cwd: root, yes: true });
    const files = ['.orbith/config.yaml', 'CLAUDE.md', 'GEMINI.md', '.claude/settings.json', '.geminiignore', '.gemini/commands/orbith/guide.toml'];
    const before = await Promise.all(files.map(read));
    await runInstall({ cwd: root, yes: true });
    expect(await Promise.all(files.map(read))).toEqual(before);
  });

  it('projet existant hors Git : pas de git init ni de squelette', async () => {
    await writeFile(path.join(root, 'package.json'), '{"name":"x"}\n');
    await runInstall({ cwd: root, yes: true });
    expect(await has('.git')).toBe(false);
    expect(await has('src')).toBe(false);
    expect(await has('tests')).toBe(false);
  });

  it('préserve les fichiers d\'un projet existant', async () => {
    await mkdir(path.join(root, '.git'));
    await mkdir(path.join(root, '.claude'));
    await writeFile(path.join(root, 'CLAUDE.md'), '# Mes règles\n\nNe pas toucher.\n');
    await writeFile(path.join(root, 'README.md'), 'Mon README\n');
    await writeFile(
      path.join(root, '.claude/settings.json'),
      JSON.stringify({ env: { A: '1' }, permissions: { allow: ['Bash(npm test)'] } }),
    );
    await runInstall({ cwd: root, yes: true });
    expect(await read('README.md')).toBe('Mon README\n');
    expect(await has('.gitlab-ci.yml')).toBe(false); // pas de squelette : projet existant
    const claude = await read('CLAUDE.md');
    expect(claude).toContain('Ne pas toucher.');
    expect(claude).toContain('<!-- orbith:debut -->');
    const settings = JSON.parse(await read('.claude/settings.json'));
    expect(settings.env).toEqual({ A: '1' });
    expect(settings.permissions.allow).toEqual(['Bash(npm test)']);
    expect(settings.permissions.deny).toContain('Read(./secrets/**)');
  });
});
