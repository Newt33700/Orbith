import type { AutoEvaluationFiabilite, ObjectifMesure, Reprise, ResultatSla } from './fiabilite-calc.js';

// Text and CSV rendering of the reliability part of `orbith metriques` (SLA, rework rate, self-assessment).

const fr = (n: number): string => String(n).replace('.', ',');
const NM = 'non mesurable';

function etat(o: ObjectifMesure): string {
  return o.atteint == null ? NM : o.atteint ? 'atteint' : 'non atteint';
}

function mesure(o: ObjectifMesure): string {
  if (o.valeur == null) return NM;
  if (o.cle === 'disponibilite') return `${fr(o.valeur)} %`;
  return `${o.respectes}/${o.mesures} dans le délai, pire cas ${fr(o.valeur)} ${o.unite}`;
}

const cibleTexte = (o: ObjectifMesure): string => `${o.sens === 'min' ? 'au moins' : 'au plus'} ${fr(o.cible)} ${o.unite}`;

export function renderReprise(r: Reprise): string[] {
  const v =
    r.pourcentage == null
      ? NM
      : `${fr(r.pourcentage)} % (${r.deploiementsDeReprise} mise(s) en production sur ${r.deploiements} livrant le correctif d'un bug de production)${r.avertissement ? ` : ${r.avertissement}` : ''}`;
  return [
    '## Taux de reprise des déploiements',
    '',
    `Taux de reprise : ${v}.`,
    '',
    "Cinquième indicateur de livraison DORA depuis le rapport 2024 (*deployment rework rate*) : part des mises en production non planifiées, faites pour corriger un bug visible des utilisateurs. DORA ne publie pas de niveau pour cet indicateur : Orbith n'en affiche pas.",
    '',
  ];
}

export function renderSla(sla: ResultatSla | undefined, autoEvals: AutoEvaluationFiabilite[]): string[] {
  const L: string[] = [];
  if (!sla && autoEvals.length === 0) return L;
  L.push('## Fiabilité et objectifs de service', '');
  if (sla) {
    if (sla.objectifs.length) {
      L.push('| Objectif | Cible | Mesuré | Résultat | Remarque |', '|---|---|---|---|---|');
      for (const o of sla.objectifs) {
        L.push(`| ${o.libelle} | ${cibleTexte(o)} | ${mesure(o)} | ${etat(o)} | ${o.remarque ?? '—'} |`);
      }
      L.push('', `Bilan : ${sla.bilan.atteints} atteint(s), ${sla.bilan.nonAtteints} non atteint(s), ${sla.bilan.nonMesurables} non mesurable(s).`);
    } else {
      L.push('Section `sla` présente dans la configuration, mais aucun objectif renseigné.');
    }
    for (const a of sla.avertissements) L.push('', `⚠️ ${a}`);
    L.push(
      '',
      "La disponibilité est une estimation : chaque incident déclaré compte comme une indisponibilité entre `detecte_le` et `retabli_le`. Elle ne remplace pas la supervision de production.",
    );
  }
  if (autoEvals.length) {
    L.push('', "Auto-évaluation de la fiabilité par l'équipe (rétrospectives, sans niveau DORA) :", '');
    for (const e of autoEvals) L.push(`- ${e.version ? `version ${e.version}` : e.source} : ${e.valeur}`);
  }
  L.push('');
  return L;
}

/** CSV rows (same columns as the main export) for the reliability part. */
export function lignesCsvFiabilite(r: Reprise, sla: ResultatSla | undefined): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [
    ['dora', 'Taux de reprise des déploiements', r.pourcentage ?? NM, '%', r.deploiementsDeReprise, NM, '', '', '', ''],
  ];
  for (const o of sla?.objectifs ?? []) {
    rows.push([
      'sla',
      o.libelle,
      o.valeur ?? NM,
      o.cle === 'disponibilite' ? '%' : `${o.unite} (pire cas)`,
      o.mesures,
      '',
      '',
      '',
      o.cible,
      o.atteint == null ? NM : o.atteint ? 'oui' : 'non',
    ]);
  }
  return rows;
}
