import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Les tests qui lancent git ou la CLI sont lents sur les runners Windows.
  test: { include: ['test/**/*.test.ts'], testTimeout: 30_000 },
});
