import type { Intent, IntentFilters, IntentKind, ParsedItem } from './types.js';
import { CONFIDENCE_THRESHOLD } from './types.js';
import type { Lexicon } from './lexicon/index.js';
import { lexiconFor } from './lexicon/index.js';
import {
  escapeRegExp,
  foldDiacritics,
  normalizeUtterance,
  stripStopWords,
} from './normalize.js';
import { CATALOG, resolveItem } from './catalog.js';

/**
 * Deterministic intent parser.
 *
 * Runs in both the browser and the server from this one shared package, so the
 * app keeps working with no network and no API key. Anything this parser is not
 * confident about is handed to the LLM by `interpret()` on the server, and both
 * paths emit the same `Intent`.
 *
 * Pipeline: normalise -> find verb -> pull price filters -> split on
 * conjunctions -> per-chunk quantity/unit/attribute/brand extraction -> resolve
 * each item name against the catalogue.
 */

/** Intents that act on an object; preferred over bare commands when both match. */
const OBJECT_INTENTS = new Set<IntentKind>([
  'add',
  'remove',
  'update_quantity',
  'search',
  'mark_bought',
]);

/** Every brand name in the catalogue, folded for matching. */
const BRAND_INDEX = new Map<string, string>();
for (const entry of CATALOG) {
  for (const brand of entry.brands) {
    BRAND_INDEX.set(foldDiacritics(brand.toLowerCase()), brand);
  }
}

interface VerbHit {
  kind: IntentKind;
  phrase: string;
  index: number;
}

/** Match a phrase on whitespace boundaries. Works for Devanagari, where `\b` does not. */
function phraseRegExp(phrase: string, flags = ''): RegExp {
  return new RegExp(`(?<=\\s)${escapeRegExp(phrase)}(?=\\s)`, flags);
}

/** All verb phrases from every intent, longest first. */
function verbPhrases(lex: Lexicon): { kind: IntentKind; phrase: string }[] {
  const out: { kind: IntentKind; phrase: string }[] = [];
  for (const [kind, phrases] of Object.entries(lex.verbs)) {
    for (const phrase of phrases ?? []) {
      out.push({ kind: kind as IntentKind, phrase: foldDiacritics(phrase.toLowerCase()) });
    }
  }
  return out.sort((a, b) => b.phrase.length - a.phrase.length);
}

/**
 * How strongly a matched verb indicates the real intent.
 *
 * `read_list` phrases are deliberately broad ("my list"), so they lose to
 * anything more specific: "add milk to my list" is an add, and "clear my list"
 * is a clear rather than a read.
 */
function intentPriority(kind: IntentKind): number {
  if (OBJECT_INTENTS.has(kind)) return 3;
  if (kind === 'read_list') return 1;
  return 2; // clear_list, undo
}

/**
 * Pick the governing verb.
 *
 * Ranked by intent priority, then by phrase length so longest-match-wins
 * resolves "don't need milk" to remove rather than add, then by position.
 */
function findVerb(padded: string, lex: Lexicon): VerbHit | null {
  const hits: VerbHit[] = [];
  for (const { kind, phrase } of verbPhrases(lex)) {
    const match = phraseRegExp(phrase).exec(padded);
    if (match) hits.push({ kind, phrase, index: match.index });
  }
  if (hits.length === 0) return null;

  // A bare command that accounts for the entire utterance wins outright, even
  // over a higher-priority object intent: "what do I need" is a read, not an
  // add triggered by "need", and "sab hatao" is a clear, not a remove.
  const whole = padded.trim();
  const exact = hits.find((h) => !OBJECT_INTENTS.has(h.kind) && h.phrase === whole);
  if (exact) return exact;

  return hits.reduce((best, h) => {
    const byPriority = intentPriority(h.kind) - intentPriority(best.kind);
    if (byPriority !== 0) return byPriority > 0 ? h : best;
    if (h.phrase.length !== best.phrase.length) {
      return h.phrase.length > best.phrase.length ? h : best;
    }
    return h.index < best.index ? h : best;
  });
}

/** Remove every occurrence of the chosen intent's verbs from the remainder. */
function stripVerbs(padded: string, kind: IntentKind, lex: Lexicon): string {
  let out = padded;
  const phrases = [...(lex.verbs[kind] ?? [])]
    .map((p) => foldDiacritics(p.toLowerCase()))
    .sort((a, b) => b.length - a.length);
  for (const phrase of phrases) {
    out = out.replace(phraseRegExp(phrase, 'g'), ' ');
  }
  return out;
}

interface PriceExtraction {
  filters: IntentFilters;
  rest: string;
}

/** Pull "under $5" / "more than 10" style constraints out of the utterance. */
function extractPrices(padded: string, lex: Lexicon): PriceExtraction {
  const filters: IntentFilters = {};
  let rest = padded;

  for (const pattern of lex.maxPricePatterns) {
    const match = new RegExp(pattern.source, pattern.flags).exec(rest);
    if (match?.[1]) {
      filters.maxPrice = Number(match[1]);
      rest = rest.replace(match[0], ' ');
      break;
    }
  }
  for (const pattern of lex.minPricePatterns) {
    const match = new RegExp(pattern.source, pattern.flags).exec(rest);
    if (match?.[1]) {
      filters.minPrice = Number(match[1]);
      rest = rest.replace(match[0], ' ');
      break;
    }
  }
  return { filters, rest };
}

/** Split on conjunctions so "milk and eggs and bread" yields three items. */
function splitItems(text: string, lex: Lexicon): string[] {
  let padded = ` ${text.trim()} `;
  for (const conjunction of lex.conjunctions) {
    padded = padded.replace(phraseRegExp(foldDiacritics(conjunction.toLowerCase()), 'g'), ' | ');
  }
  return padded
    .split('|')
    .map((chunk) => chunk.replace(/\s+/g, ' ').trim())
    .filter((chunk) => chunk.length > 0);
}

interface ChunkParse {
  quantity: number | null;
  unit: string | null;
  attributes: string[];
  brand: string | null;
  name: string;
}

/** Pull quantity, unit, attributes and brand out of one item chunk. */
function parseChunk(chunk: string, lex: Lexicon): ChunkParse {
  let rest = ` ${chunk} `;

  // Attributes first: multi-word keys ("low fat") before single tokens.
  const attributes: string[] = [];
  const attrKeys = Object.keys(lex.attributes).sort((a, b) => b.length - a.length);
  for (const key of attrKeys) {
    const folded = foldDiacritics(key.toLowerCase());
    const re = phraseRegExp(folded, 'g');
    if (re.test(rest)) {
      const canonical = lex.attributes[key]!;
      if (!attributes.includes(canonical)) attributes.push(canonical);
      rest = rest.replace(phraseRegExp(folded, 'g'), ' ');
    }
  }

  // Brand, matched against catalogue brand names.
  let brand: string | null = null;
  for (const [folded, original] of BRAND_INDEX) {
    if (phraseRegExp(folded).test(rest)) {
      brand = original;
      rest = rest.replace(phraseRegExp(folded, 'g'), ' ');
      break;
    }
  }

  // Quantity: the first standalone integer left in the chunk. Price numbers are
  // already gone, so anything here is a count.
  let quantity: number | null = null;
  const qtyMatch = /(?<=\s)(\d+(?:\.\d+)?)(?=\s)/.exec(rest);
  if (qtyMatch?.[1]) {
    quantity = Number(qtyMatch[1]);
    rest = rest.replace(qtyMatch[0], ' ');
  }

  // Unit, matched against the language's unit table.
  let unit: string | null = null;
  const unitKeys = Object.keys(lex.units).sort((a, b) => b.length - a.length);
  for (const key of unitKeys) {
    const folded = foldDiacritics(key.toLowerCase());
    if (phraseRegExp(folded).test(rest)) {
      unit = lex.units[key]!;
      rest = rest.replace(phraseRegExp(folded, 'g'), ' ');
      break;
    }
  }

  const name = stripStopWords(rest.replace(/\s+/g, ' ').trim(), lex);
  return { quantity, unit, attributes, brand, name };
}

/**
 * Resolve an item name, tolerating leading noise.
 *
 * Speech recognition leaves debris in front of the real noun ("umm yogurt",
 * "are coffee"), and no filler list catches all of it. Rather than chase that
 * list, try progressively shorter suffixes and keep the best resolution - the
 * item word is almost always at the end of the chunk.
 */
function resolveName(name: string) {
  const direct = resolveItem(name);
  if (direct && direct.score >= 0.9) return direct;

  const tokens = name.split(' ').filter(Boolean);
  let best = direct;
  for (let start = 1; start < tokens.length; start++) {
    const hit = resolveItem(tokens.slice(start).join(' '));
    if (hit && (!best || hit.score > best.score)) best = hit;
  }
  return best;
}

/** Resolve a chunk into a ParsedItem, consulting the catalogue for canonical form. */
function toParsedItem(chunk: ChunkParse, rawChunk: string): ParsedItem | null {
  if (!chunk.name) return null;

  const resolved = resolveName(chunk.name);
  return {
    raw: rawChunk.trim(),
    canonical: resolved?.entry.canonical ?? chunk.name,
    quantity: chunk.quantity,
    // Deliberately not falling back to the catalogue default unit: "buy 5
    // oranges" is a count of five, not five kilograms.
    unit: chunk.unit,
    category: resolved?.entry.category ?? null,
    attributes: chunk.attributes,
    brand: chunk.brand,
  };
}

function emptyIntent(
  language: string,
  normalized: string,
  latencyMs: number,
  kind: IntentKind = 'unknown',
  confidence = 0,
): Intent {
  return {
    intent: kind,
    items: [],
    filters: {},
    language,
    confidence,
    source: 'rules',
    latencyMs,
    normalized,
  };
}

/**
 * Parse an utterance using rules alone.
 *
 * Always returns an Intent. Callers should check `confidence` against
 * `CONFIDENCE_THRESHOLD` to decide whether to escalate to the LLM.
 */
export function parseWithRules(text: string, language = 'en-US'): Intent {
  const startedAt = performance.now();
  const lex = lexiconFor(language);
  const { normalized } = normalizeUtterance(text, lex);

  if (!normalized) {
    return emptyIntent(language, normalized, performance.now() - startedAt);
  }

  const padded = ` ${normalized} `;
  const verb = findVerb(padded, lex);

  // A bare catalogue item with no verb is almost always an add: "milk".
  if (!verb) {
    const direct = resolveItem(normalized);
    if (direct && direct.score >= 0.9) {
      const item = toParsedItem(parseChunk(normalized, lex), normalized);
      return {
        intent: 'add',
        items: item ? [item] : [],
        filters: {},
        language,
        confidence: item ? 0.75 : 0.3,
        source: 'rules',
        latencyMs: performance.now() - startedAt,
        normalized,
      };
    }
    return emptyIntent(language, normalized, performance.now() - startedAt, 'unknown', 0.25);
  }

  const kind = verb.kind;

  // Bare commands take no object; short-circuit before item extraction.
  if (!OBJECT_INTENTS.has(kind)) {
    return {
      intent: kind,
      items: [],
      filters: {},
      language,
      confidence: 0.95,
      source: 'rules',
      latencyMs: performance.now() - startedAt,
      normalized,
    };
  }

  const { filters, rest: afterPrices } = extractPrices(padded, lex);
  const remainder = stripVerbs(afterPrices, kind, lex);

  const chunks = splitItems(remainder, lex);
  const items: ParsedItem[] = [];
  for (const chunk of chunks) {
    const parsed = toParsedItem(parseChunk(chunk, lex), chunk);
    if (parsed) items.push(parsed);
  }

  // "make it 3" - a quantity change with no item names attached. The executor
  // applies this to the most recently touched item.
  if (kind === 'update_quantity' && items.length === 0) {
    const bare = parseChunk(remainder.trim(), lex);
    if (bare.quantity !== null) {
      return {
        intent: 'update_quantity',
        items: [
          {
            raw: remainder.trim(),
            canonical: '',
            quantity: bare.quantity,
            unit: bare.unit,
            category: null,
            attributes: [],
            brand: null,
          },
        ],
        filters,
        language,
        confidence: 0.8,
        source: 'rules',
        latencyMs: performance.now() - startedAt,
        normalized,
      };
    }
  }

  // A search can legitimately carry only filters: "find anything under $5".
  const hasSearchSignal =
    kind === 'search' && (filters.maxPrice !== undefined || filters.minPrice !== undefined);

  if (items.length === 0 && !hasSearchSignal) {
    return emptyIntent(language, normalized, performance.now() - startedAt, 'unknown', 0.4);
  }

  // Confidence is driven by how much of the utterance actually resolved. When
  // nothing matches the catalogue the parse stays below CONFIDENCE_THRESHOLD so
  // interpret() escalates to the LLM instead of adding nonsense to the list.
  const recognised = items.filter((i) => i.category !== null).length;

  // Confidence answers "did I understand the command", not "do I stock this
  // product". For remove, mark_bought and update_quantity the executor matches
  // against the user's own list and answers "that is not on your list", so an
  // item the catalogue has never heard of is not a reason to doubt the parse.
  // add and search have no such safety net - an unrecognised name would go
  // straight onto the list - so they stay conservative and escalate.
  const executorValidates =
    kind === 'remove' || kind === 'mark_bought' || kind === 'update_quantity';

  let confidence = 0.55;
  if (items.length > 0) {
    if (recognised === items.length || executorValidates) confidence += 0.35;
    else if (recognised > 0) confidence += 0.1;
    else confidence -= 0.15;
  }
  if (hasSearchSignal) confidence += 0.15;

  const merged: IntentFilters = { ...filters };
  const attrs = items.flatMap((i) => i.attributes);
  if (kind === 'search' && attrs.length > 0) merged.attributes = [...new Set(attrs)];
  const brand = items.find((i) => i.brand)?.brand;
  if (kind === 'search' && brand) merged.brand = brand;

  return {
    intent: kind,
    items,
    filters: merged,
    language,
    confidence: Math.min(confidence, 0.95),
    source: 'rules',
    latencyMs: performance.now() - startedAt,
    normalized,
  };
}

/** True when the rule parser is confident enough to skip the LLM entirely. */
export function isConfident(intent: Intent): boolean {
  return intent.intent !== 'unknown' && intent.confidence >= CONFIDENCE_THRESHOLD;
}
