import type { OrbithConfig } from '../core/index.js';

export type CheckCategorie = 'csr' | 'validations' | 'tracabilite' | 'secrets' | 'sbom';
export type CheckNiveau = 'erreur' | 'avertissement' | 'info';

export interface CheckResult {
  categorie: CheckCategorie;
  niveau: CheckNiveau;
  message: string;
  fichier?: string;
}

export interface CheckContext {
  /** Racine du projet (dossier contenant .orbith/). */
  root: string;
  /** Configuration, ou null si elle est absente ou illisible. */
  config: OrbithConfig | null;
}
