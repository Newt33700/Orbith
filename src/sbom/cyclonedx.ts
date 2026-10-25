import { createHash } from 'node:crypto';
import type { Composant } from './collect.js';

export interface CycloneDx {
  bomFormat: 'CycloneDX';
  specVersion: '1.5';
  serialNumber: string;
  version: 1;
  metadata: { component: { type: 'application'; name: string }; tools: { components: { type: 'application'; name: string; version?: string }[] } };
  components: {
    type: 'library';
    'bom-ref': string;
    group?: string;
    name: string;
    version?: string;
    scope: 'required' | 'optional';
    purl: string;
    licenses?: ({ expression: string } | { license: { name: string } })[];
  }[];
}

/** UUID déterministe dérivé du contenu : le même inventaire donne le même SBOM, octet pour octet. */
function serie(nom: string, composants: Composant[]): string {
  const h = createHash('sha256').update(nom + '\n' + composants.map((c) => c.purl).join('\n'), 'utf8').digest('hex');
  return `urn:uuid:${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Expression SPDX simple (identifiants, AND/OR/WITH, parenthèses) ou texte libre. */
function estExpressionSpdx(l: string): boolean {
  if (!/^[A-Za-z0-9.+\-() ]+$/.test(l)) return false;
  const tokens = l.split(/[\s()]+/).filter(Boolean);
  let attendId = true;
  for (const t of tokens) {
    const op = t === 'AND' || t === 'OR' || t === 'WITH';
    if (op === attendId) return false;
    attendId = op;
  }
  return !attendId;
}

/** SBOM CycloneDX 1.5 minimal (JSON), sans horodatage pour rester reproductible. */
export function versCycloneDx(projet: string, composants: Composant[], orbithVersion?: string): CycloneDx {
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: serie(projet, composants),
    version: 1,
    metadata: {
      component: { type: 'application', name: projet },
      tools: { components: [{ type: 'application', name: 'orbith', ...(orbithVersion ? { version: orbithVersion } : {}) }] },
    },
    components: composants.map((c) => ({
      type: 'library' as const,
      'bom-ref': c.purl,
      ...(c.groupe ? { group: c.groupe } : {}),
      name: c.nom,
      ...(c.version ? { version: c.version } : {}),
      scope: c.portee,
      purl: c.purl,
      ...(c.licence
        ? { licenses: [estExpressionSpdx(c.licence) ? { expression: c.licence } : { license: { name: c.licence } }] }
        : {}),
    })),
  };
}
