import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runValider } from '../../src/cli/valider.js';
import { extractGherkin, runTests, toFeature } from '../../src/cli/tests.js';
import { buildTraces, renderMatrix } from '../../src/cli/trace-report.js';
import { scanArtifacts } from '../../src/core/index.js';
import { GHERKIN, makeProject, put } from './helpers.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const r of roots.splice(0)) await rm(r, { recursive: true, force: true });
});

async function fixture(): Promise<string> {
  const root = await makeProject('evolution', true);
  roots.push(root);
  await put(root, 'backlog/tasks/us-001 - Connexion.md', `---\ntype: story\nid: US-001\ntitle: Connexion par email\nstatut: brouillon\nstatus: Prête\n---\n# Connexion\n\n${GHERKIN}`);
  await put(root, 'backlog/tasks/us-002 - Profil.md', `---\ntype: story\nid: US-002\ntitle: Profil\nstatut: brouillon\nstatus: À faire\n---\n# Profil\n\n${GHERKIN}`);
  await put(root, 'backlog/tasks/us-003 - Vide.md', '---\ntype: story\nid: US-003\ntitle: Vide\nstatut: brouillon\nstatus: À faire\n---\n# Vide\n');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  await runValider('backlog/tasks/us-001 - Connexion.md', { cwd: root, yes: true });
  await runValider('backlog/tasks/us-003 - Vide.md', { cwd: root, yes: true });
  return root;
}

describe('extractGherkin / toFeature', () => {
  it('lit les blocs ```gherkin, sinon la section critères', () => {
    expect(extractGherkin(GHERKIN)).toHaveLength(1);
    const brut = "## Critères d'acceptation\n\nScénario: ok\n  Étant donné a\n  Alors c\n\n## Notes\n\nScénario: hors section\n";
    const [b] = extractGherkin(brut);
    expect(b).toContain('Scénario: ok');
    expect(b).not.toContain('hors section');
    expect(extractGherkin('## Description\n\nRien.\n')).toEqual([]);
  });
  it('ajoute le tag, la Fonctionnalité et la langue si absents', () => {
    const f = toFeature('Scénario: ok\n  Étant donné a', 'US-7', 'Mon titre');
    expect(f).toMatch(/# language: fr\n@US-7\nFonctionnalité: Mon titre\n\n {2}Scénario: ok/);
  });
  it('ne double pas un tag déjà présent (US-1 ≠ US-12)', () => {
    const f = toFeature('@US-1\nFonctionnalité: x\n  Scénario: ok', 'US-1', 'x');
    expect(f.match(/@US-1\b/g)).toHaveLength(1);
    expect(toFeature('@US-12\nFeature: x\n  Scenario: ok', 'US-1', 'x')).toMatch(/@US-12\n@US-1\nFeature: x/);
  });
});

describe('orbith tests', () => {
  it('crée les .feature des seules US validées avec Gherkin, tracés par orbith trace', async () => {
    const root = await fixture();
    const r = await runTests(undefined, { cwd: root });
    expect(r.crees).toEqual(['tests/features/us-001.feature']);
    expect(r.ignorees.map((i) => i.id).sort()).toEqual(['US-002', 'US-003']);
    const content = await readFile(path.join(root, 'tests/features/us-001.feature'), 'utf8');
    expect(content).toContain('@US-001');
    expect(content).toContain('Scénario: ok');
    const [t] = await buildTraces(root, await scanArtifacts(root));
    // Un squelette généré n'est pas un test : il est listé à part, « non exécuté ».
    expect(t!.tests).not.toContain('tests/features/us-001.feature');
    expect(t!.squelettes).toContain('tests/features/us-001.feature');
    const matrice = renderMatrix([t!], 'x');
    expect(matrice).toContain('tests/features/us-001.feature (squelette, non exécuté)');
    // Une fois l'en-tête de squelette retiré, le fichier compte comme un test.
    const f = path.join(root, 'tests/features/us-001.feature');
    await writeFile(f, (await readFile(f, 'utf8')).replace(/^# Squelette.*\n/, ''));
    const [t2] = await buildTraces(root, await scanArtifacts(root));
    expect(t2!.tests).toContain('tests/features/us-001.feature');
    expect(t2!.squelettes).toEqual([]);
  });
  it('ne réécrit pas un fichier existant sans --force', async () => {
    const root = await fixture();
    await put(root, 'tests/features/us-001.feature', 'modifié à la main');
    const r = await runTests('us-001', { cwd: root });
    expect(r.existants).toEqual(['tests/features/us-001.feature']);
    expect(await readFile(path.join(root, 'tests/features/us-001.feature'), 'utf8')).toBe('modifié à la main');
    await runTests('US-001', { cwd: root, force: true });
    expect(await readFile(path.join(root, 'tests/features/us-001.feature'), 'utf8')).toContain('@US-001');
  });
  it('US inconnue : erreur claire', async () => {
    const root = await fixture();
    await expect(runTests('US-999', { cwd: root })).rejects.toThrow(/introuvable/);
  });
});
