import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';
import ExcelJS from 'exceljs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { register } from '../../src/cli/csr.js';
import { parseCsr } from '../../src/checks/csr-parser.js';

let dir: string;
let out: string[];
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'orbith-csr-'));
  out = [];
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void out.push(a.join(' ')));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

describe('orbith csr import', () => {
  it('aller-retour xlsx -> CSR.md -> parseCsr', async () => {
    const wb = new ExcelJS.Workbook();
    const s1 = wb.addWorksheet('Langages');
    s1.addRow(['Référentiel Entreprise']);
    s1.addRow(['Équipe', 'Outil', 'Version min', 'Statut', 'Commentaire']);
    s1.addRow(['Core', 'Java', 21, 'Autorisé', '']);
    s1.addRow(['Core', 'Node.js', '22', 'autorisé', 'LTS | seulement']);
    const s2 = wb.addWorksheet('Frameworks');
    s2.addRow(['outil', 'version minimale', 'statut', 'commentaire']);
    s2.addRow(['AngularJS', '', 'Interdit', 'fin de vie']);
    s2.addRow(['moment', '', 'Déprécié', 'utiliser date-fns']);
    s2.addRow([]);
    const xlsx = path.join(dir, 'csr.xlsx');
    await wb.xlsx.writeFile(xlsx);

    const p = new Command();
    register(p);
    await p.parseAsync(['node', 'orbith', 'csr', 'import', xlsx, '--cwd', dir, '--sortie', 'sortie/CSR.md']);

    expect(out.join('\n')).toContain('4 outil(s) importé(s)');
    const md = await readFile(path.join(dir, 'sortie/CSR.md'), 'utf8');
    expect(md).toContain('# Cadre de Référence (CSR)');
    expect(md).toMatch(/> Source : csr\.xlsx — Mis à jour le \d{4}-\d{2}-\d{2}/);
    expect(md).toContain('## Langages');
    expect(md).toContain('## Frameworks');
    const e = parseCsr(md);
    expect(e).toHaveLength(4);
    expect(e[0]).toMatchObject({ categorie: 'Langages', outil: 'Java', versionMin: '21', statut: 'autorisé', extra: { 'Équipe': 'Core' } });
    expect(e[1]!.commentaire).toBe('LTS | seulement');
    expect(e[2]).toMatchObject({ categorie: 'Frameworks', outil: 'AngularJS', statut: 'interdit' });
    expect(e[3]!.statut).toBe('déprécié');
  });

  it('sans --sortie : écrit dans csr.fichier de la config', async () => {
    await mkdir(path.join(dir, '.orbith'));
    await writeFile(path.join(dir, '.orbith', 'config.yaml'), 'version: 1\norbith_version: 0.1.0\nprojet:\n  nom: demo\ncsr:\n  fichier: docs/CSR.md\n');
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Langages').addRow(['Outil', 'Statut']);
    wb.getWorksheet('Langages')!.addRow(['Java', 'Autorisé']);
    const xlsx = path.join(dir, 'csr.xlsx');
    await wb.xlsx.writeFile(xlsx);

    const p = new Command();
    register(p);
    await p.parseAsync(['node', 'orbith', 'csr', 'import', xlsx, '--cwd', dir]);

    const md = await readFile(path.join(dir, 'docs', 'CSR.md'), 'utf8');
    expect(parseCsr(md)).toHaveLength(1);
  });

  it('fichier introuvable : erreur claire', async () => {
    const p = new Command();
    register(p);
    await expect(p.parseAsync(['node', 'orbith', 'csr', 'import', 'nope.xlsx', '--cwd', dir])).rejects.toThrow(/introuvable/);
  });
});
