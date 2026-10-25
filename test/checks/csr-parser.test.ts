import { describe, expect, it } from 'vitest';
import { compareVersions, parseCsr } from '../../src/checks/csr-parser.js';
import { CSR } from './helpers.js';

describe('parseCsr', () => {
  it('parse les sections et les tableaux du SPEC §7', () => {
    const e = parseCsr(CSR);
    expect(e).toHaveLength(6);
    expect(e[1]).toMatchObject({ categorie: 'Langages', outil: 'Node.js', versionMin: '22', statut: 'autorisé', commentaire: 'LTS uniquement' });
    expect(e[4]).toMatchObject({ categorie: 'Frameworks', outil: 'AngularJS', statut: 'interdit' });
    expect(e[4]!.versionMin).toBeUndefined();
    expect(e[5]!.statut).toBe('déprécié');
  });

  it('ignore accents et casse, garde les colonnes supplémentaires', () => {
    const md = `## X\n| OUTIL | Équipe | VERSION MIN | STATUT |\n|---|---|---|---|\n| lib | Core | 1.2 | DEPRECIE |\n| ldap | Sec | | Obligatoire |\n| old | Sec | | Interdit |`;
    const e = parseCsr(md);
    expect(e[0]).toMatchObject({ outil: 'lib', versionMin: '1.2', statut: 'déprécié', extra: { 'Équipe': 'Core' } });
    expect(e[1]).toMatchObject({ statut: 'autorisé', obligatoire: true });
    expect(e[2]!.statut).toBe('interdit');
  });

  it('gère les pipes échappés et un document sans tableau', () => {
    expect(parseCsr('# Rien')).toEqual([]);
    const e = parseCsr('## A\n| Outil | Commentaire |\n|---|---|\n| x | a \\| b |');
    expect(e[0]!.commentaire).toBe('a | b');
  });
});

describe('compareVersions', () => {
  it('compare numériquement par segments', () => {
    expect(compareVersions('22', '20.11')).toBe(1);
    expect(compareVersions('17', '21')).toBe(-1);
    expect(compareVersions('3.11', '3.11.0')).toBe(0);
    expect(compareVersions('3.9', '3.11')).toBe(-1);
    expect(compareVersions('v20.1', '20.01')).toBe(0);
  });
});
