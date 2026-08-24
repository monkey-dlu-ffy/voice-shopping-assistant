import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { tsExtensionResolver } from '../../vite.resolve';

/**
 * The web app consumes @vsa/shared from source rather than from its built
 * `dist`, so `npm run dev` needs no prior build step and a change to the parser
 * is reflected instantly in the browser. Node (the API) still uses `dist` via
 * the package's `exports` field.
 */
const sharedSrc = fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url));

export default defineConfig({
  plugins: [react(), tsExtensionResolver()],
  resolve: { alias: { '@vsa/shared': sharedSrc } },
  server: {
    port: 5173,
    // In development the API runs separately on 8080. In production both are
    // served by the same Express process, so this proxy has no production twin.
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
