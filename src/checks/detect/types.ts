export type Runtime = 'node' | 'java' | 'python';

export interface DetectedRuntime {
  runtime: Runtime;
  /** Version minimale détectée (ex. « 17 »), si connue. */
  version?: string;
  source: string;
}

export interface DetectedDependency {
  nom: string;
  source: string;
}

export interface DetectedTool {
  id: string;
  /** Clés de comparaison acceptées (voir toolKey). */
  aliases: string[];
  source: string;
}

export interface Detection {
  runtimes: DetectedRuntime[];
  dependances: DetectedDependency[];
  /** Outils CI / qualité / build détectés par leurs fichiers de configuration. */
  outils: DetectedTool[];
}

export function firstVersion(s: string): string | undefined {
  return /\d+(?:\.\d+)*/.exec(s)?.[0];
}

/** Résultat d'un détecteur de langage (sans les outils, détectés à part). */
export type LangDetection = Omit<Detection, 'outils'>;
