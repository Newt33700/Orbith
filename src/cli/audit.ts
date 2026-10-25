import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import { OrbithError, requireProjectRoot, ui } from '../core/index.js';
import { collectAudit, renderHtml, type AuditData } from '../audit/index.js';

export interface AuditOptions {
  cwd?: string;
  sortie?: string;
  format?: string;
  now?: Date;
}

export interface AuditResult {
  data: AuditData;
  sortie: string | null;
}

export async function runAudit(opts: AuditOptions = {}): Promise<AuditResult> {
  const format = opts.format ?? 'html';
  if (format !== 'html' && format !== 'json') {
    throw new OrbithError(`Format inconnu : « ${format} » (attendu : html ou json).`);
  }
  const cwd = path.resolve(opts.cwd ?? process.cwd());
  const root = await requireProjectRoot(cwd);
  const data = await collectAudit(root, opts.now);
  const content = format === 'json' ? JSON.stringify(data, null, 2) + '\n' : renderHtml(data);

  let sortie: string | null = null;
  if (format === 'html' || opts.sortie) {
    sortie = opts.sortie
      ? path.resolve(cwd, opts.sortie)
      : path.join(root, 'docs', 'livraisons', `audit-${data.entete.date}.html`);
    await fs.mkdir(path.dirname(sortie), { recursive: true });
    await fs.writeFile(sortie, content, 'utf8');
  } else {
    process.stdout.write(content);
  }

  const s = data.synthese;
  const problemes = data.validations.filter((v) => v.probleme).length;
  const log = format === 'json' && !sortie ? console.error : console.log;
  log(
    `\n${pc.bold('Audit')} : ${s.artefacts} artefact(s), ${s.pourcentValides} % validés, ${problemes} problème(s) de validation, ${s.erreurs} erreur(s) et ${s.avertissements} avertissement(s) de contrôle.`,
  );
  if (sortie) ui.ok(`Rapport d'audit écrit dans ${path.relative(cwd, sortie) || sortie}`);
  return { data, sortie };
}

export function register(program: Command): void {
  program
    .command('audit')
    .description("Génère un rapport d'audit (validations, traçabilité, conformité) pour les équipes conformité")
    .option('--sortie <fichier>', 'fichier de sortie (défaut : docs/livraisons/audit-AAAA-MM-JJ.html)')
    .option('--format <format>', 'format de sortie (html|json)', 'html')
    .option('--cwd <dir>', 'dossier de travail')
    .action(async (opts: AuditOptions) => {
      await runAudit(opts);
    });
}
