import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runValider } from '../../src/cli/valider.js';
import { runAudit } from '../../src/cli/audit.js';
import { escapeHtml } from '../../src/audit/render.js';
import { GHERKIN, commit, makeProject, put } from '../cli/helpers.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const r of roots.splice(0)) await rm(r, { recursive: true, force: true });
});

const NOW = new Date(2026, 9, 25, 12, 0, 0);

async function fixture(): Promise<string> {
  const root = await makeProject('evolution', true);
  roots.push(root);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  await put(root, 'backlog/tasks/US-001 - Connexion.md', `---\ntype: story\nid: US-001\ntitle: Connexion\nstatut: brouillon\nstatus: Terminée\n---\n# Connexion\n\n${GHERKIN}`);
  await put(root, 'backlog/tasks/US-002 - Piège.md', `---\ntype: story\nid: US-002\ntitle: "<script>alert(1)</script>"\nstatut: brouillon\nstatus: À faire\n---\n# x\n`);
  await put(root, 'tests/login.feature', '@US-001\nFonctionnalité: login\n');
  await runValider('backlog/tasks/US-001 - Connexion.md', { cwd: root, yes: true });
  commit(root, 'feat(US-001): ajoute le login');
  return root;
}

describe('escapeHtml', () => {
  it('échappe les caractères spéciaux', () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(12)).toBe('12');
  });
});

describe('orbith audit', () => {
  it('écrit le HTML au chemin par défaut avec toutes les sections', async () => {
    const root = await fixture();
    const { sortie } = await runAudit({ cwd: root, now: NOW });
    expect(sortie).toBe(path.join(root, 'docs/livraisons/audit-2026-10-25.html'));
    const html = await readFile(sortie!, 'utf8');
    expect(html).toContain('<html lang="fr">');
    for (const t of ['Synthèse', 'Validations humaines', 'Matrice de traçabilité', 'Conformité CSR et contrôles']) {
      expect(html).toContain(t);
    }
    expect(html).toContain('US-001');
    expect(html).toContain('feat(US-001): ajoute le login');
    expect(html).toContain('tests/login.feature');
    expect(html).toContain("l'IA propose, l'humain décide");
    expect(html).toContain('@media print');
    expect(html).not.toMatch(/<script|https?:\/\//);
  });

  it('échappe les valeurs injectées', async () => {
    const root = await fixture();
    const { sortie } = await runAudit({ cwd: root, sortie: 'out/a.html', now: NOW });
    const html = await readFile(sortie!, 'utf8');
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('format json : forme des données', async () => {
    const root = await fixture();
    const { sortie } = await runAudit({ cwd: root, format: 'json', sortie: 'a.json', now: NOW });
    const j = JSON.parse(await readFile(sortie!, 'utf8'));
    expect(j.entete.projet).toBe('demo');
    expect(j.entete.date).toBe('2026-10-25');
    expect(j.entete.auteur).toContain('Jane Doe');
    expect(j.synthese.artefacts).toBe(2);
    expect(j.synthese.parColonne['Terminée']).toBe(1);
    expect(j.synthese.couvertureTracabilite).toBe(100);
    expect(j.validations.find((v: { id: string }) => v.id === 'US-001').etat).toBe('validé');
    expect(Array.isArray(j.tracabilite)).toBe(true);
    expect(Array.isArray(j.controles)).toBe(true);
  });

  it('signale une validation modifiée et refuse un format inconnu', async () => {
    const root = await fixture();
    await put(root, 'backlog/tasks/US-001 - Connexion.md', `---\ntype: story\nid: US-001\ntitle: Connexion\nstatut: validé\nvalide_par: Jane Doe\nstatus: Terminée\n---\n# Connexion modifié\n`);
    const { data } = await runAudit({ cwd: root, sortie: 'b.html', now: NOW });
    expect(data.validations.find((v) => v.id === 'US-001')?.probleme).toBe(true);
    await expect(runAudit({ cwd: root, format: 'pdf' })).rejects.toThrow(/Format inconnu/);
  });
});
