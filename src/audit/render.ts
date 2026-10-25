import { ETAT_LIBELLES, type AuditData } from './collect.js';
import { sansControleHumain } from '../cli/provenance.js';

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const e = escapeHtml;

const CSS = `
:root{--fg:#1f2933;--muted:#52606d;--bg:#fff;--line:#d9dee3;--soft:#f5f7fa;--ok-bg:#e3f6e8;--ok-fg:#14532d;--warn-bg:#fff4d6;--warn-fg:#7a4b00;--err-bg:#fde4e4;--err-fg:#8a1c1c;--info-bg:#e6effa;--info-fg:#1c4a85;--accent:#2b4c7e}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:var(--fg);background:var(--bg);line-height:1.5}
main{max-width:1100px;margin:0 auto;padding:24px 20px}
header h1{margin:0 0 4px;color:var(--accent)}
section{margin-top:32px}
h2{border-bottom:2px solid var(--accent);padding-bottom:4px;color:var(--accent)}
dl.meta{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;margin:12px 0}
dl.meta dt{font-weight:600;color:var(--muted)}dl.meta dd{margin:0}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;padding:0;list-style:none}
.kpis li{border:1px solid var(--line);border-radius:8px;padding:12px;background:var(--soft)}
.kpis .v{display:block;font-size:1.6rem;font-weight:700}.kpis .l{color:var(--muted);font-size:.9rem}
table{border-collapse:collapse;width:100%;margin:12px 0;font-size:.9rem}
caption{text-align:left;font-weight:600;padding:6px 0;color:var(--muted)}
th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
th{background:var(--soft)}
tr.pb td{background:var(--err-bg)}
code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.85em}
.badge{display:inline-block;padding:1px 8px;border-radius:10px;font-size:.8rem;font-weight:600;border:1px solid transparent;white-space:nowrap}
.b-ok{background:var(--ok-bg);color:var(--ok-fg);border-color:var(--ok-fg)}
.b-warn{background:var(--warn-bg);color:var(--warn-fg);border-color:var(--warn-fg)}
.b-err{background:var(--err-bg);color:var(--err-fg);border-color:var(--err-fg)}
.b-info{background:var(--info-bg);color:var(--info-fg);border-color:var(--info-fg)}
ul.plain{margin:0;padding-left:16px}
footer{margin-top:40px;border-top:1px solid var(--line);padding-top:12px;color:var(--muted);font-size:.9rem}
@media print{body{font-size:11pt}main{max-width:none;padding:0}section{page-break-before:always;break-before:page;margin-top:0}header+section{page-break-before:auto;break-before:auto}tr{page-break-inside:avoid}.badge{border-color:currentColor}}
`;

const CATEGORIES: [string, string][] = [
  ['csr', 'Cadre de référence (CSR)'],
  ['validations', 'Validations'],
  ['tracabilite', 'Traçabilité'],
  ['documentation', 'Documentation'],
  ['secrets', 'Secrets'],
  ['sbom', 'Licences (SBOM)'],
  ['provenance', 'Provenance IA'],
];

function badge(kind: 'ok' | 'warn' | 'err' | 'info', text: string): string {
  return `<span class="badge b-${kind}">${e(text)}</span>`;
}

function etatBadge(etat: string, libelle: string): string {
  return badge(etat === 'validé' ? 'ok' : etat === 'non-validé' ? 'info' : 'err', libelle);
}

function list(items: string[]): string {
  return items.length ? `<ul class="plain">${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : '—';
}

function provenanceSection(d: AuditData): string {
  const p = d.provenance;
  if (!p) return '';
  const rows = p.lignes
    .map((l) => {
      const alerte = sansControleHumain(l);
      const val = l.validation ? `${e(l.validation.par)} (${e(l.validation.le)})` : e(ETAT_LIBELLES[l.etat]);
      const revue = l.revueHumaine.length ? e(l.revueHumaine.join(', ')) : l.revueQa ? 'aucune (revue QA par agent seulement)' : 'aucune';
      return `<tr${alerte ? ' class="pb"' : ''}><th scope="row">${e(l.cle)}<br><small>${e(l.titre)}</small></th><td>${e(l.colonne ?? l.type)}</td><td>${list(l.commits.map((c) => `<code>${e(c.commit.slice(0, 7))}</code> ${e(c.ia.join(', '))}`))}</td><td>${e(l.modeles.join(', ') || 'inconnu')}</td><td>${val}</td><td>${alerte ? badge('warn', revue) : revue}</td></tr>`;
    })
    .join('');
  return `
<section id="provenance" aria-labelledby="h-provenance">
<h2 id="h-provenance">Provenance IA</h2>
<p>${e(p.commitsIa)} commit(s) portent un pied <code>Co-Authored-By:</code> désignant une IA${p.sansLien ? ` (dont ${e(p.sansLien)} sans US ni document lié)` : ''}. Les lignes en rouge signalent une US terminée sans validation humaine ni revue humaine du code tracées.</p>
<table><caption>Code et documents co-écrits par une IA, et contrôle humain associé</caption>
<thead><tr><th scope="col">US / document</th><th scope="col">Colonne</th><th scope="col">Commits IA</th><th scope="col">Modèle(s)</th><th scope="col">Validation humaine</th><th scope="col">Revue humaine du code</th></tr></thead>
<tbody>${rows || '<tr><td colspan="6">Aucune US ni aucun document lié à un commit co-écrit par une IA.</td></tr>'}</tbody></table>
</section>
`;
}

export function renderHtml(d: AuditData): string {
  const h = d.entete;
  const s = d.synthese;
  const kpi = (v: string, l: string): string => `<li><span class="v">${e(v)}</span><span class="l">${e(l)}</span></li>`;
  const colonnes = Object.entries(s.parColonne);
  const problemes = d.validations.filter((v) => v.probleme).length;

  const valRows = d.validations
    .map(
      (v) =>
        `<tr${v.probleme ? ' class="pb"' : ''}><td>${e(v.type)}</td><td>${e(v.id || '—')}</td><td>${e(v.titre || '—')}<br><code>${e(v.chemin)}</code></td><td>${e(v.statut)}</td><td>${etatBadge(v.etat, v.etatLibelle)}</td><td>${e(v.validePar || '—')}</td><td>${e(v.valideLe || '—')}</td></tr>`,
    )
    .join('');

  const traceRows = d.tracabilite
    .map(
      (t) =>
        `<tr><th scope="row">${e(t.id)}<br><small>${e(t.titre)}</small></th><td>${e(t.statut)}</td><td>${e(t.colonne)}</td><td>${list(t.commits.map((c) => `<code>${e(c.hash.slice(0, 7))}</code> ${e(c.subject)}`))}</td><td>${list(t.tests.map((x) => `<code>${e(x)}</code>`))}</td><td>${list(t.notes.map((x) => `<code>${e(x)}</code>`))}</td></tr>`,
    )
    .join('');

  const controles = CATEGORIES.map(([id, titre]) => {
    const rs = d.controles.filter((c) => c.categorie === id);
    const rows = rs.length
      ? rs
          .map(
            (r) =>
              `<tr><td>${badge(r.niveau === 'erreur' ? 'err' : r.niveau === 'avertissement' ? 'warn' : 'info', r.niveau)}</td><td>${e(r.message)}</td><td>${r.fichier ? `<code>${e(r.fichier)}</code>` : '—'}</td></tr>`,
          )
          .join('')
      : `<tr><td>${badge('ok', 'ok')}</td><td>Rien à signaler</td><td>—</td></tr>`;
    return `<table><caption>${e(titre)}</caption><thead><tr><th scope="col">Niveau</th><th scope="col">Constat</th><th scope="col">Fichier</th></tr></thead><tbody>${rows}</tbody></table>`;
  }).join('\n');

  const couverture = s.couvertureTracabilite === null ? 'n/a' : `${s.couvertureTracabilite} %`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rapport d'audit — ${e(h.projet)} — ${e(h.date)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<header>
<h1>Rapport d'audit — ${e(h.projet)}</h1>
<dl class="meta">
<dt>Projet</dt><dd>${e(h.projet)}</dd>
<dt>Date</dt><dd>${e(h.date)}</dd>
<dt>Version d'Orbith</dt><dd>${e(h.versionOrbith)}</dd>
<dt>Branche git</dt><dd>${e(h.branche)}</dd>
<dt>Commit (HEAD)</dt><dd><code>${e(h.commit)}</code></dd>
<dt>Auteur</dt><dd>${e(h.auteur)}</dd>
<dt>Piste</dt><dd>${e(h.piste)}</dd>
</dl>
</header>

<section id="synthese" aria-labelledby="h-synthese">
<h2 id="h-synthese">Synthèse</h2>
<ul class="kpis">
${kpi(String(s.artefacts), 'artefacts')}
${kpi(`${s.pourcentValides} %`, `validés (${s.valides}/${s.artefacts})`)}
${kpi(String(s.erreurs), 'erreurs de contrôle')}
${kpi(String(s.avertissements), 'avertissements')}
${kpi(couverture, `couverture de traçabilité (${s.usTraceesTerminees}/${s.usTerminees} US terminées avec commits et tests)`)}
</ul>
<table><caption>User stories par colonne du tableau</caption>
<thead><tr>${colonnes.map(([c]) => `<th scope="col">${e(c)}</th>`).join('')}</tr></thead>
<tbody><tr>${colonnes.map(([, n]) => `<td>${e(n)}</td>`).join('')}</tr></tbody></table>
</section>

<section id="validations" aria-labelledby="h-validations">
<h2 id="h-validations">Validations humaines</h2>
<p>${problemes === 0 ? badge('ok', 'Aucun problème') : badge('err', `${problemes} problème(s)`)} Les lignes en rouge signalent un document modifié après validation ou une validation non tracée.</p>
<table><caption>Validation humaine de chaque artefact</caption>
<thead><tr><th scope="col">Type</th><th scope="col">Id</th><th scope="col">Titre</th><th scope="col">Statut</th><th scope="col">État</th><th scope="col">Validé par</th><th scope="col">Date</th></tr></thead>
<tbody>${valRows || '<tr><td colspan="7">Aucun artefact.</td></tr>'}</tbody></table>
</section>

<section id="tracabilite" aria-labelledby="h-tracabilite">
<h2 id="h-tracabilite">Matrice de traçabilité</h2>
<table><caption>User stories, commits, tests et notes de livraison</caption>
<thead><tr><th scope="col">US</th><th scope="col">Statut</th><th scope="col">Colonne</th><th scope="col">Commits</th><th scope="col">Tests</th><th scope="col">Notes de livraison</th></tr></thead>
<tbody>${traceRows || '<tr><td colspan="6">Aucune user story.</td></tr>'}</tbody></table>
</section>
${provenanceSection(d)}
<section id="conformite" aria-labelledby="h-conformite">
<h2 id="h-conformite">Conformité CSR et contrôles</h2>
${controles}
</section>

<footer>
<p>Rapport généré par Orbith — l'IA propose, l'humain décide</p>
<p>Généré le ${e(h.genereLe)}. Ce rapport est un instantané de l'état du projet à cette date ; il ne reflète pas les modifications ultérieures.</p>
</footer>
</main>
</body>
</html>
`;
}
