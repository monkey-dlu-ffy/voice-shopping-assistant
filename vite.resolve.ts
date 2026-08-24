import type { Plugin } from 'vite';

/**
 * Resolve `./foo.js` imports to `./foo.ts` (or `.tsx`) when running from source.
 *
 * Source files carry explicit `.js` extensions on relative imports because that
 * is what Node ESM requires of `tsc` output. Vite and Vitest load the same files
 * as TypeScript, where those siblings are still `.ts`, so this plugin retries the
 * resolution with the TypeScript extension.
 *
 * A `resolveId` hook is used rather than a `resolve.alias` entry because Vitest
 * requires aliases to produce absolute paths, which a purely syntactic rewrite
 * cannot do. Shared by the root Vitest config and the web app's Vite config so
 * the two never drift.
 */
export function tsExtensionResolver(): Plugin {
  return {
    name: 'ts-extension-resolver',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !source.startsWith('.') || !source.endsWith('.js')) return null;

      const stem = source.slice(0, -'.js'.length);
      for (const ext of ['.ts', '.tsx']) {
        const resolved = await this.resolve(stem + ext, importer, {
          ...options,
          skipSelf: true,
        });
        if (resolved) return resolved;
      }
      return null;
    },
  };
}
