import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = path.join(repo, 'bin', 'orbith.js');

interface Run {
  code: number | null;
  out: string;
  err: string;
}

let dir = '';
const run = (...args: string[]): Run => {
  const r = spawnSync(process.execPath, [cli, ...args, '--cwd', dir], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', GIT_CONFIG_NOSYSTEM: '1' },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

const STORY = 'backlog/tasks/us-001 - Connexion par email.md';
const storyText = `---
id: US-001
title: Connexion par email
status: À faire
assignee: []
created_date: 2026-10-25
labels: []
dependencies: []
type: story
statut: brouillon
epic: EPIC-001
---

## Description

En tant que visiteur
je veux me connecter avec mon email
afin d'accéder à mon espace.

## Critères d'acceptation

\`\`\`gherkin
@US-001
Fonctionnalité: Connexion par email

  Scénario: Connexion réussie
    Étant donné un compte existant
    Quand je saisis mon email et mon code
    Alors j'arrive sur mon espace
\`\`\`
`;

beforeAll(async () => {
  // Le parcours exécute la CLI compilée : on la construit si besoin.
  if (!existsSync(path.join(repo, 'dist', 'cli', 'index.js'))) {
    execFileSync(process.execPath, [path.join(repo, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.json'], {
      cwd: repo,
    });
  }
  dir = await mkdtemp(path.join(os.tmpdir(), 'orbith-e2e-'));
}, 120_000);

afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe('parcours complet : install → US → validation → modification', () => {
  it('installe, vérifie, guide, valide et détecte la modification', async () => {
    // 1. installation
    const install = run('install', '--yes', '--nom', 'demo');
    expect(install.code, install.err).toBe(0);
    expect(install.out).toContain('npx orbith next');
    expect(existsSync(path.join(dir, '.orbith', 'config.yaml'))).toBe(true);
    expect(existsSync(path.join(dir, '.gitlab-ci.yml'))).toBe(true);

    // 2. un projet neuf est conforme
    const check1 = run('check');
    expect(check1.code, check1.out + check1.err).toBe(0);

    // 3. next : pas de story -> PO
    const next1 = run('next');
    expect(next1.code).toBe(0);
    expect(next1.out).toContain('/orbith-po');
    expect(next1.out).toContain('/orbith:po');

    // identité git locale (valider la lit)
    for (const [k, v] of [
      ['user.name', 'Jane Doe'],
      ['user.email', 'jane@corp.fr'],
      ['commit.gpgsign', 'false'],
    ] as const) {
      execFileSync('git', ['config', k, v], { cwd: dir });
    }

    // 4. le PO écrit une story (nom en minuscules, comme Backlog.md)
    await mkdir(path.join(dir, 'backlog', 'tasks'), { recursive: true });
    await writeFile(path.join(dir, STORY), storyText, 'utf8');

    // 5. next : story non validée -> valider
    const next2 = run('next');
    expect(next2.out).toContain('npx orbith valider');
    expect(next2.out).toContain('us-001 - Connexion par email.md');

    // 6. validation humaine
    const val = run('valider', STORY, '--yes');
    expect(val.code, val.err).toBe(0);
    const validated = await readFile(path.join(dir, STORY), 'utf8');
    expect(validated).toMatch(/statut: validé/);
    expect(validated).toContain('valide_par: Jane Doe');
    expect(validated).toContain('status: À faire'); // la colonne du tableau n'est pas touchée
    expect(validated).toMatch(/created_date: '?2026-10-25'?\n/); // pas de réécriture en date ISO complète
    const registry = JSON.parse(await readFile(path.join(dir, '.orbith', 'validations.json'), 'utf8')) as {
      validations: { fichier: string }[];
    };
    expect(registry.validations.map((v) => v.fichier)).toEqual([STORY]);

    // 7. next : validée en « À faire » -> DoR puis Prête
    const next3 = run('next');
    expect(next3.out).toContain('DoR');
    expect(next3.out).toContain('Prête');
    expect(run('check').code).toBe(0);

    // 8. changer la colonne ne casse pas la validation (hash du corps seul)
    await writeFile(path.join(dir, STORY), validated.replace('status: À faire', 'status: Prête'), 'utf8');
    expect(run('check').code).toBe(0);
    expect(run('next').out).toContain('/orbith-dev US-001');

    // 9. modification du corps après validation
    await writeFile(path.join(dir, STORY), (await readFile(path.join(dir, STORY), 'utf8')) + '\nUn ajout non relu.\n', 'utf8');
    const check2 = run('check');
    expect(check2.code).toBe(1);
    expect(check2.out).toMatch(/modifié après validation/i);
    expect(run('next').out).toMatch(/modifié après sa validation/i);

    // 10. traçabilité
    const trace = run('trace');
    expect(trace.code).toBe(0);
    expect(trace.out).toContain('US-001');
    expect(run('trace', 'US-001').out).toContain('US-001');

    // 11. relancer install ne casse rien (idempotent)
    expect(run('install', '--yes').code).toBe(0);
    expect(await readFile(path.join(dir, STORY), 'utf8')).toContain('Un ajout non relu.');
  }, 120_000);

  it('affiche des erreurs en français hors projet', async () => {
    const vide = await mkdtemp(path.join(os.tmpdir(), 'orbith-e2e-vide-'));
    const r = spawnSync(process.execPath, [cli, 'next', '--cwd', vide], {
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1' },
    });
    await rm(vide, { recursive: true, force: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Aucun projet Orbith/);
  });
});
