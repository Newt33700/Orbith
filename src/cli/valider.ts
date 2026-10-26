import path from 'node:path';
import type { Command } from 'commander';
import { confirm, isCancel } from '@clack/prompts';
import {
  ARTIFACT_TYPES,
  OrbithError,
  estValide,
  exists,
  gitLastAuthor,
  gitUser,
  loadConfig,
  refusQuatreYeux,
  refusRole,
  hashBody,
  loadRegistry,
  readDoc,
  recordValidation,
  requireProjectRoot,
  toPosixRelative,
  ui,
  writeDoc,
} from '../core/index.js';

const TYPES: readonly string[] = ARTIFACT_TYPES;

export interface ValiderOptions {
  cwd?: string;
  yes?: boolean;
}

/** Retourne true si le document a été (ou était déjà) validé, false si annulé. */
export async function runValider(fichier: string, opts: ValiderOptions = {}): Promise<boolean> {
  const cwd = path.resolve(opts.cwd ?? process.cwd());
  const root = await requireProjectRoot(cwd);
  let abs = path.resolve(cwd, fichier);
  if (!(await exists(abs)) && (await exists(path.resolve(root, fichier)))) abs = path.resolve(root, fichier);
  if (!(await exists(abs))) throw new OrbithError(`Fichier introuvable : ${fichier}`);

  let doc;
  try {
    doc = await readDoc(abs);
  } catch {
    throw new OrbithError(`Impossible de lire le fichier : ${fichier}`);
  }
  const type = doc.data['type'];
  if (typeof type !== 'string' || !TYPES.includes(type)) {
    throw new OrbithError(
      `${fichier} n'est pas un document Orbith : il manque l'en-tête (frontmatter) avec le champ \`type\` (brief, prd, epic, story…).`,
    );
  }
  const rel = toPosixRelative(root, abs);
  if (rel.startsWith('../') || rel === '..' || path.isAbsolute(rel)) {
    throw new OrbithError(`${fichier} est en dehors du projet Orbith (${root}) : il ne peut pas être validé ici.`);
  }

  if (estValide(doc.data['statut'])) {
    const entry = (await loadRegistry(root)).find((e) => e.fichier === rel);
    if (entry && entry.sha256 === hashBody(doc.body)) {
      ui.info(`${rel} est déjà validé (par ${entry.par}) et n'a pas changé depuis.`);
      return true;
    }
  }

  const user = await gitUser(root);
  if (!user) {
    throw new OrbithError(
      'Identité git introuvable. Configure-la avec :\n  git config user.name "Ton Nom"\n  git config user.email "ton@email.fr"',
    );
  }

  // Matrice des rôles et quatre yeux (facultatifs : sans configuration, rien ne change).
  const config = await loadConfig(root).catch(() => null);
  const refus = refusRole(config, type, doc.data, user);
  if (refus) throw new OrbithError(refus);
  const auteur = await gitLastAuthor(root, rel);
  const refus4 = refusQuatreYeux(config, auteur, user);
  if (refus4) throw new OrbithError(refus4);

  const id = doc.data['id'] != null ? String(doc.data['id']) : '—';
  const titreRaw = doc.data['title'] ?? doc.data['titre'];
  const titre = titreRaw != null ? String(titreRaw) : (/^#\s+(.+)$/m.exec(doc.body)?.[1]?.trim() ?? '—');
  ui.titre('Validation humaine');
  console.log(`  Fichier : ${rel}\n  Type    : ${type}\n  Id      : ${id}\n  Titre   : ${titre}\n`);

  if (!opts.yes) {
    if (!process.stdin.isTTY) {
      throw new OrbithError(
        "Confirmation impossible : ce terminal n'est pas interactif. Si tu es un agent IA, arrête-toi : seul un humain valide. Humain : lance cette commande toi-même, dans ton terminal.",
      );
    }
    const ok = await confirm({ message: 'Je confirme avoir relu et valider ce document', initialValue: false });
    if (isCancel(ok) || !ok) {
      ui.avert('Validation annulée. Le document n\'a pas été modifié.');
      process.exitCode = 1;
      return false;
    }
  }

  const now = new Date().toISOString();
  doc.data['statut'] = 'validé';
  doc.data['valide_par'] = user.name;
  doc.data['valide_le'] = now.slice(0, 10);
  await writeDoc(abs, doc);
  const written = await readDoc(abs);
  await recordValidation(root, {
    fichier: rel,
    sha256: hashBody(written.body),
    par: user.name,
    email: user.email,
    le: now,
    ...(auteur ? { auteur: auteur.name, auteur_email: auteur.email } : {}),
  });
  ui.ok(`${rel} est validé par ${user.name}.`);
  ui.info('Lance `npx orbith next` pour connaître la suite.');
  ui.rappelNouvelleSession();
  return true;
}

export function register(program: Command): void {
  program
    .command('valider <fichier>')
    .description('Valide un document (validation humaine)')
    .option('--cwd <dir>', 'dossier de travail')
    .option('--yes', 'ne pas demander de confirmation (réservé à un usage humain en script)')
    .action(async (fichier: string, opts: ValiderOptions) => {
      await runValider(fichier, opts);
    });
}
