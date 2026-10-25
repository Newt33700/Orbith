import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  STORY_STATUSES,
  isGitRepo,
  loadConfig,
  packageRoot,
  scanArtifacts,
  type Artifact,
  type EtatValidation,
  type NoeudConnaissance,
  avancement,
  dateJour,
  enRetard,
  grapheConnaissance,
} from '../core/index.js';
import { buildContext, runAll, type CheckResult } from '../checks/index.js';
import { buildTraces, type StoryTrace } from '../cli/trace-report.js';

export interface AuditArtifact {
  type: string;
  id: string;
  titre: string;
  chemin: string;
  statut: string;
  etat: EtatValidation;
  etatLibelle: string;
  validePar: string;
  valideLe: string;
  probleme: boolean;
}

export interface AuditData {
  entete: {
    projet: string;
    date: string;
    genereLe: string;
    versionOrbith: string;
    branche: string;
    commit: string;
    auteur: string;
    piste: string;
  };
  synthese: {
    artefacts: number;
    valides: number;
    pourcentValides: number;
    parColonne: Record<string, number>;
    erreurs: number;
    avertissements: number;
    usTerminees: number;
    usTraceesTerminees: number;
    /** Pourcentage, ou null s'il n'y a aucune US terminée. */
    couvertureTracabilite: number | null;
  };
  validations: AuditArtifact[];
  tracabilite: StoryTrace[];
  controles: CheckResult[];
  /** Present only when the project has improvement actions or knowledge links. */
  connaissance?: {
    ameliorations: { id: string; titre: string; chemin: string; avancement: string; echeance: string; enRetard: boolean; etat: EtatValidation }[];
    liens: NoeudConnaissance[];
  };
}

export const ETAT_LIBELLES: Record<EtatValidation, string> = {
  'validé': 'validé',
  'non-validé': 'non validé',
  'modifié': 'modifié après validation',
  'non-tracé': 'non tracé',
};

function git(root: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    try {
      execFile('git', args, { cwd: root }, (err, stdout) => resolve(err ? '' : stdout.toString().trim()));
    } catch {
      resolve('');
    }
  });
}

export function orbithVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.join(packageRoot(), 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function formatDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function dateStr(v: unknown): string {
  if (v == null) return '';
  return v instanceof Date ? v.toISOString() : String(v);
}

function toAuditArtifact(a: Artifact): AuditArtifact {
  const valide = a.etat === 'validé';
  return {
    type: a.type,
    id: a.id ?? '',
    titre: a.titre ?? '',
    chemin: a.chemin,
    statut: a.statut ?? 'brouillon',
    etat: a.etat,
    etatLibelle: ETAT_LIBELLES[a.etat],
    validePar: a.data['valide_par'] != null ? String(a.data['valide_par']) : '',
    valideLe: dateStr(a.data['valide_le']),
    probleme: a.etat === 'modifié' || a.etat === 'non-tracé' || (!valide && a.statut === 'validé'),
  };
}

function connaissance(arts: Artifact[], aujourdhui: string): Pick<AuditData, 'connaissance'> {
  const ameliorations = arts
    .filter((a) => a.type === 'amelioration')
    .map((a) => ({
      id: a.id ?? '',
      titre: a.titre ?? '',
      chemin: a.chemin,
      avancement: avancement(a) ?? String(a.data['avancement'] ?? ''),
      echeance: dateJour(a.data['echeance']) ?? '',
      enRetard: enRetard(a, aujourdhui),
      etat: a.etat,
    }));
  const liens = grapheConnaissance(arts);
  return ameliorations.length || liens.length ? { connaissance: { ameliorations, liens } } : {};
}

export async function collectAudit(root: string, now: Date = new Date()): Promise<AuditData> {
  const config = await loadConfig(root).catch(() => null);
  const arts = await scanArtifacts(root);
  const traces = await buildTraces(root, arts);
  const controles = await runAll(await buildContext(root));
  const repo = await isGitRepo(root);
  let branche = '';
  let commit = '';
  let auteur = '';
  if (repo) {
    branche = (await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])) || (await git(root, ['symbolic-ref', '--short', 'HEAD']));
    commit = await git(root, ['rev-parse', '--short', 'HEAD']);
    const name = await git(root, ['config', 'user.name']);
    const email = await git(root, ['config', 'user.email']);
    auteur = name ? (email ? `${name} <${email}>` : name) : '';
  }

  const validations = arts.map(toAuditArtifact);
  const parColonne: Record<string, number> = Object.fromEntries(STORY_STATUSES.map((s) => [s, 0]));
  for (const t of traces) parColonne[t.colonne] = (parColonne[t.colonne] ?? 0) + 1;
  const terminees = traces.filter((t) => t.colonne === 'Terminée');
  const tracees = terminees.filter((t) => t.commits.length > 0 && t.tests.length > 0);
  const valides = arts.filter((a) => a.etat === 'validé').length;

  return {
    entete: {
      projet: config?.projet.nom ?? path.basename(root),
      date: formatDate(now),
      genereLe: now.toISOString(),
      versionOrbith: orbithVersion(),
      branche: branche || 'n/a',
      commit: commit || 'n/a',
      auteur: auteur || 'n/a',
      piste: config?.piste ?? 'n/a',
    },
    synthese: {
      artefacts: arts.length,
      valides,
      pourcentValides: arts.length ? Math.round((valides / arts.length) * 100) : 0,
      parColonne,
      erreurs: controles.filter((c) => c.niveau === 'erreur').length,
      avertissements: controles.filter((c) => c.niveau === 'avertissement').length,
      usTerminees: terminees.length,
      usTraceesTerminees: tracees.length,
      couvertureTracabilite: terminees.length ? Math.round((tracees.length / terminees.length) * 100) : null,
    },
    validations,
    tracabilite: traces,
    controles,
    ...connaissance(arts, formatDate(now)),
  };
}
