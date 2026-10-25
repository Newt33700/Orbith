/**
 * Lecture des compteurs de jetons réels laissés localement par les outils d'IA.
 *
 * Seul le format de Claude Code est pris en charge : transcriptions JSONL (une ligne JSON par événement) sous
 * `~/.claude/projects/<dossier>/<session>.jsonl` (et `<session>/subagents/agent-*.jsonl` pour les sous-agents).
 * Les lignes `type: "assistant"` portent `message.model`, `message.id` et `message.usage` (objet `usage` de l'API
 * Messages d'Anthropic : `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`,
 * éventuellement `cache_creation.ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens`).
 * Une même réponse est écrite sur plusieurs lignes (une par bloc de contenu) avec le même `message.id` et le même
 * `usage` : on ne la compte qu'une fois.
 *
 * Confidentialité : seuls les compteurs, le modèle, l'identifiant de session et l'horodatage sont lus.
 * Le contenu des messages n'est jamais lu ni recopié.
 */

export interface PrixModele {
  entree: number;
  sortie: number;
  /** Facultatif : prix par million de jetons lus depuis le cache. Défaut : 0,1 × entree. */
  cache_lecture?: number;
  /** Facultatif : prix par million de jetons écrits dans le cache. Défaut : 1,25 × entree (5 min), 2 × entree (1 h). */
  cache_ecriture?: number;
}

export interface Consommation {
  session: string;
  modele: string;
  /** Horodatages ISO du premier et du dernier appel compté. */
  du: string;
  au: string;
  appels: number;
  entree: number;
  sortie: number;
  cacheLecture: number;
  cacheEcriture5m: number;
  cacheEcriture1h: number;
}

export interface FiltreImport {
  /** Ne compte que les appels strictement postérieurs à cet horodatage, par session (imports précédents). */
  dejaImporteJusqua?: Map<string, string>;
  /** AAAA-MM-JJ : ne compte que les appels de ce jour ou après. */
  depuis?: string;
  /** Préfixe d'identifiant de session. */
  session?: string;
}

const entier = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/**
 * Agrège les appels d'un ou plusieurs fichiers JSONL de Claude Code, par (session, modèle).
 * `vus` déduplique les réponses entre fichiers (reprise de session, sous-agents).
 */
export function lireTranscriptionsClaude(
  contenus: string[],
  filtre: FiltreImport = {},
  vus: Set<string> = new Set(),
): Consommation[] {
  const parCle = new Map<string, Consommation>();
  for (const contenu of contenus) {
    for (const ligne of contenu.split(/\r?\n/)) {
      if (!ligne.trim()) continue;
      let o: Record<string, unknown>;
      try {
        o = JSON.parse(ligne) as Record<string, unknown>;
      } catch {
        continue; // ligne tronquée (fichier en cours d'écriture) : ignorée
      }
      if (o['type'] !== 'assistant') continue;
      const m = o['message'] as Record<string, unknown> | undefined;
      if (!m || typeof m !== 'object') continue;
      const u = m['usage'] as Record<string, unknown> | undefined;
      const modele = m['model'];
      if (!u || typeof u !== 'object' || typeof modele !== 'string' || !modele || modele === '<synthetic>') continue;
      const session = typeof o['sessionId'] === 'string' ? o['sessionId'] : '';
      const ts = typeof o['timestamp'] === 'string' ? o['timestamp'] : '';
      if (!session || !ts || Number.isNaN(Date.parse(ts))) continue;
      if (filtre.session && !session.startsWith(filtre.session)) continue;
      if (filtre.depuis && ts.slice(0, 10) < filtre.depuis) continue;
      const borne = filtre.dejaImporteJusqua?.get(session);
      if (borne && Date.parse(ts) <= Date.parse(borne)) continue;
      const id = typeof m['id'] === 'string' ? m['id'] : typeof o['requestId'] === 'string' ? o['requestId'] : typeof o['uuid'] === 'string' ? o['uuid'] : '';
      if (id) {
        if (vus.has(id)) continue;
        vus.add(id);
      }

      const creation = entier(u['cache_creation_input_tokens']);
      const detail = u['cache_creation'] as Record<string, unknown> | undefined;
      let c1h = 0;
      let c5m = creation;
      if (detail && typeof detail === 'object') {
        c1h = entier(detail['ephemeral_1h_input_tokens']);
        c5m = entier(detail['ephemeral_5m_input_tokens']);
        // Détail incohérent avec le total : on se fie au total (compté en écriture 5 min).
        if (c1h + c5m !== creation) {
          c1h = 0;
          c5m = creation;
        }
      }
      const cle = `${session}\u0000${modele}`;
      const c = parCle.get(cle) ?? {
        session, modele, du: ts, au: ts, appels: 0, entree: 0, sortie: 0, cacheLecture: 0, cacheEcriture5m: 0, cacheEcriture1h: 0,
      };
      c.appels++;
      c.entree += entier(u['input_tokens']);
      c.sortie += entier(u['output_tokens']);
      c.cacheLecture += entier(u['cache_read_input_tokens']);
      c.cacheEcriture5m += c5m;
      c.cacheEcriture1h += c1h;
      if (Date.parse(ts) < Date.parse(c.du)) c.du = ts;
      if (Date.parse(ts) > Date.parse(c.au)) c.au = ts;
      parCle.set(cle, c);
    }
  }
  return [...parCle.values()].sort((a, b) => a.du.localeCompare(b.du) || a.modele.localeCompare(b.modele));
}

/**
 * Prix applicable à un modèle : clé exacte, sinon la plus longue clé dont le nom du modèle commence
 * (par exemple `claude-sonnet` pour `claude-sonnet-5-5`), sinon `defaut`, sinon null.
 */
export function prixPour(modele: string, prix: Record<string, unknown>): { cle: string; prix: PrixModele } | null {
  const valide = (p: unknown): p is PrixModele =>
    !!p && typeof p === 'object' && typeof (p as PrixModele).entree === 'number' && typeof (p as PrixModele).sortie === 'number';
  const m = modele.toLowerCase();
  if (valide(prix[modele])) return { cle: modele, prix: prix[modele] };
  const candidates = Object.keys(prix)
    .filter((k) => k !== 'defaut' && m.startsWith(k.toLowerCase()) && valide(prix[k]))
    .sort((a, b) => b.length - a.length);
  if (candidates[0]) return { cle: candidates[0], prix: prix[candidates[0]] as PrixModele };
  if (valide(prix['defaut'])) return { cle: 'defaut', prix: prix['defaut'] };
  return null;
}

/** Coût (arrondi à 2 décimales) d'une consommation mesurée. */
export function coutConsommation(c: Consommation, p: PrixModele): number {
  const lecture = p.cache_lecture ?? p.entree * 0.1;
  const e5 = p.cache_ecriture ?? p.entree * 1.25;
  const e1 = p.cache_ecriture ?? p.entree * 2;
  const total =
    (c.entree * p.entree + c.sortie * p.sortie + c.cacheLecture * lecture + c.cacheEcriture5m * e5 + c.cacheEcriture1h * e1) / 1_000_000;
  return Math.round(total * 100) / 100;
}
