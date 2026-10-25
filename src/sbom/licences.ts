import { normalize, parseCsr } from '../checks/csr-parser.js';
import type { Composant } from './collect.js';

export interface PolitiqueLicences {
  /** Licences interdites (erreur). */
  interdites: string[];
  /** Licences à revoir (avertissement). */
  arevoir: string[];
}

export interface ProblemeLicence {
  composant: Composant;
  licence: string;
  niveau: 'erreur' | 'avertissement';
}

export interface ControleLicences {
  politiqueActive: boolean;
  problemes: ProblemeLicence[];
  /** Composants dont la licence n'est pas connue (donc non contrôlables). */
  sansLicence: Composant[];
}

/** « GPL-3.0-only », « gpl-3.0+ » → « gpl-3.0 ». */
function canon(l: string): string {
  return l.trim().toLowerCase().replace(/(-only|-or-later|\+)$/, '');
}

function correspond(licence: string, liste: string[]): boolean {
  const l = canon(licence);
  return liste.some((x) => {
    const p = canon(x);
    return p !== '' && (l === p || (l.startsWith(p) && /[-.]/.test(l[p.length] ?? '')));
  });
}

/**
 * Évalue une expression SPDX simple : « A OR B » n'est problématique que si toutes les alternatives le sont ;
 * « A AND B » (ou « A WITH exception ») l'est dès qu'un terme l'est.
 */
function expressionDans(expr: string, liste: string[]): string | undefined {
  const alternatives = expr.replace(/[()]/g, ' ').split(/\s+OR\s+/i);
  const trouvees: string[] = [];
  for (const alt of alternatives) {
    const termes = alt.split(/\s+(?:AND|WITH)\s+/i).map((t) => t.trim()).filter(Boolean);
    const hit = termes.find((t) => correspond(t, liste));
    if (!hit) return undefined;
    trouvees.push(hit);
  }
  return trouvees[0];
}

/** Politique issue du CSR (catégorie « Licences » : interdit / déprécié) et de `sbom.licences_interdites`. */
export function politiqueDepuis(csrMarkdown: string | null, configInterdites: string[] = []): PolitiqueLicences {
  const interdites = [...configInterdites];
  const arevoir: string[] = [];
  if (csrMarkdown) {
    for (const e of parseCsr(csrMarkdown)) {
      if (!normalize(e.categorie).startsWith('licence')) continue;
      if (e.statut === 'interdit') interdites.push(e.outil);
      else if (e.statut === 'déprécié') arevoir.push(e.outil);
    }
  }
  return { interdites, arevoir };
}

export function controlerLicences(composants: Composant[], politique: PolitiqueLicences): ControleLicences {
  const politiqueActive = politique.interdites.length + politique.arevoir.length > 0;
  const res: ControleLicences = { politiqueActive, problemes: [], sansLicence: [] };
  if (!politiqueActive) return res;
  for (const c of composants) {
    if (!c.licence) {
      res.sansLicence.push(c);
      continue;
    }
    const interdite = expressionDans(c.licence, politique.interdites);
    if (interdite) {
      res.problemes.push({ composant: c, licence: c.licence, niveau: 'erreur' });
      continue;
    }
    if (expressionDans(c.licence, politique.arevoir)) res.problemes.push({ composant: c, licence: c.licence, niveau: 'avertissement' });
  }
  return res;
}
