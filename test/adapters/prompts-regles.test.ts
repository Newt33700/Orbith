import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (rel: string) => readFile(path.join(process.cwd(), 'content', rel), 'utf8');

describe('règles portées par les prompts', () => {
  it('dev : jamais de push, même sur demande', async () => {
    const dev = await lire('agents/dev.md');
    expect(dev).toMatch(/ne pousse jamais/i);
    expect(dev).not.toMatch(/sans demande explicite/);
  });

  it('po : les epics exigent aussi une architecture validée', async () => {
    const po = await lire('agents/po.md');
    expect(po).toContain('docs/architecture/architecture.md');
    expect(po).toMatch(/epics\*\* \(piste projet\)/);
  });

  it('guide : écrit la config seulement après avoir montré la modification', async () => {
    const guide = await lire('agents/guide.md');
    expect(guide).toMatch(/Je l'écris \?/);
    expect(guide).toMatch(/après\*\* avoir vu la modification/);
  });

  it('architecte : le « sinon arrête-toi » ne suit plus la phrase sur le CSR', async () => {
    const archi = await lire('agents/architecte.md');
    expect(archi).not.toMatch(/- Sinon \*\*arrête-toi\*\*/);
    expect(archi).toMatch(/Si un prérequis n'est pas validé, \*\*arrête-toi\*\*/);
  });

  it('relecture adverse : recommandée, pas obligatoire, rapport sans type', async () => {
    const w = await lire('workflows/relecture-adverse.md');
    expect(w).toContain('fortement recommandée');
    expect(w).not.toMatch(/passe est obligatoire/);
    expect(w).toContain('sans `type`');
  });

  it('qa : peut écrire son coût IA', async () => {
    expect(await lire('agents/qa.md')).toContain('`couts_ia`');
  });

  it('nouvelle session : pas de rappel pendant l’attente d’une réponse', async () => {
    expect(await lire('rules/nouvelle-session.md')).toContain('Réponds ici, dans cette même session');
  });

  it('tutoiement uniforme dans les règles et contenus', async () => {
    expect(await lire('rules/validation-humaine.md')).toContain('tutoyant');
    for (const f of ['config/dod.md', 'config/config.yaml']) {
      expect(await lire(f)).not.toMatch(/\b(vos|votre|vous)\b/i);
    }
  });

  it('guide : liste tous les agents et workflows', async () => {
    const guide = await lire('agents/guide.md');
    for (const cmd of ['securite', 'test-archi', 'retro', 'relecture-adverse', 'changement-de-cap', 'autopilote']) {
      expect(guide).toContain(`/orbith-${cmd}`);
    }
  });

  it('modèle PRD : questions ouvertes ; story du PO : couts_ia et tag @US', async () => {
    expect(await lire('templates/prd.md')).toContain('## Questions ouvertes');
    const po = await lire('agents/po.md');
    expect(po).toContain('couts_ia: []');
    expect(po).toContain('@US-001');
  });
});

describe('outil absent du CSR (défaut 28)', () => {
  it.each(['architecte', 'dev', 'test-architect'])("%s : un outil absent du CSR n'est ni autorisé ni interdit", async (agent) => {
    const txt = await readFile(path.join('content', 'agents', `${agent}.md`), 'utf8');
    expect(txt).toContain("Un outil absent du CSR n'est ni autorisé ni interdit");
  });
});
