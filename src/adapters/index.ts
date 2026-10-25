import type { OrbithConfig, Plateforme } from '../core/index.js';
import { gemini } from './gemini/index.js';
import { claude } from './claude/index.js';
import { copilot } from './copilot/index.js';

export interface Adapter {
  id: Plateforme;
  nom: string;
  /** Generates the platform files (references to .orbith/ only). Returns written file paths (posix, relative to root). */
  generate(root: string, cfg: OrbithConfig): Promise<string[]>;
}

export const adapters: Record<Plateforme, Adapter> = { gemini, claude, copilot };
export { AGENTS } from './agents.js';

/** Runs every adapter selected in the config; returns the deduplicated file list. */
export async function runAdapters(root: string, cfg: OrbithConfig): Promise<string[]> {
  const files = new Set<string>();
  for (const id of cfg.plateformes) {
    const adapter = adapters[id];
    if (!adapter) continue;
    for (const f of await adapter.generate(root, cfg)) files.add(f);
  }
  return [...files];
}
