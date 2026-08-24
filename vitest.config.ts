import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { tsExtensionResolver } from './vite.resolve';

/**
 * Tests always run against TypeScript source, never the built `dist`, so a stale
 * build can never make a red suite look green. The published `exports` field of
 * @vsa/shared points at `dist` for Node; this alias overrides that here.
 */
const sharedSrc = fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url));

export default defineConfig({
  plugins: [tsExtensionResolver()],
  resolve: { alias: { '@vsa/shared': sharedSrc } },
  test: {
    include: ['packages/**/test/**/*.spec.ts', 'apps/**/test/**/*.spec.ts'],
    environment: 'node',
  },
});
