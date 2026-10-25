import { rm } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculerReprise, calculerSla, instant } from '../../src/cli/fiabilite-calc.js';
import { calculerMetriques } from '../../src/cli/metriques-calc.js';
import { renderMetriques, renderMetriquesCsv, runMetriques } from '../../src/cli/metriques.js';
import type { Deploiement } from '../../src/cli/deploiement.js';
import { lireGravite, lireSla, loadConfig, type Artifact } from '../../src/core/index.js';
import { makeProject, put } from './helpers.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const r of roots.splice(0)) await rm(r, { recursive: true, force: true });
});

const art = (type: Artifact['type'], id: string, data: Record<string, unknown>): Artifact =>
  ({ type, id, chemin: `x/${id}.md`, titre: id, etat: 'validé', body: '', data }) as Artifact;
const incident = (id: string, data: Record<string, unknown>): Artifact => art('incident', id, data);
const bugProd = (id: string, data: Record<string, unknown>): Artifact =>
  art('story', id, { labels: ['bug'], origine: 'production', ...data });
const dep = (version: string, env: string, date: string, us: string[]): Deploiement => ({ version, env, date, par: 'x', email: 'x', us });

// Période de 30 jours : du 2026-09-25 au 2026-10-25.
const DEBUT = '2026-09-25';
const FIN = '2026-10-25';

describe('configuration sla', () => {
  it('lit les clés, les gravités en chiffres ou en mots ; refuse le reste', () => {
    expect(lireSla(undefined)).toBeUndefined();
    expect(lireSla({ disponibilite_pct: 99.5, retablissement_heures: { 1: 4, majeure: 24 }, correction_bug_prod_jours: 5 })).toEqual({
      disponibilite_pct: 99.5,
      retablissement_heures: { 1: 4, 2: 24 },
      correction_bug_prod_jours: 5,
    });
    expect(() => lireSla({ inconnue: 1 })).toThrow(/clé `sla` inconnue/);
    expect(() => lireSla({ disponibilite_pct: 'beaucoup' })).toThrow(/nombre positif/);
    expect(() => lireSla({ disponibilite_pct: 120 })).toThrow(/entre 0 et 100/);
    expect(() => lireSla({ retablissement_heures: { 7: 1 } })).toThrow(/gravité inconnue/);
  });

  it('gravité : 1, "2 majeure", critique, mineure ; inconnue sinon', () => {
    expect([lireGravite(1), lireGravite('2 majeure'), lireGravite('Critique'), lireGravite('mineure'), lireGravite('<1 critique | 2>'), lireGravite('x')]).toEqual([
      1, 2, 1, 3, undefined, undefined,
    ]);
  });

  it('loadConfig : section sla facultative, rétrocompatible', async () => {
    const root = await makeProject();
    roots.push(root);
    expect((await loadConfig(root)).sla).toBeUndefined();
    await put(root, '.orbith/config.yaml', 'version: 1\nprojet: { nom: demo }\nsla:\n  disponibilite_pct: 99\n  retablissement_heures: { 1: 4 }\n');
    expect((await loadConfig(root)).sla).toEqual({ disponibilite_pct: 99, retablissement_heures: { 1: 4 } });
    await put(root, '.orbith/config.yaml', 'version: 1\nprojet: { nom: demo }\nsla:\n  dispo: 99\n');
    await expect(loadConfig(root)).rejects.toThrow(/dispo/);
  });
});

describe('calculerSla', () => {
  it('instant : date seule, date et heure, placeholder', () => {
    expect(instant('2026-10-01')).toBe(Date.parse('2026-10-01T00:00:00Z'));
    expect(instant('2026-10-01 14:30')).toBe(Date.parse('2026-10-01T14:30:00Z'));
    expect(instant('<AAAA-MM-JJ HH:MM>')).toBeUndefined();
  });

  it('disponibilité estimée à partir des incidents, intervalles fusionnés', () => {
    const arts = [
      incident('INC-001', { gravite: 1, detecte_le: '2026-10-01 10:00', retabli_le: '2026-10-01 16:00' }),
      incident('INC-002', { gravite: 2, detecte_le: '2026-10-01 15:00', retabli_le: '2026-10-01 18:00' }),
    ];
    const r = calculerSla(arts, { disponibilite_pct: 99.5 }, DEBUT, FIN);
    // 8 h d'indisponibilité sur 31 jours (bornes incluses).
    expect(r.objectifs[0]).toMatchObject({ cle: 'disponibilite', valeur: 98.92, atteint: false, remarque: null });
    expect(calculerSla(arts, { disponibilite_pct: 98 }, DEBUT, FIN).objectifs[0]!.atteint).toBe(true);
  });

  it("disponibilité non mesurable si un incident n'a pas de date de rétablissement ; 100 % signalé sans incident", () => {
    const ouvert = [incident('INC-003', { gravite: 1, detecte_le: '2026-10-20 08:00' })];
    expect(calculerSla(ouvert, { disponibilite_pct: 99 }, DEBUT, FIN).objectifs[0]).toMatchObject({
      valeur: null,
      atteint: null,
      remarque: expect.stringContaining('INC-003'),
    });
    expect(calculerSla([], { disponibilite_pct: 99 }, DEBUT, FIN).objectifs[0]).toMatchObject({
      valeur: 100,
      atteint: true,
      remarque: 'aucun incident déclaré : à vérifier',
    });
  });

  it('rétablissement par gravité : atteint, non atteint, non mesurable', () => {
    const arts = [
      incident('INC-001', { gravite: '1 critique', detecte_le: '2026-10-01 10:00', retabli_le: '2026-10-01 12:00' }),
      incident('INC-002', { gravite: 2, detecte_le: '2026-10-02 10:00', retabli_le: '2026-10-04 10:00' }),
      incident('INC-004', { gravite: 'inconnue', detecte_le: '2026-10-02 10:00', retabli_le: '2026-10-02 11:00' }),
    ];
    const r = calculerSla(arts, { retablissement_heures: { 1: 4, 2: 24, 3: 72 } }, DEBUT, FIN);
    expect(r.objectifs.map((o) => [o.gravite, o.atteint, o.valeur, o.mesures, o.respectes])).toEqual([
      [1, true, 2, 1, 1],
      [2, false, 48, 1, 0],
      [3, null, null, 0, 0],
    ]);
    expect(r.objectifs[2]!.remarque).toMatch(/aucun incident de gravité 3/);
    expect(r.bilan).toEqual({ atteints: 1, nonAtteints: 1, nonMesurables: 1 });
    expect(r.avertissements.join()).toContain('INC-004');
  });

  it('incident encore ouvert : non mesurable, ou non atteint si déjà hors délai', () => {
    const recent = [incident('INC-010', { gravite: 1, detecte_le: '2026-10-25 22:00' })];
    expect(calculerSla(recent, { retablissement_heures: { 1: 4 } }, DEBUT, FIN).objectifs[0]!.atteint).toBeNull();
    const ancien = [incident('INC-011', { gravite: 1, detecte_le: '2026-10-20 08:00' })];
    const o = calculerSla(ancien, { retablissement_heures: { 1: 4 } }, DEBUT, FIN).objectifs[0]!;
    expect(o.atteint).toBe(false);
    expect(o.remarque).toMatch(/INC-011/);
  });

  it('correction des bugs de production, en jours', () => {
    const arts = [
      bugProd('US-010', { detecte_le: '2026-10-01', mis_en_prod_le: '2026-10-03' }),
      bugProd('US-011', { detecte_le: '2026-10-05', mis_en_prod_le: '2026-10-15' }),
      art('story', 'US-012', { labels: ['bug'], origine: 'recette', detecte_le: '2026-10-01', mis_en_prod_le: '2026-10-30' }),
    ];
    const o = calculerSla(arts, { correction_bug_prod_jours: 5 }, DEBUT, FIN).objectifs[0]!;
    expect(o).toMatchObject({ cle: 'correction_bug_prod', valeur: 10, mesures: 2, respectes: 1, atteint: false });
    expect(calculerSla([], { correction_bug_prod_jours: 5 }, DEBUT, FIN).objectifs[0]!.atteint).toBeNull();
  });
});

describe('taux de reprise des déploiements (DORA 2024)', () => {
  it('part des mises en production qui livrent un correctif de bug de production ; pas de niveau', () => {
    const arts = [art('story', 'US-001', {}), bugProd('US-002', { detecte_le: '2026-10-01' })];
    const deps = [
      dep('1.0.0', 'production', '2026-10-01', ['US-001']),
      dep('1.0.1', 'production', '2026-10-03', ['US-002']),
      dep('1.0.1', 'recette', '2026-10-02', ['US-002']),
    ];
    expect(calculerReprise(arts, deps, DEBUT, FIN)).toEqual({ deploiements: 2, deploiementsDeReprise: 1, pourcentage: 50, avertissement: null });
    expect(calculerReprise(arts, [], DEBUT, FIN).pourcentage).toBeNull();
    expect(calculerReprise([art('story', 'US-001', {})], deps.slice(0, 1), DEBUT, FIN).avertissement).toMatch(/aucun bug/);
  });

  it('intégré à calculerMetriques, au texte et au CSV ; sla absent par défaut', () => {
    const arts = [art('story', 'US-001', {}), incident('INC-001', { gravite: 1, detecte_le: '2026-10-01 10:00', retabli_le: '2026-10-01 11:00' })];
    const deps = [dep('1.0.0', 'production', '2026-10-01', ['US-001'])];
    const base = { jours: 30, aujourdhui: FIN, devise: 'EUR' };
    const sans = calculerMetriques(arts, deps, new Map(), base);
    expect(sans.reprise.pourcentage).toBe(0);
    expect(sans.sla).toBeUndefined();
    expect(renderMetriques(sans, 'demo')).not.toContain('Fiabilité et objectifs de service');
    const m = calculerMetriques(arts, deps, new Map(), { ...base, sla: { retablissement_heures: { 1: 4 }, disponibilite_pct: 99.99 } });
    const txt = renderMetriques(m, 'demo');
    expect(txt).toContain('## Taux de reprise des déploiements');
    expect(txt).toContain("| Rétablissement d'un incident de gravité 1 (critique) | au plus 4 heure(s) | 1/1 dans le délai, pire cas 1 heure(s) | atteint |");
    expect(txt).toMatch(/Disponibilité .* \| non atteint \|/);
    const csv = renderMetriquesCsv(m);
    expect(csv).toContain('dora;Taux de reprise des déploiements;0;%;0;non mesurable');
    expect(csv).toContain("sla;Rétablissement d'un incident de gravité 1 (critique);1;heure(s) (pire cas);1;;;;4;oui");
  });

  it("auto-évaluation de la fiabilité reprise d'une rétrospective, telle quelle", async () => {
    const root = await makeProject();
    roots.push(root);
    await put(root, '.orbith/config.yaml', 'version: 1\nprojet: { nom: demo }\nsla:\n  correction_bug_prod_jours: 5\n');
    await put(root, 'docs/livraisons/retro-1.0.0.md', '---\ntype: retro\nstatut: brouillon\nversion: 1.0.0\nfiabilite_auto_evaluation: "souvent, sauf la nuit"\n---\n# Rétro\n');
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const m = await runMetriques({ cwd: root, aujourdhui: FIN });
    expect(m.fiabilite).toEqual([{ source: 'docs/livraisons/retro-1.0.0.md', version: '1.0.0', valeur: 'souvent, sauf la nuit' }]);
    expect(m.sla?.objectifs[0]?.atteint).toBeNull();
    expect(renderMetriques(m, 'demo')).toContain('- version 1.0.0 : souvent, sauf la nuit');
  });
});
