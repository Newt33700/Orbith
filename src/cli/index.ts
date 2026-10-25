import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import { OrbithError, packageRoot, ui } from '../core/index.js';
import { register as registerInstall } from './install.js';
import { register as registerNext } from './next.js';
import { register as registerValider } from './valider.js';
import { register as registerCheck } from './check.js';
import { register as registerTrace } from './trace.js';
import { register as registerTests } from './tests.js';
import { register as registerCsr } from './csr.js';
import { register as registerUpdate } from './update.js';
import { register as registerPlugin } from './plugin.js';
import { register as registerAudit } from './audit.js';

function version(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.join(packageRoot(), 'package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Traduit les messages d'erreur de commander les plus courants. */
function francais(msg: string): string {
  const rules: [RegExp, string][] = [
    [/error: unknown option '(.+?)'(.*)/, "erreur : option inconnue « $1 »"],
    [/error: unknown command '(.+?)'(.*)/, "erreur : commande inconnue « $1 »"],
    [/error: missing required argument '(.+?)'/, "erreur : argument obligatoire manquant « $1 »"],
    [/error: option '(.+?)' argument missing/, "erreur : il manque une valeur pour l'option « $1 »"],
    [/error: too many arguments(.*)/, "erreur : trop d'arguments"],
    [/error: required option '(.+?)' not specified/, "erreur : option obligatoire manquante « $1 »"],
  ];
  let out = msg;
  for (const [re, rep] of rules) out = out.replace(re, rep);
  return out;
}

const program = new Command();
program
  .name('orbith')
  .description("Orbith : méthode agile pilotée par l'IA, avec la validation humaine au centre")
  .version(version(), '-v, --version', 'affiche la version')
  .helpOption('-h, --help', "affiche l'aide")
  .helpCommand('help [commande]', "affiche l'aide d'une commande")
  .showHelpAfterError('(lance `npx orbith --help` pour voir les commandes)')
  .configureOutput({ outputError: (str, write) => write(francais(str)) });

for (const register of [
  registerInstall,
  registerNext,
  registerValider,
  registerCheck,
  registerTrace,
  registerTests,
  registerCsr,
  registerUpdate,
  registerPlugin,
  registerAudit,
]) {
  register(program);
}

try {
  await program.parseAsync(process.argv);
} catch (e) {
  if (e instanceof OrbithError) {
    ui.erreur(e.message);
  } else {
    ui.erreur("Une erreur inattendue s'est produite. Relance avec ORBITH_DEBUG=1 pour plus de détails.");
    if (process.env['ORBITH_DEBUG'] === '1' && e instanceof Error) console.error(e.stack);
  }
  process.exitCode = 1;
}
