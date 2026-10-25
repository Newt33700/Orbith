import { promises as fs } from 'node:fs';
import path from 'node:path';
import { OrbithError } from './errors.js';
import { exists } from './fsutil.js';
import { parseDoc } from './frontmatter.js';
import { ORBITH_DIR, toPosixRelative } from './paths.js';
import { hashBody } from './validations.js';

/**
 * Sharding of large Markdown documents (SPEC §15). Everything here is deterministic and read-only with respect
 * to the source: extracts are a DERIVED copy under `.orbith/extraits/<nom>/`, never an Orbith artifact
 * (no `type` frontmatter) and never a replacement of a validated document.
 */

/** Seuil par défaut (jetons estimés) au-delà duquel un document est jugé volumineux. */
export const EXTRAITS_SEUIL_DEFAUT = 4000;
export const EXTRAITS_DIR = `${ORBITH_DIR}/extraits`;
const MARQUEUR = 'orbith-extrait';

/** Estimation grossière du nombre de jetons : caractères / 4, arrondi au supérieur. */
export function estimerJetons(texte: string): number {
  return Math.ceil(texte.length / 4);
}

export interface Section {
  /** Niveau du titre (1 à 6), 0 pour le préambule (texte avant le premier titre retenu). */
  niveau: number;
  titre: string;
  /** Texte de la section, titre inclus, sans retour à la ligne final superflu. */
  texte: string;
  jetons: number;
}

const RE_TITRE = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const RE_CLOTURE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Découpe un corps Markdown aux titres de niveau <= `niveau`. Les titres situés dans un bloc de code
 * (``` ou ~~~) sont ignorés. Le texte avant le premier titre devient une section « Introduction » (niveau 0).
 * Un titre de niveau inférieur sans contenu propre (ex. `# Titre` suivi directement de `## A`) n'est pas une section.
 */
export function decouperSections(corps: string, niveau: number): Section[] {
  const lignes = corps.replace(/\r\n/g, '\n').split('\n');
  const brutes: { niveau: number; titre: string; lignes: string[] }[] = [{ niveau: 0, titre: 'Introduction', lignes: [] }];
  let cloture: { car: string; long: number } | null = null;
  for (const ligne of lignes) {
    const f = RE_CLOTURE.exec(ligne);
    if (cloture) {
      if (f && f[1]![0] === cloture.car && f[1]!.length >= cloture.long && ligne.trim() === f[1]) cloture = null;
    } else if (f) {
      cloture = { car: f[1]![0]!, long: f[1]!.length };
    } else {
      const t = RE_TITRE.exec(ligne);
      if (t && t[2]!.trim() !== '' && t[1]!.length <= niveau) {
        brutes.push({ niveau: t[1]!.length, titre: t[2]!.trim(), lignes: [ligne] });
        continue;
      }
    }
    brutes[brutes.length - 1]!.lignes.push(ligne);
  }
  const out: Section[] = [];
  for (const b of brutes) {
    const texte = b.lignes.join('\n').replace(/^\n+/, '').replace(/\s+$/, '');
    if (texte === '') continue;
    const contenuPropre = b.niveau === 0 ? texte : b.lignes.slice(1).join('\n').trim();
    if (b.niveau !== 0 && b.niveau < niveau && contenuPropre === '') continue;
    out.push({ niveau: b.niveau, titre: b.titre, texte, jetons: estimerJetons(texte) });
  }
  return out;
}

/** Corps d'un fichier Markdown (frontmatter retiré) : celui dont `hashBody` donne l'empreinte de validation. */
export function corpsMarkdown(contenu: string): string {
  try {
    return parseDoc(contenu).body;
  } catch {
    return contenu.replace(/\r\n/g, '\n');
  }
}

export function slug(titre: string): string {
  const s = titre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '');
  return s || 'section';
}

export function nomExtrait(index: number, largeur: number, s: Section): string {
  return `${String(index).padStart(largeur, '0')}-${s.niveau === 0 ? 'introduction' : slug(s.titre)}.md`;
}

export interface MarqueurExtrait {
  source: string;
  sha256: string;
}

function marqueur(source: string, sha256: string, extra = ''): string {
  return `<!-- ${MARQUEUR} source=${JSON.stringify(source)} sha256=${sha256}${extra} -->`;
}

/** Lit le marqueur de la première ligne d'un fichier d'extrait ou d'index ; null s'il n'y en a pas. */
export function lireMarqueur(contenu: string): MarqueurExtrait | null {
  const m = /^<!-- orbith-extrait source=("(?:[^"\\]|\\.)*") sha256=([0-9a-f]{64})\b[^>]*-->/.exec(contenu.replace(/^﻿/, ''));
  if (!m) return null;
  try {
    return { source: JSON.parse(m[1]!) as string, sha256: m[2]! };
  } catch {
    return null;
  }
}

function echapperCellule(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\s+/g, ' ');
}

export function rendreExtrait(source: string, sha256: string, s: Section): string {
  return [
    marqueur(source, sha256),
    `> Extrait en lecture seule, dérivé de \`${source}\` (empreinte du corps : \`${sha256.slice(0, 12)}\`).`,
    '> Ne le modifie pas : modifie le document source, puis relance `npx orbith decouper`.',
    '',
    s.texte,
    '',
  ].join('\n');
}

export function rendreIndex(
  source: string,
  sha256: string,
  niveau: number,
  titreDoc: string,
  fichiers: { nom: string; section: Section }[],
  jetonsTotal: number,
): string {
  const lignes = fichiers.map(
    (f) => `| ${echapperCellule(f.section.niveau === 0 ? 'Introduction' : f.section.titre)} | ${f.section.jetons} | [${f.nom}](${f.nom}) |`,
  );
  return [
    marqueur(source, sha256, ` niveau=${niveau}`),
    `# Index : ${titreDoc}`,
    '',
    `> Découpage en lecture seule de \`${source}\` (niveau ${niveau}, empreinte du corps : \`${sha256.slice(0, 12)}\`).`,
    `> Document entier : environ ${jetonsTotal} jetons. Lis cet index, puis seulement les extraits utiles à ta tâche.`,
    '> Ne modifie pas ces fichiers : modifie le document source, puis relance `npx orbith decouper`.',
    '',
    '| Section | Jetons (≈) | Extrait |',
    '|---|---:|---|',
    ...lignes,
    '',
  ].join('\n');
}

export interface ResultatDecoupage {
  source: string;
  dossier: string;
  sha256: string;
  extraits: { nom: string; titre: string; jetons: number }[];
  jetonsTotal: number;
}

/** Dossier d'extraits par défaut d'un document : nom de fichier sans extension, normalisé. */
export function dossierExtraitsDefaut(source: string): string {
  return `${EXTRAITS_DIR}/${slug(path.basename(source, path.extname(source)))}`;
}

/**
 * Découpe `fichier` (chemin relatif à `root` ou absolu) au niveau `niveau` dans `sortie` (relatif à `root`,
 * défaut `.orbith/extraits/<nom>/`). Ne modifie jamais le source. Ne supprime que des fichiers qu'un
 * précédent découpage a créés (marqueur en première ligne).
 */
export async function decouper(root: string, fichier: string, niveau: number, sortie?: string): Promise<ResultatDecoupage> {
  if (!Number.isInteger(niveau) || niveau < 1 || niveau > 6) {
    throw new OrbithError(`Niveau de titre invalide : « ${niveau} » (attendu : un entier de 1 à 6).`);
  }
  const abs = path.resolve(root, fichier);
  const source = toPosixRelative(root, abs);
  if (source.startsWith('..') || path.isAbsolute(source)) {
    throw new OrbithError(`Le fichier ${fichier} est en dehors du projet : seul un document du projet peut être découpé.`);
  }
  if (source === EXTRAITS_DIR || source.startsWith(`${EXTRAITS_DIR}/`)) {
    throw new OrbithError('Ce fichier est déjà un extrait (dossier dérivé) : découpe le document source.');
  }
  if (!/\.(md|markdown)$/i.test(abs)) throw new OrbithError(`Le fichier ${fichier} n'est pas un document Markdown (.md).`);
  let contenu: string;
  try {
    contenu = await fs.readFile(abs, 'utf8');
  } catch {
    throw new OrbithError(`Fichier introuvable : ${fichier}`);
  }
  const corps = corpsMarkdown(contenu);
  const sha256 = hashBody(corps);
  const sections = decouperSections(corps, niveau);
  if (!sections.some((s) => s.niveau > 0)) {
    throw new OrbithError(`Aucun titre de niveau ${niveau} ou moins dans ${source} : rien à découper.`);
  }
  const rel = (sortie ?? dossierExtraitsDefaut(source)).replace(/\\/g, '/').replace(/\/+$/, '');
  const dossier = path.resolve(root, rel);
  if (path.relative(root, dossier).startsWith('..') || dossier === path.resolve(root)) {
    throw new OrbithError('Le dossier de sortie doit être un sous-dossier du projet.');
  }
  if (path.dirname(abs) === dossier) {
    throw new OrbithError('Le dossier de sortie ne peut pas être celui du document source : choisis un dossier dédié.');
  }

  // Dossier existant : doit venir d'un découpage de ce même document (ou être vide).
  const indexPath = path.join(dossier, 'index.md');
  const anciens: string[] = [];
  if (await exists(dossier)) {
    const entrees = await fs.readdir(dossier);
    if (entrees.length > 0) {
      const m = (await exists(indexPath)) ? lireMarqueur(await fs.readFile(indexPath, 'utf8')) : null;
      if (!m) {
        throw new OrbithError(`Le dossier ${rel} existe et n'a pas été créé par \`orbith decouper\` : choisis un autre dossier avec --sortie.`);
      }
      if (m.source !== source) {
        throw new OrbithError(`Le dossier ${rel} contient le découpage de ${m.source}. Choisis un autre dossier avec --sortie.`);
      }
      for (const e of entrees) {
        if (!e.endsWith('.md')) continue;
        if (lireMarqueur(await fs.readFile(path.join(dossier, e), 'utf8'))) anciens.push(e);
      }
    }
  }

  const largeur = Math.max(2, String(sections.length).length);
  const fichiers = sections.map((section, i) => ({ nom: nomExtrait(i, largeur, section), section }));
  const titreDoc = /^#\s+(.+?)\s*$/m.exec(corps.replace(/\r\n/g, '\n'))?.[1] ?? path.basename(source);
  const jetonsTotal = estimerJetons(corps);

  await fs.mkdir(dossier, { recursive: true });
  for (const a of anciens) await fs.rm(path.join(dossier, a), { force: true });
  for (const f of fichiers) await fs.writeFile(path.join(dossier, f.nom), rendreExtrait(source, sha256, f.section), 'utf8');
  await fs.writeFile(indexPath, rendreIndex(source, sha256, niveau, titreDoc, fichiers, jetonsTotal), 'utf8');
  return {
    source,
    dossier: rel,
    sha256,
    extraits: fichiers.map((f) => ({ nom: f.nom, titre: f.section.titre, jetons: f.section.jetons })),
    jetonsTotal,
  };
}

export interface IndexExtraits {
  /** Dossier de l'index, relatif à la racine du projet. */
  dossier: string;
  source: string;
  sha256: string;
}

/** Index d'extraits trouvés dans `.orbith/extraits/*` (un niveau de sous-dossiers). */
export async function listerExtraits(root: string): Promise<IndexExtraits[]> {
  const base = path.join(root, ORBITH_DIR, 'extraits');
  let noms: string[];
  try {
    noms = (await fs.readdir(base, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return [];
  }
  const out: IndexExtraits[] = [];
  for (const n of noms) {
    try {
      const m = lireMarqueur(await fs.readFile(path.join(base, n, 'index.md'), 'utf8'));
      if (m) out.push({ dossier: `${EXTRAITS_DIR}/${n}`, ...m });
    } catch {
      // pas d'index lisible : ignoré
    }
  }
  return out;
}

export interface ExtraitPerime {
  dossier: string;
  source: string;
  /** 'modifie' : le corps du source a changé ; 'absent' : le source n'existe plus. */
  raison: 'modifie' | 'absent';
}

/** Extraits dont le document source a changé (empreinte du corps différente) ou disparu. Lecture seule. */
export async function extraitsPerimes(root: string): Promise<ExtraitPerime[]> {
  const out: ExtraitPerime[] = [];
  for (const i of await listerExtraits(root)) {
    let contenu: string;
    try {
      contenu = await fs.readFile(path.resolve(root, i.source), 'utf8');
    } catch {
      out.push({ dossier: i.dossier, source: i.source, raison: 'absent' });
      continue;
    }
    if (hashBody(corpsMarkdown(contenu)) !== i.sha256) out.push({ dossier: i.dossier, source: i.source, raison: 'modifie' });
  }
  return out;
}

export interface DocumentVolumineux {
  chemin: string;
  jetons: number;
}

/** Documents (artefacts scannés) dont le corps dépasse `seuil` jetons et qui n'ont aucun extrait. */
export async function documentsVolumineux(
  root: string,
  artefacts: { chemin: string; body: string }[],
  seuil: number,
): Promise<DocumentVolumineux[]> {
  const deja = new Set((await listerExtraits(root)).map((i) => i.source));
  return artefacts
    .map((a) => ({ chemin: a.chemin, jetons: estimerJetons(a.body) }))
    .filter((d) => d.jetons > seuil && !deja.has(d.chemin))
    .sort((a, b) => a.chemin.localeCompare(b.chemin));
}
