/**
 * The Intent contract.
 *
 * This is the single abstraction the whole application hangs off. Speech becomes
 * text, text becomes an `Intent`, and an executor applies `Intent`s to state.
 *
 * Two completely independent parsers emit this exact shape:
 *   - `RuleParser`  - deterministic, offline, sub-millisecond, free
 *   - `LlmProvider` - Gemini Flash, used only when the rules are not confident
 *
 * Because both sides of the fallback speak the same language, either can be
 * tested, swapped or removed without touching the executor.
 */

export const CATEGORIES = [
  'produce',
  'dairy',
  'bakery',
  'meat',
  'seafood',
  'pantry',
  'frozen',
  'beverages',
  'snacks',
  'household',
  'personal care',
  'other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const INTENT_KINDS = [
  'add',
  'remove',
  'update_quantity',
  'search',
  'clear_list',
  'mark_bought',
  'read_list',
  'undo',
  'unknown',
] as const;

export type IntentKind = (typeof INTENT_KINDS)[number];

/** Where a parse came from. Surfaced in the UI so the architecture is visible. */
export type ParseSource = 'rules' | 'llm' | 'cache';

export interface ParsedItem {
  /** Exactly as spoken, in the user's own language. Preserved for display. */
  raw: string;
  /**
   * Normalised English key, e.g. "milk".
   *
   * This is the load-bearing field for multilingual support: whatever language
   * the user speaks, the list is stored against English keys, so categorisation,
   * pricing, purchase history and recommendations all work identically across
   * languages. The UI renders the label back in the user's language.
   */
  canonical: string;
  quantity: number | null;
  /** bottle, kg, dozen, packet, ... */
  unit: string | null;
  category: Category | null;
  /** organic, whole, low-fat, ... */
  attributes: string[];
  brand: string | null;
}

export interface IntentFilters {
  maxPrice?: number;
  minPrice?: number;
  brand?: string;
  attributes?: string[];
}

export interface Intent {
  intent: IntentKind;
  items: ParsedItem[];
  filters: IntentFilters;
  /** BCP-47 language tag the utterance was spoken in, e.g. "hi-IN". */
  language: string;
  /** 0..1. Below CONFIDENCE_THRESHOLD the rule parser defers to the LLM. */
  confidence: number;
  source: ParseSource;
  latencyMs: number;
  /** The normalised utterance the parse was derived from. Used as the cache key. */
  normalized: string;
}

/** Rule-parser results below this confidence are handed to the LLM. */
export const CONFIDENCE_THRESHOLD = 0.6;

export interface CatalogEntry {
  canonical: string;
  aliases: Record<string, string[]>;
  category: Category;
  defaultUnit: string | null;
  avgPrice: number;
  brands: string[];
  /** 1-indexed months this item is in season, or null for year-round items. */
  seasonMonths: number[] | null;
  substitutes: string[];
  attributes: string[];
  onSale: boolean;
}

export interface ShoppingItem {
  id: string;
  canonical: string;
  raw: string;
  quantity: number;
  unit: string | null;
  category: Category;
  done: boolean;
  addedAt: string;
}

export type SuggestionKind = 'replenishment' | 'seasonal' | 'substitute' | 'deal' | 'co-purchase';

export interface Suggestion {
  canonical: string;
  kind: SuggestionKind;
  /** Human-readable justification, rendered verbatim in the UI. */
  reason: string;
  score: number;
  category: Category;
  avgPrice: number;
}

/** What the API returns for any voice command. */
export interface CommandResult {
  intent: Intent;
  list: ShoppingItem[];
  /** Short confirmation, spoken aloud in voice-only mode. */
  speak: string;
  searchResults?: CatalogEntry[];
  substitutes?: { forItem: string; options: CatalogEntry[] };
}
