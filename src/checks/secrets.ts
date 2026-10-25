import { promises as fs } from 'node:fs';
import path from 'node:path';
import { gitLsFiles } from '../core/index.js';
import type { CheckContext, CheckResult } from './types.js';

const MAX_SIZE = 1024 * 1024;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);
const SKIP_FILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']);

interface Pattern {
  nom: string;
  re: RegExp;
  /** Index du groupe contenant la valeur secrète (0 = match complet). */
  groupe: number;
}

const PATTERNS: Pattern[] = [
  { nom: 'clé d\'accès AWS', re: /\b(AKIA[0-9A-Z]{16})\b/, groupe: 1 },
  { nom: 'clé privée', re: /(-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----)/, groupe: 1 },
  { nom: 'jeton GitHub', re: /\b(gh[pousr]_[A-Za-z0-9]{36,})\b/, groupe: 1 },
  { nom: 'mot de passe en dur', re: /password\s*=\s*['"]([^'"]+)['"]/i, groupe: 1 },
  {
    nom: 'jeton ou clé d\'API générique',
    re: /(?:api[_-]?key|secret|token|access[_-]?key)\w*['"]?\s*[:=]\s*['"]([A-Za-z0-9_\-./+=]{20,})['"]/i,
    groupe: 1,
  },
];

/** Valeurs d'exemple ou références à une variable : pas un vrai secret. */
export function isPlaceholder(value: string): boolean {
  const v = value.trim();
  if (/^[$<{%[]/.test(v) || /\$\{|\{\{|process\.env|os\.environ|getenv/i.test(v)) return true;
  if (/^(x+|\*+|\.+|_+|-+)$/i.test(v)) return true;
  return /^(changeme|change-me|example|exemple|todo|redacted|dummy|motdepasse|password|secret|ton[-_ ].*|votre[-_ ].*|your[-_ ].*)$/i.test(v);
}

export function mask(value: string): string {
  const v = value.trim();
  if (v.length <= 8) return '****';
  return v.slice(0, 4) + '****';
}

async function walk(root: string, dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) await walk(root, path.join(dir, e.name), out);
    } else if (e.isFile()) {
      out.push(path.relative(root, path.join(dir, e.name)).split(path.sep).join('/'));
    }
  }
}

function isEnvFile(rel: string): boolean {
  const b = path.posix.basename(rel);
  return (b === '.env' || b.startsWith('.env.')) && !/\.(example|sample|template|dist)$/.test(b);
}

export async function run(ctx: CheckContext): Promise<CheckResult[]> {
  const res: CheckResult[] = [];
  let files = await gitLsFiles(ctx.root);
  if (!files || files.length === 0) {
    files = [];
    await walk(ctx.root, ctx.root, files);
  }
  files = files.filter((f) => !f.split('/').some((p) => SKIP_DIRS.has(p)) && !SKIP_FILES.has(path.posix.basename(f)));
  for (const rel of files) {
    if (isEnvFile(rel)) {
      res.push({
        categorie: 'secrets',
        niveau: 'erreur',
        message: `Fichier d'environnement versionné (${path.posix.basename(rel)}) : il peut contenir des secrets. Retire-le du dépôt et ajoute-le au .gitignore.`,
        fichier: rel,
      });
    }
    const abs = path.join(ctx.root, rel);
    let buf: Buffer;
    try {
      const st = await fs.stat(abs);
      if (!st.isFile() || st.size > MAX_SIZE) continue;
      buf = await fs.readFile(abs);
    } catch {
      continue;
    }
    if (buf.subarray(0, 8000).includes(0)) continue;
    const lines = buf.toString('utf8').split(/\r?\n/);
    for (const p of PATTERNS) {
      for (let i = 0; i < lines.length; i++) {
        const m = p.re.exec(lines[i]!);
        if (!m) continue;
        if (p.groupe > 0 && p.nom !== 'clé d\'accès AWS' && p.nom !== 'jeton GitHub' && isPlaceholder(m[p.groupe] ?? '')) continue;
        res.push({
          categorie: 'secrets',
          niveau: 'erreur',
          message: `Secret potentiel (${p.nom}) ligne ${i + 1} : ${mask(m[p.groupe] ?? m[0])}`,
          fichier: rel,
        });
        break;
      }
    }
  }
  return res;
}
