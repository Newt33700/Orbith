import { promises as fs, constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { readDoc } from './frontmatter.js';
import { toPosixRelative } from './paths.js';
import { etatValidation, type EtatValidation } from './validations.js';

export type ArtifactType =
  | 'brief'
  | 'prd'
  | 'ux'
  | 'architecture'
  | 'adr'
  | 'epic'
  | 'story'
  | 'release-notes'
  | 'environnements'
  | 'change'
  | 'incident'
  | 'menaces'
  | 'strategie-test'
  | 'retro'
  | 'analyse'
  | 'amelioration';

export interface Artifact {
  type: ArtifactType;
  chemin: string;
  id?: string;
  titre?: string;
  statut?: string;
  etat: EtatValidation;
  data: Record<string, unknown>;
  body: string;
}

export const STORY_STATUSES = ['À faire', 'Prête', 'En cours', 'En revue', 'Terminée'] as const;


const STATUS_ALIASES: Record<string, string> = {
  'a faire': 'À faire',
  'to do': 'À faire',
  todo: 'À faire',
  prete: 'Prête',
  ready: 'Prête',
  'en cours': 'En cours',
  'in progress': 'En cours',
  'en revue': 'En revue',
  'in review': 'En revue',
  review: 'En revue',
  terminee: 'Terminée',
  termine: 'Terminée',
  done: 'Terminée',
};

/** Colonne du tableau (`status`), insensible à la casse et aux accents, avec les noms Backlog.md par défaut. */
export function storyStatus(a: { data: Record<string, unknown> }): string {
  const s = a.data['status'];
  if (typeof s !== 'string' || !s.trim()) return 'À faire';
  const k = s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  return STATUS_ALIASES[k] ?? s.trim();
}

export const ARTIFACT_TYPES: readonly ArtifactType[] = [
  'brief',
  'prd',
  'ux',
  'architecture',
  'adr',
  'epic',
  'story',
  'release-notes',
  'environnements',
  'change',
  'incident',
  'menaces',
  'strategie-test',
  'retro',
  'analyse',
  'amelioration',
];
const TYPES: readonly string[] = ARTIFACT_TYPES;

const SCAN_DIRS = ['docs/produit', 'docs/architecture', 'docs/livraisons', 'backlog/tasks', 'docs/amelioration'];

async function walkMd(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkMd(p)));
    else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) out.push(p);
  }
  return out;
}

function firstHeading(body: string): string | undefined {
  const m = /^#\s+(.+)$/m.exec(body);
  return m?.[1]?.trim();
}

/** Fichier Markdown dont le frontmatter YAML est illisible. */
export interface FrontmatterProblem {
  chemin: string;
  message: string;
}

export interface ScanResult {
  artifacts: Artifact[];
  problems: FrontmatterProblem[];
}

export async function scanAll(root: string): Promise<ScanResult> {
  const result: Artifact[] = [];
  const problems: FrontmatterProblem[] = [];
  for (const rel of SCAN_DIRS) {
    for (const file of await walkMd(path.join(root, rel))) {
      let doc;
      try {
        doc = await readDoc(file);
      } catch (e) {
        const msg = e instanceof Error ? e.message.split(/\r?\n/)[0] ?? '' : String(e);
        // Fichier illisible (droits…) : ignoré ; YAML invalide : signalé.
        const lisible = await fs.access(file, fsConstants.R_OK).then(() => true, () => false);
        if (lisible) problems.push({ chemin: toPosixRelative(root, file), message: msg });
        continue;
      }
      const type = doc.data['type'];
      if (typeof type !== 'string' || !TYPES.includes(type)) continue;
      const titreRaw = doc.data['title'] ?? doc.data['titre'];
      result.push({
        type: type as ArtifactType,
        chemin: toPosixRelative(root, file),
        id: doc.data['id'] != null ? String(doc.data['id']) : undefined,
        titre: titreRaw != null ? String(titreRaw) : firstHeading(doc.body),
        statut: doc.data['statut'] != null ? String(doc.data['statut']) : undefined,
        etat: await etatValidation(root, file, doc),
        data: doc.data,
        body: doc.body,
      });
    }
  }
  return { artifacts: result, problems };
}

export async function scanArtifacts(root: string): Promise<Artifact[]> {
  return (await scanAll(root)).artifacts;
}

export async function scanProblems(root: string): Promise<FrontmatterProblem[]> {
  return (await scanAll(root)).problems;
}

export function hasGherkin(body: string): boolean {
  if (/```\s*gherkin\b/i.test(body)) return true;
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  let inAc = false;
  for (const line of lines) {
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) {
      inAc = /crit[èe]res?\s+d['’]acceptation|acceptance criteria/i.test(h[1] ?? '');
      continue;
    }
    if (inAc && /^\s*(Sc[ée]nario|Scenario)(\s+Outline|\s+Template)?\s*:/i.test(line)) return true;
  }
  return false;
}
