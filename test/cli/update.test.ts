import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runInstall } from '../../src/cli/install.js';
import { runUpdate } from '../../src/cli/update.js';
import { exists, loadConfig, OrbithError } from '../../src/core/index.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'orbith-upd-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});
const read = (rel: string) => readFile(path.join(root, rel), 'utf8');

describe('orbith update', () => {
  it('échoue hors projet Orbith', async () => {
    await expect(runUpdate({ cwd: root, yes: true })).rejects.toBeInstanceOf(OrbithError);
  });

  it('remet à jour le cœur sans toucher à la config, au custom ni aux validations', async () => {
    await runInstall({ cwd: root, yes: true, nom: 'demo', piste: 'correctif' });
    await writeFile(path.join(root, '.orbith/agents/po.md'), 'modifié à la main');
    await writeFile(path.join(root, '.orbith/custom/mon-fichier.md'), 'perso');
    await writeFile(path.join(root, '.orbith/config/dor.md'), 'ma DoR');
    await writeFile(path.join(root, '.orbith/csr/CSR.md'), 'mon CSR');
    const validations = JSON.stringify({ version: 1, validations: [{ fichier: 'a.md', sha256: 'x', par: 'Moi', email: 'm@x.fr', le: 'now' }] });
    await writeFile(path.join(root, '.orbith/validations.json'), validations);
    // simule une ancienne version et une config modifiée
    const cfgBefore = (await read('.orbith/config.yaml')).replace(/orbith_version: .*/, 'orbith_version: 0.0.1');
    await writeFile(path.join(root, '.orbith/config.yaml'), cfgBefore);
    await writeFile(path.join(root, 'CLAUDE.md'), '# Perso\n');

    await runUpdate({ cwd: root, yes: true });

    expect(await read('.orbith/agents/po.md')).not.toBe('modifié à la main');
    expect(await read('.orbith/custom/mon-fichier.md')).toBe('perso');
    expect(await read('.orbith/config/dor.md')).toBe('ma DoR');
    expect(await read('.orbith/csr/CSR.md')).toBe('mon CSR');
    expect(await read('.orbith/validations.json')).toBe(validations);
    const cfg = await loadConfig(root);
    expect(cfg.orbith_version).not.toBe('0.0.1');
    expect(cfg.projet.nom).toBe('demo');
    expect(cfg.piste).toBe('correctif');
    expect(await read('.orbith/config.yaml')).toContain('# Configuration Orbith du projet.');
    expect(await read('CLAUDE.md')).toContain('# Perso');
    expect(await read('CLAUDE.md')).toContain('orbith:debut');
    expect(await exists(path.join(root, '.claude/commands/orbith-po.md'))).toBe(true);
  });
});
