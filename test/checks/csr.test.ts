import { describe, expect, it } from 'vitest';
import { run } from '../../src/checks/csr.js';
import { CSR, useProject } from './helpers.js';

const fx = useProject();
const ctx = () => ({ root: fx.root, config: null });

describe('check csr', () => {
  it('avertit si le CSR est absent', async () => {
    const r = await run(ctx());
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ categorie: 'csr', niveau: 'avertissement' });
  });

  it('Node : version trop basse et dépendance interdite/dépréciée', async () => {
    await fx.put('.orbith/csr/CSR.md', CSR);
    await fx.put('package.json', JSON.stringify({ engines: { node: '>=18' }, dependencies: { angularjs: '1', moment: '2' } }));
    const r = await run(ctx());
    expect(r.some((x) => x.niveau === 'erreur' && /Node\.js 18/.test(x.message))).toBe(true);
    expect(r.some((x) => x.niveau === 'erreur' && /AngularJS/.test(x.message))).toBe(true);
    expect(r.some((x) => x.niveau === 'avertissement' && /moment/.test(x.message))).toBe(true);
  });

  it('Node conforme : aucun résultat', async () => {
    await fx.put('.orbith/csr/CSR.md', CSR);
    await fx.put('package.json', JSON.stringify({ engines: { node: '>=22' } }));
    await fx.put('.nvmrc', 'v22.1.0\n');
    expect(await run(ctx())).toEqual([]);
  });

  it('Java : maven.compiler.release 17 < 21', async () => {
    await fx.put('.orbith/csr/CSR.md', CSR);
    await fx.put('pom.xml', '<project><properties><maven.compiler.release>17</maven.compiler.release></properties></project>');
    const r = await run(ctx());
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ niveau: 'erreur', fichier: 'pom.xml' });
    expect(r[0]!.message).toMatch(/Java 17.*21/);
  });

  it('Python : requires-python trop bas', async () => {
    await fx.put('.orbith/csr/CSR.md', CSR);
    await fx.put('pyproject.toml', '[project]\nname="x"\nrequires-python = ">=3.9"\n');
    const r = await run(ctx());
    expect(r.some((x) => x.niveau === 'erreur' && /Python 3\.9/.test(x.message))).toBe(true);
  });

  it('outil obligatoire absent', async () => {
    await fx.put('.orbith/csr/CSR.md', '## A\n| Outil | Statut |\n|---|---|\n| helmet | obligatoire |');
    await fx.put('package.json', '{}');
    expect((await run(ctx()))[0]).toMatchObject({ niveau: 'erreur' });
  });

  it('GitLab CI obligatoire : détecté via .gitlab-ci.yml, sinon erreur', async () => {
    await fx.put('.orbith/csr/CSR.md', '## Outils\n| Outil | Statut |\n|---|---|\n| GitLab CI | obligatoire |\n| Docker | autorisé |');
    const sans = await run(ctx());
    expect(sans).toHaveLength(1);
    expect(sans[0]).toMatchObject({ niveau: 'erreur' });
    await fx.put('.gitlab-ci.yml', 'stages: []\n');
    await fx.put('Dockerfile', 'FROM node:22\n');
    expect(await run(ctx())).toEqual([]);
  });

  it('outil obligatoire sans moyen de détection : avertissement, pas erreur', async () => {
    await fx.put('.orbith/csr/CSR.md', '## A\n| Outil | Statut |\n|---|---|\n| Datadog | obligatoire |');
    const r = await run(ctx());
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ niveau: 'avertissement' });
    expect(r[0]!.message).toMatch(/non vérifiable automatiquement/);
  });

  it("une ligne « interdit » avec version ne vise que cette version (Python 2.7 vs 3.12)", async () => {
    await fx.put(
      '.orbith/csr/CSR.md',
      '## L\n| Outil | Version min | Statut |\n|---|---|---|\n| Python | 3.11 | autorisé |\n| Python | 2.7 | interdit |\n| Node.js | 22 | autorisé |\n| Node.js | 20 | déprécié |',
    );
    await fx.put('.python-version', '3.12\n');
    expect(await run(ctx())).toEqual([]);
    await fx.put('.python-version', '2.7.18\n');
    const r = await run(ctx());
    expect(r.some((x) => x.niveau === 'erreur' && /Python 2\.7 est interdit/.test(x.message))).toBe(true);
    await fx.put('.python-version', '3.12\n');
    await fx.put('.nvmrc', '20.11.0\n');
    const n = await run(ctx());
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ niveau: 'avertissement' });
  });
});
