import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { arg, OrbithError, exists, requireProjectRoot, scanArtifacts, toPosixRelative, ui, type Artifact } from '../core/index.js';
import { mentions } from './trace-report.js';

export interface TestsOptions {
  cwd?: string;
  dossier?: string;
  force?: boolean;
}

export interface TestsResult {
  crees: string[];
  existants: string[];
  /** US ignorées, avec la raison (non validée, sans Gherkin). */
  ignorees: { id: string; raison: string }[];
}

const FEATURE_RE = /^\s*(Fonctionnalit[ée]|Feature)\s*:/im;
const SCENARIO_RE = /^\s*(Sc[ée]nario|Scenario|Plan du sc[ée]nario|Scenario Outline|Scenario Template)\s*:/im;

/** Blocs Gherkin d'une US : blocs ```gherkin, sinon le texte de la section « Critères d'acceptation ». */
export function extractGherkin(body: string): string[] {
  const text = body.replace(/\r\n/g, '\n');
  const fenced = [...text.matchAll(/```[ \t]*gherkin[^\n]*\n([\s\S]*?)```/gi)].map((m) => m[1]!.trim());
  if (fenced.length > 0) return fenced.filter((b) => SCENARIO_RE.test(b));
  const lines = text.split('\n');
  const out: string[] = [];
  let inAc = false;
  for (const line of lines) {
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) {
      if (inAc) break;
      inAc = /crit[èe]res?\s+d['’]acceptation|acceptance criteria/i.test(h[1] ?? '');
      continue;
    }
    if (inAc && !/^\s*<!--/.test(line)) out.push(line);
  }
  const block = out.join('\n').trim();
  return SCENARIO_RE.test(block) ? [block] : [];
}

/** Contenu du fichier .feature : tag @US-xxx garanti, Fonctionnalité ajoutée si absente. */
export function toFeature(block: string, id: string, titre: string): string {
  let lines = block.split('\n');
  const francais = /^\s*(Fonctionnalit[ée]|Sc[ée]nario|Étant donné|Etant donné|Quand|Alors)\b/im.test(block);
  if (!FEATURE_RE.test(block)) {
    const first = lines.findIndex((l) => SCENARIO_RE.test(l) || /^\s*@/.test(l));
    const head = `${francais ? 'Fonctionnalité' : 'Feature'}: ${titre}`;
    lines = [...lines.slice(0, first), head, '', ...lines.slice(first).map((l) => (l.trim() ? `  ${l.trimStart()}` : l))];
  }
  if (!mentions(lines.join('\n'), `@${id}`)) {
    const f = lines.findIndex((l) => FEATURE_RE.test(l));
    lines.splice(f, 0, `@${id}`);
  }
  if (francais && !/^\s*#\s*language\s*:/im.test(block)) lines.unshift('# language: fr');
  return [
    `# Squelette généré par « npx orbith tests » depuis ${id}. Complète les définitions d'étapes (step definitions).`,
    ...lines,
    '',
  ].join('\n');
}

function fileName(id: string, index: number): string {
  const base = id.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  return index === 0 ? `${base}.feature` : `${base}-${index + 1}.feature`;
}

export async function runTests(id: string | undefined, opts: TestsOptions = {}): Promise<TestsResult> {
  const cwd = path.resolve(opts.cwd ?? process.cwd());
  const root = await requireProjectRoot(cwd);
  const dossier = path.resolve(root, opts.dossier ?? 'tests/features');
  let stories = (await scanArtifacts(root)).filter((a): a is Artifact & { id: string } => a.type === 'story' && !!a.id);
  if (id) {
    stories = stories.filter((s) => s.id.toLowerCase() === id.toLowerCase());
    if (stories.length === 0) throw new OrbithError(`User story introuvable : ${id}`);
  }
  const result: TestsResult = { crees: [], existants: [], ignorees: [] };
  for (const s of stories) {
    // Validation humaine d'abord : pas de tests tirés de critères que personne n'a relus.
    if (s.etat !== 'validé') {
      result.ignorees.push({ id: s.id, raison: `non validée (lance \`npx orbith valider ${arg(s.chemin)}\`)` });
      continue;
    }
    const blocks = extractGherkin(s.body);
    if (blocks.length === 0) {
      result.ignorees.push({ id: s.id, raison: "pas de critères d'acceptation Gherkin" });
      continue;
    }
    for (const [i, block] of blocks.entries()) {
      const file = path.join(dossier, fileName(s.id, i));
      const rel = toPosixRelative(root, file);
      if (!opts.force && (await exists(file))) {
        result.existants.push(rel);
        continue;
      }
      await fs.mkdir(dossier, { recursive: true });
      await fs.writeFile(file, toFeature(block, s.id, s.titre ?? s.id), 'utf8');
      result.crees.push(rel);
    }
  }
  return result;
}

export function register(program: Command): void {
  program
    .command('tests [id]')
    .description("Génère les squelettes de tests (.feature) depuis les critères Gherkin des US validées")
    .option('--cwd <dir>', 'dossier de travail')
    .option('--dossier <dir>', 'dossier des fichiers .feature', 'tests/features')
    .option('--force', 'réécrit les fichiers .feature déjà présents')
    .action(async (id: string | undefined, opts: TestsOptions) => {
      const r = await runTests(id, opts);
      for (const f of r.crees) ui.ok(`Créé : ${f}`);
      for (const f of r.existants) ui.info(`Déjà présent, conservé : ${f} (--force pour le réécrire)`);
      for (const i of r.ignorees) ui.avert(`${i.id} ignorée : ${i.raison}`);
      if (r.crees.length === 0 && r.existants.length === 0 && r.ignorees.length === 0) {
        ui.info('Aucune US trouvée.');
      }
      if (r.crees.length > 0) {
        ui.info("Prochaine étape : écris les définitions d'étapes avec l'agent dev (/orbith:dev · /orbith-dev).");
      }
    });
}
