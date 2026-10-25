import path from 'node:path';
import type { Command } from 'commander';
import {
  OrbithError,
  enregistrerProvenance,
  isGitRepo,
  loadConfig,
  loadRegistry,
  provenanceComplete,
  provenanceGit,
  requireProjectRoot,
  scanArtifacts,
  storyStatus,
  type Artifact,
  type EtatValidation,
  type ProvenanceCommit,
} from '../core/index.js';

export interface LigneProvenance {
  /** Id de la US, ou chemin du document. */
  cle: string;
  type: string;
  titre: string;
  chemin: string;
  colonne?: string;
  etat: EtatValidation;
  /** Validation humaine tracée (registre des validations), si l'état est `validé`. */
  validation?: { par: string; le: string };
  commits: { commit: string; date: string; ia: string[]; modele?: string }[];
  modeles: string[];
  /** Relecture humaine du code : `revue_par` / `revue_le` de la US ou pied `Reviewed-by:` d'un commit lié. */
  revueHumaine: string[];
  /** La US contient un titre « Revue QA » (revue faite par l'agent QA, relue par l'humain). */
  revueQa: boolean;
}

export interface RapportProvenance {
  commitsIa: number;
  /** Commits co-écrits par une IA qui ne mentionnent aucune US ni ne modifient de document. */
  sansLien: number;
  lignes: LigneProvenance[];
}

const texte = (v: unknown): string => (v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());

/** Construit le rapport à partir des artefacts, du registre des validations et des commits co-écrits par une IA. */
export function construireRapport(
  arts: Artifact[],
  commits: ProvenanceCommit[],
  validations: { fichier: string; par: string; le: string }[],
): RapportProvenance {
  const lignes: LigneProvenance[] = [];
  const lies = new Set<string>();
  for (const a of arts) {
    const estUs = a.type === 'story' && !!a.id;
    const cs = commits.filter((c) => (estUs && c.us.includes(a.id!)) || c.documents.includes(a.chemin));
    if (cs.length === 0) continue;
    for (const c of cs) lies.add(c.commit);
    const v = validations.find((x) => x.fichier === a.chemin);
    const revue = new Set<string>();
    const rp = texte(a.data['revue_par']);
    const rl = texte(a.data['revue_le']);
    if (rp || rl) revue.add(rp ? (rl ? `${rp} (${rl})` : rp) : `revue le ${rl}`);
    for (const c of cs) for (const r of c.relu_par ?? []) revue.add(r);
    lignes.push({
      cle: estUs ? a.id! : a.chemin,
      type: a.type,
      titre: a.titre ?? a.id ?? a.chemin,
      chemin: a.chemin,
      ...(estUs ? { colonne: storyStatus(a) } : {}),
      etat: a.etat,
      ...(v && a.etat === 'validé' ? { validation: { par: v.par, le: v.le.slice(0, 10) } } : {}),
      commits: cs.map((c) => ({ commit: c.commit, date: c.date, ia: c.ia, ...(c.modele ? { modele: c.modele } : {}) })),
      modeles: [...new Set(cs.map((c) => c.modele).filter((m): m is string => !!m))],
      revueHumaine: [...revue],
      revueQa: /^#{1,6}\s+Revue QA\b/im.test(a.body),
    });
  }
  return { commitsIa: commits.length, sansLien: commits.filter((c) => !lies.has(c.commit)).length, lignes };
}

/** true si du code co-écrit par une IA est lié à une US terminée sans validation humaine ni revue humaine tracées. */
export function sansControleHumain(l: LigneProvenance): boolean {
  return l.type === 'story' && l.colonne === 'Terminée' && l.etat !== 'validé' && l.revueHumaine.length === 0;
}

export async function collecterProvenance(root: string): Promise<RapportProvenance> {
  const config = await loadConfig(root).catch(() => null);
  const prefixe = config?.backlog.prefixe ?? 'US';
  const commits = (await isGitRepo(root)) ? await provenanceComplete(root, prefixe) : [];
  return construireRapport(await scanArtifacts(root), commits, await loadRegistry(root));
}

const ETATS: Record<EtatValidation, string> = {
  'validé': 'validé',
  'non-validé': 'non validé',
  'modifié': 'modifié après validation',
  'non-tracé': 'validation non tracée',
};

export function renderProvenance(r: RapportProvenance): string {
  const L: string[] = ['# Provenance IA', ''];
  L.push(`${r.commitsIa} commit(s) portent un pied \`Co-Authored-By:\` désignant une IA${r.sansLien ? ` (dont ${r.sansLien} sans US ni document lié)` : ''}.`, '');
  if (r.lignes.length === 0) {
    L.push('Aucune US ni aucun document lié à un commit co-écrit par une IA.', '');
    return L.join('\n');
  }
  L.push('| US / document | Colonne | Commits IA | Modèle(s) | Validation humaine | Revue humaine du code |', '|---|---|---|---|---|---|');
  for (const l of r.lignes) {
    const val = l.validation ? `${l.validation.par} (${l.validation.le})` : ETATS[l.etat];
    const revue = l.revueHumaine.length ? l.revueHumaine.join(', ') : l.revueQa ? 'aucune (revue QA par agent seulement)' : 'aucune';
    L.push(
      `| ${l.cle} : ${l.titre.replace(/\|/g, '\\|')} | ${l.colonne ?? '—'} | ${l.commits.map((c) => c.commit.slice(0, 7)).join(', ')} | ${l.modeles.join(', ') || 'inconnu'} | ${val} | ${revue}${sansControleHumain(l) ? ' ⚠️' : ''} |`,
    );
  }
  L.push('', '⚠️ : US terminée, code co-écrit par une IA, sans validation humaine ni revue humaine tracées.', '');
  return L.join('\n');
}

export interface ProvenanceOptions {
  cwd?: string;
  format?: string;
  enregistrer?: boolean;
}

export async function runProvenance(opts: ProvenanceOptions = {}): Promise<RapportProvenance> {
  const root = await requireProjectRoot(path.resolve(opts.cwd ?? process.cwd()));
  const format = opts.format ?? 'texte';
  if (!['texte', 'json'].includes(format)) throw new OrbithError(`Format inconnu : ${format} (texte ou json).`);
  if (opts.enregistrer) {
    if (!(await isGitRepo(root))) throw new OrbithError("Pas de dépôt Git : rien à enregistrer.");
    const config = await loadConfig(root).catch(() => null);
    const n = await enregistrerProvenance(root, await provenanceGit(root, config?.backlog.prefixe ?? 'US'));
    // Message sur la sortie d'erreur : la sortie standard reste exploitable en JSON.
    console.error(n ? `${n} commit(s) ajouté(s) à .orbith/provenance.json.` : 'Registre .orbith/provenance.json déjà à jour.');
  }
  const r = await collecterProvenance(root);
  process.stdout.write(format === 'json' ? JSON.stringify(r, null, 2) + '\n' : renderProvenance(r));
  return r;
}

export function register(program: Command): void {
  program
    .command('provenance')
    .description('Provenance IA : commits co-écrits par une IA, par US et document, et contrôle humain associé')
    .option('--format <format>', 'texte ou json', 'texte')
    .option('--enregistrer', 'ajoute les nouveaux commits co-écrits par une IA au registre .orbith/provenance.json')
    .option('--cwd <dir>', 'dossier de travail')
    .action(async (opts: ProvenanceOptions) => {
      await runProvenance(opts);
    });
}
