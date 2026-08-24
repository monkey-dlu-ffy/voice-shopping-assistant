/**
 * Runtime configuration.
 *
 * Every external dependency is optional by design. With no MongoDB URI the app
 * falls back to an in-process store; with no LLM key it falls back to
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

  /**
   * Two interchangeable LLM fallbacks, both behind the same IntentProvider
   * interface. Gemini is preferred when both keys are set - it is the
   * genuinely free option (Google AI Studio, no billing account required),
   * while the Anthropic key stays supported for anyone who does have Claude
   * billing configured. See createIntentProvider() in nlp/provider.ts.
   */
  geminiApiKey: optional('GEMINI_API_KEY'),
  geminiModel: optional('GEMINI_MODEL') ?? 'gemini-2.5-flash',

  anthropicApiKey: optional('ANTHROPIC_API_KEY'),
  anthropicModel: optional('ANTHROPIC_MODEL') ?? 'claude-haiku-4-5',

  /** Directory of built frontend assets, served by the same process in production. */
  webRoot: optional('WEB_ROOT') ?? '../../web/dist',

  /** Utterances kept in the LLM parse cache before the oldest is evicted. */
  parseCacheSize: Number(process.env.PARSE_CACHE_SIZE ?? 500),
} as const;

export const isProduction = config.nodeEnv === 'production';
