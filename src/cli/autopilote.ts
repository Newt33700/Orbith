import type { Command } from 'commander';
import pc from 'picocolors';
import { OrbithError, loadConfig, requireProjectRoot, scanAll, ui } from '../core/index.js';
import { buildContext, runAll } from '../checks/index.js';
import { calculerPlan, montant, type PlanAutopilote } from './autopilote-plan.js';

export { calculerPlan, dorRemplie, usEligibles, AUTOPILOTE_MAX_US_DEFAUT } from './autopilote-plan.js';
export type { PlanAutopilote } from './autopilote-plan.js';

export function renderPlan(p: PlanAutopilote): string {
  const out: string[] = [pc.bold(pc.cyan('Plan de l\'autopilote (borné, sans IA)')), ''];
  out.push(`  Périmètre : ${p.perimetre}`);
  out.push(`  Plafond : ${p.max_us} US en attente de revue au plus ${p.en_attente.length ? ` (déjà, tout le projet : ${p.en_attente.join(', ')})` : ' (tout le projet)'}`);
  const b = p.budget;
  out.push(
    `  Budget IA : ${b.plafond != null ? `${montant(b.consomme, b.devise)} consommés sur ${montant(b.plafond, b.devise)} (reste ${montant(b.restant ?? 0, b.devise)})` : `${montant(b.consomme, b.devise)} consommés, aucun plafond`}` +
      (b.consomme_projet !== b.consomme ? ` · total du projet : ${montant(b.consomme_projet, b.devise)}` : '') +
      (b.cout_moyen_us != null ? ` · coût moyen constaté par US : ${montant(b.cout_moyen_us, b.devise)}` : '') +
      pc.dim(' (estimations, pas une facture)'),
  );
  if (p.refus.length > 0) {
    out.push('', pc.bold(pc.red('Autopilote refusé :')));
    for (const r of p.refus) out.push(`  ❌ ${r}`);
  } else if (p.plan.length === 0) {
    out.push('', pc.yellow('Aucune US éligible : rien à enchaîner. Lance `npx orbith next`.'));
  } else {
    out.push('', pc.bold('US retenues, dans l\'ordre :'));
    for (const u of p.plan) {
      const dev = u.etapes[0];
      const qa = u.etapes[1];
      out.push(`  ${u.ordre}. ${pc.bold(u.id)}${u.titre ? ` : ${u.titre}` : ''}${u.epic ? pc.dim(` (${u.epic})`) : ''}`);
      out.push(`     Dev ${pc.bold(dev?.claude ?? '')} · QA ${pc.bold(qa?.claude ?? '')} · puis 🔒 ta revue`);
    }
  }
  if (p.ecartees.length > 0) {
    out.push('', pc.bold('US écartées :'));
    for (const e of p.ecartees) out.push(`  • ${e.id} : ${e.raison}`);
  }
  for (const a of p.avertissements) out.push('', `  ${pc.yellow('⚠️ ')} ${a}`);
  out.push('', pc.bold('🔒 Portes humaines qui arrêteront l\'exécution :'));
  for (const g of p.portes) out.push(`  • ${g.quand} : ${g.action}`);
  if (p.ok && p.plan.length > 0) {
    out.push('', `Pour lancer : ${pc.bold('/orbith:autopilote')} (Gemini) ou ${pc.bold('/orbith-autopilote')} (Claude), une US par session.`);
  }
  return out.join('\n');
}

export async function runAutopilote(
  cwd: string,
  cibles: string[],
  opts: { maxUs?: string; budget?: string; format?: string },
): Promise<PlanAutopilote> {
  const format = opts.format ?? 'texte';
  if (format !== 'texte' && format !== 'json') {
    throw new OrbithError(`Format inconnu : « ${format} » (attendu : texte ou json).`);
  }
  const root = await requireProjectRoot(cwd);
  const config = await loadConfig(root);
  const { artifacts, problems } = await scanAll(root);
  const erreursCheck = (await runAll(await buildContext(root))).filter((r) => r.niveau === 'erreur').map((r) => r.message);
  const plan = calculerPlan({
    artifacts,
    config,
    problemes: problems,
    erreursCheck,
    options: {
      cibles,
      ...(opts.maxUs != null ? { maxUs: opts.maxUs } : {}),
      ...(opts.budget != null ? { budget: opts.budget } : {}),
    },
  });
  if (!plan.ok) process.exitCode = 1;
  if (format === 'json') {
    console.log(JSON.stringify({ ...plan, erreurs_check: erreursCheck }, null, 2));
  } else {
    console.log(renderPlan(plan));
    if (erreursCheck.length > 0) ui.info('Détail des erreurs : npx orbith check');
    ui.rappelNouvelleSession();
  }
  return plan;
}

export function register(program: Command): void {
  program
    .command('autopilote')
    .description('Calcule le plan borné de l\'autopilote (US éligibles, plafond, budget, portes humaines), sans IA')
    .argument('[cibles...]', 'EPIC-NNN ou identifiants de US (défaut : tout le projet)')
    .option('--max-us <n>', `nombre maximum de US en attente de revue (défaut : config, sinon 3)`)
    .option('--budget <montant>', 'plafond de coût IA estimé pour le périmètre (défaut : config, sinon aucun)')
    .option('--format <format>', 'texte ou json', 'texte')
    .option('--cwd <dir>', 'dossier de travail')
    .action(async (cibles: string[], opts: { maxUs?: string; budget?: string; format?: string; cwd?: string }) => {
      await runAutopilote(opts.cwd ?? process.cwd(), cibles ?? [], opts);
    });
}
