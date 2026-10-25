import { detectJava } from './java.js';
import { detectNode } from './node.js';
import { detectPython } from './python.js';
import { detectTools } from './tools.js';
import type { Detection } from './types.js';

export * from './types.js';
export { isDetectableTool, toolKey } from './tools.js';

export async function detectStack(root: string): Promise<Detection> {
  const [node, java, python, outils] = await Promise.all([
    detectNode(root),
    detectJava(root),
    detectPython(root),
    detectTools(root),
  ]);
  const parts = [node, java, python];
  return {
    runtimes: parts.flatMap((p) => p.runtimes),
    dependances: parts.flatMap((p) => p.dependances),
    outils,
  };
}
