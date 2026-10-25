import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bornesImportees, dossierClaudeParDefaut, runCoutsImporter } from '../../src/cli/couts.js';
import { coutConsommation, lireTranscriptionsClaude, prixPour } from '../../src/cli/couts-import.js';
import { runMetriques } from '../../src/cli/metriques.js';
import { runValider } from '../../src/cli/valider.js';
import { etatValidation, readDoc, scanArtifacts } from '../../src/core/index.js';
import { GHERKIN, makeProject, put } from './helpers.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const r of roots.splice(0)) await rm(r, { recursive: true, force: true });
});

const SESSION = '0f8e2c4a-1111-4222-8333-944455556666';

/**
 * Ligne de transcription au format constaté dans les fichiers de Claude Code (~/.claude/projects/…/<session>.jsonl) :
 * enveloppe `type`, `sessionId`, `timestamp`, `requestId`, et `message` (réponse de l'API Messages) avec `id`,
 * `model`, `usage`. Le contenu est volontairement factice : le parseur ne doit jamais le lire.
 */
function ligne(o: { id: string; ts: string; model?: string; input?: number; output?: number; read?: number; write5?: number; write1?: number; session?: string; bloc?: string }): string {
  const w5 = o.write5 ?? 0;
  const w1 = o.write1 ?? 0;
  return JSON.stringify({
    parentUuid: null,
    isSidechain: false,
    type: 'assistant',
    uuid: `u-${o.id}-${o.bloc ?? 'text'}`,
    timestamp: o.ts,
    sessionId: o.session ?? SESSION,
    requestId: `req_${o.id}`,
    cwd: '/projet',
    gitBranch: 'main',
    version: '2.0.0',
    message: {
      id: `msg_${o.id}`,
      type: 'message',
      role: 'assistant',
      model: o.model ?? 'claude-sonnet-5-5',
      content: [{ type: o.bloc ?? 'text', text: 'CONTENU SECRET À NE JAMAIS RECOPIER' }],
      stop_reason: 'end_turn',
      usage: {
        input_tokens: o.input ?? 0,
        cache_creation_input_tokens: w5 + w1,
        cache_read_input_tokens: o.read ?? 0,
        output_tokens: o.output ?? 0,
        cache_creation: { ephemeral_5m_input_tokens: w5, ephemeral_1h_input_tokens: w1 },
        service_tier: 'standard',
      },
    },
  });
}

const TRANSCRIPTION = [
  JSON.stringify({ type: 'user', sessionId: SESSION, timestamp: '2026-10-20T10:00:00.000Z', message: { role: 'user', content: 'secret' } }),
  // Une même réponse sur deux lignes (un bloc « thinking » puis un bloc « text ») : comptée une seule fois.
  ligne({ id: 'A', ts: '2026-10-20T10:00:05.000Z', input: 1000, output: 200, read: 0, write5: 10000, bloc: 'thinking' }),
  ligne({ id: 'A', ts: '2026-10-20T10:00:05.000Z', input: 1000, output: 200, read: 0, write5: 10000 }),
  ligne({ id: 'B', ts: '2026-10-20T10:01:00.000Z', input: 500, output: 300, read: 50000, write1: 2000 }),
  ligne({ id: 'C', ts: '2026-10-20T10:02:00.000Z', model: 'claude-opus-5-5', input: 100, output: 100 }),
  ligne({ id: 'S', ts: '2026-10-20T10:03:00.000Z', model: '<synthetic>' }),
  '{"type":"assistant","tronqué',
  '',
].join('\n');

const PRIX = { defaut: { entree: 3, sortie: 15 }, 'claude-sonnet': { entree: 3, sortie: 15 }, 'claude-opus': { entree: 15, sortie: 75 } };

describe('lecture des transcriptions Claude Code', () => {
  it('agrège par session et modèle, déduplique, ignore les lignes illisibles et synthétiques', () => {
    const c = lireTranscriptionsClaude([TRANSCRIPTION]);
    expect(c).toHaveLength(2);
    const sonnet = c.find((x) => x.modele === 'claude-sonnet-5-5')!;
    expect(sonnet).toMatchObject({ session: SESSION, appels: 2, entree: 1500, sortie: 500, cacheLecture: 50000, cacheEcriture5m: 10000, cacheEcriture1h: 2000 });
    expect(sonnet.du).toBe('2026-10-20T10:00:05.000Z');
    expect(sonnet.au).toBe('2026-10-20T10:01:00.000Z');
    expect(JSON.stringify(c)).not.toContain('SECRET');
  });

  it('déduplique entre fichiers (sous-agents, reprise) et respecte les filtres', () => {
    expect(lireTranscriptionsClaude([TRANSCRIPTION, TRANSCRIPTION]).reduce((s, x) => s + x.appels, 0)).toBe(3);
    expect(lireTranscriptionsClaude([TRANSCRIPTION], { session: 'ffff' })).toHaveLength(0);
    expect(lireTranscriptionsClaude([TRANSCRIPTION], { depuis: '2026-10-21' })).toHaveLength(0);
    const apres = lireTranscriptionsClaude([TRANSCRIPTION], { dejaImporteJusqua: new Map([[SESSION, '2026-10-20T10:00:05.000Z']]) });
    expect(apres.find((x) => x.modele === 'claude-sonnet-5-5')!.appels).toBe(1);
  });

  it('choisit le prix par famille de modèle et compte le cache', () => {
    expect(prixPour('claude-sonnet-5-5', PRIX)!.cle).toBe('claude-sonnet');
    expect(prixPour('claude-opus-5-5', PRIX)!.cle).toBe('claude-opus');
    expect(prixPour('autre', PRIX)!.cle).toBe('defaut');
    expect(prixPour('autre', {})).toBeNull();
    const sonnet = lireTranscriptionsClaude([TRANSCRIPTION]).find((x) => x.modele === 'claude-sonnet-5-5')!;
    // (1500×3 + 500×15 + 50000×0,3 + 10000×3,75 + 2000×6) / 1e6 = 0,0765 → 0,08
    expect(coutConsommation(sonnet, PRIX['claude-sonnet'])).toBe(0.08);
    expect(coutConsommation(sonnet, { entree: 3, sortie: 15, cache_lecture: 0, cache_ecriture: 0 })).toBe(0.01);
  });

  it('dossier par défaut : chemin du projet encodé sous ~/.claude/projects', () => {
    const avant = process.env['CLAUDE_CONFIG_DIR'];
    delete process.env['CLAUDE_CONFIG_DIR'];
    try {
      expect(dossierClaudeParDefaut('/home/user/Orbith', '/home/user')).toBe(
        path.join('/home/user', '.claude', 'projects', path.resolve('/home/user/Orbith').replace(/[^A-Za-z0-9]/g, '-')),
      );
      if (process.platform !== 'win32') {
        expect(dossierClaudeParDefaut('/home/user/Orbith', '/home/user')).toBe(path.join('/home/user', '.claude', 'projects', '-home-user-Orbith'));
      }
    } finally {
      if (avant !== undefined) process.env['CLAUDE_CONFIG_DIR'] = avant;
    }
  });
});

async function projet(): Promise<string> {
  const root = await makeProject('evolution', true);
  roots.push(root);
  await put(root, '.orbith/config.yaml', `version: 1\norbith_version: 0.1.0\nprojet:\n  nom: demo\nplateformes: [claude]\npiste: evolution\nbacklog:\n  prefixe: US\nfinops:\n  devise: EUR\n  prix:\n    defaut: { entree: 3, sortie: 15 }\n    claude-sonnet: { entree: 3, sortie: 15 }\n    claude-opus: { entree: 15, sortie: 75 }\n`);
  await put(
    root,
    'backlog/tasks/us-001 - Connexion.md',
    `---\ntype: story\nid: US-001\ntitle: Connexion\nstatut: brouillon\nstatus: En cours\ncouts_ia:\n  - { date: 2026-10-01, agent: dev, cout: 0.5, source: estimé }\n---\n# Connexion\n\n${GHERKIN}`,
  );
  return root;
}

describe('orbith couts importer', () => {
  it('aperçu sans --us, puis ajout en fin de liste avec source mesuré, sans casser la validation ni réimporter', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const root = await projet();
    await runValider('backlog/tasks/us-001 - Connexion.md', { cwd: root, yes: true });
    const dir = await mkdtemp(path.join(os.tmpdir(), 'orbith-transcripts-'));
    roots.push(dir);
    await put(dir, `${SESSION}.jsonl`, TRANSCRIPTION);
    await put(dir, `${SESSION}/subagents/agent-x.jsonl`, ligne({ id: 'D', ts: '2026-10-20T10:05:00.000Z', input: 10, output: 10 }));
    await put(dir, `${SESSION}/tool-results/x.txt`, 'ignoré');

    const apercu = await runCoutsImporter({ cwd: root, chemin: dir, aujourdhui: '2026-10-25' });
    expect(apercu.us).toBeNull();
    expect(apercu.fichiers).toBe(2);
    let doc = await readDoc(path.join(root, 'backlog/tasks/us-001 - Connexion.md'));
    expect((doc.data['couts_ia'] as unknown[]).length).toBe(1);

    const r = await runCoutsImporter({ cwd: root, chemin: dir, us: 'US-001', agent: 'dev', aujourdhui: '2026-10-25' });
    expect(r.entrees).toHaveLength(2);
    doc = await readDoc(path.join(root, 'backlog/tasks/us-001 - Connexion.md'));
    const couts = doc.data['couts_ia'] as Record<string, unknown>[];
    expect(couts).toHaveLength(3);
    expect(couts[0]).toEqual({ date: '2026-10-01', agent: 'dev', cout: 0.5, source: 'estimé' });
    expect(couts[1]).toMatchObject({ source: 'mesuré', outil: 'claude-code', modele: 'claude-sonnet-5-5', tokens_entree: 1510, tokens_sortie: 510, devise: 'EUR', session: SESSION, au: '2026-10-20T10:05:00.000Z' });
    expect(JSON.stringify(couts)).not.toContain('SECRET');
    expect(await etatValidation(root, 'backlog/tasks/us-001 - Connexion.md')).toBe('validé');

    // Deuxième import : rien de nouveau.
    const encore = await runCoutsImporter({ cwd: root, chemin: dir, us: 'US-001', aujourdhui: '2026-10-25' });
    expect(encore.entrees).toHaveLength(0);
    expect(bornesImportees(await scanArtifacts(root)).get(SESSION)).toBe('2026-10-20T10:05:00.000Z');

    // Les métriques distinguent estimé et mesuré.
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const m = await runMetriques({ cwd: root, aujourdhui: '2026-10-25' });
    expect(m.couts.parSource.estime).toEqual({ total: 0.5, entrees: 1 });
    expect(m.couts.parSource.mesure.entrees).toBe(2);
    expect(m.couts.total).toBe(Math.round((0.5 + m.couts.parSource.mesure.total) * 100) / 100);
  });

  it('refuse Gemini (format non confirmé), une US inconnue et un dossier vide', async () => {
    const root = await projet();
    await expect(runCoutsImporter({ cwd: root, source: 'gemini' })).rejects.toThrow(/pas encore pris en charge/);
    await expect(runCoutsImporter({ cwd: root, source: 'x' })).rejects.toThrow(/Source inconnue/);
    await expect(runCoutsImporter({ cwd: root, us: 'US-999', chemin: root })).rejects.toThrow(/introuvable/);
    await expect(runCoutsImporter({ cwd: root, chemin: path.join(root, 'rien') })).rejects.toThrow(/Aucune transcription/);
    await expect(runCoutsImporter({ cwd: root, depuis: '20/10/2026' })).rejects.toThrow(/AAAA-MM-JJ/);
  });
});
