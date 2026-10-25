import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { register } from '../../src/cli/decouper.js';
import { runNext } from '../../src/cli/next.js';
import { register as registerCheck } from '../../src/cli/check.js';
import { loadConfig } from '../../src/core/index.js';
import { useProject } from '../checks/helpers.js';

const fx = useProject();
let out: string[];
beforeEach(() => {
  out = [];
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void out.push(a.join(' ')));
  process.exitCode = undefined;
});
afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

const CONFIG = 'version: 1\norbith_version: 0.1.0\nprojet:\n  nom: demo\nplateformes: [claude]\npiste: evolution\nbacklog:\n  prefixe: US\n';
const gros = `---\ntype: prd\nstatut: brouillon\n---\n# Gros PRD\n\n## A\n\n${'mot '.repeat(300)}\n\n## B\n\nfin\n`;

async function decoupe(...args: string[]): Promise<void> {
  const p = new Command();
  register(p);
  await p.parseAsync(['node', 'orbith', 'decouper', ...args, '--cwd', fx.root]);
}
async function check(): Promise<string> {
  out = [];
  const p = new Command();
  registerCheck(p);
  await p.parseAsync(['node', 'orbith', 'check', '--cwd', fx.root]);
  return out.join('\n');
}

describe('orbith decouper', () => {
  it('découpe, affiche le résultat et accepte --niveau / --sortie', async () => {
    await fx.put('.orbith/config.yaml', CONFIG);
    await fx.put('docs/produit/prd.md', gros);
    await decoupe('docs/produit/prd.md');
    expect(out.join('\n')).toContain('découpé en 2 extrait(s)');
    expect((await fs.readdir(path.join(fx.root, '.orbith/extraits/prd'))).sort()).toEqual([
      '00-a.md',
      '01-b.md',
      'index.md',
    ]);
    await decoupe('docs/produit/prd.md', '--niveau', '1', '--sortie', 'derive');
    expect((await fs.readdir(path.join(fx.root, 'derive'))).sort()).toEqual(['00-gros-prd.md', 'index.md']);
  });

  it('niveau invalide : erreur en français', async () => {
    await fx.put('docs/produit/prd.md', gros);
    await expect(decoupe('docs/produit/prd.md', '--niveau', 'x')).rejects.toThrow(/Niveau invalide/);
  });
});

describe('check et next avec extraits', () => {
  it('info sans extraits, rien une fois découpé, avertissement quand périmé (jamais une erreur)', async () => {
    await fx.put('.orbith/config.yaml', `${CONFIG}extraits:\n  seuil_jetons: 100\n`);
    expect((await loadConfig(fx.root)).extraits?.seuil_jetons).toBe(100);
    await fx.put('docs/produit/prd.md', gros);
    let t = await check();
    expect(t).toContain('est volumineux');
    expect(t).toContain('npx orbith decouper docs/produit/prd.md');
    expect(process.exitCode).toBeUndefined();

    out = [];
    await runNext(fx.root, 'texte');
    expect(out.join('\n')).toContain('est volumineux');

    await decoupe('docs/produit/prd.md');
    t = await check();
    expect(t).not.toContain('est volumineux');
    expect(t).not.toContain('périmés');

    await fx.put('docs/produit/prd.md', gros + '\nAjout.\n');
    t = await check();
    expect(t).toContain('sont périmés');
    expect(t).toContain('Aucune erreur');
    expect(process.exitCode).toBeUndefined();
  });

  it('seuil par défaut 4000 : document moyen non signalé ; seuil invalide refusé', async () => {
    await fx.put('.orbith/config.yaml', CONFIG);
    await fx.put('docs/produit/prd.md', gros);
    expect(await check()).not.toContain('est volumineux');
    expect((await loadConfig(fx.root)).extraits).toBeUndefined();
    await fx.put('.orbith/config.yaml', `${CONFIG}extraits:\n  seuil_jetons: abc\n`);
    await expect(loadConfig(fx.root)).rejects.toThrow(/seuil_jetons/);
  });
});
