import {
  CHANGE_RISQUES,
  CHANGE_TYPES,
  approbateursDuChangement,
  changeRisque,
  changeType,
  correspond,
  loadRegistry,
  planRetourArriere,
  scanArtifacts,
  valideursDuType,
  memePersonne,
  type Artifact,
} from '../core/index.js';
import type { CheckContext, CheckResult } from './types.js';

const filled = (v: unknown): boolean => v != null && String(v).trim() !== '' && !String(v).trim().startsWith('<');

/** Complétude d'une demande de changement (avertissements : le document peut encore être un brouillon). */
function controlerChange(a: Artifact): CheckResult[] {
  const res: CheckResult[] = [];
  const warn = (message: string): void => {
    res.push({ categorie: 'validations', niveau: 'avertissement', message, fichier: a.chemin });
  };
  const type = changeType(a);
  if (!type) warn(`Demande de changement : le champ \`changement\` doit valoir ${CHANGE_TYPES.join(', ')}.`);
  if (!changeRisque(a)) warn(`Demande de changement : le champ \`risque\` doit valoir ${CHANGE_RISQUES.join(', ')}.`);
  if (!filled(a.data['version'])) warn('Demande de changement : la version concernée (`version`) n\'est pas renseignée.');
  if (!planRetourArriere(a)) warn('Demande de changement : le plan de retour arrière est vide.');
  if (type !== 'standard') {
    if (!filled(a.data['fenetre_debut']) || !filled(a.data['fenetre_fin'])) {
      warn('Demande de changement : la fenêtre de déploiement (`fenetre_debut`, `fenetre_fin`) n\'est pas renseignée.');
    }
    if (approbateursDuChangement(a.data).length === 0) warn('Demande de changement : aucun approbateur (`approbateurs`) n\'est désigné.');
  }
  return res;
}

/** Matrice des rôles et quatre yeux, d'après le registre des validations (rien n'est signalé si la configuration est absente). */
async function controlerRoles(ctx: CheckContext, arts: Artifact[]): Promise<CheckResult[]> {
  const res: CheckResult[] = [];
  const cfg = ctx.config;
  if (!cfg?.roles) return res;
  const registre = await loadRegistry(ctx.root);
  for (const a of arts) {
    if (a.etat !== 'validé') continue;
    const e = registre.find((x) => x.fichier === a.chemin);
    if (!e) continue;
    const valideur = { name: e.par, email: e.email };
    const liste = valideursDuType(cfg, a.type);
    if (liste && !liste.some((x) => correspond(valideur, x))) {
      res.push({
        categorie: 'validations',
        niveau: 'erreur',
        message: `Validé par ${e.par} (${e.email}), qui n'est pas dans la liste des valideurs du type « ${a.type} » (${liste.join(', ')}).`,
        fichier: a.chemin,
      });
    }
    if (a.type === 'change') {
      const appro = approbateursDuChangement(a.data);
      if (appro.length > 0 && !appro.some((x) => correspond(valideur, x))) {
        res.push({
          categorie: 'validations',
          niveau: 'erreur',
          message: `Demande de changement validée par ${e.par}, qui ne fait pas partie des approbateurs (${appro.join(', ')}).`,
          fichier: a.chemin,
        });
      }
    }
    if (cfg.roles.quatre_yeux && e.auteur !== undefined && memePersonne({ name: e.auteur, email: e.auteur_email ?? '' }, valideur)) {
      res.push({
        categorie: 'validations',
        niveau: 'erreur',
        message: `Principe des quatre yeux : ${e.par} a validé un document dont il ou elle était l'auteur du dernier commit.`,
        fichier: a.chemin,
      });
    }
  }
  return res;
}

export async function run(ctx: CheckContext): Promise<CheckResult[]> {
  const arts = await scanArtifacts(ctx.root);
  return [...arts.filter((a) => a.type === 'change').flatMap(controlerChange), ...(await controlerRoles(ctx, arts))];
}
