import { promises as fs } from 'node:fs';
import path from 'node:path';
import { compareVersions, normalize, parseCsr, type CsrEntry } from './csr-parser.js';
import { detectStack, isDetectableTool, toolKey, type Runtime } from './detect/index.js';
import type { CheckContext, CheckResult } from './types.js';

const RUNTIME_ALIASES: Record<string, Runtime> = {
  node: 'node',
  nodejs: 'node',
  'node.js': 'node',
  java: 'java',
  jdk: 'java',
  python: 'python',
};

const RUNTIME_LABEL: Record<Runtime, string> = { node: 'Node.js', java: 'Java', python: 'Python' };

function runtimeOf(entry: CsrEntry): Runtime | undefined {
  return RUNTIME_ALIASES[normalize(entry.outil)];
}

/** « 20.11 » appartient à la ligne « 20 » ; « 3.11 » à « 3.11 » mais pas à « 3.9 ». Les « x » sont ignorés (« 1.x »). */
function sameVersionLine(version: string, line: string): boolean {
  const want = line.match(/\d+/g);
  const have = version.match(/\d+/g);
  if (!want || !have) return false;
  return want.every((n, i) => have[i] !== undefined && parseInt(have[i]!, 10) === parseInt(n, 10));
}

function depKey(s: string): string {
  return s.toLowerCase().replace(/_/g, '-');
}

export async function run(ctx: CheckContext): Promise<CheckResult[]> {
  const res: CheckResult[] = [];
  const rel = ctx.config?.csr.fichier ?? '.orbith/csr/CSR.md';
  const file = path.resolve(ctx.root, rel);
  let md: string;
  try {
    md = await fs.readFile(file, 'utf8');
  } catch {
    return [
      {
        categorie: 'csr',
        niveau: 'avertissement',
        message: `Fichier CSR introuvable (${rel}) : conformité au cadre de référence non vérifiée. Importe-le avec \`orbith csr import <fichier.xlsx>\`.`,
        fichier: rel,
      },
    ];
  }
  const entries = parseCsr(md);
  if (entries.length === 0) {
    return [
      {
        categorie: 'csr',
        niveau: 'avertissement',
        message: `Aucun outil lisible dans le CSR (${rel}) : vérifie le format des tableaux.`,
        fichier: rel,
      },
    ];
  }
  // Right after `orbith install` the CSR is still the public example: say so, without weakening any control.
  if (/EXEMPLE\s*:\s*ce fichier n'est pas le vrai r[ée]f[ée]rentiel/i.test(md)) {
    res.push({
      categorie: 'csr',
      niveau: 'info',
      message: `Le CSR (${rel}) est encore l'exemple fourni avec Orbith, pas le référentiel de ton entreprise : ses règles s'appliquent quand même. Remplace-le par le vrai (\`npx orbith csr sync\` ou \`npx orbith csr import\`).`,
      fichier: rel,
    });
  }
  const stack = await detectStack(ctx.root);
  const manifesteConnu = stack.runtimes.length > 0 || stack.dependances.length > 0;
  const seen = new Set<string>();
  const push = (r: CheckResult): void => {
    const k = `${r.niveau}|${r.message}|${r.fichier ?? ''}`;
    if (seen.has(k)) return;
    seen.add(k);
    res.push(r);
  };
  for (const e of entries) {
    const rt = runtimeOf(e);
    const depMatches = stack.dependances.filter((d) => depKey(d.nom) === depKey(e.outil));
    const rtMatches = rt ? stack.runtimes.filter((r) => r.runtime === rt) : [];
    const key = toolKey(e.outil);
    const toolMatches = stack.outils.filter((t) => t.aliases.includes(key));
    const present = rtMatches.length > 0 || depMatches.length > 0 || toolMatches.length > 0;
    const label = rt ? RUNTIME_LABEL[rt] : e.outil;
    const sources = [
      ...rtMatches.map((r) => r.source),
      ...depMatches.map((d) => d.source),
      ...toolMatches.map((t) => t.source),
    ];
    const where = [...new Set(sources)].join(', ');
    const note = e.commentaire ? ` (${e.commentaire})` : '';

    if (e.obligatoire && !present) {
      // Détectable : runtime, outil connu, ou bibliothèque quand un manifeste (package.json, pom.xml…) existe.
      const verifiable = rt !== undefined || isDetectableTool(e.outil) || manifesteConnu;
      push(
        verifiable
          ? {
              categorie: 'csr',
              niveau: 'erreur',
              message: `${label} est obligatoire selon le CSR mais n'est pas détecté dans le projet.`,
              fichier: rel,
            }
          : {
              categorie: 'csr',
              niveau: 'avertissement',
              message: `${label} est obligatoire selon le CSR : non vérifiable automatiquement, vérifie-le toi-même.`,
              fichier: rel,
            },
      );
    }
    if (!present) continue;

    // Une ligne « interdit » / « déprécié » avec une version ne vise que cette version
    // (ex. « Python 2.7 interdit » ne concerne pas un projet en Python 3.11).
    const versions = e.versionMin && rt ? rtMatches.filter((r) => r.version) : [];
    const concerne =
      !e.versionMin || !rt || versions.some((r) => sameVersionLine(r.version!, e.versionMin!));
    if (e.statut === 'interdit' && concerne) {
      push({
        categorie: 'csr',
        niveau: 'erreur',
        message: `${label}${e.versionMin && rt ? ` ${e.versionMin}` : ''} est interdit par le CSR${note} — utilisé dans ${where}.`,
        fichier: sources[0],
      });
    } else if (e.statut === 'déprécié' && concerne) {
      push({
        categorie: 'csr',
        niveau: 'avertissement',
        message: `${label}${e.versionMin && rt ? ` ${e.versionMin}` : ''} est déprécié selon le CSR${note} — utilisé dans ${where}.`,
        fichier: sources[0],
      });
    }
    if (e.versionMin && e.statut === 'autorisé') {
      for (const r of rtMatches) {
        if (!r.version || compareVersions(r.version, e.versionMin) >= 0) continue;
        // Version explicitement dépréciée (ou interdite) par une autre ligne : c'est cette ligne qui s'applique.
        const couverte = entries.some(
          (o) =>
            o !== e &&
            runtimeOf(o) === rt &&
            o.statut !== 'autorisé' &&
            o.versionMin !== undefined &&
            sameVersionLine(r.version!, o.versionMin),
        );
        if (couverte) continue;
        push({
          categorie: 'csr',
          niveau: 'erreur',
          message: `${label} ${r.version} (${r.source}) est inférieur à la version minimale du CSR (${e.versionMin}).`,
          fichier: r.source,
        });
      }
    }
  }
  return res;
}
