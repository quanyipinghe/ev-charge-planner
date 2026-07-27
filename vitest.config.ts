import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@evcp/models': resolve('./packages/models/src/index.ts'),
      '@evcp/calculator': resolve('./packages/calculator/src/index.ts'),
      '@evcp/notification': resolve('./packages/notification/src/index.ts'),
      '@data': resolve('./data/dist'),
    },
  },
  test: {
    include: ['packages/**/*.test.ts', 'apps/api/**/*.test.ts', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/calculator/src/**', 'packages/models/src/**'],
      exclude: ['**/*.test.ts', '**/fixtures.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
