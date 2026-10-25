// Installeur du plugin « backlog-md » (ESM pur : le dossier plugins/ n'est pas compilé).
// Appelé par `npx orbith plugin add backlog-md` avec un contexte :
//   { root, config, run(cmd, args, { cwd }) => Promise<{ code, stdout, stderr }>, log: { info, ok, avert } }
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Scalar, YAMLSeq, parseDocument } from 'yaml';

// Backlog.md lit son config.yml avec un analyseur simple : on écrit des chaînes entre guillemets.
const quoted = (v) => {
  const n = new Scalar(v);
  n.type = 'QUOTE_DOUBLE';
  return n;
};
const quotedFlowList = (items) => {
  const seq = new YAMLSeq();
  seq.flow = true;
  for (const i of items) seq.items.push(quoted(i));
  return seq;
};

export const STATUSES = ['À faire', 'Prête', 'En cours', 'En revue', 'Terminée'];
export const DEFAULT_STATUS = 'À faire';

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Crée ou complète backlog/config.yml sans rien supprimer d'autre. Retourne true si le fichier a changé. */
export async function writeBacklogConfig(root, nom, prefixe) {
  const dir = path.join(root, 'backlog');
  const file = path.join(dir, 'config.yml');
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  const before = (await exists(file)) ? await fs.readFile(file, 'utf8') : '';
  const doc = parseDocument(before === '' ? 'auto_commit: false\n' : before);
  if (doc.errors.length > 0) {
    throw new Error('backlog/config.yml est illisible : corrige-le puis relance la commande.');
  }
  if (!doc.has('project_name')) doc.set('project_name', quoted(nom));
  doc.set('default_status', quoted(DEFAULT_STATUS));
  doc.set('statuses', quotedFlowList(STATUSES));
  doc.set('task_prefix', quoted(prefixe));
  if (!doc.has('zero_padded_ids')) doc.set('zero_padded_ids', 3);
  if (!doc.has('auto_commit')) doc.set('auto_commit', false);
  if (!doc.has('labels')) doc.set('labels', []);
  const after = String(doc);
  if (after !== before) await fs.writeFile(file, after, 'utf8');
  return after !== before;
}

export async function install({ root, config, run, log }) {
  const prefixe = config.backlog.prefixe;
  if (!/^[A-Za-z]+$/.test(prefixe)) {
    log.avert(
      `Le préfixe « ${prefixe} » contient autre chose que des lettres : Backlog.md n'accepte que des lettres. ` +
        'Modifie backlog.prefixe dans .orbith/config.yaml (par exemple US).',
    );
  }
  const changed = await writeBacklogConfig(root, config.projet.nom, prefixe);
  log.ok(
    changed
      ? 'backlog/config.yml configuré (colonnes : ' + STATUSES.join(', ') + ').'
      : 'backlog/config.yml était déjà à jour.',
  );

  const pkgFile = path.join(root, 'package.json');
  if (await exists(pkgFile)) {
    let pkg = {};
    try {
      pkg = JSON.parse(await fs.readFile(pkgFile, 'utf8'));
    } catch {
      log.avert("package.json est illisible : installe backlog.md toi-même avec `npm i -D backlog.md`.");
      return;
    }
    const present = pkg.devDependencies?.['backlog.md'] ?? pkg.dependencies?.['backlog.md'];
    if (present) {
      log.ok('backlog.md est déjà une dépendance du projet.');
    } else {
      log.info('Installation de backlog.md dans le projet (npm i -D backlog.md)…');
      const res = await run('npm', ['install', '--save-dev', 'backlog.md'], { cwd: root });
      if (res.code === 0) log.ok('backlog.md installé.');
      else log.avert("L'installation a échoué. Lance toi-même : npm i -D backlog.md");
    }
    log.info('Affiche le tableau avec : npx backlog browser');
  } else {
    log.info("Ce projet n'a pas de package.json. Installe l'outil une fois pour toutes : npm i -g backlog.md");
    log.info('Puis affiche le tableau avec : backlog browser');
  }
}
