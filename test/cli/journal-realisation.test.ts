import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  empreinteValidation,
  etatValidation,
  hashBody,
  loadRegistry,
  readDoc,
  recordValidation,
  retirerJournal,
  scanArtifacts,
} from '../../src/core/index.js';
import { run as checkValidations } from '../../src/checks/validations.js';
import { runValider } from '../../src/cli/valider.js';
import { usEligibles } from '../../src/cli/autopilote.js';
import { GHERKIN, makeProject, put } from './helpers.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const r of roots.splice(0)) await rm(r, { recursive: true, force: true });
});

const FICHIER = 'backlog/tasks/us-001 - Ajouter.md';
const DOR =
  '## Definition of Ready\n\n- [x] Valeur métier claire\n- [x] Critères d\'acceptation en Gherkin\n' +
  '- [ ] Validée par le PO\n';
const STORY =
  '---\nid: US-001\ntitle: Ajouter\nstatus: Prête\ntype: story\nstatut: brouillon\n---\n\n' +
  '## Description\n\nEn tant que client je veux ajouter afin de gagner du temps.\n\n' +
  GHERKIN +
  '\n## Notes techniques\n\n- contrainte CSR\n\n' +
  DOR +
  '\n## Journal de réalisation\n\n<!-- Section non validée. -->\n';

async function storyValidee(): Promise<{ root: string; f: string }> {
  const root = await makeProject('evolution', true);
  roots.push(root);
  const f = await put(root, FICHIER, STORY);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  expect(await runValider(FICHIER, { cwd: root, yes: true })).toBe(true);
  return { root, f };
}

describe('section « Journal de réalisation » hors empreinte de validation', () => {
  it('retirerJournal ne change pas un corps sans journal', () => {
    const corps = '\n## A\n\ntexte\n\n## B\n\nsuite\n';
    expect(retirerJournal(corps)).toBe(corps);
    expect(retirerJournal('## A\n\nx\n\n## Journal de réalisation\n\nnote\n### sous-titre\nnote\n\n## B\n')).toBe(
      '## A\n\nx\n\n## B\n',
    );
  });

  it('notes ajoutées au journal après validation : la US reste validée et check est OK', async () => {
    const { root, f } = await storyValidee();
    const brut = await readFile(f, 'utf8');
    await put(root, FICHIER, brut + '\n### Dev — 2026-10-26\n\n- Fait : ajout du service.\n\n### Revue QA — 2026-10-26\n\n- RAS\n');
    expect(await etatValidation(root, f)).toBe('validé');
    expect(await checkValidations({ root, config: null })).toEqual([]);
  });

  it('toute autre modification du corps est toujours détectée', async () => {
    const { root, f } = await storyValidee();
    const brut = await readFile(f, 'utf8');
    for (const modifie of [
      brut.replace('- contrainte CSR', '- contrainte CSR\n- note ajoutée par un agent'),
      brut.replace('Alors c', 'Alors d'),
      brut.replace('## Journal de réalisation', '## Journal de réalisation\n\nnote\n\n## Ajout hors journal\n\ntexte'),
      // Un titre de journal inséré au milieu d'une section n'en masque pas la suite.
      brut.replace('- contrainte CSR', '## Journal de réalisation\n\n- contrainte CSR'),
      brut.replace('- [ ] Validée par le PO', '- [x] Validée par le PO'),
    ]) {
      await put(root, FICHIER, modifie);
      expect(await etatValidation(root, f)).toBe('modifié');
    }
    const r = await checkValidations({ root, config: null });
    expect(r.map((x) => x.niveau)).toEqual(['erreur']);
  });

  it("le journal n'est exclu que pour les stories", async () => {
    const root = await makeProject('evolution', true);
    roots.push(root);
    const f = await put(root, 'docs/produit/prd.md', '---\ntype: prd\nstatut: brouillon\n---\n# PRD\n\nContenu\n');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await runValider('docs/produit/prd.md', { cwd: root, yes: true });
    await put(root, 'docs/produit/prd.md', (await readFile(f, 'utf8')) + '\n## Journal de réalisation\n\nx\n');
    expect(await etatValidation(root, f)).toBe('modifié');
  });

  it('rétrocompatible : une validation enregistrée avec l\'ancienne empreinte (corps entier) reste valide', async () => {
    const root = await makeProject('evolution', true);
    roots.push(root);
    const ancien = STORY.replace('statut: brouillon', 'statut: validé').replace(/\n## Journal de réalisation[\s\S]*$/, '');
    const f = await put(root, FICHIER, ancien);
    const doc = await readDoc(f);
    await recordValidation(root, { fichier: FICHIER, sha256: hashBody(doc.body), par: 'A', email: 'a@b.c', le: new Date().toISOString() });
    expect(await etatValidation(root, f)).toBe('validé');
    // Journal ajouté ensuite (à la fin, comme dans le modèle) : toujours validé.
    await put(root, FICHIER, ancien + '\n## Journal de réalisation\n\n- Dev : fait.\n');
    expect(await etatValidation(root, f)).toBe('validé');
    await put(root, FICHIER, ancien.replace('Alors c', 'Alors z'));
    expect(await etatValidation(root, f)).toBe('modifié');
  });

  it('valider enregistre l\'empreinte sans le journal', async () => {
    const { root, f } = await storyValidee();
    const doc = await readDoc(f);
    const [entree] = await loadRegistry(root);
    expect(entree?.sha256).toBe(empreinteValidation(doc.body, 'story'));
    expect(entree?.sha256).toBe(hashBody(retirerJournal(doc.body)));
  });
});

describe('DoR et autopilote', () => {
  it('une US validée, DoR remplie (case « Validée par le PO » non cochée) et journal rempli est éligible', async () => {
    const { root, f } = await storyValidee();
    await put(root, FICHIER, (await readFile(f, 'utf8')) + '\n- Dev : commencé.\n');
    const artifacts = await scanArtifacts(root);
    expect(usEligibles(artifacts).map((s) => s.id)).toEqual(['US-001']);
  });
});
