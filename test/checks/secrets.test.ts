import { describe, expect, it } from 'vitest';
import { run, mask } from '../../src/checks/secrets.js';
import { git, initRepo, useProject } from './helpers.js';

const fx = useProject();
const AWS = 'AKIAIOSFODNN7EXAMPLE';
const PWD = 'hunter2hunter2';

describe('check secrets', () => {
  it('détecte les secrets et masque les valeurs (parcours sans git)', async () => {
    await fx.put('src/a.ts', `const k = '${AWS}';\nconst password = "${PWD}";\n`);
    await fx.put('key.pem', '-----BEGIN RSA PRIVATE KEY-----\nabc\n');
    await fx.put('.env', 'X=1');
    await fx.put('node_modules/x/leak.js', `const k='${AWS}'`);
    await fx.put('dist/leak.js', `const k='${AWS}'`);
    await fx.put('big.txt', `${AWS}\n` + 'a'.repeat(1024 * 1024 + 10));
    await fx.put('bin.dat', `\0${AWS}`);
    const r = await run({ root: fx.root, config: null });
    expect(r.every((x) => x.niveau === 'erreur' && x.categorie === 'secrets')).toBe(true);
    const files = r.map((x) => x.fichier).sort();
    expect(files).toEqual(['.env', 'key.pem', 'src/a.ts', 'src/a.ts']);
    const out = JSON.stringify(r);
    expect(out).not.toContain(AWS);
    expect(out).not.toContain(PWD);
    expect(out).toContain('AKIA****');
  });

  it('utilise git ls-files quand disponible', async () => {
    initRepo(fx.root);
    await fx.put('tracked.ts', `x = '${AWS}'`);
    await fx.put('untracked.ts', `x = '${AWS}'`);
    git(fx.root, 'add', 'tracked.ts');
    const r = await run({ root: fx.root, config: null });
    expect(r.map((x) => x.fichier)).toEqual(['tracked.ts']);
  });

  it('mask ne révèle jamais la valeur complète', () => {
    expect(mask('abc')).toBe('****');
    expect(mask('supersecretvalue')).toBe('supe****');
  });

  it('ignore les valeurs d\'exemple et les références à des variables', async () => {
    await fx.put(
      'doc.md',
      'password = "${DB_PASSWORD}"\npassword = "<ton-mot-de-passe>"\npassword = "changeme"\nLe mot de passe (password) ne doit jamais être écrit.\n',
    );
    expect(await run({ root: fx.root, config: null })).toEqual([]);
  });
});
