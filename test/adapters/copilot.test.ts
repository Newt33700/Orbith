import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adapters, AGENTS, runAdapters } from '../../src/adapters/index.js';
import { defaultConfig, exists, loadConfig } from '../../src/core/index.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'orbith-copilot-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
const read = (rel: string) => readFile(path.join(root, rel), 'utf8');

describe('adaptateur copilot', () => {
  it('est opt-in : absent des plateformes par défaut', async () => {
    expect(defaultConfig('x').plateformes).toEqual(['gemini', 'claude']);
    await runAdapters(root, defaultConfig('x'));
    expect(await exists(path.join(root, '.github/prompts'))).toBe(false);
  });

  it('génère les 17 prompt files qui référencent le cœur sans le dupliquer', async () => {
    const files = await adapters.copilot.generate(root, defaultConfig('x'));
    expect(AGENTS).toHaveLength(17);
    for (const a of AGENTS) {
      const rel = `.github/prompts/${a.claude}.prompt.md`;
      expect(files).toContain(rel);
      const md = await read(rel);
      expect(md.startsWith('---\ndescription: ')).toBe(true);
      expect(md).toContain(`](../../.orbith/${a.file})`);
    }
    expect(await read('.github/prompts/orbith.prompt.md')).toContain('npx orbith next');
    const instr = await read('.github/copilot-instructions.md');
    expect(instr).toContain('(../.orbith/rules/confidentialite.md)');
    expect(instr).toContain('(../.orbith/csr/CSR.md)');
  });

  it('est idempotent et préserve le contenu utilisateur', async () => {
    await mkdir(path.join(root, '.github'), { recursive: true });
    await writeFile(path.join(root, '.github/copilot-instructions.md'), '# Mes consignes\nNe pas toucher.\n');
    await adapters.copilot.generate(root, defaultConfig('x'));
    const first = await read('.github/copilot-instructions.md');
    await adapters.copilot.generate(root, defaultConfig('x'));
    const second = await read('.github/copilot-instructions.md');
    expect(second).toBe(first);
    expect(second).toContain('Ne pas toucher.');
    expect(second.match(/orbith:debut/g)).toHaveLength(1);
  });
});

describe('config : plateformes', () => {
  const ecrire = async (yaml: string) => {
    await mkdir(path.join(root, '.orbith'), { recursive: true });
    await writeFile(path.join(root, '.orbith/config.yaml'), yaml);
  };
  it('accepte copilot', async () => {
    await ecrire('version: 1\nprojet:\n  nom: x\nplateformes: [claude, copilot]\n');
    expect((await loadConfig(root)).plateformes).toEqual(['claude', 'copilot']);
  });
  it('refuse une plateforme inconnue en listant les valeurs permises', async () => {
    await ecrire('version: 1\nprojet:\n  nom: x\nplateformes: [cursor]\n');
    await expect(loadConfig(root)).rejects.toThrow(/plateforme inconnue « cursor ».*gemini, claude, copilot/);
  });
});
