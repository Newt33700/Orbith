import { describe, expect, it } from 'vitest';
import { run, estDocumentation, documentationNonConcernee } from '../../src/checks/documentation.js';
import { defaultConfig, loadConfig, type OrbithConfig } from '../../src/core/index.js';
import { git, initRepo, useProject } from './helpers.js';

const fx = useProject();
const ctx = (cfg: OrbithConfig = defaultConfig('t')) => ({ root: fx.root, config: cfg });

async function commit(files: Record<string, string>, message: string): Promise<void> {
  for (const [f, c] of Object.entries(files)) await fx.put(f, c);
  git(fx.root, 'add', '-A');
  git(fx.root, 'commit', '-q', '-m', message);
}

describe('check documentation', () => {
  it('reconnaît les fichiers de documentation', () => {
    expect(estDocumentation('README.md')).toBe(true);
    expect(estDocumentation('docs/guide/x.md')).toBe(true);
    expect(estDocumentation('docs/schema.png')).toBe(true);
    expect(estDocumentation('CHANGELOG.md')).toBe(true);
    expect(estDocumentation('packages/a/README')).toBe(true);
    expect(estDocumentation('backlog/tasks/us-001 - X.md')).toBe(false);
    expect(estDocumentation('src/index.ts')).toBe(false);
    expect(estDocumentation('.orbith/agents/dev.md')).toBe(false);
    expect(estDocumentation('.orbith/contexte-projet.md')).toBe(true);
    expect(documentationNonConcernee('Non-concernée')).toBe(true);
    expect(documentationNonConcernee('aucune')).toBe(true);
    expect(documentationNonConcernee('oui')).toBe(false);
  });

  it("ne dit rien hors dépôt git ou sans commit d'US", async () => {
    expect(await run(ctx())).toEqual([]);
    initRepo(fx.root);
    await commit({ 'src/a.ts': '1' }, 'chore: sans story');
    expect(await run(ctx())).toEqual([]);
  });

  it('avertit quand une US modifie src/ sans documentation, pas quand la doc suit', async () => {
    initRepo(fx.root);
    await commit({ 'src/a.ts': '1' }, 'feat(US-001): code seul');
    await commit({ 'src/b.ts': '1' }, 'feat(US-002): code');
    await commit({ 'README.md': '# doc' }, 'docs(US-002): documente');
    await commit({ 'tests/a.test.ts': '1' }, 'test(US-003): test seul');
    const r = await run(ctx());
    expect(r).toHaveLength(1);
    expect(r[0]!.categorie).toBe('documentation');
    expect(r[0]!.niveau).toBe('avertissement');
    expect(r[0]!.message).toContain('US-001');
    expect(r[0]!.message).toContain('src/a.ts');
  });

  it('respecte `documentation: non-concernée` dans la US et la désactivation par la config', async () => {
    initRepo(fx.root);
    await fx.put(
      'backlog/tasks/us-001 - X.md',
      '---\ntype: story\nid: US-001\nstatut: brouillon\ndocumentation: non-concernée\n---\n# X\n',
    );
    await commit({ 'src/a.ts': '1' }, 'refactor(US-001): interne');
    await commit({ 'src/b.ts': '1' }, 'feat(US-002): code');
    const r = await run(ctx());
    expect(r.map((x) => x.message.slice(0, 6))).toEqual(['US-002']);

    await fx.put('.orbith/config.yaml', 'version: 1\nprojet: { nom: t }\ndocumentation:\n  controle: false\n');
    const cfg = await loadConfig(fx.root);
    expect(cfg.documentation).toEqual({ controle: false, code: ['src/'] });
    expect(await run(ctx(cfg))).toEqual([]);
  });

  it('utilise les dossiers de code configurés', async () => {
    initRepo(fx.root);
    await commit({ 'lib/a.py': '1', 'src/b.ts': '1' }, 'feat(US-001): code');
    await fx.put('.orbith/config.yaml', 'version: 1\nprojet: { nom: t }\ndocumentation:\n  code: [lib/]\n');
    const cfg = await loadConfig(fx.root);
    const r = await run(ctx(cfg));
    expect(r).toHaveLength(1);
    expect(r[0]!.message).toContain('lib/a.py');
    expect(r[0]!.message).not.toContain('src/b.ts');
  });
});
