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

function pipName(spec: string): string | null {
  const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(spec);
  return m ? m[1]!.toLowerCase().replace(/_/g, '-') : null;
}

export async function detectPython(root: string): Promise<LangDetection> {
  const out: LangDetection = { runtimes: [], dependances: [] };
  const py = await read(path.join(root, 'pyproject.toml'));
  if (py !== null) {
    const rp = /requires-python\s*=\s*['"]([^'"]+)['"]/.exec(py);
    const v = rp ? firstVersion(rp[1]!) : undefined;
    out.runtimes.push({ runtime: 'python', ...(v ? { version: v } : {}), source: 'pyproject.toml' });
    const arr = /^dependencies\s*=\s*\[([\s\S]*?)\]/m.exec(py);
    if (arr) {
      for (const s of arr[1]!.matchAll(/['"]([^'"]+)['"]/g)) {
        const nom = pipName(s[1]!);
        if (nom) out.dependances.push({ nom, source: 'pyproject.toml' });
      }
    }
    const poetry = /\[tool\.poetry\.dependencies\]([\s\S]*?)(?:\n\[|$)/.exec(py);
    if (poetry) {
      for (const l of poetry[1]!.split(/\r?\n/)) {
        const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*=/.exec(l);
        if (m && m[1]!.toLowerCase() !== 'python') {
          out.dependances.push({ nom: m[1]!.toLowerCase().replace(/_/g, '-'), source: 'pyproject.toml' });
        }
      }
    }
  }
  const pv = await read(path.join(root, '.python-version'));
  if (pv !== null) {
    const v = firstVersion(pv);
    out.runtimes.push({ runtime: 'python', ...(v ? { version: v } : {}), source: '.python-version' });
  }
  let files: string[] = [];
  try {
    files = (await fs.readdir(root)).filter((f) => /^requirements.*\.txt$/.test(f));
  } catch {
    // dossier illisible
  }
  for (const f of files) {
    const raw = await read(path.join(root, f));
    if (raw === null) continue;
    if (out.runtimes.length === 0) out.runtimes.push({ runtime: 'python', source: f });
    for (const l of raw.split(/\r?\n/)) {
      const t = l.trim();
      if (!t || t.startsWith('#') || t.startsWith('-')) continue;
      const nom = pipName(t);
      if (nom) out.dependances.push({ nom, source: f });
    }
  }
  return out;
}
