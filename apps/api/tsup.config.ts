import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsup';

const resolvePath = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  entry: { node: 'src/node.ts' },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  sourcemap: true,
  // Workspace packages are bundled in so the Docker image needs no monorepo layout.
  noExternal: [/^@evcp\//],
  esbuildOptions(options) {
    options.alias = {
      '@evcp/models': resolvePath('../../packages/models/src/index.ts'),
      '@evcp/calculator': resolvePath('../../packages/calculator/src/index.ts'),
      '@evcp/notification': resolvePath('../../packages/notification/src/index.ts'),
    };
  },
});
