import { describe, expect, it } from 'vitest';
import { run } from '../../src/checks/tracabilite.js';
import { defaultConfig } from '../../src/core/index.js';
import { git, initRepo, useProject } from './helpers.js';

const fx = useProject();
const ctx = () => ({ root: fx.root, config: defaultConfig('t') });

describe('check tracabilite', () => {
  it('ignore un dossier hors dépôt git', async () => {
    const r = await run(ctx());
    expect(r).toHaveLength(1);
    expect(r[0]!.niveau).toBe('info');
  });

  it('avertit pour les commits sans id et les stories Terminées non référencées', async () => {
    initRepo(fx.root);
    await fx.put('a.txt', '1');
    git(fx.root, 'add', '.');
    git(fx.root, 'commit', '-q', '-m', 'feat(US-001): premier');
    await fx.put('a.txt', '2');
    git(fx.root, 'commit', '-q', '-am', 'chore: sans story');
    const story = (id: string) => `---\ntype: story\nid: ${id}\nstatut: brouillon\nstatus: Terminée\n---\n# ${id}\n`;
    await fx.put('backlog/tasks/us-001.md', story('US-001'));
    await fx.put('backlog/tasks/us-002.md', story('US-002'));
    const r = await run(ctx());
    expect(r.every((x) => x.niveau === 'avertissement')).toBe(true);
    expect(r.filter((x) => /sans identifiant/.test(x.message))).toHaveLength(1);
    const st = r.filter((x) => /Terminée/.test(x.message));
    expect(st).toHaveLength(1);
    expect(st[0]!.message).toContain('US-002');
  });
});
