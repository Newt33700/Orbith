import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GENESE,
  chainer,
  etatChaineRegistre,
  loadRegistry,
  recordValidation,
  verifierChaine,
  type ValidationEntry,
} from '../../src/core/index.js';
import { run } from '../../src/checks/validations.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'orbith-chaine-'));
  await mkdir(path.join(root, '.orbith'), { recursive: true });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const e = (fichier: string, sha256 = 'x'): ValidationEntry => ({ fichier, sha256, par: 'J', email: 'j@x.fr', le: '2026-10-25T10:00:00.000Z' });
const regFile = () => path.join(root, '.orbith', 'validations.json');
const lire = async () => JSON.parse(await readFile(regFile(), 'utf8')) as { validations: ValidationEntry[] };

describe('chaîne d\'audit : primitives', () => {
  it('chaîne depuis la genèse et vérifie', () => {
    const c = chainer([{ a: 1 }, { a: 2 }, { a: 3 }]);
    expect(c[0]!.precedent).toBe(GENESE);
    expect(c[1]!.precedent).toMatch(/^[0-9a-f]{64}$/);
    expect(verifierChaine(c)).toEqual({ etat: 'ok' });
    expect(verifierChaine([])).toEqual({ etat: 'vide' });
    expect(verifierChaine([{ a: 1 }])).toEqual({ etat: 'sans-chaine' });
  });

  it('est insensible à l\'ordre des clés, sensible à toute modification', () => {
    const c = chainer([{ a: 1, b: 2 }, { a: 3 }]);
    expect(verifierChaine([{ b: 2, a: 1, precedent: c[0]!.precedent }, c[1]!])).toEqual({ etat: 'ok' });
    expect(verifierChaine([{ ...c[0]!, b: 9 }, c[1]!])).toEqual({ etat: 'rompue', index: 1 });
  });

  it('détecte suppression au milieu et entrée sans chaîne parmi des entrées chaînées', () => {
    const c = chainer([{ a: 1 }, { a: 2 }, { a: 3 }]);
    expect(verifierChaine([c[0]!, c[2]!])).toEqual({ etat: 'rompue', index: 1 });
    expect(verifierChaine([c[0]!, { a: 2 }])).toEqual({ etat: 'rompue', index: 1 });
  });
});

describe('registre des validations chaîné', () => {
  it('chaîne les entrées et remplace celle d\'un fichier revalidé en gardant une chaîne valide', async () => {
    await recordValidation(root, e('a.md'));
    await recordValidation(root, e('b.md'));
    await recordValidation(root, e('a.md', 'y'));
    const reg = await lire();
    expect(reg.validations.map((v) => v.fichier)).toEqual(['b.md', 'a.md']);
    expect(reg.validations[0]!.precedent).toBe(GENESE);
    expect(await etatChaineRegistre(root)).toEqual({ etat: 'ok' });
  });

  it('migration douce : ancien registre sans chaîne accepté, puis chaîné au prochain enregistrement', async () => {
    await writeFile(regFile(), JSON.stringify({ version: 1, validations: [e('a.md'), e('b.md')] }));
    expect(await etatChaineRegistre(root)).toEqual({ etat: 'sans-chaine' });
    const avant = await run({ root, config: null });
    expect(avant).toHaveLength(1);
    expect(avant[0]).toMatchObject({ niveau: 'avertissement', fichier: '.orbith/validations.json' });
    expect(avant[0]!.message).toMatch(/sans chaîne d'audit/);

    await recordValidation(root, e('c.md'));
    expect((await loadRegistry(root)).map((v) => v.fichier)).toEqual(['a.md', 'b.md', 'c.md']);
    expect(await etatChaineRegistre(root)).toEqual({ etat: 'ok' });
    expect(await run({ root, config: null })).toEqual([]);
  });

  it('check signale une édition manuelle (erreur) et valider refuse de masquer la rupture', async () => {
    await recordValidation(root, e('a.md', 'vrai'));
    await recordValidation(root, e('b.md'));
    const reg = await lire();
    reg.validations[0]!.sha256 = 'falsifié';
    await writeFile(regFile(), JSON.stringify(reg));

    const r = await run({ root, config: null });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ niveau: 'erreur', fichier: '.orbith/validations.json' });
    expect(r[0]!.message).toMatch(/Chaîne d'audit rompue à l'entrée 2/);
    await expect(recordValidation(root, e('c.md'))).rejects.toThrow(/chaîne rompue/);
    expect((await lire()).validations).toHaveLength(2);
  });

  it('check signale aussi une chaîne rompue dans deploiements.json', async () => {
    const dep = chainer([
      { version: '1.0.0', env: 'production', date: '2026-10-01', par: 'J', email: 'j@x.fr', us: [] },
      { version: '1.1.0', env: 'production', date: '2026-10-10', par: 'J', email: 'j@x.fr', us: [] },
    ]);
    const f = path.join(root, '.orbith', 'deploiements.json');
    await writeFile(f, JSON.stringify({ version: 1, deploiements: dep }));
    expect(await run({ root, config: null })).toEqual([]);
    dep[0]!.date = '2026-01-01';
    await writeFile(f, JSON.stringify({ version: 1, deploiements: dep }));
    const r = await run({ root, config: null });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ niveau: 'erreur', fichier: '.orbith/deploiements.json' });
  });
});
