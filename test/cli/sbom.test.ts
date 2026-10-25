import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runSbom } from '../../src/cli/sbom.js';
import { runValider } from '../../src/cli/valider.js';
import { runDeploiement } from '../../src/cli/deploiement.js';
import { run as runChecks } from '../../src/checks/sbom.js';
import { run as runValidations } from '../../src/checks/validations.js';
import { collecterComposants, controlerLicences, politiqueDepuis } from '../../src/sbom/index.js';
import { loadConfig, verifierChaine } from '../../src/core/index.js';
import { GHERKIN, commit, makeProject, put } from './helpers.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const r of roots.splice(0)) await rm(r, { recursive: true, force: true });
});

async function projet(): Promise<string> {
  const root = await makeProject('evolution', true);
  roots.push(root);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  return root;
}

const LOCK = JSON.stringify({
  lockfileVersion: 3,
  packages: {
    '': { name: 'demo' },
    'node_modules/zlib-lib': { version: '2.0.0', license: 'MIT' },
    'node_modules/@acme/core': { version: '1.2.3', license: 'GPL-3.0-only' },
    'node_modules/a/node_modules/dual': { version: '0.1.0', license: '(MIT OR GPL-3.0)', dev: true },
    'node_modules/nolic': { version: '1.0.0' },
  },
});

const POM = `<project>
  <properties><spring.version>3.3.1</spring.version></properties>
  <dependencyManagement><dependencies><dependency><groupId>x</groupId><artifactId>ignore</artifactId><version>1</version></dependency></dependencies></dependencyManagement>
  <dependencies>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter</artifactId><version>\${spring.version}</version></dependency>
    <dependency><groupId>junit</groupId><artifactId>junit</artifactId><version>4.13</version><scope>test</scope></dependency>
  </dependencies>
  <build><plugins><plugin><groupId>p</groupId><artifactId>plug</artifactId></plugin></plugins></build>
</project>`;

describe('collecte des composants', () => {
  it('lit package-lock, pom.xml, requirements et pyproject, triés et dédoublonnés', async () => {
    const root = await projet();
    await put(root, 'package.json', JSON.stringify({ dependencies: { ignoré: '^1.0.0' } }));
    await put(root, 'package-lock.json', LOCK);
    await put(root, 'pom.xml', POM);
    await put(root, 'requirements.txt', 'Flask==3.0.0\nrequests>=2  # commentaire\n-r autre.txt\n');
    await put(root, 'pyproject.toml', '[project]\ndependencies = ["numpy==1.26.0"]\n');
    const c = await collecterComposants(root);
    const purls = c.map((x) => x.purl);
    expect(purls).toEqual([...purls].sort());
    expect(purls).toEqual(
      expect.arrayContaining([
        'pkg:npm/%40acme/core@1.2.3',
        'pkg:npm/zlib-lib@2.0.0',
        'pkg:npm/dual@0.1.0',
        'pkg:maven/org.springframework.boot/spring-boot-starter@3.3.1',
        'pkg:maven/junit/junit@4.13',
        'pkg:pypi/flask@3.0.0',
        'pkg:pypi/requests',
        'pkg:pypi/numpy@1.26.0',
      ]),
    );
    expect(purls.some((p) => p.includes('ignore') || p.includes('plug'))).toBe(false);
    expect(c.find((x) => x.nom === 'dual')).toMatchObject({ portee: 'optional', licence: '(MIT OR GPL-3.0)' });
    expect(c.find((x) => x.nom === 'junit')?.portee).toBe('optional');
    expect(await collecterComposants(root)).toEqual(c);
  });

  it('se rabat sur package.json sans lock', async () => {
    const root = await projet();
    await put(root, 'package.json', JSON.stringify({ dependencies: { left: '^1.2.3' }, devDependencies: { vitest: '~2' } }));
    const c = await collecterComposants(root);
    expect(c.map((x) => [x.nom, x.version, x.portee])).toEqual([
      ['left', '1.2.3', 'required'],
      ['vitest', '2', 'optional'],
    ]);
  });
});

describe('orbith sbom', () => {
  it('écrit un CycloneDX JSON reproductible', async () => {
    const root = await projet();
    await put(root, 'package-lock.json', LOCK);
    await runSbom({ cwd: root, sortie: 'sbom/a.json' });
    await runSbom({ cwd: root, sortie: 'sbom/b.json' });
    const a = await readFile(path.join(root, 'sbom/a.json'), 'utf8');
    expect(a).toBe(await readFile(path.join(root, 'sbom/b.json'), 'utf8'));
    const bom = JSON.parse(a);
    expect(bom).toMatchObject({ bomFormat: 'CycloneDX', specVersion: '1.5', version: 1 });
    expect(bom.serialNumber).toMatch(/^urn:uuid:[0-9a-f-]{36}$/);
    expect(bom.components).toHaveLength(4);
    const acme = bom.components.find((x: { name: string }) => x.name === '@acme/core');
    expect(acme).toMatchObject({ group: 'acme', version: '1.2.3', licenses: [{ expression: 'GPL-3.0-only' }] });
  });
});

describe('contrôle des licences (check)', () => {
  it('sans politique : rien à signaler', async () => {
    const root = await projet();
    await put(root, 'package-lock.json', LOCK);
    expect(await runChecks({ root, config: null })).toEqual([]);
  });

  it('config : GPL interdite = erreur ; « MIT OR GPL » est toléré ; sans licence = info', async () => {
    const root = await projet();
    await put(root, 'package-lock.json', LOCK);
    const r = await runChecks({ root, config: { ...(await loadConfig(root)), sbom: { licences_interdites: ['GPL-3.0'] } } });
    const erreurs = r.filter((x) => x.niveau === 'erreur');
    expect(erreurs).toHaveLength(1);
    expect(erreurs[0]!.message).toMatch(/Licence interdite : @acme\/core@1\.2\.3 .* GPL-3\.0-only/);
    expect(r.find((x) => x.niveau === 'info')?.message).toMatch(/1 composant\(s\) sans licence/);
    expect(r.every((x) => x.categorie === 'sbom')).toBe(true);
  });

  it('CSR : catégorie « Licences » (interdit = erreur, déprécié = avertissement)', async () => {
    const root = await projet();
    await put(root, 'package-lock.json', LOCK);
    await put(root, '.orbith/csr/CSR.md', '# CSR\n\n## Licences\n| Outil | Version min | Statut | Commentaire |\n|---|---|---|---|\n| AGPL-3.0 | | interdit | |\n| MIT | | déprécié | test |\n');
    const r = await runChecks({ root, config: await loadConfig(root) });
    expect(r.filter((x) => x.niveau === 'erreur')).toHaveLength(0);
    expect(r.filter((x) => x.niveau === 'avertissement').map((x) => x.message)).toEqual(
      expect.arrayContaining([expect.stringMatching(/zlib-lib@2\.0\.0.*MIT/)]),
    );
  });

  it('politiqueDepuis / controlerLicences : préfixes et variantes SPDX', () => {
    const c = (licence: string) => ({ ecosysteme: 'npm' as const, nom: 'x', portee: 'required' as const, source: 's', purl: 'p', licence });
    const pol = politiqueDepuis(null, ['GPL-3.0', 'AGPL']);
    const niveau = (l: string) => controlerLicences([c(l)], pol).problemes[0]?.niveau;
    expect(niveau('GPL-3.0+')).toBe('erreur');
    expect(niveau('GPL-3.0-or-later')).toBe('erreur');
    expect(niveau('AGPL-3.0-only')).toBe('erreur');
    expect(niveau('LGPL-3.0')).toBeUndefined();
    expect(niveau('GPL-2.0')).toBeUndefined();
    expect(niveau('MIT AND GPL-3.0')).toBe('erreur');
    expect(niveau('MIT OR GPL-3.0')).toBeUndefined();
    expect(niveau('GPL-3.0 OR AGPL-3.0')).toBe('erreur');
  });
});

describe('déploiements chaînés', () => {
  it('chaîne deploiements.json et refuse un registre altéré', async () => {
    const root = await projet();
    await put(root, 'backlog/tasks/us-001 - Connexion.md', `---\ntype: story\nid: US-001\ntitle: Connexion\nstatut: brouillon\nstatus: Terminée\n---\n# Connexion\n\n${GHERKIN}`);
    await runValider('backlog/tasks/us-001 - Connexion.md', { cwd: root, yes: true });
    commit(root, 'feat(US-001): login');
    for (const v of ['1.0.0', '1.1.0']) {
      await put(root, `docs/livraisons/release-notes-${v}.md`, `---\ntype: release-notes\nstatut: brouillon\nversion: ${v}\n---\n# ${v}\n\n- US-001\n`);
      await runValider(`docs/livraisons/release-notes-${v}.md`, { cwd: root, yes: true });
    }
    await runDeploiement('1.0.0', { cwd: root, yes: true, date: '2026-10-20' });
    await runDeploiement('1.1.0', { cwd: root, yes: true, date: '2026-10-21' });
    const file = path.join(root, '.orbith/deploiements.json');
    const json = JSON.parse(await readFile(file, 'utf8')) as { deploiements: { date: string; precedent?: string }[] };
    expect(verifierChaine(json.deploiements)).toEqual({ etat: 'ok' });
    expect(await runValidations({ root, config: null })).toEqual([]);

    json.deploiements[0]!.date = '2026-01-01';
    await put(root, '.orbith/deploiements.json', JSON.stringify(json));
    const r = await runValidations({ root, config: null });
    expect(r.map((x) => x.niveau)).toEqual(['erreur']);
    await expect(runDeploiement('1.2.0', { cwd: root, yes: true })).rejects.toThrow();
  });
});
