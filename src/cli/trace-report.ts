import { promises as fs } from 'node:fs';
import path from 'node:path';
import { changeRisque, changeType, gitLog, isGitRepo, storyStatus, type Artifact } from '../core/index.js';

export interface StoryTrace {
  id: string;
  titre: string;
  chemin: string;
  statut: string;
  colonne: string;
  validePar?: string;
  valideLe?: string;
  etat: string;
  commits: { hash: string; subject: string }[];
  tests: string[];
  notes: string[];
}

const EXCLUDED = new Set(['node_modules', '.git', 'dist', '.orbith', 'backlog', 'docs']);
const MAX_SIZE = 1024 * 1024;

async function walk(dir: string, root: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (EXCLUDED.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, root, out);
    else if (e.isFile()) out.push(p);
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Mention exacte d'un identifiant : US-1 ne correspond pas à US-12. */
export function mentions(text: string, id: string): boolean {
  return new RegExp(`(?<![A-Za-z0-9-])${escapeRe(id)}(?![A-Za-z0-9-])`).test(text);
}

function looksLikeTest(rel: string): boolean {
  return (
    /(^|\/)(tests?|__tests__|e2e|features?|spec|specs)\//i.test(rel) ||
    /\.(test|spec)\.[a-z]+$|\.feature$|(_test\.[a-z]+|Tests?\.java)$/i.test(rel)
  );
}

/** Retourne, pour chaque id, la liste des fichiers de test (chemins POSIX) qui le référencent. */
export async function findTests(root: string, ids: string[]): Promise<Map<string, string[]>> {
  const files: string[] = [];
  await walk(root, root, files);
  const result = new Map<string, string[]>(ids.map((i) => [i, []]));
  for (const f of files) {
    let content: string;
    try {
      const st = await fs.stat(f);
      if (st.size > MAX_SIZE) continue;
      content = await fs.readFile(f, 'utf8');
    } catch {
      continue;
    }
    if (content.includes('\0')) continue;
    const rel = path.relative(root, f).split(path.sep).join('/');
    const test = looksLikeTest(rel);
    for (const id of ids) {
      if (mentions(content, '@' + id) || (test && mentions(content, id))) result.get(id)!.push(rel);
    }
  }
  return result;
}

export async function buildTraces(root: string, arts: Artifact[]): Promise<StoryTrace[]> {
  const stories = arts.filter((a) => a.type === 'story');
  const ids = stories.map((s) => s.id).filter((i): i is string => !!i);
  const tests = await findTests(root, ids);
  const commits = (await isGitRepo(root)) ? await gitLog(root, 100_000) : [];
  const notes = arts.filter((a) => a.type === 'release-notes');
  return stories.map((s) => {
    const id = s.id ?? s.chemin;
    const colonne = typeof s.data['status'] === 'string' ? storyStatus(s) : '—';
    return {
      id,
      titre: s.titre ?? '—',
      chemin: s.chemin,
      statut: s.statut ?? 'brouillon',
      colonne,
      validePar: s.data['valide_par'] != null ? String(s.data['valide_par']) : undefined,
      valideLe: s.data['valide_le'] != null ? dateStr(s.data['valide_le']) : undefined,
      etat: s.etat,
      commits: s.id ? commits.filter((c) => mentions(c.subject, s.id!)) : [],
      tests: tests.get(id) ?? [],
      notes: s.id ? notes.filter((n) => mentions(n.body, s.id!)).map((n) => n.chemin) : [],
    };
  });
}

function dateStr(v: unknown): string {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
}

const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function renderMatrix(traces: StoryTrace[], projet: string): string {
  const lines = [`# Matrice de traçabilité — ${projet}`, ''];
  if (traces.length === 0) {
    lines.push('Aucune user story trouvée.');
    return lines.join('\n') + '\n';
  }
  lines.push(
    '| US | Titre | Statut | Colonne | Validée par | Commits | Tests | Livraison |',
    '|---|---|---|---|---|---|---|---|',
  );
  for (const t of traces) {
    const val = t.validePar ? `${t.validePar}${t.valideLe ? ` (${t.valideLe})` : ''}` : '—';
    const commits = t.commits.length ? t.commits.map((c) => `${c.hash.slice(0, 7)} ${c.subject}`).join('<br>') : '—';
    lines.push(
      `| ${cell(t.id)} | ${cell(t.titre)} | ${cell(t.statut)} | ${cell(t.colonne)} | ${cell(val)} | ${cell(commits)} | ${
        t.tests.length ? cell(t.tests.join('<br>')) : '—'
      } | ${t.notes.length ? cell(t.notes.join('<br>')) : '—'} |`,
    );
  }
  return lines.join('\n') + '\n';
}

export function renderDetail(t: StoryTrace): string {
  const list = (xs: string[]): string[] => (xs.length ? xs.map((x) => `- ${x}`) : ['- aucun']);
  return (
    [
      `# ${t.id} — ${t.titre}`,
      '',
      `- Fichier : ${t.chemin}`,
      `- Statut de validation : ${t.statut} (${t.etat})`,
      `- Colonne du tableau : ${t.colonne}`,
      `- Validée par : ${t.validePar ? `${t.validePar}${t.valideLe ? ` le ${t.valideLe}` : ''}` : '—'}`,
      '',
      '## Commits',
      ...list(t.commits.map((c) => `${c.hash.slice(0, 7)} ${c.subject}`)),
      '',
      '## Tests',
      ...list(t.tests),
      '',
      '## Notes de livraison',
      ...list(t.notes),
    ].join('\n') + '\n'
  );
}

/** Section « Demandes de changement » de la matrice (vide s'il n'y en a pas). */
export function renderChanges(arts: Artifact[]): string {
  const changes = arts.filter((a) => a.type === 'change');
  if (changes.length === 0) return '';
  const lines = [
    '',
    '## Demandes de changement',
    '',
    '| Demande | Type | Risque | Version | Fenêtre | Validée par | US concernées |',
    '|---|---|---|---|---|---|---|',
  ];
  const ids = arts.filter((a) => a.type === 'story' && a.id).map((a) => a.id!);
  for (const c of changes) {
    const version = c.data['version'] != null ? String(c.data['version']) : '—';
    const fenetre = c.data['fenetre_debut'] != null ? `${dateStr(c.data['fenetre_debut'])} → ${dateStr(c.data['fenetre_fin'] ?? '—')}` : '—';
    const par = c.etat === 'validé' && c.data['valide_par'] != null ? String(c.data['valide_par']) : `— (${c.etat})`;
    const us = ids.filter((id) => mentions(c.body, id));
    lines.push(
      `| ${cell(c.id ?? c.chemin)} | ${cell(changeType(c) ?? '—')} | ${cell(changeRisque(c) ?? '—')} | ${cell(version)} | ${cell(fenetre)} | ${cell(par)} | ${cell(us.join(', ') || '—')} |`,
    );
  }
  return lines.join('\n') + '\n';
}
