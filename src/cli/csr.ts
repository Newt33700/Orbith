import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import ExcelJS from 'exceljs';
import { OrbithError, findProjectRoot, loadConfig, requireProjectRoot, syncCsr, masquer, ui } from '../core/index.js';
import { normalize } from '../checks/csr-parser.js';

function cellText(cell: ExcelJS.Cell): string {
  let t = '';
  try {
    t = cell.text ?? '';
  } catch {
    t = String(cell.value ?? '');
  }
  return t.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

export interface ImportResult {
  markdown: string;
  outils: number;
  feuilles: number;
}

export async function convertWorkbook(file: string, sourceLabel: string, date = new Date()): Promise<ImportResult> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(file);
  } catch (e) {
    throw new OrbithError(`Impossible de lire le classeur Excel « ${file} » : ${e instanceof Error ? e.message : String(e)}`);
  }
  const iso = date.toISOString().slice(0, 10);
  const parts: string[] = ['# Cadre de Référence (CSR)', '', `> Source : ${sourceLabel} — Mis à jour le ${iso}`, ''];
  let outils = 0;
  let feuilles = 0;
  for (const ws of wb.worksheets) {
    let headerRow = 0;
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (headerRow) return;
      for (let c = 1; c <= row.cellCount; c++) {
        if (normalize(cellText(row.getCell(c))).startsWith('outil')) {
          headerRow = n;
          return;
        }
      }
    });
    if (!headerRow) {
      ui.avert(`Feuille « ${ws.name} » ignorée : aucune colonne « Outil » trouvée.`);
      continue;
    }
    const head = ws.getRow(headerRow);
    const width = head.cellCount;
    const headers: string[] = [];
    for (let c = 1; c <= width; c++) headers.push(cellText(head.getCell(c)));
    const outilCol = headers.findIndex((h) => normalize(h).startsWith('outil'));
    const rows: string[][] = [];
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const cells: string[] = [];
      for (let c = 1; c <= width; c++) cells.push(cellText(row.getCell(c)));
      if (cells.every((x) => x === '')) continue;
      rows.push(cells);
      if (cells[outilCol]) outils++;
    }
    feuilles++;
    parts.push(`## ${ws.name}`, '');
    parts.push(`| ${headers.map((h, i) => h || `Colonne ${i + 1}`).join(' | ')} |`);
    parts.push(`|${headers.map(() => '---').join('|')}|`);
    for (const r of rows) parts.push(`| ${r.join(' | ')} |`);
    parts.push('');
  }
  return { markdown: parts.join('\n'), outils, feuilles };
}

export function register(program: Command): void {
  const csr = program.command('csr').description('Cadre de Référence (CSR)');
  csr
    .command('import <fichier>')
    .description('Importe un classeur Excel en CSR.md')
    .option('--sortie <fichier>', 'fichier de sortie', '.orbith/csr/CSR.md')
    .option('--cwd <dir>', 'dossier de travail')
    .action(async (fichier: string, opts: { sortie: string; cwd?: string }) => {
      const cwd = path.resolve(opts.cwd ?? process.cwd());
      const root = (await findProjectRoot(cwd)) ?? cwd;
      const src = path.resolve(cwd, fichier);
      try {
        await fs.access(src);
      } catch {
        throw new OrbithError(`Fichier introuvable : ${fichier}`);
      }
      const { markdown, outils, feuilles } = await convertWorkbook(src, path.basename(src));
      if (feuilles === 0) throw new OrbithError('Aucune feuille exploitable : une colonne « Outil » est requise.');
      const out = path.resolve(root, opts.sortie);
      await fs.mkdir(path.dirname(out), { recursive: true });
      await fs.writeFile(out, markdown, 'utf8');
      ui.ok(`${outils} outil(s) importé(s) depuis ${feuilles} feuille(s) vers ${path.relative(root, out) || out}`);
    });
  csr
    .command('sync')
    .description('Met à jour le CSR local depuis csr.source (dépôt Git privé, URL https ou fichier)')
    .option('--cwd <dir>', 'dossier de travail')
    .action(async (opts: { cwd?: string }) => {
      const root = await requireProjectRoot(path.resolve(opts.cwd ?? process.cwd()));
      const cfg = await loadConfig(root);
      const r = await syncCsr(root, cfg);
      ui.ok(
        r.change
          ? `CSR mis à jour depuis ${masquer(r.source)} (${r.outils} outils)`
          : `CSR déjà à jour depuis ${masquer(r.source)} (${r.outils} outils)`,
      );
    });
}
