import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { chaineResultats } from '../../src/checks/chaine.js';
import { chainer, entreesPerdues, recordValidation, type ValidationEntry } from '../../src/core/index.js';
import { commit, makeProject, put } from '../cli/helpers.js';

const roots: string[] = [];
afterEach(async () => {
  for (const r of roots.splice(0)) await rm(r, { recursive: true, force: true });
});

const e = (fichier: string, sha256 = 'a'): ValidationEntry => ({
  fichier,
  sha256,
  par: 'J',
  email: 'j@x.fr',
  le: '2026-10-25T10:00:00.000Z',
});
const reg = (root: string) => path.join(root, '.orbith', 'validations.json');
const dep = (root: string) => path.join(root, '.orbith', 'deploiements.json');
const messages = async (root: string) => (await chaineResultats(root)).filter((r) => r.niveau === 'erreur').map((r) => r.message);

async function projetGit(): Promise<string> {
  const root = await makeProject('evolution', true);
  roots.push(root);
  return root;
}
async function lire(root: string): Promise<ValidationEntry[]> {
  return (JSON.parse(await readFile(reg(root), 'utf8')) as { validations: ValidationEntry[] }).validations;
}

describe('suppression d’entrées d’un registre chaîné (comparaison à HEAD)', () => {
  it('détecte le retrait de la DERNIÈRE entrée de validations.json (la chaîne reste valide)', async () => {
    const root = await projetGit();
    await recordValidation(root, e('a.md'));
    await recordValidation(root, e('b.md'));
    commit(root, 'valid');
    expect(await messages(root)).toEqual([]);
    const l = await lire(root);
    await writeFile(reg(root), JSON.stringify({ version: 1, validations: l.slice(0, 1) }, null, 2));
    const m = await messages(root);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatch(/Entrée supprimée ou modifiée[\s\S]*b\.md/);
  });

  it('détecte la suppression du fichier de validations commité', async () => {
    const root = await projetGit();
    await recordValidation(root, e('a.md'));
    commit(root, 'valid');
    await rm(reg(root));
    expect((await messages(root))[0]).toMatch(/Entrée supprimée ou modifiée/);
  });

  it('pas de faux positif : valider un nouveau fichier, ou revalider le même, avant commit', async () => {
    const root = await projetGit();
    await recordValidation(root, e('a.md'));
    await recordValidation(root, e('b.md'));
    commit(root, 'valid');
    await recordValidation(root, e('c.md')); // nouvelle validation non commitée
    expect(await messages(root)).toEqual([]);
    await recordValidation(root, e('a.md', 'autre-sha')); // revalidation légitime (réordonne et rechaîne)
    expect(await messages(root)).toEqual([]);
    commit(root, 'revalid');
    expect(await messages(root)).toEqual([]);
  });

  it('pas de faux positif : projet sans commit, registre non suivi, ou hors dépôt Git', async () => {
    const root = await projetGit();
    await recordValidation(root, e('a.md'));
    expect(await messages(root)).toEqual([]); // aucun HEAD
    commit(root, 'init');
    await rm(reg(root));
    await put(root, 'x.txt', 'x');
    commit(root, 'sans registre');
    expect(await messages(root)).toEqual([]); // plus suivi à HEAD
    const hors = await makeProject('evolution', false);
    roots.push(hors);
    await recordValidation(hors, e('a.md'));
    expect(await messages(hors)).toEqual([]);
  });

  it('deploiements.json : retrait de la dernière entrée ou modification détectés, ajout toléré', async () => {
    const root = await projetGit();
    const d = (v: string) => ({ version: v, env: 'prod', date: '2026-10-25', par: 'J', email: 'j@x.fr', us: [] });
    const ecrire = (l: object[]) => writeFile(dep(root), JSON.stringify({ version: 1, deploiements: chainer(l) }, null, 2));
    await ecrire([d('1.0.0'), d('1.1.0')]);
    commit(root, 'deploiements');
    await ecrire([d('1.0.0'), d('1.1.0'), d('1.2.0')]);
    expect(await messages(root)).toEqual([]);
    await ecrire([d('1.0.0')]);
    expect((await messages(root))[0]).toMatch(/déploiements[\s\S]*1\.1\.0 \/ prod/);
    await ecrire([d('1.0.0'), { ...d('1.1.0'), env: 'test' }]);
    expect((await messages(root))[0]).toMatch(/Entrée supprimée ou modifiée/);
  });
});

describe('entreesPerdues', () => {
  it('append-seul : préfixe inchangé requis', () => {
    const l = chainer([{ n: 1 }, { n: 2 }]);
    expect(entreesPerdues(l, l, 'append-seul')).toEqual([]);
    expect(entreesPerdues(l, l.slice(0, 1), 'append-seul')).toEqual([1]);
  });
});
