import { DOCUMENTATION_CODE_DEFAUT, gitLogFiles, isGitRepo, scanArtifacts } from '../core/index.js';
import type { CheckContext, CheckResult } from './types.js';

/** Nombre de commits examinés (même fenêtre que le contrôle de traçabilité). */
const FENETRE = 50;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sansAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Un fichier de documentation : README, CHANGELOG, tout fichier de `docs/`, ou un texte Markdown hors backlog. */
export function estDocumentation(f: string): boolean {
  if (f.startsWith('backlog/')) return false;
  // Le cœur Orbith copié par install/update n'est pas la documentation du projet, sauf le contexte projet.
  if (f.startsWith('.orbith/')) return f === '.orbith/contexte-projet.md';
  if (f.startsWith('docs/')) return true;
  const base = f.split('/').pop() ?? f;
  if (/^(readme|changelog)(\.|$)/i.test(base)) return true;
  return /\.(md|mdx|adoc|rst)$/i.test(base);
}

/** Valeur du champ `documentation` d'une US qui dit qu'aucune documentation n'est concernée. */
export function documentationNonConcernee(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  return ['non-concernee', 'non concernee', 'aucune'].includes(sansAccents(v));
}

/**
 * Avertit quand les commits d'une US modifient du code (`documentation.code`, défaut `src/`) sans qu'aucun
 * fichier de documentation n'ait changé pour cette même US. Désactivable (`documentation.controle: false`).
 */
export async function run(ctx: CheckContext): Promise<CheckResult[]> {
  const conf = ctx.config?.documentation;
  if (conf && conf.controle === false) return [];
  if (!(await isGitRepo(ctx.root))) return [];
  const prefixesCode = conf?.code?.length ? conf.code : [...DOCUMENTATION_CODE_DEFAUT];
  const estCode = (f: string): boolean => prefixesCode.some((p) => f.startsWith(p));

  const prefixe = ctx.config?.backlog.prefixe ?? 'US';
  const idRe = new RegExp(`\\b${escapeRe(prefixe)}-\\d+\\b`, 'g');
  const parUs = new Map<string, { code: Set<string>; doc: boolean }>();
  for (const c of await gitLogFiles(ctx.root, FENETRE)) {
    const ids = new Set(c.subject.match(idRe) ?? []);
    for (const id of ids) {
      const e = parUs.get(id) ?? { code: new Set<string>(), doc: false };
      for (const f of c.files) {
        if (estCode(f)) e.code.add(f);
        if (estDocumentation(f)) e.doc = true;
      }
      parUs.set(id, e);
    }
  }
  if (parUs.size === 0) return [];

  const stories = new Map(
    (await scanArtifacts(ctx.root)).filter((a) => a.type === 'story' && a.id).map((a) => [a.id!, a]),
  );
  const res: CheckResult[] = [];
  for (const [id, e] of [...parUs].sort(([a], [b]) => a.localeCompare(b))) {
    if (e.code.size === 0 || e.doc) continue;
    const story = stories.get(id);
    if (story && documentationNonConcernee(story.data['documentation'])) continue;
    const exemples = [...e.code].sort().slice(0, 3).join(', ') + (e.code.size > 3 ? '…' : '');
    res.push({
      categorie: 'documentation',
      niveau: 'avertissement',
      message:
        `${id} : du code a changé (${exemples}) sans aucune mise à jour de documentation (README, docs/, CHANGELOG, *.md). ` +
        'Mets à jour la documentation concernée, ou, si rien n\'est à documenter, ajoute `documentation: non-concernée` dans l\'en-tête de la US.',
      ...(story ? { fichier: story.chemin } : {}),
    });
  }
  return res;
}
