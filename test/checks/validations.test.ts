import { describe, expect, it } from 'vitest';
import { hashBody, recordValidation, readDoc } from '../../src/core/index.js';
import { run } from '../../src/checks/validations.js';
import { useProject } from './helpers.js';
import path from 'node:path';

const fx = useProject();

describe('check validations', () => {
  it('détecte modifié et non tracé, pas le validé', async () => {
    const body = '\n# PRD\n\nContenu\n';
    const head = (s: string) => `---\ntype: prd\nstatut: ${s}\n---\n`;
    await fx.put('docs/produit/ok.md', head('validé') + body);
    await fx.put('docs/produit/modif.md', head('validé') + body);
    await fx.put('docs/produit/trace.md', head('validé') + body);
    await fx.put('docs/produit/brouillon.md', head('brouillon') + body);
    for (const f of ['ok.md', 'modif.md']) {
      const doc = await readDoc(path.join(fx.root, 'docs/produit', f));
      await recordValidation(fx.root, { fichier: `docs/produit/${f}`, sha256: hashBody(doc.body), par: 'A', email: 'a@b.c', le: new Date().toISOString() });
    }
    await fx.put('docs/produit/modif.md', head('validé') + body + 'ajout\n');
    const r = await run({ root: fx.root, config: null });
    expect(r.map((x) => [x.fichier, x.niveau]).sort()).toEqual([
      ['docs/produit/modif.md', 'erreur'],
      ['docs/produit/trace.md', 'erreur'],
    ]);
    expect(r.find((x) => x.fichier?.endsWith('modif.md'))!.message).toMatch(/Modifié après validation/);
    expect(r.find((x) => x.fichier?.endsWith('trace.md'))!.message).toMatch(/non tracée/);
  });
});

describe('check validations : frontmatter invalide', () => {
  it('signale une erreur « Frontmatter invalide » avec le fichier', async () => {
    await fx.put('docs/produit/casse.md', '---\ntype: prd\nstatut: [oups\n---\n# PRD\n');
    const r = await run({ root: fx.root, config: null });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ niveau: 'erreur', fichier: 'docs/produit/casse.md' });
    expect(r[0]!.message).toMatch(/^Frontmatter invalide/);
  });
});
