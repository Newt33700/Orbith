import {
  avancement,
  cleArtifact,
  dateJour,
  enRetard,
  grapheConnaissance,
  sourceAmelioration,
  type Artifact,
  type Lien,
  type NoeudConnaissance,
} from '../core/index.js';

// Sections of `orbith trace` for continual improvement actions and the knowledge graph (`liens`).

const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

const CHAMPS: Record<Lien['champ'], string> = {
  liens: 'lien',
  cause: 'cause',
  change: 'changement',
  source_ref: 'source',
};

const sortant = (l: Lien): string => `${l.cible}${l.existe ? '' : ' (introuvable)'}${l.champ === 'liens' ? '' : ` [${CHAMPS[l.champ]}]`}`;
const entrant = (l: Lien): string => `${l.source}${l.champ === 'liens' ? '' : ` [${CHAMPS[l.champ]}]`}`;

/** « Actions d'amélioration » section (empty string when there is none). */
export function renderAmeliorations(arts: Artifact[], aujourdhui = new Date().toISOString().slice(0, 10)): string {
  const actions = arts.filter((a) => a.type === 'amelioration');
  if (actions.length === 0) return '';
  const lines = [
    '',
    "## Actions d'amélioration",
    '',
    '| Action | Titre | Source | Responsable | Échéance | Avancement | Validation |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const a of actions) {
    const src = [sourceAmelioration(a) ?? (a.data['source'] != null ? String(a.data['source']) : ''), a.data['source_ref'] != null ? String(a.data['source_ref']) : '']
      .filter(Boolean)
      .join(' ');
    const ech = dateJour(a.data['echeance']);
    lines.push(
      `| ${cell(a.id ?? a.chemin)} | ${cell(a.titre ?? '—')} | ${cell(src || '—')} | ${cell(String(a.data['responsable'] ?? '') || '—')} | ${ech ? `${ech}${enRetard(a, aujourdhui) ? ' (en retard)' : ''}` : '—'} | ${cell(avancement(a) ?? String(a.data['avancement']))} | ${cell(a.etat)} |`,
    );
  }
  return lines.join('\n') + '\n';
}

/** « Liens de connaissance » section: one row per linked artifact (empty string when no link exists). */
export function renderConnaissance(arts: Artifact[]): string {
  const noeuds = grapheConnaissance(arts);
  if (noeuds.length === 0) return '';
  const lines = [
    '',
    '## Liens de connaissance',
    '',
    'Liens déclarés dans les en-têtes (`liens`, `cause` des bugs, `change` des incidents, `source_ref` des actions).',
    '',
    '| Élément | Type | Titre | Mène à | Cité par |',
    '|---|---|---|---|---|',
  ];
  for (const n of noeuds) {
    lines.push(
      `| ${cell(n.cle)} | ${n.type} | ${cell(n.libelle)} | ${cell(n.sortants.map(sortant).join(', ') || '—')} | ${cell(n.entrants.map(entrant).join(', ') || '—')} |`,
    );
  }
  return lines.join('\n') + '\n';
}

/** Detail of one linked artifact (`orbith trace INC-002`), or undefined when the key has no link. */
export function renderDetailConnaissance(arts: Artifact[], cle: string): string | undefined {
  const art = arts.find((a) => cleArtifact(a).toLowerCase() === cle.toLowerCase());
  if (!art) return undefined;
  const n: NoeudConnaissance =
    grapheConnaissance(arts).find((x) => x.cle === cleArtifact(art)) ??
    { cle: cleArtifact(art), type: art.type, libelle: art.titre ?? cleArtifact(art), chemin: art.chemin, sortants: [], entrants: [] };
  const list = (xs: string[]): string[] => (xs.length ? xs.map((x) => `- ${x}`) : ['- aucun']);
  return (
    [
      `# ${n.cle} — ${n.libelle}`,
      '',
      `- Type : ${n.type}`,
      `- Fichier : ${n.chemin}`,
      `- Statut de validation : ${art.statut ?? 'brouillon'} (${art.etat})`,
      ...(art.type === 'amelioration' ? [`- Avancement : ${avancement(art) ?? String(art.data['avancement'])}`] : []),
      '',
      '## Mène à',
      ...list(n.sortants.map(sortant)),
      '',
      '## Cité par',
      ...list(n.entrants.map(entrant)),
    ].join('\n') + '\n'
  );
}
