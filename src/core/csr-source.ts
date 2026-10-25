import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCsr } from '../checks/csr-parser.js';
import type { OrbithConfig } from './config.js';
import { OrbithError } from './errors.js';
import { exists } from './fsutil.js';

export interface SyncResult {
  source: string;
  /** Chemin du CSR local, relatif à la racine du projet (séparateurs `/`). */
  fichier: string;
  /** Le contenu du CSR local a changé. */
  change: boolean;
  /** Nombre d'outils du CSR synchronisé. */
  outils: number;
}

export type ParsedSource =
  | { kind: 'local'; path: string }
  | { kind: 'url'; url: string }
  | { kind: 'git'; repo: string; ref?: string; file: string };

/** Masque les identifiants éventuels (`https://user:jeton@hôte`) avant affichage. */
export function masquer(s: string): string {
  return s.replace(/(\/\/)[^/@\s]+@/g, '$1***@');
}

export function parseSource(source: string): ParsedSource {
  const s = source.trim();
  if (!s) throw new OrbithError('La source du CSR est vide.');
  if (/^git\+/i.test(s)) {
    const rest = s.slice(4);
    const hash = rest.indexOf('#');
    if (hash < 0 || hash === rest.length - 1) {
      throw new OrbithError(
        `Source CSR « ${masquer(s)} » incomplète : indique le fichier après « # », par exemple git+https://hote/groupe/depot.git#csr/CSR.md`,
      );
    }
    let repo = rest.slice(0, hash);
    const file = rest.slice(hash + 1).replace(/\\/g, '/');
    if (path.posix.isAbsolute(file) || /^[a-z]:/i.test(file) || file.split('/').includes('..')) {
      throw new OrbithError(`Chemin de fichier invalide dans la source CSR : « ${file} » (chemin relatif au dépôt attendu).`);
    }
    let ref: string | undefined;
    const schemeEnd = repo.indexOf('://');
    const lastSlash = repo.lastIndexOf('/');
    if (schemeEnd >= 0 && lastSlash > schemeEnd + 2) {
      const at = repo.indexOf('@', lastSlash);
      if (at >= 0) {
        ref = repo.slice(at + 1);
        repo = repo.slice(0, at);
      }
    }
    if (ref !== undefined && (!ref || ref.startsWith('-'))) {
      throw new OrbithError(`Référence Git invalide dans la source CSR : « ${ref} ».`);
    }
    if (!repo || repo.startsWith('-')) throw new OrbithError('URL du dépôt Git invalide dans la source CSR.');
    return { kind: 'git', repo, ...(ref ? { ref } : {}), file };
  }
  if (/^https:\/\//i.test(s)) return { kind: 'url', url: s };
  if (/^http:\/\//i.test(s)) {
    throw new OrbithError('Source CSR en http:// refusée : utilise https:// (ou git+https / git+ssh).');
  }
  return { kind: 'local', path: s };
}

function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd,
        timeout: 120_000,
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      },
      (err, out, stderr) => {
        if (!err) return resolve(out);
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          return reject(new OrbithError("git est introuvable : installe Git pour utiliser une source CSR de type git+…"));
        }
        const detail = masquer(String(stderr).trim().split(/\r?\n/).filter(Boolean).slice(-2).join(' '));
        reject(new OrbithError(`Échec du clonage Git de la source CSR${detail ? ` : ${detail}` : ''}. Vérifie l'URL, la référence et tes accès (identifiants Git habituels).`));
      },
    );
  });
}

async function fromGit(src: Extract<ParsedSource, { kind: 'git' }>): Promise<string> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'orbith-csr-'));
  try {
    const dest = path.join(tmp, 'repo');
    const args = ['clone', '--depth', '1', '--quiet', '--no-checkout'];
    if (src.ref) args.push('--branch', src.ref);
    args.push('--', src.repo, dest);
    await git(args, tmp);
    // Lecture du blob tel que versionné : aucune conversion de fins de ligne (autocrlf, .gitattributes).
    try {
      return await git(['show', `HEAD:${src.file}`], dest);
    } catch {
      throw new OrbithError(`Fichier « ${src.file} » introuvable dans le dépôt ${masquer(src.repo)}.`);
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  }
}

async function fromUrl(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'follow' });
  } catch (e) {
    throw new OrbithError(`Impossible de télécharger le CSR (${masquer(url)}) : ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) throw new OrbithError(`Impossible de télécharger le CSR (${masquer(url)}) : HTTP ${res.status}.`);
  return res.text();
}

async function fromLocal(root: string, p: string): Promise<string> {
  const abs = path.resolve(root, p);
  try {
    return await fs.readFile(abs, 'utf8');
  } catch {
    throw new OrbithError(`Fichier CSR source introuvable : ${abs}`);
  }
}

export async function fetchSource(root: string, source: string): Promise<string> {
  const src = parseSource(source);
  if (src.kind === 'git') return fromGit(src);
  if (src.kind === 'url') return fromUrl(src.url);
  return fromLocal(root, src.path);
}

/** Récupère le CSR depuis `csr.source` et remplace le fichier local s'il est valide. */
export async function syncCsr(root: string, cfg: OrbithConfig): Promise<SyncResult> {
  const source = cfg.csr.source;
  if (!source) {
    throw new OrbithError("Aucune source CSR configurée : renseigne `csr.source` dans .orbith/config.yaml (ou lance `orbith install --csr-source <source>`).");
  }
  const content = (await fetchSource(root, source)).replace(/^﻿/, '');
  const outils = parseCsr(content).length;
  if (outils === 0) {
    throw new OrbithError(
      `Le CSR récupéré depuis ${masquer(source)} est invalide : aucun outil reconnu (tableaux Markdown avec une colonne « Outil » attendus). Le CSR local est conservé.`,
    );
  }
  const abs = path.resolve(root, cfg.csr.fichier);
  const fichier = path.relative(root, abs).split(path.sep).join('/');
  const ancien = (await exists(abs)) ? await fs.readFile(abs, 'utf8') : null;
  const change = ancien === null || ancien.replace(/\r\n/g, '\n') !== content.replace(/\r\n/g, '\n');
  if (change) {
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, 'utf8');
  }
  return { source, fichier, change, outils };
}
