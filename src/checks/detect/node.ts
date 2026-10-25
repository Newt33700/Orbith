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

export async function detectNode(root: string): Promise<LangDetection> {
  const out: LangDetection = { runtimes: [], dependances: [] };
  const pkgRaw = await read(path.join(root, 'package.json'));
  let hasNode = false;
  if (pkgRaw) {
    hasNode = true;
    try {
      const pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
      const engines = pkg['engines'] as { node?: string } | undefined;
      const v = engines?.node ? firstVersion(engines.node) : undefined;
      out.runtimes.push({ runtime: 'node', ...(v ? { version: v } : {}), source: 'package.json' });
      for (const k of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
        const deps = pkg[k] as Record<string, string> | undefined;
        for (const nom of Object.keys(deps ?? {})) out.dependances.push({ nom, source: 'package.json' });
      }
    } catch {
      // package.json illisible : ignoré
    }
  }
  for (const f of ['.nvmrc', '.node-version']) {
    const raw = await read(path.join(root, f));
    if (raw === null) continue;
    hasNode = true;
    const v = firstVersion(raw);
    if (v) out.runtimes.push({ runtime: 'node', version: v, source: f });
  }
  if (hasNode && out.runtimes.length === 0) out.runtimes.push({ runtime: 'node', source: 'package.json' });
  return out;
}
