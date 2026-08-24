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
   * The LLM fallback, behind the IntentProvider interface in nlp/provider.ts.
   * Gemini via Google AI Studio - no billing account required to get a key,
   * which is what makes it the honest default for a project meant to run on a
   * free tier.
   */
  geminiApiKey: optional('GEMINI_API_KEY'),
  // gemini-2.5-flash and gemini-2.5-pro 404 on some free-tier API keys/projects
  // (present in ListModels, but not actually enabled for generateContent).
  // flash-lite is confirmed working across free-tier keys and is plenty for
  // structured intent parsing.
  geminiModel: optional('GEMINI_MODEL') ?? 'gemini-2.5-flash-lite',

  /** Directory of built frontend assets, served by the same process in production. */
  webRoot: optional('WEB_ROOT') ?? '../../web/dist',

  /** Utterances kept in the LLM parse cache before the oldest is evicted. */
  parseCacheSize: Number(process.env.PARSE_CACHE_SIZE ?? 500),
} as const;

export const isProduction = config.nodeEnv === 'production';
