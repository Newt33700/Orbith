import { promises as fs } from 'node:fs';
import path from 'node:path';

export type Ecosysteme = 'npm' | 'maven' | 'pypi';

export interface Composant {
  ecosysteme: Ecosysteme;
  /** Maven : groupId. npm : scope sans « @ » si présent (le nom complet reste dans `nom`). */
  groupe?: string;
  /** npm : nom complet (« @scope/nom »). Maven : artifactId. PyPI : nom normalisé. */
  nom: string;
  version?: string;
  /** Expression SPDX ou texte libre déclaré par le composant, si connu. */
  licence?: string;
  /** required = dépendance d'exécution ; optional = dev / test / provided. */
  portee: 'required' | 'optional';
  /** Fichier du projet dont le composant est issu. */
  source: string;
  /** Package URL (https://github.com/package-url/purl-spec). */
  purl: string;
}

async function read(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return null;
  }
}

function enc(s: string): string {
  return encodeURIComponent(s).replace(/%40/g, '@').replace(/%2F/gi, '/');
}

function purlNpm(nom: string, version?: string): string {
  const base = nom.startsWith('@') ? `%40${enc(nom.slice(1))}` : enc(nom);
  return `pkg:npm/${base}${version ? `@${enc(version)}` : ''}`;
}

function licenceTexte(l: unknown): string | undefined {
  if (typeof l === 'string' && l.trim()) return l.trim();
  if (l && typeof l === 'object') {
    const t = (l as { type?: unknown }).type;
    if (typeof t === 'string' && t.trim()) return t.trim();
  }
  if (Array.isArray(l)) {
    const parts = l.map(licenceTexte).filter((x): x is string => !!x);
    if (parts.length) return parts.join(' OR ');
  }
  return undefined;
}

/** Version « propre » d'une contrainte semver (« ^1.2.3 » → « 1.2.3 ») ; la contrainte brute sinon. */
function versionDeclaree(spec: string): string {
  const m = /^[\s^~=v<>]*(\d+(?:\.\d+){0,2}(?:[-+][0-9A-Za-z.-]+)?)\s*$/.exec(spec);
  return m ? m[1]! : spec.trim();
}

interface LockPkg {
  version?: string;
  license?: unknown;
  dev?: boolean;
  optional?: boolean;
  link?: boolean;
  dependencies?: Record<string, LockPkg>;
}

function npmComposant(nom: string, version: string | undefined, licence: unknown, dev: boolean, source: string): Composant {
  const lic = licenceTexte(licence);
  return {
    ecosysteme: 'npm',
    ...(nom.startsWith('@') ? { groupe: nom.slice(1, nom.indexOf('/')) } : {}),
    nom,
    ...(version ? { version } : {}),
    ...(lic ? { licence: lic } : {}),
    portee: dev ? 'optional' : 'required',
    source,
    purl: purlNpm(nom, version),
  };
}

async function collecteNode(root: string): Promise<Composant[]> {
  const out: Composant[] = [];
  const pkgRaw = await read(path.join(root, 'package.json'));
  const lockRaw = await read(path.join(root, 'package-lock.json'));
  if (lockRaw !== null) {
    try {
      const lock = JSON.parse(lockRaw) as { packages?: Record<string, LockPkg>; dependencies?: Record<string, LockPkg> };
      if (lock.packages) {
        for (const [key, p] of Object.entries(lock.packages)) {
          if (!key || p.link || !p.version) continue;
          const nom = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
          out.push(npmComposant(nom, p.version, p.license, p.dev === true, 'package-lock.json'));
        }
      } else if (lock.dependencies) {
        const walk = (deps: Record<string, LockPkg>): void => {
          for (const [nom, p] of Object.entries(deps)) {
            if (p.version) out.push(npmComposant(nom, p.version, p.license, p.dev === true, 'package-lock.json'));
            if (p.dependencies) walk(p.dependencies);
          }
        };
        walk(lock.dependencies);
      }
      if (out.length > 0) return out;
    } catch {
      // lock illisible : repli sur package.json
    }
  }
  if (pkgRaw !== null) {
    try {
      const pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
      for (const [champ, dev] of [['dependencies', false], ['optionalDependencies', false], ['devDependencies', true]] as const) {
        const deps = pkg[champ];
        if (!deps || typeof deps !== 'object') continue;
        for (const [nom, spec] of Object.entries(deps as Record<string, unknown>)) {
          out.push(npmComposant(nom, typeof spec === 'string' ? versionDeclaree(spec) : undefined, undefined, dev, 'package.json'));
        }
      }
    } catch {
      // package.json illisible : ignoré
    }
  }
  return out;
}

function sansCommentairesXml(xml: string): string {
  return xml.replace(/<!--[\s\S]*?-->/g, '');
}

function balise(bloc: string, nom: string): string | undefined {
  const m = new RegExp(`<${nom}>\\s*([^<]*?)\\s*</${nom}>`).exec(bloc);
  return m && m[1] ? m[1] : undefined;
}

async function collecteMaven(root: string): Promise<Composant[]> {
  const raw = await read(path.join(root, 'pom.xml'));
  if (raw === null) return [];
  const xml = sansCommentairesXml(raw);
  const props: Record<string, string> = {};
  const pb = /<properties>([\s\S]*?)<\/properties>/.exec(xml);
  if (pb) for (const m of pb[1]!.matchAll(/<([A-Za-z0-9_.-]+)>\s*([^<]*?)\s*<\/\1>/g)) props[m[1]!] = m[2]!;
  const projetVersion = balise(xml.replace(/<parent>[\s\S]*?<\/parent>/, ''), 'version');
  if (projetVersion) props['project.version'] = projetVersion;
  const resolu = (v: string | undefined): string | undefined =>
    v?.replace(/\$\{([^}]+)\}/g, (all, k: string) => props[k] ?? all);
  // Hors dépendances du projet : gestion de versions, plugins de build, parent.
  const corps = xml
    .replace(/<dependencyManagement>[\s\S]*?<\/dependencyManagement>/g, '')
    .replace(/<build>[\s\S]*?<\/build>/g, '')
    .replace(/<profiles>[\s\S]*?<\/profiles>/g, '');
  const out: Composant[] = [];
  for (const m of corps.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
    const groupe = resolu(balise(m[1]!, 'groupId'));
    const nom = resolu(balise(m[1]!, 'artifactId'));
    if (!groupe || !nom) continue;
    const version = resolu(balise(m[1]!, 'version'));
    const scope = balise(m[1]!, 'scope');
    out.push({
      ecosysteme: 'maven',
      groupe,
      nom,
      ...(version ? { version } : {}),
      portee: scope === 'test' || scope === 'provided' ? 'optional' : 'required',
      source: 'pom.xml',
      purl: `pkg:maven/${enc(groupe)}/${enc(nom)}${version ? `@${enc(version)}` : ''}`,
    });
  }
  return out;
}

function pyComposant(spec: string, source: string, dev: boolean): Composant | null {
  const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*(.*)$/.exec(spec);
  if (!m) return null;
  const nom = m[1]!.toLowerCase().replace(/[_.]+/g, '-');
  const v = /^={2,3}\s*([^\s,;]+)/.exec(m[2]!);
  const version = v ? v[1] : undefined;
  return {
    ecosysteme: 'pypi',
    nom,
    ...(version ? { version } : {}),
    portee: dev ? 'optional' : 'required',
    source,
    purl: `pkg:pypi/${enc(nom)}${version ? `@${enc(version)}` : ''}`,
  };
}

async function collectePython(root: string): Promise<Composant[]> {
  const out: Composant[] = [];
  const add = (c: Composant | null): void => {
    if (c) out.push(c);
  };
  const py = await read(path.join(root, 'pyproject.toml'));
  if (py !== null) {
    const arr = /^dependencies\s*=\s*\[([\s\S]*?)\]/m.exec(py);
    if (arr) for (const s of arr[1]!.matchAll(/['"]([^'"]+)['"]/g)) add(pyComposant(s[1]!, 'pyproject.toml', false));
    const poetry = /\[tool\.poetry\.dependencies\]([\s\S]*?)(?:\n\[|$)/.exec(py);
    if (poetry) {
      for (const l of poetry[1]!.split(/\r?\n/)) {
        const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*=\s*(?:['"]([^'"]*)['"]|\{[^}]*version\s*=\s*['"]([^'"]*)['"])/.exec(l);
        if (!m || m[1]!.toLowerCase() === 'python') continue;
        const spec = m[2] ?? m[3] ?? '';
        const exact = /^=*\s*(\d[^\s,]*)$/.exec(spec);
        add(pyComposant(`${m[1]!}${exact && !/^[\^~]/.test(spec) ? `==${exact[1]}` : ''}`, 'pyproject.toml', false));
      }
    }
  }
  let files: string[] = [];
  try {
    files = (await fs.readdir(root)).filter((f) => /^requirements.*\.txt$/.test(f)).sort();
  } catch {
    // dossier illisible
  }
  for (const f of files) {
    const raw = await read(path.join(root, f));
    if (raw === null) continue;
    const dev = /dev|test/i.test(f);
    for (const l of raw.split(/\r?\n/)) {
      const t = l.replace(/\s+#.*$/, '').trim();
      if (!t || t.startsWith('#') || t.startsWith('-')) continue;
      add(pyComposant(t, f, dev));
    }
  }
  return out;
}

/** Inventaire déterministe des composants du projet (même entrée = même sortie, triée par purl). */
export async function collecterComposants(root: string): Promise<Composant[]> {
  const tous = [...(await collecteNode(root)), ...(await collecteMaven(root)), ...(await collectePython(root))];
  const parPurl = new Map<string, Composant>();
  for (const c of tous) {
    const existant = parPurl.get(c.purl);
    if (!existant) parPurl.set(c.purl, c);
    else {
      // Même composant vu plusieurs fois : exécution > dev, licence connue conservée.
      if (c.portee === 'required') existant.portee = 'required';
      if (!existant.licence && c.licence) existant.licence = c.licence;
    }
  }
  return [...parPurl.values()].sort((a, b) => (a.purl < b.purl ? -1 : a.purl > b.purl ? 1 : 0));
}
