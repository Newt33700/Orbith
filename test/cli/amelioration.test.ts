import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { run as runCheckAmelioration } from '../../src/checks/amelioration.js';
import { runAll } from '../../src/checks/index.js';
import { runTrace } from '../../src/cli/trace.js';
import { runAudit } from '../../src/cli/audit.js';
import { computeNext } from '../../src/cli/next.js';
import { ameliorationHints } from '../../src/cli/next-amelioration.js';
import {
  avancement,
  defaultConfig,
  enRetard,
  grapheConnaissance,
  liensCasses,
  lireLiens,
  scanArtifacts,
  type Artifact,
} from '../../src/core/index.js';
import { GHERKIN, makeProject, put } from './helpers.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const r of roots.splice(0)) await rm(r, { recursive: true, force: true });
});

const art = (type: Artifact['type'], id: string | undefined, data: Record<string, unknown>, chemin = `x/${id}.md`): Artifact =>
  ({ type, id, chemin, titre: id, etat: 'validé', statut: 'validé', body: '', data }) as Artifact;

const amel = (id: string, fm: string): string =>
  `---\nid: ${id}\ntitle: Action ${id}\ntype: amelioration\nstatut: brouillon\n${fm}\n---\n# Action ${id}\n\n## Constat\n\nx\n`;

async function fixture(): Promise<string> {
  const root = await makeProject('evolution');
  roots.push(root);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  await put(root, 'backlog/tasks/us-001 - Paiement.md', `---\ntype: story\nid: US-001\ntitle: Paiement\nstatut: brouillon\nstatus: Prête\n---\n# Paiement\n\n${GHERKIN}`);
  await put(root, 'backlog/tasks/us-002 - Bug.md', `---\ntype: story\nid: US-002\ntitle: Bug paiement\nstatut: brouillon\nstatus: Terminée\nlabels: [bug]\norigine: production\ncause: US-001\nliens: [INC-001]\n---\n# Bug\n\n${GHERKIN}`);
  await put(root, 'docs/architecture/adr/ADR-001-file.md', '---\ntype: adr\nid: ADR-001\nstatut: brouillon\ntitle: File de messages\n---\n# ADR\n');
  await put(root, 'docs/livraisons/incidents/INC-001-paiement.md', '---\ntype: incident\nid: INC-001\nstatut: brouillon\ntitle: Paiement indisponible\ngravite: 1\ndetecte_le: 2026-10-01 10:00\nretabli_le: 2026-10-01 12:00\nliens: [ADR-001, US-999]\n---\n# INC\n');
  await put(root, 'docs/livraisons/retro-1.0.0.md', '---\ntype: retro\nstatut: brouillon\nversion: 1.0.0\n---\n# Rétro\n');
  await put(root, 'docs/amelioration/AMEL-001-alerte.md', amel('AMEL-001', 'source: incident\nsource_ref: INC-001\nresponsable: Ops\necheance: 2020-01-01\navancement: en cours\nliens: [ADR-001]'));
  await put(root, 'docs/amelioration/AMEL-002-revue.md', amel('AMEL-002', 'source: retro\nsource_ref: retro-1.0.0\nresponsable: SM\necheance: 2999-01-01\navancement: fait'));
  await put(root, 'docs/amelioration/AMEL-003-x.md', amel('AMEL-003', 'source: hasard\navancement: peut-être'));
  return root;
}

describe('amélioration continue : modèle et cœur', () => {
  it('le modèle amelioration.md porte le type, le statut et les champs attendus', async () => {
    const tpl = await readFile(path.join(__dirname, '../../content/templates/amelioration.md'), 'utf8');
    for (const s of ['type: amelioration', 'statut: brouillon', 'source:', 'source_ref:', 'responsable:', 'echeance:', 'avancement: ouvert', 'liens: []', '## Constat', '## Action', '## Indicateur de succès']) {
      expect(tpl).toContain(s);
    }
  });

  it('avancement normalisé, retard selon l’échéance', () => {
    expect(avancement(art('amelioration', 'AMEL-1', {}))).toBe('ouvert');
    expect(avancement(art('amelioration', 'AMEL-1', { avancement: 'En-Cours' }))).toBe('en cours');
    expect(avancement(art('amelioration', 'AMEL-1', { avancement: 'abandonnee' }))).toBe('abandonné');
    expect(avancement(art('amelioration', 'AMEL-1', { avancement: 'bof' }))).toBeUndefined();
    expect(enRetard(art('amelioration', 'AMEL-1', { echeance: '2026-10-01' }), '2026-10-25')).toBe(true);
    expect(enRetard(art('amelioration', 'AMEL-1', { echeance: '2026-10-01', avancement: 'fait' }), '2026-10-25')).toBe(false);
    expect(enRetard(art('amelioration', 'AMEL-1', {}), '2026-10-25')).toBe(false);
  });

  it('liens : liste ou chaîne ; graphe avec cause, change et source_ref ; placeholders ignorés', () => {
    expect(lireLiens({ liens: 'ADR-001, INC-002' })).toEqual(['ADR-001', 'INC-002']);
    expect(lireLiens({})).toEqual([]);
    const arts = [
      art('story', 'US-001', {}),
      art('story', 'US-002', { labels: ['bug'], cause: 'US-001' }),
      art('incident', 'INC-001', { change: 'CHG-XXX', liens: ['US-002', 'ADR-404'] }),
      art('amelioration', 'AMEL-001', { source_ref: 'INC-001' }),
    ];
    const g = grapheConnaissance(arts);
    expect(g.find((n) => n.cle === 'US-001')?.entrants.map((l) => [l.source, l.champ])).toEqual([['US-002', 'cause']]);
    expect(g.find((n) => n.cle === 'INC-001')?.sortants.map((l) => [l.cible, l.existe])).toEqual([
      ['US-002', true],
      ['ADR-404', false],
    ]);
    expect(liensCasses(arts).map((c) => c.cible)).toEqual(['ADR-404']);
  });
});

describe('amélioration continue dans les commandes', () => {
  it('scan, check : retard, champs à compléter, valeurs inconnues, liens introuvables (avertissements)', async () => {
    const root = await fixture();
    const arts = await scanArtifacts(root);
    expect(arts.filter((a) => a.type === 'amelioration').map((a) => a.id)).toEqual(['AMEL-001', 'AMEL-002', 'AMEL-003']);
    const res = await runCheckAmelioration({ root, config: null }, '2026-10-25');
    const msgs = res.map((r) => `${r.categorie}:${r.niveau}:${r.message}`);
    expect(msgs.some((m) => m.startsWith('amelioration:avertissement:AMEL-001 est en retard'))).toBe(true);
    expect(msgs.some((m) => m.includes('AMEL-002'))).toBe(false);
    expect(msgs.some((m) => m.includes('AMEL-003 : avancement inconnu'))).toBe(true);
    expect(msgs.some((m) => m.includes('AMEL-003 : source inconnue'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('tracabilite:avertissement:INC-001 : lien vers « US-999 »'))).toBe(true);
    expect(res.every((r) => r.niveau === 'avertissement')).toBe(true);
    const tous = await runAll({ root, config: null });
    expect(tous.some((r) => r.categorie === 'amelioration')).toBe(true);
  });

  it('trace : actions et liens de connaissance ; détail d’un incident par son identifiant', async () => {
    const root = await fixture();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const out = await runTrace(undefined, { cwd: root });
    expect(out).toContain("## Actions d'amélioration");
    expect(out).toMatch(/\| AMEL-001 \| Action AMEL-001 \| incident INC-001 \| Ops \| 2020-01-01 \(en retard\) \| en cours \|/);
    expect(out).toContain('## Liens de connaissance');
    expect(out).toMatch(/\| INC-001 \| incident \| Paiement indisponible \| ADR-001, US-999 \(introuvable\) \| US-002, AMEL-001 \[source\] \|/);
    expect(out).toMatch(/\| US-001 \| story \| Paiement \| — \| US-002 \[cause\] \|/);
    const detail = await runTrace('inc-001', { cwd: root });
    expect(detail).toContain('# INC-001 — Paiement indisponible');
    expect(detail).toContain('- AMEL-001 [source]');
    await expect(runTrace('US-404', { cwd: root })).rejects.toThrow(/introuvable/);
  });

  it('trace sans action ni lien : aucune nouvelle section (rétrocompatible)', async () => {
    const root = await makeProject('evolution');
    roots.push(root);
    await put(root, 'backlog/tasks/us-001.md', `---\ntype: story\nid: US-001\ntitle: A\nstatut: brouillon\nstatus: À faire\n---\n# A\n`);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const out = await runTrace(undefined, { cwd: root });
    expect(out).not.toContain('Liens de connaissance');
    expect(out).not.toContain("Actions d'amélioration");
  });

  it('audit : section amélioration continue et liens', async () => {
    const root = await fixture();
    const { sortie, data } = await runAudit({ cwd: root, now: new Date(2026, 9, 25, 12) });
    const html = await readFile(sortie!, 'utf8');
    expect(data.connaissance?.ameliorations.find((a) => a.id === 'AMEL-001')?.enRetard).toBe(true);
    expect(html).toContain('Amélioration continue et liens de connaissance');
    expect(html).toContain('introuvable');
  });

  it('next : action en retard, incident ou rétrospective sans action', () => {
    const base = [{ ...art('story', 'US-001', { status: 'Prête' }), body: GHERKIN }];
    const avec = [
      ...base,
      art('incident', 'INC-001', { retabli_le: '2026-10-01 12:00' }),
      art('incident', 'INC-002', { retabli_le: '2026-10-02 12:00' }),
      art('retro', undefined, { version: '1.0.0' }, 'docs/livraisons/retro-1.0.0.md'),
      art('amelioration', 'AMEL-001', { source_ref: 'INC-001', echeance: '2020-01-01' }),
    ];
    const hints = ameliorationHints(avec, '2026-10-25');
    expect(hints.map((h) => h.message)).toEqual([
      expect.stringMatching(/^AMEL-001 est en retard/),
      expect.stringMatching(/^INC-002 n'a engendré aucune action/),
      expect.stringMatching(/^La rétrospective docs\/livraisons\/retro-1.0.0.md/),
    ]);
    expect(hints[2]?.claude).toBe('/orbith-retro');
    expect(hints[1]?.claude).toBe('/orbith-devops');
    // Rétrospective reliée par `liens` côté rétro : plus de suggestion.
    const relie = [art('retro', undefined, { liens: ['AMEL-001'] }, 'docs/livraisons/retro-1.0.0.md'), art('amelioration', 'AMEL-001', {})];
    expect(ameliorationHints(relie, '2026-10-25')).toEqual([]);
    // Priorité basse : l'action principale reste celle des US.
    expect(computeNext(avec, defaultConfig('x')).principal.claude).toBe('/orbith-dev US-001');
    expect(ameliorationHints(base)).toEqual([]);
  });
});
