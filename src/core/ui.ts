import pc from 'picocolors';

export const ui = {
  titre(s: string): void {
    console.log('\n' + pc.bold(pc.cyan(s)) + '\n');
  },
  ok(s: string): void {
    console.log(pc.green('✔ ') + s);
  },
  info(s: string): void {
    console.log(pc.blue('ℹ ') + s);
  },
  avert(s: string): void {
    console.log(pc.yellow('⚠ ') + s);
  },
  erreur(s: string): void {
    console.error(pc.red('✖ ') + s);
  },
  etape(s: string): void {
    console.log(pc.bold('→ ') + s);
  },
  rappelNouvelleSession(): void {
    console.log(
      '\n' +
        pc.dim(
          "💡 Tâche terminée ? Ouvre une NOUVELLE session (ou tape /clear) avant la suivante : l'agent repart\n   avec un contexte propre et reste performant.",
        ),
    );
  },
};
