import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { OrbithError, gitLogDated, isGitRepo, loadConfig, requireProjectRoot, scanArtifacts, ui } from '../core/index.js';
import { dateTerminee, loadDeploiements } from './deploiement.js';
import { calculerMetriques, type CibleMesuree, type Metriques, type Niveau, type Tendance } from './metriques-calc.js';
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
const NM = 'non mesurable';
const nm = (n: number | null, unite: string): string => (n == null ? NM : `${fr(n)} ${unite}`);

/** Rappel affiché dans chaque rapport (texte, JSON, CSV). */
export const RAPPEL_METHODO =
  "DORA mesure une équipe et son processus de livraison, pas des personnes : ne l'utilisez ni pour classer ni pour évaluer des individus.";

function tendanceTexte(t: Tendance): string {
  if (t.ecart == null || t.fleche == null) return NM;
  const signe = t.ecart > 0 ? '+' : '';
  const avis = t.favorable == null ? 'stable' : t.favorable ? 'en amélioration' : 'à surveiller';
  return `${t.fleche} ${signe}${fr(t.ecart)} ${t.unite} (${avis})`;
}

function cibleTexte(c: CibleMesuree): string {
  const cond = `${c.sens === 'min' ? 'au moins' : 'au plus'} ${fr(c.cible)} ${c.unite}`;
  const etat = c.atteinte == null ? NM : c.atteinte ? 'atteinte' : 'non atteinte';
  return `${cond} : ${etat}`;
}

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? '' : typeof v === 'number' ? fr(v) : v;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Export CSV : une ligne par indicateur. Séparateur « ; » et virgule décimale (ouverture directe dans un
 * tableur français) ; une donnée absente est écrite « non mesurable », jamais 0.
 */
export function renderMetriquesCsv(m: Metriques): string {
  const rows: (string | number | null)[][] = [
    ['famille', 'indicateur', 'valeur', 'unite', 'effectif', 'niveau_dora', 'periode_precedente', 'ecart', 'cible', 'cible_atteinte'],
  ];
  const cible = (cle: string): CibleMesuree | undefined => m.cibles?.find((c) => c.cle === cle);
  const tend = (cle: string): Tendance | undefined => m.tendances.find((t) => t.cle === cle);
  const dora = (cle: string, famille: string, nom: string, valeur: number | null, unite: string, effectif: number | null, niveau: Niveau | null): void => {
    const t = tend(cle);
    const c = cible(cle);
    rows.push([
      famille, nom, valeur ?? NM, unite, effectif, niveau ?? NM,
      t?.precedent ?? NM, t?.ecart ?? NM,
      c ? c.cible : '', c ? (c.atteinte == null ? NM : c.atteinte ? 'oui' : 'non') : '',
    ]);
  };
  const vide = ['', '', '', '', ''];
  dora('frequence', 'dora', 'Fréquence de déploiement', m.frequence.deploiements > 0 ? m.frequence.parSemaine : null, 'par semaine', m.frequence.deploiements, m.frequence.niveau);
  dora('delai', 'dora', 'Délai de mise en production (médiane)', m.leadTime.medianeJours, 'jour(s)', m.leadTime.us, m.leadTime.niveau);
  dora('tauxEchec', 'dora', "Taux d'échec des changements", m.tauxEchec.pourcentage, '%', m.tauxEchec.deploiementsEnEchec, m.tauxEchec.niveau);
  dora('retablissement', 'dora', 'Temps de rétablissement (médiane)', m.retablissement.medianeHeures, 'heure(s)', m.retablissement.incidents, m.retablissement.niveau);
  const att = (famille: string, nom: string, e: { medianeJours: number | null; us: number }): void => {
    rows.push([famille, nom, e.medianeJours ?? NM, 'jour(s)', e.us, ...vide]);
  };
  att('attente', 'Attente avant mise en production (médiane)', m.attente);
  att('attente', 'dont revue (médiane)', m.decoupageAttente.revue);
  att('attente', 'dont recette (médiane)', m.decoupageAttente.recette);
  att('attente', 'dont production (médiane)', m.decoupageAttente.production);
  rows.push(['taille', 'US par version (médiane)', m.taille.usParVersion ?? NM, 'US', m.taille.versions.length, ...vide]);
  rows.push(['taille', 'Commits par version (médiane)', m.taille.commitsParVersion ?? NM, 'commit(s)', m.taille.versions.length, ...vide]);
  for (const v of m.taille.versions) {
    rows.push(['version', `${v.version} (${v.date}) : US`, v.us, 'US', '', ...vide]);
    rows.push(['version', `${v.version} (${v.date}) : commits`, v.commits ?? NM, 'commit(s)', '', ...vide]);
  }
  rows.push(['periode', `${m.periode.debut} au ${m.periode.fin} (${m.periode.jours} jours)`, '', '', '', ...vide]);
  rows.push(['rappel', RAPPEL_METHODO, '', '', '', ...vide]);
  return '\uFEFF' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

export function renderMetriques(m: Metriques, projet: string): string {
  const L: string[] = [];
  L.push(`# Indicateurs DORA : ${projet}`, '');
  L.push(`Période : du ${m.periode.debut} au ${m.periode.fin} (${m.periode.jours} jours).`, '');
  L.push('| Indicateur | Valeur |', '|---|---|');
  L.push(`| Fréquence de déploiement | ${m.frequence.deploiements} mise(s) en production, ${fr(m.frequence.parSemaine)} par semaine${niv(m.frequence.niveau)} |`);
  L.push(`| Délai de mise en production (médiane) | ${val(m.leadTime.medianeJours, 'jour(s)')}${m.leadTime.us ? ` sur ${m.leadTime.us} US` : ''}${niv(m.leadTime.niveau)} |`);
  L.push(`| Attente avant mise en production (médiane) | ${val(m.attente.medianeJours, 'jour(s)')}${m.attente.us ? ` sur ${m.attente.us} US` : ''} |`);
  L.push(`| Taux d'échec des changements | ${m.tauxEchec.pourcentage == null ? 'pas encore de données' : `${fr(m.tauxEchec.pourcentage)} % (${m.tauxEchec.deploiementsEnEchec} déploiement(s) suivi(s) d'un bug de production)`}${niv(m.tauxEchec.niveau)}${m.tauxEchec.avertissement ? ` : ${m.tauxEchec.avertissement}` : ''} |`);
  L.push(`| Temps de rétablissement (médiane) | ${val(m.retablissement.medianeHeures, 'heure(s)')}${m.retablissement.incidents ? ` sur ${m.retablissement.incidents} incident(s)` : ''}${niv(m.retablissement.niveau)} |`);
  L.push('');
  if (m.cibles?.length) {
    L.push('## Cibles', '', '| Indicateur | Mesuré | Cible |', '|---|---|---|');
    for (const c of m.cibles) L.push(`| ${c.libelle} | ${nm(c.valeur, c.unite)} | ${cibleTexte(c)} |`);
    L.push('');
  }
  L.push(`## Tendances (période précédente : du ${m.precedent.debut} au ${m.precedent.fin})`, '');
  L.push('| Indicateur | Cette période | Période précédente | Évolution |', '|---|---|---|---|');
  for (const t of m.tendances) L.push(`| ${t.libelle} | ${nm(t.valeur, t.unite)} | ${nm(t.precedent, t.unite)} | ${tendanceTexte(t)} |`);
  L.push('');
  L.push('## Où se perd l\'attente avant mise en production', '');
  const e = m.decoupageAttente;
  const etape = (nom: string, x: { medianeJours: number | null; us: number }): string =>
    `| ${nom} | ${nm(x.medianeJours, 'jour(s)')}${x.us ? ` sur ${x.us} US` : ''} |`;
  L.push('| Étape | Durée (médiane) |', '|---|---|');
  L.push(etape('Revue (Terminée → fin de revue)', e.revue), etape('Recette (→ première mise en recette)', e.recette), etape('Production (recette → mise en production)', e.production));
  L.push('', "Les étapes dépendent de dates facultatives (`revue_le` dans la US, déploiements enregistrés hors production). Sans `revue_le`, la durée de revue est comprise dans la recette.");
  L.push('');
  L.push('## Taille des changements', '');
  L.push(`Médiane par mise en production : ${nm(m.taille.usParVersion, 'US')} ; ${nm(m.taille.commitsParVersion, 'commit(s)')}.`);
  if (m.taille.versions.length) {
    L.push('', '| Version | Date | US | Commits |', '|---|---|---|---|');
    for (const v of m.taille.versions) L.push(`| ${v.version} | ${v.date} | ${v.us} | ${v.commits ?? NM} |`);
  }
  L.push('');
  L.push(`## Coûts IA (estimations des agents)`, '');
  L.push(`Total : ${fr(m.couts.total)} ${m.devise} sur ${m.couts.estimations} estimation(s). Ce sont des ordres de grandeur, pas une facture.`);
  const agents = Object.entries(m.couts.parAgent).sort((a, b) => b[1] - a[1]);
  if (agents.length) L.push('', ...agents.map(([a, c]) => `- ${a} : ${fr(c)} ${m.devise}`));
  L.push('', '## User stories', '');
  L.push('| US | Type | Colonne | Créée | Modifiée | Début dev | Terminée | Mise en prod | Délai (j) | Coût IA |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const u of m.us) {
    L.push(
      `| ${u.id} | ${u.bug ? 'bug' : 'US'} | ${u.colonne} | ${d(u.creee)} | ${d(u.modifiee)} | ${d(u.debutDev)} | ${d(u.terminee)} | ${d(u.misEnProd)} | ${u.leadTimeJours != null ? fr(u.leadTimeJours) : '—'} | ${u.coutIa ? `${fr(u.coutIa)} ${m.devise}` : '—'} |`,
    );
  }
  L.push('', '## À savoir', '', `${RAPPEL_METHODO}`, '');
  return L.join('\n');
}

export async function runMetriques(opts: MetriquesOptions = {}): Promise<Metriques> {
  const cwd = path.resolve(opts.cwd ?? process.cwd());
  const root = await requireProjectRoot(cwd);
  const jours = opts.jours != null ? Number(opts.jours) : 90;
  if (!Number.isInteger(jours) || jours < 1) throw new OrbithError(`Période invalide : ${opts.jours} (un nombre de jours, par exemple 90).`);
  const format = opts.format ?? 'texte';
  if (!['texte', 'json', 'csv'].includes(format)) throw new OrbithError(`Format inconnu : ${format} (texte, json ou csv).`);

  const config = await loadConfig(root);
  const arts = await scanArtifacts(root);
  const ids = arts.filter((a) => a.type === 'story' && a.id).map((a) => a.id!);
  let commits: Awaited<ReturnType<typeof gitLogDated>> | undefined;
  const premiers = new Map<string, string>();
  const terminees = new Map<string, string>();
  if (await isGitRepo(root)) {
    commits = await gitLogDated(root);
    for (const id of ids) {
      const c = commits.find((x) => mentions(x.subject, id));
      if (c) premiers.set(id, c.date);
    }
    for (const s of arts) {
      if (s.type !== 'story' || !s.id) continue;
      const fin = await dateTerminee(root, s);
      if (fin) terminees.set(s.id, fin);
    }
  }
  const m = calculerMetriques(arts, await loadDeploiements(root), premiers, {
    jours,
    devise: config.finops.devise,
    terminees,
    ...(commits ? { commits } : {}),
    ...(config.dora?.cibles ? { cibles: config.dora.cibles } : {}),
    ...(opts.aujourdhui ? { aujourdhui: opts.aujourdhui } : {}),
  });
  const out =
    format === 'json'
      ? JSON.stringify({ ...m, rappel: RAPPEL_METHODO }, null, 2) + '\n'
      : format === 'csv'
        ? renderMetriquesCsv(m)
        : renderMetriques(m, config.projet.nom);
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
    .option('--format <format>', 'texte, json ou csv', 'texte')
    .option('--sortie <fichier>', 'écrit le résultat dans un fichier')
    .option('--cwd <dir>', 'dossier de travail')
    .action(async (opts: MetriquesOptions) => {
      await runMetriques(opts);
    });
}
