import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { OrbithError, gitLogDated, isGitRepo, loadConfig, requireProjectRoot, scanArtifacts, ui } from '../core/index.js';
import { loadDeploiements } from './deploiement.js';
import { calculerMetriques, type Metriques, type Niveau } from './metriques-calc.js';
import { mentions } from './trace-report.js';

export interface MetriquesOptions {
  cwd?: string;
  jours?: string;
  format?: string;
  sortie?: string;
  /** Pour les tests : date de fin de période (AAAA-MM-JJ). */
  aujourdhui?: string;
}

/** Nombre à la française : virgule décimale. */
const fr = (n: number): string => String(n).replace('.', ',');
const val = (n: number | null, unite: string): string => (n == null ? 'pas encore de données' : `${fr(n)} ${unite}`);
const niv = (n: Niveau | null): string => (n ? ` (niveau DORA : ${n})` : '');
const d = (s?: string): string => s ?? '—';

export function renderMetriques(m: Metriques, projet: string): string {
  const L: string[] = [];
  L.push(`# Indicateurs DORA : ${projet}`, '');
  L.push(`Période : du ${m.periode.debut} au ${m.periode.fin} (${m.periode.jours} jours).`, '');
  L.push('| Indicateur | Valeur |', '|---|---|');
  L.push(`| Fréquence de déploiement | ${m.frequence.deploiements} mise(s) en production, ${fr(m.frequence.parSemaine)} par semaine${niv(m.frequence.niveau)} |`);
  L.push(`| Délai de mise en production (médiane) | ${val(m.leadTime.medianeJours, 'jour(s)')}${m.leadTime.us ? ` sur ${m.leadTime.us} US` : ''}${niv(m.leadTime.niveau)} |`);
  L.push(`| Taux d'échec des changements | ${m.tauxEchec.pourcentage == null ? 'pas encore de données' : `${fr(m.tauxEchec.pourcentage)} % (${m.tauxEchec.deploiementsEnEchec} déploiement(s) suivi(s) d'un bug de production)`}${niv(m.tauxEchec.niveau)} |`);
  L.push(`| Temps de rétablissement (médiane) | ${val(m.retablissement.medianeHeures, 'heure(s)')}${m.retablissement.incidents ? ` sur ${m.retablissement.incidents} incident(s)` : ''}${niv(m.retablissement.niveau)} |`);
  L.push('');
  L.push(`## Coûts IA (estimations des agents)`, '');
  L.push(`Total : ${fr(m.couts.total)} ${m.devise} sur ${m.couts.estimations} estimation(s). Ce sont des ordres de grandeur, pas une facture.`);
  const agents = Object.entries(m.couts.parAgent).sort((a, b) => b[1] - a[1]);
  if (agents.length) L.push('', ...agents.map(([a, c]) => `- ${a} : ${fr(c)} ${m.devise}`));
  L.push('', '## User stories', '');
  L.push('| US | Type | Colonne | Créée | Modifiée | Début dev | Mise en prod | Délai (j) | Coût IA |', '|---|---|---|---|---|---|---|---|---|');
  for (const u of m.us) {
    L.push(
      `| ${u.id} | ${u.bug ? 'bug' : 'US'} | ${u.colonne} | ${d(u.creee)} | ${d(u.modifiee)} | ${d(u.debutDev)} | ${d(u.misEnProd)} | ${u.leadTimeJours != null ? fr(u.leadTimeJours) : '—'} | ${u.coutIa ? `${fr(u.coutIa)} ${m.devise}` : '—'} |`,
    );
  }
  L.push('');
  return L.join('\n');
}

export async function runMetriques(opts: MetriquesOptions = {}): Promise<Metriques> {
  const cwd = path.resolve(opts.cwd ?? process.cwd());
  const root = await requireProjectRoot(cwd);
  const jours = opts.jours != null ? Number(opts.jours) : 90;
  if (!Number.isInteger(jours) || jours < 1) throw new OrbithError(`Période invalide : ${opts.jours} (un nombre de jours, par exemple 90).`);
  const format = opts.format ?? 'texte';
  if (!['texte', 'json'].includes(format)) throw new OrbithError(`Format inconnu : ${format} (texte ou json).`);

  const config = await loadConfig(root);
  const arts = await scanArtifacts(root);
  const ids = arts.filter((a) => a.type === 'story' && a.id).map((a) => a.id!);
  const premiers = new Map<string, string>();
  if (await isGitRepo(root)) {
    const commits = await gitLogDated(root);
    for (const id of ids) {
      const c = commits.find((x) => mentions(x.subject, id));
      if (c) premiers.set(id, c.date);
    }
  }
  const m = calculerMetriques(arts, await loadDeploiements(root), premiers, {
    jours,
    devise: config.finops.devise,
    ...(opts.aujourdhui ? { aujourdhui: opts.aujourdhui } : {}),
  });
  const out = format === 'json' ? JSON.stringify(m, null, 2) + '\n' : renderMetriques(m, config.projet.nom);
  if (opts.sortie) {
    const file = path.resolve(cwd, opts.sortie);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, out, 'utf8');
    ui.ok(`Indicateurs écrits dans ${opts.sortie}`);
  } else {
    process.stdout.write(out);
  }
  return m;
}

export function register(program: Command): void {
  program
    .command('metriques')
    .description('Indicateurs DORA / Accelerate et coûts IA estimés')
    .option('--jours <n>', 'période analysée, en jours', '90')
    .option('--format <format>', 'texte ou json', 'texte')
    .option('--sortie <fichier>', 'écrit le résultat dans un fichier')
    .option('--cwd <dir>', 'dossier de travail')
    .action(async (opts: MetriquesOptions) => {
      await runMetriques(opts);
    });
}
