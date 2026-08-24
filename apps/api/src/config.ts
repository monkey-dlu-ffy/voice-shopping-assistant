/**
 * Runtime configuration.
 *
 * Every external dependency is optional by design. With no MongoDB URI the app
 * falls back to an in-process store; with no Anthropic key it falls back to
 * rules-only parsing. Both degradations are visible at `/api/health` rather than
 * silent, so a reviewer can see exactly which mode the deployment is running in.
 */

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  mongoUri: optional('MONGODB_URI'),

  anthropicApiKey: optional('ANTHROPIC_API_KEY'),
  anthropicModel: optional('ANTHROPIC_MODEL') ?? 'claude-haiku-4-5',

  /** Directory of built frontend assets, served by the same process in production. */
  webRoot: optional('WEB_ROOT') ?? '../../web/dist',

  /** Utterances kept in the LLM parse cache before the oldest is evicted. */
  parseCacheSize: Number(process.env.PARSE_CACHE_SIZE ?? 500),
} as const;

export const isProduction = config.nodeEnv === 'production';
