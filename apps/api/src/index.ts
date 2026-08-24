import { createApp } from './app.js';
import { config } from './config.js';
import { createIntentProvider } from './nlp/provider.js';
import { createRepository } from './store/index.js';

/**
 * Process entrypoint.
 *
 * Both external dependencies are resolved with fallbacks before the server
 * starts listening, so the process either serves a working app or fails loudly -
 * it never comes up half-broken.
 */
async function main(): Promise<void> {
  const [repo, provider] = await Promise.all([
    createRepository(),
    Promise.resolve(createIntentProvider()),
  ]);

  const app = createApp({ repo, provider });

  const server = app.listen(config.port, () => {
    console.log(`[api] listening on :${config.port}`);
    console.log(`[api] storage=${repo.kind} nlp-fallback=${provider.available ? provider.name : 'disabled'}`);
  });

  // Cloud Run sends SIGTERM before reclaiming an instance; close cleanly so
  // in-flight requests finish and the Mongo connection is released.
  const shutdown = (signal: string) => {
    console.log(`[api] ${signal} received, shutting down`);
    server.close(async () => {
      await repo.close();
      process.exit(0);
    });
    // Do not hang forever if a connection refuses to drain.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('[api] failed to start:', error);
  process.exit(1);
});
