import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AGENTS, runAdapters } from '../../src/adapters/index.js';
import { agentsDuProjet, inventaireAgentsPerso } from '../../src/adapters/agents-perso.js';
import { defaultConfig, exists, OrbithError, type OrbithConfig } from '../../src/core/index.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'orbith-ap-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
const read = (rel: string) => readFile(path.join(root, rel), 'utf8');
const put = async (rel: string, content: string) => {
  await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await writeFile(path.join(root, rel), content, 'utf8');
};
const cfg3 = (): OrbithConfig => ({ ...defaultConfig('x'), plateformes: ['gemini', 'claude', 'copilot'] });
const JURISTE = '---\nnom: Jade\ndescription: "Juriste RGPD : registre des traitements"\npersona: Juriste bienveillante\n---\n# Agent Jade\nCorps unique du juriste.\n';

describe('agents personnalisés', () => {
  it('génère une commande par plateforme qui référence le fichier custom sans le copier', async () => {
    await put('.orbith/custom/agents/juriste-rgpd.md', JURISTE);
    const files = await runAdapters(root, cfg3());
    expect(files).toContain('.gemini/commands/orbith/juriste-rgpd.toml');
    expect(files).toContain('.claude/commands/orbith-juriste-rgpd.md');
    expect(files).toContain('.github/prompts/orbith-juriste-rgpd.prompt.md');

    const toml = await read('.gemini/commands/orbith/juriste-rgpd.toml');
    expect(toml).toContain('description = "Juriste RGPD : registre des traitements"');
    expect(toml).toContain('@{.orbith/custom/agents/juriste-rgpd.md}');
    const md = await read('.claude/commands/orbith-juriste-rgpd.md');
    expect(md).toContain('@.orbith/custom/agents/juriste-rgpd.md');
    expect(md).toContain('$ARGUMENTS');
    const prompt = await read('.github/prompts/orbith-juriste-rgpd.prompt.md');
    expect(prompt).toContain('](../../.orbith/custom/agents/juriste-rgpd.md)');
    for (const t of [toml, md, prompt]) expect(t).not.toContain('Corps unique du juriste');
  });

  it('utilise le champ commande et garde les agents du cœur', async () => {
    await put('.orbith/custom/agents/juriste-rgpd.md', JURISTE.replace('persona:', 'commande: rgpd\npersona:'));
    await runAdapters(root, cfg3());
    expect(await exists(path.join(root, '.claude/commands/orbith-rgpd.md'))).toBe(true);
    expect(await exists(path.join(root, '.claude/commands/orbith-juriste-rgpd.md'))).toBe(false);
    expect(await exists(path.join(root, '.claude/commands/orbith-po.md'))).toBe(true);
    const all = await agentsDuProjet(root);
    expect(all).toHaveLength(AGENTS.length + 1);
    expect(all.at(-1)).toMatchObject({ key: 'juriste-rgpd', gemini: 'orbith:rgpd', claude: 'orbith-rgpd' });
  });

  it("un complément d'un agent du cœur ne crée pas de commande ; un fichier sans description est ignoré", async () => {
    await put('.orbith/custom/agents/qa.md', '---\ndescription: "autre QA"\n---\nConsignes en plus.\n');
    await put('.orbith/custom/agents/notes.md', 'Mes notes.\n');
    const inv = await inventaireAgentsPerso(root);
    expect(inv.agents).toEqual([]);
    expect(inv.complements).toEqual(['.orbith/custom/agents/qa.md']);
    expect(inv.ignores).toEqual(['.orbith/custom/agents/notes.md']);
    await runAdapters(root, defaultConfig('x'));
    expect(await read('.claude/commands/orbith-qa.md')).toContain('@.orbith/agents/qa.md');
    expect(await exists(path.join(root, '.claude/commands/orbith-notes.md'))).toBe(false);
  });

  it("refuse une collision avec une commande du cœur, sans rien écraser", async () => {
    await put('.orbith/custom/agents/mon-archi.md', '---\ndescription: "Autre architecte"\ncommande: archi\n---\nX\n');
    await expect(runAdapters(root, defaultConfig('x'))).rejects.toThrow(OrbithError);
    await expect(runAdapters(root, defaultConfig('x'))).rejects.toThrow(/« archi » est déjà utilisée par l'agent du cœur « architecte »/);
    expect(await exists(path.join(root, '.gemini/commands/orbith/archi.toml'))).toBe(false);
  });

  it('refuse une collision avec un workflow du cœur et entre deux agents personnalisés', async () => {
    await put('.orbith/custom/agents/retro.md', '---\ndescription: "Ma rétro"\n---\nX\n');
    let inv = await inventaireAgentsPerso(root);
    expect(inv.erreurs[0]?.message).toMatch(/retro/);
    await rm(path.join(root, '.orbith/custom/agents/retro.md'));
    await put('.orbith/custom/agents/a.md', '---\ndescription: "A"\ncommande: dup\n---\nX\n');
    await put('.orbith/custom/agents/b.md', '---\ndescription: "B"\ncommande: dup\n---\nX\n');
    inv = await inventaireAgentsPerso(root);
    expect(inv.agents.map((a) => a.key)).toEqual(['a']);
    expect(inv.erreurs).toHaveLength(1);
    expect(inv.erreurs[0]?.chemin).toBe('.orbith/custom/agents/b.md');
    await expect(agentsDuProjet(root)).rejects.toThrow(/déjà déclarée par \.orbith\/custom\/agents\/a\.md/);
  });

  it('refuse une commande ou un nom de fichier invalide', async () => {
    await put('.orbith/custom/agents/x.md', '---\ndescription: "X"\ncommande: "Mauvais Nom"\n---\nX\n');
    await put('.orbith/custom/agents/Majuscule.md', '---\ndescription: "Y"\n---\nX\n');
    const inv = await inventaireAgentsPerso(root);
    expect(inv.erreurs.map((e) => e.chemin)).toEqual(['.orbith/custom/agents/Majuscule.md', '.orbith/custom/agents/x.md']);
  });

  it('est idempotent', async () => {
    await put('.orbith/custom/agents/juriste-rgpd.md', JURISTE);
    const first = await runAdapters(root, cfg3());
    const before = await read('.gemini/commands/orbith/juriste-rgpd.toml');
    const second = await runAdapters(root, cfg3());
    expect(second.sort()).toEqual(first.sort());
    expect(await read('.gemini/commands/orbith/juriste-rgpd.toml')).toBe(before);
  });

  it('échappe une description avec guillemets et retours à la ligne (TOML valide)', async () => {
    await put('.orbith/custom/agents/doc.md', '---\ndescription: |\n  Rédacteur "doc"\n  sur deux lignes\n---\nX\n');
    await runAdapters(root, defaultConfig('x'));
    const toml = await read('.gemini/commands/orbith/doc.toml');
    expect(toml.split('\n')[0]).toBe('description = "Rédacteur \\"doc\\" sur deux lignes"');
  });
});
