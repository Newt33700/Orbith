export type CsrStatut = 'autorisé' | 'déprécié' | 'interdit';

export interface CsrEntry {
  categorie: string;
  outil: string;
  versionMin?: string;
  statut: CsrStatut;
  /** Statut « obligatoire » : autorisé et doit être présent. */
  obligatoire: boolean;
  commentaire?: string;
  /** Colonnes supplémentaires (clé = en-tête d'origine). */
  extra: Record<string, string>;
}

export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (c === '|') {
      cells.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

function isSeparator(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-');
}

type Col = 'outil' | 'version' | 'statut' | 'commentaire' | null;

function classify(header: string): Col {
  const h = normalize(header);
  if (h === 'outil' || h.startsWith('outil')) return 'outil';
  if (h.startsWith('version')) return 'version';
  if (h === 'statut' || h === 'status' || h.startsWith('statut')) return 'statut';
  if (h.startsWith('commentaire') || h === 'remarque' || h === 'remarques') return 'commentaire';
  return null;
}

function parseStatut(raw: string): { statut: CsrStatut; obligatoire: boolean } {
  const s = normalize(raw);
  if (s.startsWith('interdit')) return { statut: 'interdit', obligatoire: false };
  if (s.startsWith('deprecie') || s.startsWith('obsolete')) return { statut: 'déprécié', obligatoire: false };
  if (s.startsWith('obligatoire')) return { statut: 'autorisé', obligatoire: true };
  return { statut: 'autorisé', obligatoire: false };
}

export function parseCsr(md: string): CsrEntry[] {
  const entries: CsrEntry[] = [];
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  let categorie = '';
  let cols: Col[] | null = null;
  let headers: string[] = [];
  for (const line of lines) {
    const h = /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (h && !line.startsWith('###')) {
      categorie = h[1]!.trim();
      cols = null;
      continue;
    }
    if (!line.trim().startsWith('|')) {
      // Toute ligne hors tableau (y compris vide) termine le tableau courant.
      cols = null;
      continue;
    }
    if (isSeparator(line)) continue;
    const cells = splitRow(line);
    if (!cols) {
      const c = cells.map(classify);
      if (c.includes('outil')) {
        cols = c;
        headers = cells;
      }
      continue;
    }
    const get = (k: Col): string => {
      const i = cols!.indexOf(k);
      return i >= 0 ? (cells[i] ?? '').trim() : '';
    };
    const outil = get('outil');
    if (!outil) continue;
    const { statut, obligatoire } = parseStatut(get('statut'));
    const extra: Record<string, string> = {};
    cols.forEach((k, i) => {
      if (k === null && cells[i]) extra[headers[i] ?? `col${i}`] = cells[i]!;
    });
    const vm = get('version');
    const com = get('commentaire');
    entries.push({
      categorie,
      outil,
      ...(vm ? { versionMin: vm } : {}),
      statut,
      obligatoire,
      ...(com ? { commentaire: com } : {}),
      extra,
    });
  }
  return entries;
}

function segments(v: string): number[] {
  const m = /\d+(?:\.\d+)*/.exec(v);
  return m ? m[0].split('.').map((n) => parseInt(n, 10)) : [];
}

/** Compare deux versions pointées numériquement (22 >= 20.11). Retourne -1, 0 ou 1. */
export function compareVersions(a: string, b: string): number {
  const x = segments(a);
  const y = segments(b);
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}
