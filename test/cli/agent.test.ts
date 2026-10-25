import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runInstall } from '../../src/cli/install.js';
import { runUpdate } from '../../src/cli/update.js';
import { listeAgents, runAgentNew, squeletteAgent } from '../../src/cli/agent.js';
import { reglesManquantes, run as runCheckAgents } from '../../src/checks/agents.js';
import { inventaireAgentsPerso } from '../../src/adapters/agents-perso.js';
import { exists, OrbithError, parseDoc } from '../../src/core/index.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'orbith-agent-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});
const read = (rel: string) => readFile(path.join(root, rel), 'utf8');

describe('squelette d\'agent', () => {
  it('suit les conventions des agents du cœur et contient les règles obligatoires', () => {
    const txt = squeletteAgent({ cle: 'juriste-rgpd', description: 'Juriste RGPD : registre', nom: 'Jade' });
    const { data, body } = parseDoc(txt);
    expect(data).toMatchObject({ nom: 'Jade', description: 'Juriste RGPD : registre', commande: 'juriste-rgpd' });
    expect(typeof data['persona']).toBe('string');
    expect(data['statut']).toBeUndefined();
    for (const titre of [
      '## Persona',
      '## Mission',
      '## Ce que tu lis',
      '## Ce que tu écris',
      '## Contrôles avant de commencer (portes de validation)',
      '## Procédure',
      '## Règles de comportement',
      '## Fin de tâche',
    ]) {
      expect(body, titre).toContain(titre);
    }
    expect(body).toContain('**Une seule question à la fois.**');
    expect(body).toContain("tu n'écris jamais `statut: validé`");
    expect(body).toContain('Ouvre une NOUVELLE session');
    expect(reglesManquantes(body)).toEqual([]);
    expect(body).not.toMatch(/^statut:\s*validé/m);
  });

  it('détecte les règles obligatoires absentes', () => {
    expect(reglesManquantes('# Agent\nFais ton travail.')).toHaveLength(4);
    expect(reglesManquantes('Confidentialité. Nouvelle session. Documentation à jour.')).toEqual([
      'validation humaine (« tu n\'écris jamais `statut: validé` »)',
    ]);
  });
});

describe('orbith agent new / list', () => {
  it('crée le squelette, génère les commandes et passe le check sans avertissement', async () => {
    await runInstall({ cwd: root, yes: true, nom: 'demo', plateformes: 'gemini,claude,copilot' });
    const r = await runAgentNew('juriste-rgpd', { cwd: root, yes: true, description: 'Juriste RGPD' });
    expect(r.fichier).toBe('.orbith/custom/agents/juriste-rgpd.md');
    expect(r.commandes).toContain('.gemini/commands/orbith/juriste-rgpd.toml');
    expect(await read('.claude/commands/orbith-juriste-rgpd.md')).toContain('@.orbith/custom/agents/juriste-rgpd.md');
    expect(await exists(path.join(root, '.github/prompts/orbith-juriste-rgpd.prompt.md'))).toBe(true);

    const res = await runCheckAgents({ root, config: null });
    expect(res.filter((x) => x.niveau !== 'info')).toEqual([]);
    expect(res.map((x) => x.niveau)).toEqual(['info']);

    const { lignes } = await listeAgents(root);
    expect(lignes.filter((l) => l.origine === 'cœur').map((l) => l.cle)).toContain('creer-agent');
    expect(lignes.filter((l) => l.origine === 'projet')).toEqual([
      expect.objectContaining({ cle: 'juriste-rgpd', gemini: '/orbith:juriste-rgpd', claude: '/orbith-juriste-rgpd' }),
    ]);
  });

  it("n'écrase jamais un fichier existant et refuse un nom du cœur ou invalide", async () => {
    await runInstall({ cwd: root, yes: true, nom: 'demo' });
    await runAgentNew('redacteur', { cwd: root, yes: true });
    const avant = await read('.orbith/custom/agents/redacteur.md');
    expect(avant).toContain('Agent personnalisé « redacteur » (à compléter)');
    await expect(runAgentNew('redacteur', { cwd: root, yes: true })).rejects.toThrow(/existe déjà/);
    expect(await read('.orbith/custom/agents/redacteur.md')).toBe(avant);
    await expect(runAgentNew('qa', { cwd: root, yes: true })).rejects.toThrow(/agent du cœur/);
    await expect(runAgentNew('archi', { cwd: root, yes: true })).rejects.toThrow(/architecte/);
    await expect(runAgentNew('Pas Bon', { cwd: root, yes: true })).rejects.toBeInstanceOf(OrbithError);
    expect(await exists(path.join(root, '.orbith/custom/agents/qa.md'))).toBe(false);
  });

  it('update et install (relancé) régénèrent les commandes des agents personnalisés, de façon idempotente', async () => {
    await runInstall({ cwd: root, yes: true, nom: 'demo' });
    await mkdir(path.join(root, '.orbith/custom/agents'), { recursive: true });
    await writeFile(
      path.join(root, '.orbith/custom/agents/expert.md'),
      squeletteAgent({ cle: 'expert', description: 'Expert métier' }),
    );
    await runUpdate({ cwd: root, yes: true });
    const toml = await read('.gemini/commands/orbith/expert.toml');
    expect(toml).toContain('@{.orbith/custom/agents/expert.md}');
    await runUpdate({ cwd: root, yes: true });
    expect(await read('.gemini/commands/orbith/expert.toml')).toBe(toml);
    await runInstall({ cwd: root, yes: true });
    expect(await read('.gemini/commands/orbith/expert.toml')).toBe(toml);
    expect(await read('.orbith/custom/agents/expert.md')).toContain('description: Expert métier');
  });

  it('update échoue clairement sur une collision', async () => {
    await runInstall({ cwd: root, yes: true, nom: 'demo' });
    await mkdir(path.join(root, '.orbith/custom/agents'), { recursive: true });
    await writeFile(path.join(root, '.orbith/custom/agents/po2.md'), '---\ndescription: "PO bis"\ncommande: po\n---\nX\n');
    await expect(runUpdate({ cwd: root, yes: true })).rejects.toThrow(/po2\.md : la commande « po » est déjà utilisée/);
    expect(await read('.claude/commands/orbith-po.md')).toContain('@.orbith/agents/po.md');
  });

  it('check : erreur pour une collision, avertissement pour les règles manquantes et un fichier ignoré', async () => {
    await mkdir(path.join(root, '.orbith/custom/agents'), { recursive: true });
    await writeFile(path.join(root, '.orbith/custom/agents/dev2.md'), '---\ndescription: "Dev bis"\ncommande: dev\n---\nX\n');
    await writeFile(path.join(root, '.orbith/custom/agents/maigre.md'), '---\ndescription: "Maigre"\n---\nFais le travail.\n');
    await writeFile(path.join(root, '.orbith/custom/agents/notes.md'), 'Notes.\n');
    await writeFile(path.join(root, '.orbith/custom/agents/dev.md'), 'Complément du dev.\n');
    expect((await inventaireAgentsPerso(root)).complements).toEqual(['.orbith/custom/agents/dev.md']);
    const res = await runCheckAgents({ root, config: null });
    expect(res.map((r) => [r.niveau, r.fichier])).toEqual([
      ['erreur', '.orbith/custom/agents/dev2.md'],
      ['avertissement', '.orbith/custom/agents/notes.md'],
      ['avertissement', '.orbith/custom/agents/maigre.md'],
    ]);
    expect(res[2]?.message).toMatch(/validation humaine.*confidentialité.*nouvelle session.*documentation/);
    expect(res.every((r) => r.categorie === 'agents')).toBe(true);
  });
});

describe('workflow creer-agent', () => {
  it('existe, guide question par question et interdit statut: validé', async () => {
    const txt = await readFile(path.join(process.cwd(), 'content', 'workflows', 'creer-agent.md'), 'utf8');
    expect(txt).toContain('.orbith/custom/agents/<cle>.md');
    expect(txt).toContain('**Une seule question à la fois.**');
    expect(txt).toContain("N'écris jamais `statut: validé`");
    expect(txt).toContain('NOUVELLE session');
    expect(reglesManquantes(txt)).toEqual([]);
  });
});
