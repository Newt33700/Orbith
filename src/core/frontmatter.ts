import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export interface Doc {
  data: Record<string, unknown>;
  body: string;
}

// YAML 1.2 (paquet `yaml`) : une date comme `2026-10-25` reste du texte au lieu de devenir un objet Date
// réécrit en `2026-10-25T00:00:00.000Z` par js-yaml. Pas de retour à la ligne automatique des longs titres.
const OPTIONS = {
  engines: {
    yaml: {
      parse: (s: string): object => (parseYaml(s) ?? {}) as object,
      stringify: (d: object): string => stringifyYaml(d, { lineWidth: 0 }),
    },
  },
};

export async function readDoc(file: string): Promise<Doc> {
  // CRLF (Windows) normalisé : gray-matter laisse sinon un \r en fin de valeur YAML.
  const raw = (await fs.readFile(file, 'utf8')).replace(/\r\n/g, '\n');
  // Options fournies : désactive aussi le cache interne de gray-matter (il partage les objets `data` entre appels).
  const parsed = matter(raw, OPTIONS);
  return { data: (parsed.data ?? {}) as Record<string, unknown>, body: parsed.content };
}

export async function writeDoc(file: string, doc: Doc): Promise<void> {
  const out = Object.keys(doc.data).length > 0 ? matter.stringify(doc.body, doc.data, OPTIONS) : doc.body;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, out, 'utf8');
}
