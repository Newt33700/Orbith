import { readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runProvenance, renderProvenance } from '../../src/cli/provenance.js';
import { runValider } from '../../src/cli/valider.js';
import { buildContext, runAll } from '../../src/checks/index.js';
import { collectAudit, renderHtml } from '../../src/audit/index.js';
import { analyserCommit, coAuteurIa, etatChaineProvenance, loadProvenance } from '../../src/core/index.js';
import { GHERKIN, makeProject, put } from './helpers.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const r of roots.splice(0)) await rm(r, { recursive: true, force: true });
});

function commitMsg(root: string, msg: string): void {
  execFileSync('git', ['add', '-A'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['commit', '-q', '--allow-empty', '-F', '-'], { cwd: root, input: msg, stdio: ['pipe', 'ignore', 'ignore'] });
}

const CLAUDE = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>';

describe('détection des co-auteurs IA', () => {
  it('reconnaît les IA, pas les humains (même prénommés Claude)', () => {
    expect(coAuteurIa('Claude Opus 5.5 <noreply@anthropic.com>')).toEqual({ nom: 'Claude Opus 5.5', modele: 'Claude Opus 5.5' });
    expect(coAuteurIa('Claude <noreply@anthropic.com>')).toEqual({ nom: 'Claude' });
    expect(coAuteurIa('Copilot <175728472+Copilot@users.noreply.github.com>')).toEqual({ nom: 'Copilot' });
    expect(coAuteurIa('gemini-code-assist[bot] <x@y.z>')).not.toBeNull();
    expect(coAuteurIa('Claude Martin <claude.martin@corp.fr>')).toBeNull();
    expect(coAuteurIa('Jane Doe <jane@corp.fr>')).toBeNull();
  });

  it('extrait US, documents, modèle et relecteurs, sans adresse électronique', () => {
    const p = analyserCommit({
      hash: 'abc',
      date: '2026-10-20',
      message: `feat(US-001): connexion\n\nRefs US-002\n\nReviewed-by: Jane Doe <jane@corp.fr>\n${CLAUDE}\n`,
      files: ['src/a.ts', 'docs/produit/prd.md', 'backlog/tasks/us-001 - x.md'],
    })!;
    expect(p).toMatchObject({ us: ['US-001', 'US-002'], modele: 'Claude Opus 5.5', ia: ['Claude Opus 5.5'], relu_par: ['Jane Doe'] });
    expect(p.documents).toEqual(['docs/produit/prd.md', 'backlog/tasks/us-001 - x.md']);
    expect(JSON.stringify(p)).not.toContain('@');
    expect(analyserCommit({ hash: 'x', date: '', message: 'chore: rien\n\nCo-Authored-By: Jane <jane@corp.fr>', files: [] })).toBeNull();
  });
});

async function projet(): Promise<string> {
  const root = await makeProject('evolution', true);
  roots.push(root);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  await put(root, 'backlog/tasks/us-001 - Connexion.md', `---\ntype: story\nid: US-001\ntitle: Connexion\nstatut: brouillon\nstatus: Terminée\n---\n# Connexion\n\n${GHERKIN}`);
  await put(root, 'backlog/tasks/us-002 - Export.md', `---\ntype: story\nid: US-002\ntitle: Export\nstatut: brouillon\nstatus: Terminée\nrevue_par: Jane Doe\nrevue_le: 2026-10-21\n---\n# Export\n\n${GHERKIN}`);
  await put(root, 'backlog/tasks/us-003 - Profil.md', `---\ntype: story\nid: US-003\ntitle: Profil\nstatut: brouillon\nstatus: Terminée\n---\n# Profil\n\n${GHERKIN}`);
  commitMsg(root, 'chore: backlog');
  await put(root, 'src/a.ts', 'export const a = 1;\n');
  commitMsg(root, `feat(US-001): connexion\n\n${CLAUDE}\nClaude-Session: https://example.invalid/s\n`);
  await put(root, 'src/b.ts', 'export const b = 1;\n');
  commitMsg(root, `feat(US-002): export\n\n${CLAUDE}\n`);
  await put(root, 'src/c.ts', 'export const c = 1;\n');
  commitMsg(root, 'feat(US-003): profil écrit à la main');
  return root;
}

describe('orbith provenance', () => {
  it('liste par US, signale l’absence de contrôle humain et alimente check et audit', async () => {
    const root = await projet();
    const r = await runProvenance({ cwd: root, format: 'json' });
    expect(r.commitsIa).toBe(2);
    expect(r.lignes.map((l) => l.cle)).toEqual(['US-001', 'US-002']);
    const us1 = r.lignes[0]!;
    expect(us1.modeles).toEqual(['Claude Opus 5.5']);
    expect(us1.revueHumaine).toEqual([]);
    expect(r.lignes[1]!.revueHumaine).toEqual(['Jane Doe (2026-10-21)']);
    expect(renderProvenance(r)).toContain('⚠️');

    let res = await runAll(await buildContext(root));
    const prov = res.filter((x) => x.categorie === 'provenance');
    expect(prov).toHaveLength(1);
    expect(prov[0]!.message).toContain('US-001');

    const html = renderHtml(await collectAudit(root));
    expect(html).toContain('id="h-provenance">Provenance IA</h2>');
    expect(html).toContain('Claude Opus 5.5');

    // Une validation humaine tracée de la US lève l'avertissement.
    await runValider('backlog/tasks/us-001 - Connexion.md', { cwd: root, yes: true });
    res = await runAll(await buildContext(root));
    expect(res.filter((x) => x.categorie === 'provenance')).toHaveLength(0);
    const r2 = await runProvenance({ cwd: root });
    expect(r2.lignes[0]!.validation?.par).toBe('Jane Doe');
  });

  it('registre chaîné en ajout seul, conservé après réécriture de l’historique, chaîne rompue détectée', async () => {
    const root = await projet();
    await runProvenance({ cwd: root, enregistrer: true });
    const reg = await loadProvenance(root);
    expect(reg).toHaveLength(2);
    expect(await etatChaineProvenance(root)).toEqual({ etat: 'ok' });
    await runProvenance({ cwd: root, enregistrer: true });
    expect(await loadProvenance(root)).toHaveLength(2);

    // Historique réécrit (commits IA écrasés) : le registre garde la trace.
    execFileSync('git', ['reset', '-q', '--soft', 'HEAD~3'], { cwd: root });
    commitMsg(root, 'feat: tout en un');
    const r = await runProvenance({ cwd: root, format: 'json' });
    expect(r.commitsIa).toBe(2);

    const file = path.join(root, '.orbith/provenance.json');
    const json = JSON.parse(await readFile(file, 'utf8')) as { commits: { modele?: string }[] };
    json.commits[0]!.modele = 'autre';
    await writeFile(file, JSON.stringify(json));
    await expect(runProvenance({ cwd: root, enregistrer: true })).rejects.toThrow(/chaîne rompue/);
    const res = await runAll(await buildContext(root));
    expect(res.some((x) => x.categorie === 'provenance' && x.niveau === 'erreur')).toBe(true);
  });

  it('projet sans IA ni dépôt : rien à signaler', async () => {
    const root = await makeProject('evolution', false);
    roots.push(root);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const r = await runProvenance({ cwd: root });
    expect(r).toEqual({ commitsIa: 0, sansLien: 0, lignes: [] });
    await expect(runProvenance({ cwd: root, format: 'xml' })).rejects.toThrow(/texte ou json/);
    expect((await runAll(await buildContext(root))).filter((x) => x.categorie === 'provenance')).toHaveLength(0);
  });
});
