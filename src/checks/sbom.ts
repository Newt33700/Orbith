import { promises as fs } from 'node:fs';
import path from 'node:path';
import { collecterComposants, controlerLicences, politiqueDepuis, type Composant } from '../sbom/index.js';
import type { CheckContext, CheckResult } from './types.js';

function nomComplet(c: Composant): string {
  return `${c.ecosysteme === 'maven' && c.groupe ? `${c.groupe}:` : ''}${c.nom}${c.version ? `@${c.version}` : ''}`;
}

/** Contrôle des licences des composants (SBOM) selon le CSR (catégorie « Licences ») et `sbom.licences_interdites`. */
export async function run(ctx: CheckContext): Promise<CheckResult[]> {
  let csr: string | null = null;
  try {
    csr = await fs.readFile(path.resolve(ctx.root, ctx.config?.csr.fichier ?? '.orbith/csr/CSR.md'), 'utf8');
  } catch {
    // pas de CSR : seule la configuration compte
  }
  const politique = politiqueDepuis(csr, ctx.config?.sbom?.licences_interdites);
  if (politique.interdites.length + politique.arevoir.length === 0) return [];

  const controle = controlerLicences(await collecterComposants(ctx.root), politique);
  const res: CheckResult[] = controle.problemes.map((p) => ({
    categorie: 'sbom',
    niveau: p.niveau,
    message:
      p.niveau === 'erreur'
        ? `Licence interdite : ${nomComplet(p.composant)} est sous licence ${p.licence}, interdite par la politique de licences.`
        : `Licence à revoir : ${nomComplet(p.composant)} est sous licence ${p.licence} (dépréciée dans le CSR).`,
    fichier: p.composant.source,
  }));
  if (controle.sansLicence.length > 0) {
    res.push({
      categorie: 'sbom',
      niveau: 'info',
      message: `${controle.sansLicence.length} composant(s) sans licence déclarée (non contrôlables ; seul le fichier package-lock.json en fournit).`,
    });
  }
  return res;
}
