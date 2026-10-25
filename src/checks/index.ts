import { loadConfig } from '../core/index.js';
import { run as runCsr } from './csr.js';
import { run as runSecrets } from './secrets.js';
import { run as runTracabilite } from './tracabilite.js';
import { run as runValidations } from './validations.js';
import { run as runSbom } from './sbom.js';
import { run as runDocumentation } from './documentation.js';
import { run as runExtraits } from './extraits.js';
import { run as runAgents } from './agents.js';
import { run as runProvenance } from './provenance.js';
import type { CheckContext, CheckResult } from './types.js';

export * from './types.js';
export { parseCsr, compareVersions } from './csr-parser.js';

export async function buildContext(root: string): Promise<CheckContext> {
  let config = null;
  try {
    config = await loadConfig(root);
  } catch {
    // configuration absente ou invalide : valeurs par défaut
  }
  return { root, config };
}

export async function runAll(ctx: CheckContext): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  for (const run of [runCsr, runValidations, runTracabilite, runDocumentation, runExtraits, runSecrets, runSbom, runAgents, runProvenance]) {
    try {
      out.push(...(await run(ctx)));
    } catch (e) {
      out.push({
        categorie: run === runCsr ? 'csr' : run === runValidations ? 'validations' : run === runTracabilite ? 'tracabilite' : run === runSbom ? 'sbom' : run === runDocumentation ? 'documentation' : run === runAgents ? 'agents' : run === runProvenance ? 'provenance' : 'secrets',
        niveau: 'erreur',
        message: `Échec de la vérification : ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }
  return out;
}
