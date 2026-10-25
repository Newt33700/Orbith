import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Adapter } from '../index.js';
import { AGENTS, CLAUDE_DENY } from '../agents.js';
import { upsertBlockFile, writeIfChanged } from '../blocks.js';
import { exists, OrbithError } from '../../core/index.js';
import { geminiMdBlock } from '../gemini/index.js';

export function commandMd(agent: (typeof AGENTS)[number]): string {
  const lines = ['---', `description: ${agent.description}`, 'argument-hint: [ta demande]', '---'];
  if (agent.key === 'guide') {
    lines.push('Commence par exécuter `npx orbith next` pour connaître l\'état du projet et la prochaine action.', '');
  }
  lines.push(`@.orbith/${agent.file}`, '', "Demande de l'utilisateur : $ARGUMENTS", '');
  return lines.join('\n');
}

/** Merges deny entries into a settings object without dropping anything. */
export function mergeSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const permissions =
    settings['permissions'] && typeof settings['permissions'] === 'object' && !Array.isArray(settings['permissions'])
      ? { ...(settings['permissions'] as Record<string, unknown>) }
      : {};
  const deny = Array.isArray(permissions['deny']) ? [...(permissions['deny'] as unknown[])] : [];
  for (const entry of CLAUDE_DENY) if (!deny.includes(entry)) deny.push(entry);
  permissions['deny'] = deny;
  return { ...settings, permissions };
}

export const claude: Adapter = {
  id: 'claude',
  nom: 'Claude Code',
  async generate(root) {
    const written: string[] = [];
    for (const agent of AGENTS) {
      written.push(await writeIfChanged(root, `.claude/commands/${agent.claude}.md`, commandMd(agent)));
    }
    written.push(await upsertBlockFile(root, 'CLAUDE.md', '<!-- orbith:debut -->', '<!-- orbith:fin -->', geminiMdBlock()));

    const rel = '.claude/settings.json';
    const file = path.join(root, rel);
    let current: Record<string, unknown> = {};
    if (await exists(file)) {
      const raw = await fs.readFile(file, 'utf8');
      if (raw.trim() !== '') {
        try {
          const parsed: unknown = JSON.parse(raw);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
          current = parsed as Record<string, unknown>;
        } catch {
          throw new OrbithError(
            "Le fichier .claude/settings.json n'est pas un JSON valide : corrige-le (ou renomme-le) puis relance la commande.",
          );
        }
      }
    }
    written.push(await writeIfChanged(root, rel, JSON.stringify(mergeSettings(current), null, 2) + '\n'));
    return written;
  },
};
