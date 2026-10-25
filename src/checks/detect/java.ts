import { promises as fs } from 'node:fs';
import path from 'node:path';
import { firstVersion, type LangDetection } from './types.js';

async function read(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return null;
  }
}

function javaVersion(raw: string): string | undefined {
  const v = firstVersion(raw);
  if (!v) return undefined;
  return v.startsWith('1.') ? v.slice(2) : v;
}

export async function detectJava(root: string): Promise<LangDetection> {
  const out: LangDetection = { runtimes: [], dependances: [] };
  const pom = await read(path.join(root, 'pom.xml'));
  if (pom !== null) {
    const m =
      /<maven\.compiler\.release>\s*([^<\s]+)\s*</.exec(pom) ??
      /<java\.version>\s*([^<\s]+)\s*</.exec(pom) ??
      /<maven\.compiler\.(?:source|target)>\s*([^<\s]+)\s*</.exec(pom);
    const v = m ? javaVersion(m[1]!) : undefined;
    out.runtimes.push({ runtime: 'java', ...(v ? { version: v } : {}), source: 'pom.xml' });
    for (const a of pom.matchAll(/<artifactId>\s*([^<\s]+)\s*<\/artifactId>/g)) {
      out.dependances.push({ nom: a[1]!, source: 'pom.xml' });
    }
  }
  for (const f of ['build.gradle', 'build.gradle.kts']) {
    const g = await read(path.join(root, f));
    if (g === null) continue;
    const m =
      /JavaLanguageVersion\.of\(\s*(\d+)\s*\)/.exec(g) ??
      /(?:sourceCompatibility|targetCompatibility)\s*=?\s*JavaVersion\.VERSION_([0-9_]+)/.exec(g) ??
      /(?:sourceCompatibility|targetCompatibility)\s*=?\s*['"]?([0-9.]+)['"]?/.exec(g) ??
      /jvmTarget\s*=\s*['"]?([0-9.]+)/.exec(g);
    const v = m ? javaVersion(m[1]!.replace(/_/g, '.')) : undefined;
    out.runtimes.push({ runtime: 'java', ...(v ? { version: v } : {}), source: f });
    for (const d of g.matchAll(/['"]([\w.-]+):([\w.-]+)(?::[^'"]*)?['"]/g)) {
      out.dependances.push({ nom: d[2]!, source: f });
    }
  }
  return out;
}
