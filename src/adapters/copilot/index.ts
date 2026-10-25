import type { Adapter } from '../index.js';
import type { OrbithConfig } from '../../core/index.js';
import { AGENTS, RULES } from '../agents.js';
import { upsertBlockFile, writeIfChanged } from '../blocks.js';
import { ensureContexteProjet } from '../contexte.js';
import { agentsDuProjet } from '../agents-perso.js';

/**
 * GitHub Copilot (VS Code) — opt-in (SPEC §6). Workspace prompt files in `.github/prompts/*.prompt.md`
 * (frontmatter `description`, `argument-hint`; the body references files with Markdown links relative to
 * the prompt file) and project instructions in `.github/copilot-instructions.md`.
 * Source: https://code.visualstudio.com/docs/agent-customization/prompt-files and
 * https://code.visualstudio.com/docs/agent-customization/custom-instructions (microsoft/vscode-docs).
 * Copilot has no project file to forbid reading files (content exclusion is a GitHub repo/org setting),
 * so no deny list is generated: the `confidentialite` rule is the only safeguard on this platform.
 */
export function promptMd(agent: (typeof AGENTS)[number]): string {
  const lines = ['---', `description: ${JSON.stringify(agent.description)}`, 'argument-hint: "[ta demande]"', '---'];
  if (agent.key === 'guide') {
    lines.push("Commence par exécuter `npx orbith next` pour connaître l'état du projet et la prochaine action.", '');
  }
  lines.push(
    `Suis les instructions de [.orbith/${agent.file}](../../.orbith/${agent.file}).`,
    '',
    "Demande de l'utilisateur : le texte saisi après la commande dans le chat.",
    '',
  );
  return lines.join('\n');
}

export function copilotInstructionsBlock(cfg: OrbithConfig): string {
  return [
    '# Orbith',
    'Ce projet utilise Orbith. Règles permanentes (à lire et à appliquer) :',
    ...RULES.map((r) => `- [${r}](../.orbith/rules/${r}.md)`),
    `- Référentiel technique (CSR) : [${cfg.csr.fichier}](../${cfg.csr.fichier})`,
    '- Contexte projet (conventions, patterns, pièges) : [contexte-projet](../.orbith/contexte-projet.md)',
  ].join('\n');
}

export const copilot: Adapter = {
  id: 'copilot',
  nom: 'GitHub Copilot',
  async generate(root, cfg) {
    const written: string[] = [];
    await ensureContexteProjet(root);
    for (const agent of await agentsDuProjet(root)) {
      written.push(await writeIfChanged(root, `.github/prompts/${agent.claude}.prompt.md`, promptMd(agent)));
    }
    written.push(
      await upsertBlockFile(
        root,
        '.github/copilot-instructions.md',
        '<!-- orbith:debut -->',
        '<!-- orbith:fin -->',
        copilotInstructionsBlock(cfg),
      ),
    );
    return written;
  },
};
