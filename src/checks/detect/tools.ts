import { promises as fs } from 'node:fs';
import path from 'node:path';
import { normalize } from '../csr-parser.js';
import type { DetectedTool } from './types.js';

/** Clé de comparaison d'un nom d'outil : « GitLab CI », « gitlab-ci » et « GitLabCI » donnent la même clé. */
export function toolKey(name: string): string {
  return normalize(name).replace(/[^a-z0-9]/g, '');
}

interface ToolDef {
  id: string;
  /** Clés (voir toolKey) sous lesquelles le CSR peut nommer cet outil. */
  aliases: string[];
  /** Fichiers de la racine du projet qui prouvent sa présence. */
  files: RegExp[];
  /** Dossiers (chemins POSIX relatifs à la racine) qui prouvent sa présence. */
  dirs?: string[];
}

export const TOOLS: ToolDef[] = [
  { id: 'GitLab CI', aliases: ['gitlabci', 'gitlab'], files: [/^\.gitlab-ci\.ya?ml$/] },
  { id: 'GitHub Actions', aliases: ['githubactions'], files: [], dirs: ['.github/workflows'] },
  { id: 'Jenkins', aliases: ['jenkins', 'jenkinsci'], files: [/^Jenkinsfile(\..+)?$/] },
  {
    id: 'Docker',
    aliases: ['docker'],
    files: [/^(Dockerfile|.+\.Dockerfile)(\..+)?$/, /^(docker-compose|compose)(\..+)?\.ya?ml$/],
  },
  { id: 'Docker Compose', aliases: ['dockercompose'], files: [/^(docker-compose|compose)(\..+)?\.ya?ml$/] },
  { id: 'SonarQube', aliases: ['sonarqube', 'sonar', 'sonarcloud'], files: [/^sonar-project\.properties$/] },
  {
    id: 'ESLint',
    aliases: ['eslint'],
    files: [/^eslint\.config\.(js|mjs|cjs|ts|mts|cts)$/, /^\.eslintrc(\.(js|cjs|mjs|json|ya?ml))?$/],
  },
  { id: 'Prettier', aliases: ['prettier'], files: [/^prettier\.config\.(js|mjs|cjs|ts|mts|cts)$/, /^\.prettierrc(\..+)?$/] },
  { id: 'Maven', aliases: ['maven', 'apachemaven', 'mvn'], files: [/^pom\.xml$/, /^mvnw(\.cmd)?$/] },
  { id: 'Gradle', aliases: ['gradle'], files: [/^(build|settings)\.gradle(\.kts)?$/, /^gradlew(\.bat)?$/] },
];

/** Vrai si Orbith sait détecter cet outil (nom tel qu'écrit dans le CSR). */
export function isDetectableTool(name: string): boolean {
  const k = toolKey(name);
  return TOOLS.some((t) => t.aliases.includes(k));
}

export async function detectTools(root: string): Promise<DetectedTool[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(root);
  } catch {
    return [];
  }
  const out: DetectedTool[] = [];
  for (const t of TOOLS) {
    const hit = entries.find((e) => t.files.some((re) => re.test(e)));
    if (hit) {
      out.push({ id: t.id, aliases: t.aliases, source: hit });
      continue;
    }
    for (const d of t.dirs ?? []) {
      try {
        if ((await fs.stat(path.join(root, ...d.split('/')))).isDirectory()) {
          out.push({ id: t.id, aliases: t.aliases, source: d });
          break;
        }
      } catch {
        // dossier absent
      }
    }
  }
  return out;
}
