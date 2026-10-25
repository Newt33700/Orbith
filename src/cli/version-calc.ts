import path from 'node:path';
import { gitCommitsSince, gitReachableTags, gitTags, storyStatus, type Artifact, type RawCommit } from '../core/index.js';
import { mentions } from './trace-report.js';

/** Story label that forces a major bump (case-insensitive). */
export const BREAKING_LABEL = 'breaking';

export type Bump = 'majeur' | 'mineur' | 'correctif';

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

export function parseSemVer(v: string): SemVer | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) } : null;
}

export function formatSemVer(v: SemVer): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

export function compareSemVer(a: SemVer, b: SemVer): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

export function applyBump(base: SemVer, bump: Bump): SemVer {
  if (bump === 'majeur') return { major: base.major + 1, minor: 0, patch: 0 };
  if (bump === 'mineur') return { major: base.major, minor: base.minor + 1, patch: 0 };
  return { major: base.major, minor: base.minor, patch: base.patch + 1 };
}

const RANK: Record<Bump, number> = { correctif: 1, mineur: 2, majeur: 3 };

export function maxBump(a: Bump | undefined, b: Bump): Bump {
  return a && RANK[a] >= RANK[b] ? a : b;
}

/** Highest `vX.Y.Z` tag reachable from HEAD (pre-releases, other tags and tags only on other branches are ignored). */
export async function lastReleaseTag(root: string): Promise<{ tag: string; version: SemVer } | null> {
  let best: { tag: string; version: SemVer } | null = null;
  for (const tag of await gitReachableTags(root)) {
    const version = parseSemVer(tag);
    if (version && /^v?\d+\.\d+\.\d+$/.test(tag) && (!best || compareSemVer(version, best.version) > 0)) best = { tag, version };
  }
  return best;
}

export interface ParsedCommit {
  hash: string;
  type: string;
  scope?: string;
  breaking: boolean;
  /** Description without the `type(scope):` prefix. */
  description: string;
  subject: string;
  /** Story ids found in the scope or the subject. */
  us: string[];
}

/** Parses a Conventional Commit; non-conforming subjects get the type `autre`. */
export function parseCommit(c: RawCommit, ids: string[]): ParsedCommit {
  const m = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.*)$/.exec(c.subject);
  const type = m ? m[1]!.toLowerCase() : 'autre';
  const breaking = (!!m && !!m[3]) || /^BREAKING[ -]CHANGE:/m.test(c.body);
  return {
    hash: c.hash,
    type,
    scope: m?.[2] || undefined,
    breaking,
    description: m ? m[4]! : c.subject,
    subject: c.subject,
    us: ids.filter((id) => mentions(c.subject, id)),
  };
}

export function isBug(s: Artifact): boolean {
  const labels = s.data['labels'];
  return Array.isArray(labels) && labels.some((l) => String(l).toLowerCase() === 'bug');
}

export function isBreakingStory(s: Artifact): boolean {
  const labels = s.data['labels'];
  return Array.isArray(labels) && labels.some((l) => String(l).toLowerCase() === BREAKING_LABEL);
}

export interface Reason {
  bump: Bump;
  text: string;
}

export interface VersionProposal {
  derniere: string | null;
  base: string;
  propose: string | null;
  bump: Bump | null;
  raisons: Reason[];
  commits: ParsedCommit[];
  /** Stories pending release (done and not yet in production, or cited by a commit since the last tag). */
  stories: Artifact[];
  /** Stories cited since the last tag but not « Terminée ». */
  nonTerminees: Artifact[];
}

/** Version a release-notes document is about (frontmatter `version`, else its file name), or null. */
export function versionDesNotes(n: Artifact): string | null {
  if (n.data['version'] != null) return String(n.data['version']).trim().replace(/^v/, '');
  const m = /^release-notes-(\d+\.\d+\.\d+)\.md$/.exec(path.posix.basename(n.chemin));
  return m ? m[1]! : null;
}

/**
 * Ids of the stories already shipped in a published version: cited by the release notes of a version
 * that has a `vX.Y.Z` (or `X.Y.Z`) tag. They must not be counted again for the next version, even
 * before `orbith deploiement` writes their `mis_en_prod_le`.
 */
export function storiesDejaLivrees(arts: Artifact[], tags: string[]): Set<string> {
  const publiees = new Set(tags.map((t) => t.replace(/^v/, '')));
  const notes = arts.filter((a) => a.type === 'release-notes' && publiees.has(versionDesNotes(a) ?? ''));
  const ids = new Set<string>();
  for (const s of arts) {
    if (s.type === 'story' && s.id && notes.some((n) => mentions(n.body, s.id!))) ids.add(s.id);
  }
  return ids;
}

/**
 * Stories concerned by the next version: done and never put in production, or touched by a recent commit.
 * Stories listed in `livrees` (already in a published version) are left out.
 */
export function storiesEnAttente(arts: Artifact[], commits: ParsedCommit[], livrees: Set<string> = new Set()): Artifact[] {
  return arts.filter((a) => {
    if (a.type !== 'story' || !a.id || a.data['mis_en_prod_le'] != null || livrees.has(a.id)) return false;
    return storyStatus(a) === 'Terminée' || commits.some((c) => c.us.includes(a.id!));
  });
}

/** Deterministic SemVer proposal (no AI): breaking → major, feat or story → minor, fix or bug → patch. */
export async function proposerVersion(root: string, arts: Artifact[]): Promise<VersionProposal> {
  const last = await lastReleaseTag(root);
  const ids = arts.filter((a) => a.type === 'story' && a.id).map((a) => a.id!);
  const commits = (await gitCommitsSince(root, last?.tag)).map((c) => parseCommit(c, ids));
  const stories = storiesEnAttente(arts, commits, storiesDejaLivrees(arts, await gitTags(root)));
  const raisons: Reason[] = [];
  let bump: Bump | null = null;
  const add = (b: Bump, text: string) => {
    raisons.push({ bump: b, text });
    bump = maxBump(bump ?? undefined, b);
  };
  for (const c of commits) {
    if (c.breaking) add('majeur', `commit à rupture : ${c.subject}`);
    else if (c.type === 'feat') add('mineur', `nouveauté : ${c.subject}`);
    else if (c.type === 'fix') add('correctif', `correction : ${c.subject}`);
  }
  for (const s of stories) {
    if (isBreakingStory(s)) add('majeur', `${s.id} porte l'étiquette « ${BREAKING_LABEL} »`);
    else if (storyStatus(s) === 'Terminée') {
      if (isBug(s)) add('correctif', `${s.id} (bug) terminée`);
      else add('mineur', `${s.id} terminée`);
    }
  }
  const base = last?.version ?? { major: 0, minor: 0, patch: 0 };
  const b = bump as Bump | null;
  return {
    derniere: last?.tag ?? null,
    base: formatSemVer(base),
    propose: b ? formatSemVer(applyBump(base, b)) : null,
    bump: b,
    raisons,
    commits,
    stories,
    nonTerminees: stories.filter((s) => storyStatus(s) !== 'Terminée'),
  };
}
