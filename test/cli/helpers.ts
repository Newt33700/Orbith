import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function makeProject(piste = 'evolution', git = false): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'orbith-cli-'));
  await mkdir(path.join(root, '.orbith'), { recursive: true });
  await writeFile(
    path.join(root, '.orbith', 'config.yaml'),
    `version: 1\norbith_version: 0.1.0\nprojet:\n  nom: demo\nplateformes: [gemini, claude]\npiste: ${piste}\nbacklog:\n  prefixe: US\n`,
  );
  if (git) {
    const g = (...a: string[]) => execFileSync('git', a, { cwd: root, stdio: 'ignore' });
    g('init', '-q');
    g('config', 'user.name', 'Jane Doe');
    g('config', 'user.email', 'jane@corp.fr');
    g('config', 'commit.gpgsign', 'false');
  }
  return root;
}

export async function put(root: string, rel: string, content: string): Promise<string> {
  const f = path.join(root, rel);
  await mkdir(path.dirname(f), { recursive: true });
  await writeFile(f, content, 'utf8');
  return f;
}

export function commit(root: string, msg: string): void {
  execFileSync('git', ['add', '-A'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['commit', '-q', '-m', msg, '--allow-empty'], { cwd: root, stdio: 'ignore' });
}

export const GHERKIN = "## Critères d'acceptation\n\n```gherkin\nScénario: ok\n  Étant donné a\n  Quand b\n  Alors c\n```\n";
