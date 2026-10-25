import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import {
  OrbithError,
  exists,
  hasGherkin,
  loadConfig,
  requireProjectRoot,
  scanAll,
  storyStatus,
  type Artifact,
  type ArtifactType,
  type FrontmatterProblem,
  type OrbithConfig,
} from '../core/index.js';
import { CONTEXTE_PROJET, MARQUEUR_A_COMPLETER } from '../adapters/contexte.js';
import { mentions } from './trace-report.js';

export type Verdict = 'PASS' | 'CONCERNS' | 'FAIL';
export type ContexteEtat = 'absent' | 'a-completer' | 'rempli';

export interface Controle {
  niveau: 'ok' | 'concern' | 'fail';
  /** Short French message. */
  message: string;
  fichier?: string;
}

export interface PreparationResult {
  verdict: Verdict;
  controles: Controle[];
}

function ofType(arts: Artifact[], type: ArtifactType): Artifact[] {
  return arts.filter((a) => a.type === type);
}

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

function deps(s: Artifact): string[] {
  const d = s.data['dependencies'];
  return Array.isArray(d) ? d.map((x) => String(x)).filter((x) => x.trim() !== '') : [];
}

/** Finds a dependency cycle among stories; returns the ids of the cycle or null. */
function cycle(stories: Artifact[]): string[] | null {
  const byId = new Map(stories.filter((s) => s.id).map((s) => [(s.id as string).toLowerCase(), s]));
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    const st = state.get(id);
    if (st === 2) return null;
    if (st === 1) return [...stack.slice(stack.indexOf(id)), id];
    state.set(id, 1);
    stack.push(id);
    for (const d of deps(byId.get(id) as Artifact)) {
      const k = d.toLowerCase();
      if (!byId.has(k)) continue;
      const c = visit(k);
      if (c) return c;
    }
    stack.pop();
    state.set(id, 2);
    return null;
  };
  for (const id of byId.keys()) {
    const c = visit(id);
    if (c) return c.map((k) => (byId.get(k)?.id as string) ?? k);
  }
  return null;
}

/**
 * Implementation readiness check (deterministic, no AI): coherence brief → PRD → architecture → epics → stories.
 * Pure function: every input is passed in.
 */
export function evaluerPreparation(
  artifacts: Artifact[],
  config: Pick<OrbithConfig, 'piste'>,
  problems: FrontmatterProblem[] = [],
  contexte: ContexteEtat = 'rempli',
): PreparationResult {
  const c: Controle[] = [];
  const ok = (message: string) => c.push({ niveau: 'ok', message });
  const concern = (message: string, fichier?: string) => c.push({ niveau: 'concern', message, ...(fichier ? { fichier } : {}) });
  const fail = (message: string, fichier?: string) => c.push({ niveau: 'fail', message, ...(fichier ? { fichier } : {}) });

  for (const p of problems) fail(`Frontmatter invalide (${p.message})`, p.chemin);
  for (const a of artifacts) {
    if (a.etat === 'modifié') fail('Modifié après sa validation : relis-le puis revalide-le.', a.chemin);
    else if (a.etat === 'non-tracé') fail('Marqué « validé » sans trace de validation.', a.chemin);
  }

  // 1. Documents de cadrage.
  const projet = config.piste === 'projet';
  const docs: [ArtifactType, string, boolean][] = [
    ['brief', 'brief', true],
    ['prd', 'PRD', true],
    ['ux', 'document UX', false],
    ['architecture', 'architecture', true],
    ['epic', 'epic', true],
  ];
  for (const [type, nom, requis] of docs) {
    const found = ofType(artifacts, type);
    if (found.length === 0) {
      if (projet) (requis ? fail : concern)(`Pas de ${nom} (piste projet).`);
      continue;
    }
    for (const a of found) {
      if (a.etat === 'validé') ok(`${nom} validé`);
      else if (a.etat === 'non-validé') (projet && requis ? fail : concern)(`Le ${nom} n'est pas validé.`, a.chemin);
    }
  }

  // 2. Epics et user stories.
  const stories = ofType(artifacts, 'story');
  const epics = ofType(artifacts, 'epic');
  if (stories.length === 0) fail("Aucune user story : rien à implémenter.");
  const epicIds = epics.map((e) => e.id).filter((i): i is string => !!i);
  const epicDeLaStory = (s: Artifact): string | null => {
    const v = s.data['epic'];
    return typeof v === 'string' && v.trim() !== '' && !/^EPIC-X+$/i.test(v.trim()) ? v.trim() : null;
  };
  for (const e of epics) {
    const mine = stories.filter((s) => {
      const ref = epicDeLaStory(s);
      return (ref !== null && e.id !== undefined && same(ref, e.id)) || (s.id !== undefined && mentions(e.body, s.id));
    });
    if (mine.length === 0) concern(`L'epic ${e.id ?? e.chemin} n'a aucune user story.`, e.chemin);
  }
  for (const s of stories) {
    const ref = epicDeLaStory(s);
    if (ref === null) {
      if (projet && epics.length > 0) concern(`${s.id ?? s.chemin} n'est rattachée à aucun epic.`, s.chemin);
    } else if (!epicIds.some((id) => same(id, ref))) {
      fail(`${s.id ?? s.chemin} référence l'epic ${ref}, qui n'existe pas.`, s.chemin);
    }
  }

  // 3. Gherkin, dépendances, ADR.
  const open = stories.filter((s) => storyStatus(s) !== 'Terminée');
  for (const s of open) {
    if (!hasGherkin(s.body)) fail(`${s.id ?? s.chemin} n'a pas de critères d'acceptation Gherkin.`, s.chemin);
    if (s.etat === 'non-validé') concern(`${s.id ?? s.chemin} n'est pas encore validée.`, s.chemin);
  }
  const byId = new Map(stories.filter((s) => s.id).map((s) => [(s.id as string).toLowerCase(), s]));
  for (const s of open) {
    for (const d of deps(s)) {
      const dep = byId.get(d.toLowerCase());
      if (!dep) fail(`${s.id ?? s.chemin} dépend de ${d}, qui n'existe pas.`, s.chemin);
      else if (storyStatus(dep) !== 'Terminée' && ['En cours', 'En revue'].includes(storyStatus(s))) {
        concern(`${s.id ?? s.chemin} avance alors que sa dépendance ${d} n'est pas terminée.`, s.chemin);
      }
    }
  }
  const cyc = cycle(stories);
  if (cyc) fail(`Dépendances circulaires entre les user stories : ${cyc.join(' → ')}.`);

  const adrs = ofType(artifacts, 'adr').filter((a) => a.etat === 'validé');
  for (const s of open) {
    const labels = s.data['labels'];
    if (!Array.isArray(labels) || !labels.includes('impact-archi')) continue;
    const id = s.id;
    const couverte = !!id && adrs.some((a) => mentions(a.body, id) || mentions(JSON.stringify(a.data), id));
    if (!couverte) fail(`${id ?? s.chemin} a un impact d'architecture (impact-archi) mais aucun ADR validé n'y répond.`, s.chemin);
  }

  // 4. Contexte projet.
  if (contexte === 'absent') concern(`Pas de contexte projet (${CONTEXTE_PROJET}) : lance \`npx orbith install\` ou \`npx orbith init-context\`.`);
  else if (contexte === 'a-completer') concern(`Le contexte projet (${CONTEXTE_PROJET}) reste à compléter.`);
  else ok('Contexte projet renseigné');

  if (!c.some((x) => x.niveau !== 'ok')) ok('Aucune incohérence détectée');
  const verdict: Verdict = c.some((x) => x.niveau === 'fail') ? 'FAIL' : c.some((x) => x.niveau === 'concern') ? 'CONCERNS' : 'PASS';
  return { verdict, controles: c };
}

export async function contexteEtat(root: string): Promise<ContexteEtat> {
  const file = path.join(root, CONTEXTE_PROJET);
  if (!(await exists(file))) return 'absent';
  return (await fs.readFile(file, 'utf8')).includes(MARQUEUR_A_COMPLETER) ? 'a-completer' : 'rempli';
}

export function renderPreparation(res: PreparationResult): string {
  const icone = { ok: pc.green('✅'), concern: pc.yellow('⚠️ '), fail: pc.red('❌') } as const;
  const out: string[] = [pc.bold(pc.cyan('Check de préparation à l\'implémentation')), ''];
  for (const x of res.controles) {
    out.push(`  ${icone[x.niveau]} ${x.message}${x.fichier ? pc.dim(` [${x.fichier}]`) : ''}`);
  }
  const verdict =
    res.verdict === 'PASS'
      ? pc.green('PASS : prêt à implémenter')
      : res.verdict === 'CONCERNS'
        ? pc.yellow('CONCERNS : tu peux avancer, mais regarde les points ci-dessus')
        : pc.red('FAIL : corrige les points ❌ avant de développer');
  out.push('', `${pc.bold('Verdict')} : ${verdict}`);
  return out.join('\n');
}

export async function runPreparation(cwd: string, format: string): Promise<PreparationResult> {
  if (format !== 'texte' && format !== 'json') {
    throw new OrbithError(`Format inconnu : « ${format} » (attendu : texte ou json).`);
  }
  const root = await requireProjectRoot(cwd);
  const config = await loadConfig(root);
  const { artifacts, problems } = await scanAll(root);
  const res = evaluerPreparation(artifacts, config, problems, await contexteEtat(root));
  if (res.verdict === 'FAIL') process.exitCode = 1;
  console.log(format === 'json' ? JSON.stringify(res, null, 2) : renderPreparation(res));
  return res;
}

export function register(program: Command): void {
  program
    .command('preparation')
    .description("Vérifie la préparation à l'implémentation (cohérence brief, PRD, architecture, epics, US) : PASS, CONCERNS ou FAIL")
    .option('--format <format>', 'format de sortie (texte|json)', 'texte')
    .option('--cwd <dir>', 'dossier de travail')
    .action(async (opts: { format?: string; cwd?: string }) => {
      await runPreparation(opts.cwd ?? process.cwd(), opts.format ?? 'texte');
    });
}
