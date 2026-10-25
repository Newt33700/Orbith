import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { register } from '../../src/cli/check.js';
import { CSR, useProject } from '../checks/helpers.js';

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

async function run(...args: string[]) {
  const p = new Command();
  register(p);
  await p.parseAsync(['node', 'orbith', 'check', '--cwd', fx.root, ...args]);
}

describe('orbith check', () => {
  it('projet conforme sans CSR : avertissement, exit 0', async () => {
    await run();
    const text = out.join('\n');
    expect(text).toContain('Aucune erreur');
    expect(text).toContain('1 avertissement(s)');
    expect(process.exitCode).toBeUndefined();
  });

  it('erreur détectée : exit 1 et résumé en français', async () => {
    await fx.put('.orbith/csr/CSR.md', CSR);
    await fx.put('package.json', JSON.stringify({ dependencies: { angularjs: '1' } }));
    await run();
    const text = out.join('\n');
    expect(text).toMatch(/❌ 1 erreur\(s\), 0 avertissement\(s\)/);
    expect(text).toContain('Cadre de référence (CSR)');
    expect(process.exitCode).toBe(1);
  });

  it('tout conforme', async () => {
    await fx.put('.orbith/csr/CSR.md', CSR);
    await fx.put('package.json', JSON.stringify({ engines: { node: '>=22' } }));
    await run();
    expect(out.join('\n')).toContain('✅ Tout est conforme');
  });

  it('--format json', async () => {
    await fx.put('.orbith/csr/CSR.md', CSR);
    await fx.put('package.json', JSON.stringify({ dependencies: { angularjs: '1' } }));
    await run('--format', 'json');
    const json = JSON.parse(out.join('\n'));
    expect(json).toMatchObject({ conforme: false, erreurs: 1 });
    expect(json.resultats[0]).toMatchObject({ categorie: 'csr', niveau: 'erreur' });
    expect(process.exitCode).toBe(1);
  });
});
