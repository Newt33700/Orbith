import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  corpsMarkdown,
  decouper,
  decouperSections,
  documentsVolumineux,
  estimerJetons,
  extraitsPerimes,
  hashBody,
  lireMarqueur,
  listerExtraits,
  scanArtifacts,
  slug,
} from '../../src/core/index.js';
import { useProject } from '../checks/helpers.js';

const fx = useProject();

const DOC = `---
type: prd
statut: validé
---
# Mon PRD

Intro du document.

## Contexte

Texte du contexte.

### Détail

Sous-section.

## Exigences & « cas »

Les exigences.
`;

describe('decouperSections', () => {
  it('coupe au niveau demandé, garde les sous-niveaux dans leur parent', () => {
    const s = decouperSections(corpsMarkdown(DOC), 2);
    expect(s.map((x) => x.titre)).toEqual(['Mon PRD', 'Contexte', 'Exigences & « cas »']);
    expect(s[1]!.texte).toContain('### Détail');
    expect(s[0]!.niveau).toBe(1);
  });

  it('niveau 3 coupe plus finement ; niveau 1 donne une seule section', () => {
    expect(decouperSections(corpsMarkdown(DOC), 3).map((x) => x.titre)).toContain('Détail');
    expect(decouperSections(corpsMarkdown(DOC), 1)).toHaveLength(1);
  });

  it('texte avant le premier titre : section Introduction (niveau 0)', () => {
    const s = decouperSections('Avant tout.\n\n## A\n\nx\n', 2);
    expect(s[0]).toMatchObject({ niveau: 0, titre: 'Introduction' });
    expect(s[1]!.titre).toBe('A');
  });

  it('ne coupe pas sur les titres dans des blocs de code (``` et ~~~, fences plus longues)', () => {
    const corps = [
      '## A',
      '```bash',
      '## pas un titre',
      '```',
      '~~~',
      '## non plus',
      '~~~',
      '````md',
      '```',
      '## toujours dans le bloc',
      '```',
      '````',
      '## B',
      'fin',
    ].join('\n');
    const s = decouperSections(corps, 2);
    expect(s.map((x) => x.titre)).toEqual(['A', 'B']);
    expect(s[0]!.texte).toContain('## toujours dans le bloc');
  });

  it('bloc de code jamais refermé : le reste du document reste dans la section', () => {
    const s = decouperSections('## A\n```\n## B\ntexte', 2);
    expect(s).toHaveLength(1);
  });

  it('CRLF et accents', () => {
    const s = decouperSections('## Été\r\n\r\nça va\r\n\r\n## Épilogue\r\n\r\nfin\r\n', 2);
    expect(s.map((x) => x.titre)).toEqual(['Été', 'Épilogue']);
    expect(s[0]!.texte).not.toContain('\r');
  });

  it('document sans titre : uniquement une introduction', () => {
    const s = decouperSections('juste du texte\nsans titre', 2);
    expect(s).toHaveLength(1);
    expect(s[0]!.niveau).toBe(0);
  });

  it('estime les jetons à caractères / 4 (arrondi au supérieur)', () => {
    expect(estimerJetons('a'.repeat(9))).toBe(3);
    expect(estimerJetons('')).toBe(0);
  });

  it('slug : accents retirés, sûr pour un nom de fichier', () => {
    expect(slug('Exigences & « cas » Été')).toBe('exigences-cas-ete');
    expect(slug('???')).toBe('section');
  });
});

describe('decouper', () => {
  it('écrit index + un fichier par section, sans frontmatter type, avec source et hash', async () => {
    await fx.put('docs/produit/prd.md', DOC);
    const r = await decouper(fx.root, 'docs/produit/prd.md', 2);
    expect(r.dossier).toBe('.orbith/extraits/prd');
    const dir = path.join(fx.root, r.dossier);
    expect((await fs.readdir(dir)).sort()).toEqual(['00-mon-prd.md', '01-contexte.md', '02-exigences-cas.md', 'index.md']);
    const hash = hashBody(corpsMarkdown(DOC));
    expect(r.sha256).toBe(hash);

    const ext = await fs.readFile(path.join(dir, '01-contexte.md'), 'utf8');
    expect(ext.startsWith('---')).toBe(false);
    expect(ext).not.toMatch(/^type:/m);
    expect(lireMarqueur(ext)).toEqual({ source: 'docs/produit/prd.md', sha256: hash });
    expect(ext).toContain('## Contexte');
    expect(ext).toContain('### Détail');

    const idx = await fs.readFile(path.join(dir, 'index.md'), 'utf8');
    expect(lireMarqueur(idx)).toEqual({ source: 'docs/produit/prd.md', sha256: hash });
    expect(idx).toContain('[01-contexte.md](01-contexte.md)');
    expect(idx).toContain('| Contexte |');
    expect(idx).toMatch(/environ \d+ jetons/);
  });

  it('ne modifie jamais le source, ne crée aucun artefact et laisse un document validé validé', async () => {
    await fx.put('docs/produit/prd.md', DOC);
    const avant = await fs.readFile(path.join(fx.root, 'docs/produit/prd.md'), 'utf8');
    const artefactsAvant = await scanArtifacts(fx.root);
    await decouper(fx.root, 'docs/produit/prd.md', 2);
    expect(await fs.readFile(path.join(fx.root, 'docs/produit/prd.md'), 'utf8')).toBe(avant);
    expect(await scanArtifacts(fx.root)).toEqual(artefactsAvant);
    // même avec une sortie dans un dossier scanné, aucun extrait n'a de `type`
    await decouper(fx.root, 'docs/produit/prd.md', 2, 'docs/produit/extraits-prd');
    const apres = await scanArtifacts(fx.root);
    expect(apres.map((a) => a.chemin)).toEqual(['docs/produit/prd.md']);
  });

  it('est déterministe et régénère sans laisser de fichier obsolète', async () => {
    await fx.put('docs/a.md', DOC);
    await decouper(fx.root, 'docs/a.md', 2);
    const dir = path.join(fx.root, '.orbith/extraits/a');
    const un = await fs.readFile(path.join(dir, 'index.md'), 'utf8');
    await decouper(fx.root, 'docs/a.md', 2);
    expect(await fs.readFile(path.join(dir, 'index.md'), 'utf8')).toBe(un);
    await fx.put('docs/a.md', '# T\n\n## Seule\n\nx\n');
    await decouper(fx.root, 'docs/a.md', 2);
    expect((await fs.readdir(dir)).sort()).toEqual(['00-seule.md', 'index.md']);
  });

  it('refuse : sans titre, niveau invalide, hors projet, extrait, non Markdown, fichier absent', async () => {
    await fx.put('docs/plat.md', 'rien\nde titré\n');
    await expect(decouper(fx.root, 'docs/plat.md', 2)).rejects.toThrow(/Aucun titre/);
    await expect(decouper(fx.root, 'docs/plat.md', 7)).rejects.toThrow(/Niveau/);
    await expect(decouper(fx.root, '../hors.md', 2)).rejects.toThrow(/en dehors/);
    await expect(decouper(fx.root, 'docs/absent.md', 2)).rejects.toThrow(/introuvable/);
    await fx.put('docs/x.txt', '## a');
    await expect(decouper(fx.root, 'docs/x.txt', 2)).rejects.toThrow(/Markdown/);
    await fx.put('docs/a.md', DOC);
    await decouper(fx.root, 'docs/a.md', 2);
    await expect(decouper(fx.root, '.orbith/extraits/a/01-contexte.md', 2)).rejects.toThrow(/déjà un extrait/);
  });

  it("n'écrase pas un dossier étranger ni le découpage d'un autre document", async () => {
    await fx.put('docs/a.md', DOC);
    await fx.put('docs/b/a.md', DOC);
    await decouper(fx.root, 'docs/a.md', 2);
    await expect(decouper(fx.root, 'docs/b/a.md', 2)).rejects.toThrow(/contient le découpage de docs\/a\.md/);
    await decouper(fx.root, 'docs/b/a.md', 2, '.orbith/extraits/a-bis');
    await fx.put('mes-notes/important.md', 'précieux');
    await expect(decouper(fx.root, 'docs/a.md', 2, 'mes-notes')).rejects.toThrow(/pas été créé/);
    expect(await fs.readFile(path.join(fx.root, 'mes-notes/important.md'), 'utf8')).toBe('précieux');
    await expect(decouper(fx.root, 'docs/a.md', 2, 'docs')).rejects.toThrow();
  });

  it('CRLF : même empreinte que la validation (hashBody du corps)', async () => {
    await fx.put('docs/c.md', DOC.replace(/\n/g, '\r\n'));
    const r = await decouper(fx.root, 'docs/c.md', 2);
    expect(r.sha256).toBe(hashBody(corpsMarkdown(DOC)));
  });
});

describe('extraitsPerimes / documentsVolumineux', () => {
  it('détecte périmé (corps modifié), orphelin (source supprimé), pas périmé si seul le frontmatter change', async () => {
    await fx.put('docs/a.md', DOC);
    await decouper(fx.root, 'docs/a.md', 2);
    expect(await extraitsPerimes(fx.root)).toEqual([]);
    await fx.put('docs/a.md', DOC.replace('statut: validé', 'statut: en-revue'));
    expect(await extraitsPerimes(fx.root)).toEqual([]);
    await fx.put('docs/a.md', DOC + '\nAjout.\n');
    expect(await extraitsPerimes(fx.root)).toEqual([{ dossier: '.orbith/extraits/a', source: 'docs/a.md', raison: 'modifie' }]);
    await fs.rm(path.join(fx.root, 'docs/a.md'));
    expect((await extraitsPerimes(fx.root))[0]!.raison).toBe('absent');
    expect(await listerExtraits(fx.root)).toHaveLength(1);
  });

  it('liste les documents au-dessus du seuil sans extraits', async () => {
    const gros = `---\ntype: prd\nstatut: brouillon\n---\n# Gros\n\n## A\n\n${'mot '.repeat(1000)}\n`;
    await fx.put('docs/produit/prd.md', gros);
    await fx.put('docs/produit/brief.md', '---\ntype: brief\nstatut: brouillon\n---\n# Petit\n');
    const arts = await scanArtifacts(fx.root);
    const v = await documentsVolumineux(fx.root, arts, 900);
    expect(v.map((d) => d.chemin)).toEqual(['docs/produit/prd.md']);
    expect(await documentsVolumineux(fx.root, arts, 4000)).toEqual([]);
    await decouper(fx.root, 'docs/produit/prd.md', 2);
    expect(await documentsVolumineux(fx.root, arts, 900)).toEqual([]);
  });
});
