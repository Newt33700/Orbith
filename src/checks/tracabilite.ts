import { gitLog, isGitRepo, scanArtifacts, storyStatus } from '../core/index.js';
import type { CheckContext, CheckResult } from './types.js';

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function run(ctx: CheckContext): Promise<CheckResult[]> {
  if (!(await isGitRepo(ctx.root))) {
    return [
      { categorie: 'tracabilite', niveau: 'info', message: "Pas de dépôt git : vérification de traçabilité ignorée." },
    ];
  }
  const res: CheckResult[] = [];
  const prefixe = ctx.config?.backlog.prefixe ?? 'US';
  const idRe = new RegExp(`\\b${escapeRe(prefixe)}-\\d+\\b`);
  for (const c of await gitLog(ctx.root, 50)) {
    if (!idRe.test(c.subject)) {
      res.push({
        categorie: 'tracabilite',
        niveau: 'avertissement',
        message: `Commit ${c.hash.slice(0, 7)} sans identifiant de story (${prefixe}-NNN) : « ${c.subject} »`,
      });
    }
  }
  const stories = (await scanArtifacts(ctx.root)).filter(
    (a) => a.type === 'story' && a.id && storyStatus(a) === 'Terminée',
  );
  if (stories.length > 0) {
    const all = (await gitLog(ctx.root, 100000)).map((c) => c.subject).join('\n');
    for (const s of stories) {
      const re = new RegExp(`\\b${escapeRe(s.id!)}\\b`);
      if (!re.test(all)) {
        res.push({
          categorie: 'tracabilite',
          niveau: 'avertissement',
          message: `La story ${s.id} est Terminée mais aucun commit ne la référence.`,
          fichier: s.chemin,
        });
      }
    }
  }
  return res;
}
