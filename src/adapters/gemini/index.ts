import type { Adapter } from '../index.js';
import { AGENTS, GEMINI_IGNORE, RULES } from '../agents.js';
import { upsertBlockFile, writeIfChanged } from '../blocks.js';

const tomlEscape = (s: string): string => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export function commandToml(agent: (typeof AGENTS)[number]): string {
  const lines = [`description = "${tomlEscape(agent.description)}"`, 'prompt = """'];
  if (agent.key === 'guide') {
    lines.push('Voici l\'état actuel du projet (résultat de `npx orbith next`) :', '', '!{npx orbith next}', '');
  }
  lines.push(`@{.orbith/${agent.file}}`, '', 'Demande de l\'utilisateur : {{args}}', '"""', '');
  return lines.join('\n');
}

export function geminiMdBlock(): string {
  return [
    '# Orbith',
    'Ce projet utilise Orbith. Règles permanentes :',
    ...RULES.map((r) => `@.orbith/rules/${r}.md`),
    'Référentiel technique (CSR) : @.orbith/csr/CSR.md',
  ].join('\n');
}

export const gemini: Adapter = {
  id: 'gemini',
  nom: 'Gemini CLI',
  async generate(root) {
    const written: string[] = [];
    for (const agent of AGENTS) {
      const name = agent.gemini.split(':')[1] as string;
      written.push(await writeIfChanged(root, `.gemini/commands/orbith/${name}.toml`, commandToml(agent)));
    }
    written.push(await upsertBlockFile(root, 'GEMINI.md', '<!-- orbith:debut -->', '<!-- orbith:fin -->', geminiMdBlock()));
    written.push(
      await upsertBlockFile(
        root,
        '.geminiignore',
        '# orbith:debut',
        '# orbith:fin',
        ['# Secrets : jamais lus par l\'agent', ...GEMINI_IGNORE].join('\n'),
      ),
    );
    return written;
  },
};
