import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { adapters, AGENTS, runAdapters } from '../../src/adapters/index.js';
import { commandMd } from '../../src/adapters/claude/index.js';
import { upsertBlock } from '../../src/adapters/blocks.js';
import { defaultConfig, exists } from '../../src/core/index.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'orbith-ad-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
const read = (rel: string) => readFile(path.join(root, rel), 'utf8');

describe('adaptateur gemini', () => {
  it('génère les commandes toml qui référencent le cœur', async () => {
    const files = await adapters.gemini.generate(root, defaultConfig('x'));
    expect(files).toContain('.gemini/commands/orbith/po.toml');
    expect(files).toContain('GEMINI.md');
    expect(files).toContain('.geminiignore');
    const po = await read('.gemini/commands/orbith/po.toml');
    expect(po).toContain('description = "Product Owner');
    expect(po).toContain('@{.orbith/agents/po.md}');
    expect(po).toContain('{{args}}');
    expect(po).not.toContain('!{');
    const guide = await read('.gemini/commands/orbith/guide.toml');
    expect(guide).toContain('!{npx orbith next}');
    expect(await exists(path.join(root, '.gemini/commands/orbith/archi.toml'))).toBe(true);
    expect(await read('GEMINI.md')).toContain('@.orbith/rules/validation-humaine.md');
    expect(await read('.geminiignore')).toContain('secrets/');
  });
});

describe('adaptateur claude', () => {
  it('génère les commandes md, CLAUDE.md et settings.json', async () => {
    const files = await adapters.claude.generate(root, defaultConfig('x'));
    expect(files).toContain('.claude/commands/orbith.md');
    expect(files).toContain('.claude/commands/orbith-archi.md');
    const po = await read('.claude/commands/orbith-po.md');
    expect(po).toContain('@.orbith/agents/po.md');
    expect(po).toContain('$ARGUMENTS');
    expect(await read('.claude/commands/orbith.md')).toContain('npx orbith next');
    expect(await read('CLAUDE.md')).toContain('@.orbith/csr/CSR.md');
    const settings = JSON.parse(await read('.claude/settings.json'));
    expect(settings.permissions.deny).toContain('Read(./.env)');
    expect(AGENTS).toHaveLength(9);
  });

  it('frontmatter des commandes md est du YAML valide', () => {
    for (const agent of AGENTS) {
      const lines = commandMd(agent).split('\n');
      const fm = parse(lines.slice(1, lines.indexOf('---', 1)).join('\n'));
      expect(fm.description, agent.key).toBe(agent.description);
      expect(fm['argument-hint'], agent.key).toBe('[ta demande]');
    }
  });

  it('CLAUDE.md référence le CSR configuré', async () => {
    const cfg = defaultConfig('x');
    cfg.csr.fichier = 'docs/CSR.md';
    await runAdapters(root, cfg);
    expect(await read('CLAUDE.md')).toContain('@docs/CSR.md');
  });

  it('préserve le contenu utilisateur et est idempotent', async () => {
    await writeFile(path.join(root, 'CLAUDE.md'), '# Mes notes\n\nGarde-moi.\n');
    await mkdir(path.join(root, '.claude'));
    await writeFile(
      path.join(root, '.claude/settings.json'),
      JSON.stringify({ model: 'opus', permissions: { allow: ['Bash(ls)'], deny: ['Read(./.env)', 'Read(./perso)'] } }),
    );
    await writeFile(path.join(root, '.geminiignore'), 'perso/\n');
    const cfg = defaultConfig('x');
    const first = await runAdapters(root, cfg);
    const snapshot = {
      claude: await read('CLAUDE.md'),
      settings: await read('.claude/settings.json'),
      ignore: await read('.geminiignore'),
    };
    const second = await runAdapters(root, cfg);
    expect(second.sort()).toEqual(first.sort());
    expect(await read('CLAUDE.md')).toBe(snapshot.claude);
    expect(await read('.claude/settings.json')).toBe(snapshot.settings);
    expect(await read('.geminiignore')).toBe(snapshot.ignore);
    expect(snapshot.claude).toContain('Garde-moi.');
    expect(snapshot.claude.match(/orbith:debut/g)).toHaveLength(1);
    const s = JSON.parse(snapshot.settings);
    expect(s.model).toBe('opus');
    expect(s.permissions.allow).toEqual(['Bash(ls)']);
    expect(s.permissions.deny.filter((d: string) => d === 'Read(./.env)')).toHaveLength(1);
    expect(s.permissions.deny).toContain('Read(./perso)');
    expect(snapshot.ignore).toContain('perso/');
  });

  it('refuse un settings.json invalide sans l\'écraser', async () => {
    await mkdir(path.join(root, '.claude'));
    await writeFile(path.join(root, '.claude/settings.json'), '{ pas du json');
    await expect(adapters.claude.generate(root, defaultConfig('x'))).rejects.toThrow(/settings\.json/);
    expect(await read('.claude/settings.json')).toBe('{ pas du json');
  });
});

describe('upsertBlock', () => {
  it('remplace uniquement le bloc marqué', () => {
    const a = upsertBlock('avant\n', '<!-- d -->', '<!-- f -->', 'v1');
    const b = upsertBlock(a + 'après\n', '<!-- d -->', '<!-- f -->', 'v2');
    expect(b).toContain('avant');
    expect(b).toContain('après');
    expect(b).toContain('v2');
    expect(b).not.toContain('v1');
  });
});
