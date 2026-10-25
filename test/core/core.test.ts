import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  defaultConfig, loadConfig, saveConfig, readDoc, writeDoc, hashBody, recordValidation,
  etatValidation, loadRegistry, scanArtifacts, hasGherkin, findProjectRoot, requireProjectRoot,
  OrbithError, toPosixRelative, packageRoot,
} from '../../src/core/index.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'orbith-'));
  await mkdir(path.join(root, '.orbith'), { recursive: true });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function put(rel: string, content: string) {
  const f = path.join(root, rel);
  await mkdir(path.dirname(f), { recursive: true });
  await writeFile(f, content, 'utf8');
  return f;
}

describe('paths', () => {
  it('finds the package root', () => {
    expect(path.basename(packageRoot())).toBeTruthy();
  });
  it('findProjectRoot walks up', async () => {
    const sub = path.join(root, 'a', 'b');
    await mkdir(sub, { recursive: true });
    expect(await findProjectRoot(sub)).toBe(root);
    const other = await mkdtemp(path.join(os.tmpdir(), 'orbith-none-'));
    expect(await findProjectRoot(other)).toBeNull();
    await expect(requireProjectRoot(other)).rejects.toBeInstanceOf(OrbithError);
    await rm(other, { recursive: true, force: true });
  });
  it('toPosixRelative', () => {
    expect(toPosixRelative(root, path.join(root, 'docs', 'x.md'))).toBe('docs/x.md');
  });
});

describe('config', () => {
  it('round-trips', async () => {
    const cfg = defaultConfig('demo');
    cfg.plugins = ['backlog-md'];
    cfg.piste = 'projet';
    await saveConfig(root, cfg);
    expect(await loadConfig(root)).toEqual(cfg);
  });
  it('errors in French when missing', async () => {
    const other = await mkdtemp(path.join(os.tmpdir(), 'orbith-nocfg-'));
    await expect(loadConfig(other)).rejects.toThrow(/config\.yaml/);
    await rm(other, { recursive: true, force: true });
  });
});

describe('frontmatter', () => {
  it('reads and writes', async () => {
    const f = await put('d.md', '---\ntype: prd\nstatut: brouillon\n---\n# Titre\n\nTexte\n');
    const doc = await readDoc(f);
    expect(doc.data).toEqual({ type: 'prd', statut: 'brouillon' });
    expect(doc.body).toContain('# Titre');
    doc.data['statut'] = 'en-revue';
    await writeDoc(f, doc);
    const again = await readDoc(f);
    expect(again.data['statut']).toBe('en-revue');
    expect(again.body.trim()).toBe(doc.body.trim());
  });
});

describe('validations', () => {
  it('hashBody normalizes CRLF and whitespace', () => {
    expect(hashBody('a\r\nb\r\n')).toBe(hashBody('a\nb'));
    expect(hashBody('a\nb')).not.toBe(hashBody('a\nc'));
    expect(hashBody('a\nb')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('computes the four states', async () => {
    const body = '# PRD\n\nContenu\n';
    const f = await put('docs/produit/prd.md', `---\ntype: prd\nstatut: brouillon\n---\n${body}`);
    expect(await etatValidation(root, f)).toBe('non-validé');

    await writeDoc(f, { data: { type: 'prd', statut: 'validé' }, body });
    expect(await etatValidation(root, f)).toBe('non-tracé');

    await recordValidation(root, {
      fichier: 'docs/produit/prd.md', sha256: hashBody(body), par: 'Jane', email: 'j@x.fr', le: new Date().toISOString(),
    });
    expect(await etatValidation(root, 'docs/produit/prd.md')).toBe('validé');

    await writeDoc(f, { data: { type: 'prd', statut: 'validé' }, body: body + 'extra\n' });
    expect(await etatValidation(root, f)).toBe('modifié');
  });

  it('recordValidation replaces the entry for a file', async () => {
    const e = { fichier: 'a.md', sha256: 'x', par: 'J', email: 'j@x', le: 'now' };
    await recordValidation(root, e);
    await recordValidation(root, { ...e, sha256: 'y' });
    const reg = await loadRegistry(root);
    expect(reg).toHaveLength(1);
    expect(reg[0]?.sha256).toBe('y');
  });
});

describe('robustesse', () => {
  it('un registre illisible lève une OrbithError au lieu d\'être écrasé', async () => {
    await put('.orbith/validations.json', '{ pas du json');
    await expect(loadRegistry(root)).rejects.toBeInstanceOf(OrbithError);
    await expect(recordValidation(root, { fichier: 'a.md', sha256: 'x', par: 'J', email: 'j@x', le: 'now' })).rejects.toThrow(
      /validations\.json/,
    );
  });

  it('readDoc/writeDoc conservent les dates et ne partagent pas les objets entre lectures', async () => {
    const f = await put('a.md', '---\ntype: story\ncreated_date: 2026-10-25\n---\ncorps\n');
    const d1 = await readDoc(f);
    d1.data['statut'] = 'validé';
    const d2 = await readDoc(f);
    expect(d2.data['statut']).toBeUndefined();
    await writeDoc(f, d1);
    const raw = await (await import('node:fs/promises')).readFile(f, 'utf8');
    expect(raw).toMatch(/created_date: '?2026-10-25'?\n/);
    expect(raw).not.toContain('T00:00:00');
  });

  it('le hash ignore le frontmatter, CRLF et les espaces de bord', () => {
    expect(hashBody('a\r\nb\r\n\r\n')).toBe(hashBody('\na\nb'));
  });
});

describe('hasGherkin', () => {
  it('detects fenced blocks', () => {
    expect(hasGherkin('## Critères d\'acceptation\n```gherkin\nScénario: x\n```')).toBe(true);
  });
  it('detects scenario lines in the AC section only', () => {
    expect(hasGherkin("## Critères d'acceptation\nScénario: login\n  Étant donné x")).toBe(true);
    expect(hasGherkin('## Scenario: Autre\nScenario: hors section')).toBe(false);
    expect(hasGherkin("## Critères d'acceptation\nrien\n## Notes\nScenario: x")).toBe(false);
  });
});

describe('scanArtifacts', () => {
  it('scans the fixture project', async () => {
    const prdBody = '# PRD\n\nok\n';
    await put('docs/produit/prd.md', `---\ntype: prd\nstatut: validé\n---\n${prdBody}`);
    await recordValidation(root, {
      fichier: 'docs/produit/prd.md', sha256: hashBody(prdBody), par: 'J', email: 'j@x', le: 'now',
    });
    await put('docs/produit/brief.md', '---\ntype: brief\nstatut: brouillon\n---\n# Brief\n');
    await put('docs/produit/epics/EPIC-001-x.md', '---\ntype: epic\nid: EPIC-001\nstatut: validé\n---\n# Epic\n');
    await put('backlog/tasks/US-001 - Login.md', '---\ntype: story\nid: US-001\ntitle: Login\nstatut: brouillon\nstatus: À faire\n---\nbody\n');
    await put('backlog/tasks/notes.md', '# sans frontmatter\n');
    await put('docs/produit/autre.md', '---\ntype: inconnu\n---\nx\n');

    const arts = await scanArtifacts(root);
    const by = Object.fromEntries(arts.map((a) => [a.chemin, a]));
    expect(arts).toHaveLength(4);
    expect(by['docs/produit/prd.md']?.etat).toBe('validé');
    expect(by['docs/produit/brief.md']?.etat).toBe('non-validé');
    expect(by['docs/produit/epics/EPIC-001-x.md']?.etat).toBe('non-tracé');
    expect(by['docs/produit/epics/EPIC-001-x.md']?.id).toBe('EPIC-001');
    const story = by['backlog/tasks/US-001 - Login.md'];
    expect(story?.type).toBe('story');
    expect(story?.titre).toBe('Login');
    expect(story?.data['status']).toBe('À faire');
  });
});
