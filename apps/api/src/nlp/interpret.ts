import {
  cacheKey,
  categorize,
  isConfident,
  lexiconFor,
  normalizeUtterance,
  parseWithRules,
  resolveItem,
  type Intent,
  type ParsedItem,
} from '@vsa/shared';
import { config } from '../config.js';
import { describeProviderError, type IntentProvider, type ParsedIntentPayload } from './provider.js';

/**
 * The hybrid parser.
 *
 * 1. Run the deterministic rules. If confident, we are done - no network, no
 *    cost, sub-millisecond.
 * 2. Otherwise check the cache: the same phrasing said twice should only ever be
 *    paid for once.
 * 3. Otherwise ask the LLM, validate, cache and return.
 *
 * Every failure mode below step 1 degrades back to the rule result rather than
 * erroring, so a missing key, a rate limit or a dead network never breaks the
 * app - it just makes it less clever.
 */

/** Simple LRU. A Map preserves insertion order, so the oldest key is the first. */
class ParseCache {
  private entries = new Map<string, Intent>();

  constructor(private readonly maxSize: number) {}

  get(key: string): Intent | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    // Refresh recency.
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit;
  }

  set(key: string, value: Intent): void {
    if (this.entries.has(key)) this.entries.delete(key);
    this.entries.set(key, value);
    if (this.entries.size > this.maxSize) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}

const cache = new ParseCache(config.parseCacheSize);

export const parseCacheStats = {
  get size() {
    return cache.size;
  },
  hits: 0,
  misses: 0,
  llmCalls: 0,
  llmFailures: 0,
  reset() {
    cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.llmCalls = 0;
    this.llmFailures = 0;
  },
};

/** Convert the model's payload into the same `ParsedItem` shape the rules emit. */
function toParsedItems(payload: ParsedIntentPayload): ParsedItem[] {
  return payload.items.map((item) => {
    const resolved = resolveItem(item.canonical);
    return {
      raw: item.raw || item.canonical,
      // Prefer the catalogue's spelling so "tomato" and "tomatoes" are one item.
      canonical: resolved?.entry.canonical ?? item.canonical,
      quantity: item.quantity,
      unit: item.unit,
      category: resolved?.entry.category ?? categorize(item.canonical),
      attributes: item.attributes ?? [],
      brand: item.brand,
    };
  });
}

export interface InterpretOptions {
  utterance: string;
  language?: string;
  provider: IntentProvider;
}

/**
 * Downgrade a low-confidence parse to `unknown`.
 *
 * Reached only when the LLM could not be consulted - no key, a failure, or a
 * null response. Without this the executor would act on whatever the rules
 * scraped together, so "grab whatever we need for tacos" would add a literal
 * item called "whatever tacos". Asking the user to rephrase is the honest
 * outcome, and it is why `CONFIDENCE_THRESHOLD` exists.
 */
function degrade(intent: Intent): Intent {
  if (isConfident(intent)) return intent;
  return { ...intent, intent: 'unknown', items: [], filters: {} };
}

export async function interpret({
  utterance,
  language = 'en-US',
  provider,
}: InterpretOptions): Promise<Intent> {
  const startedAt = performance.now();

  const ruleResult = parseWithRules(utterance, language);
  if (isConfident(ruleResult)) {
    return ruleResult;
  }

  const lex = lexiconFor(language);
  const { normalized } = normalizeUtterance(utterance, lex);
  const key = cacheKey(normalized, language);

  const cached = cache.get(key);
  if (cached) {
    parseCacheStats.hits++;
    return { ...cached, source: 'cache', latencyMs: performance.now() - startedAt };
  }
  parseCacheStats.misses++;

  if (!provider.available || !normalized) {
    return degrade(ruleResult);
  }

  try {
    parseCacheStats.llmCalls++;
    const payload = await provider.parse(utterance, language);
    if (!payload) return degrade(ruleResult);

    const items = toParsedItems(payload);

    // The model is allowed to say it does not understand; trust that over a
    // low-confidence rule guess.
    if (payload.intent === 'unknown') {
      const unknown: Intent = {
        intent: 'unknown',
        items: [],
        filters: {},
        language,
        confidence: 0.9,
        source: 'llm',
        latencyMs: performance.now() - startedAt,
        normalized,
      };
      cache.set(key, unknown);
      return unknown;
    }

    const intent: Intent = {
      intent: payload.intent,
      items,
      filters: payload.filters ?? {},
      language,
      confidence: 0.85,
      source: 'llm',
      latencyMs: performance.now() - startedAt,
      normalized,
    };
    cache.set(key, intent);
    return intent;
  } catch (error) {
    parseCacheStats.llmFailures++;
    const { message, retryable } = describeProviderError(error);
    console.warn(`[nlp] fallback failed (${retryable ? 'retryable' : 'permanent'}): ${message}`);
    return degrade(ruleResult);
  }
}
