import { catalogSource } from './data/catalog.js';
import type { CatalogEntry, Category } from './types.js';
import { CATEGORIES } from './types.js';
import { escapeRegExp, foldDiacritics } from './normalize.js';
import { bestMatches, similarity } from './fuzzy.js';

/** The compact on-disk shape. Expanded into CatalogEntry at load time. */
interface RawItem {
  canonical: string;
  category: string;
  unit?: string | null;
  price: number;
  alias?: string[];
  hi?: string[];
  es?: string[];
  season?: number[];
  subs?: string[];
  brands?: string[];
  attrs?: string[];
  sale?: boolean;
}

interface RawCatalog {
  items: RawItem[];
  coPurchase: [string, string][];
}

function toCategory(value: string): Category {
  return (CATEGORIES as readonly string[]).includes(value) ? (value as Category) : 'other';
}

function expand(item: RawItem): CatalogEntry {
  return {
    canonical: item.canonical,
    aliases: {
      en: [item.canonical, ...(item.alias ?? [])],
      hi: item.hi ?? [],
      es: item.es ?? [],
    },
    category: toCategory(item.category),
    defaultUnit: item.unit ?? null,
    avgPrice: item.price,
    brands: item.brands ?? [],
    seasonMonths: item.season ?? null,
    substitutes: item.subs ?? [],
    attributes: item.attrs ?? [],
    onSale: item.sale ?? false,
  };
}

const source = catalogSource as unknown as RawCatalog;

export const CATALOG: CatalogEntry[] = source.items.map(expand);

export const CO_PURCHASE_PAIRS: readonly (readonly [string, string])[] = source.coPurchase;

const byCanonical = new Map<string, CatalogEntry>(CATALOG.map((e) => [e.canonical, e]));

/**
 * Every alias in every language, folded and lowercased, pointing at its entry.
 * Built once at module load; lookups are O(1) for anything spelled correctly.
 */
const aliasIndex = new Map<string, CatalogEntry>();
for (const entry of CATALOG) {
  for (const list of Object.values(entry.aliases)) {
    for (const alias of list) {
      aliasIndex.set(foldDiacritics(alias.toLowerCase()), entry);
    }
  }
}

export function getEntry(canonical: string): CatalogEntry | undefined {
  return byCanonical.get(canonical);
}

export function allCanonicalNames(): string[] {
  return CATALOG.map((e) => e.canonical);
}

export interface ResolveResult {
  entry: CatalogEntry;
  /** 1 for an exact alias hit, <1 for a fuzzy match. */
  score: number;
  how: 'alias' | 'fuzzy';
}

/**
 * Resolve a spoken item name to a catalogue entry.
 *
 * Exact alias first (free, O(1)), then fuzzy across every alias in every
 * language. Returns null when nothing clears the threshold, which is the signal
 * for the caller to fall through to the LLM for categorisation.
 */
export function resolveItem(name: string, minScore = 0.72): ResolveResult | null {
  const query = foldDiacritics(name.toLowerCase().trim());
  if (!query) return null;

  const exact = aliasIndex.get(query);
  if (exact) return { entry: exact, score: 1, how: 'alias' };

  // Singular/plural is the most common near-miss; try it before paying for fuzzy.
  for (const variant of [`${query}s`, `${query}es`, query.replace(/e?s$/, '')]) {
    const hit = aliasIndex.get(variant);
    if (hit) return { entry: hit, score: 0.97, how: 'alias' };
  }

  const ranked = bestMatches(
    query,
    CATALOG,
    (e) => Object.values(e.aliases).flat(),
    minScore,
  );
  const top = ranked[0];
  return top ? { entry: top.value, score: top.score, how: 'fuzzy' } : null;
}

/** Categorise a spoken name, defaulting to "other" when unknown. */
export function categorize(name: string): Category {
  return resolveItem(name)?.entry.category ?? 'other';
}

export interface SearchQuery {
  text?: string;
  maxPrice?: number;
  minPrice?: number;
  brand?: string;
  attributes?: string[];
  category?: Category;
  limit?: number;
}

/**
 * Voice-driven catalogue search: "find organic apples under $5".
 * Text matching is fuzzy; price, brand and attribute filters are exact.
 */
export function searchCatalog(query: SearchQuery): CatalogEntry[] {
  const limit = query.limit ?? 12;
  let pool = CATALOG;

  if (query.category) pool = pool.filter((e) => e.category === query.category);
  if (query.maxPrice !== undefined) pool = pool.filter((e) => e.avgPrice <= query.maxPrice!);
  if (query.minPrice !== undefined) pool = pool.filter((e) => e.avgPrice >= query.minPrice!);

  if (query.brand) {
    const brand = foldDiacritics(query.brand.toLowerCase());
    pool = pool.filter((e) => e.brands.some((b) => foldDiacritics(b.toLowerCase()).includes(brand)));
  }

  if (query.attributes?.length) {
    pool = pool.filter((e) => query.attributes!.every((attr) => e.attributes.includes(attr)));
  }

  const text = query.text?.trim();
  if (!text) {
    return [...pool].sort((a, b) => a.avgPrice - b.avgPrice).slice(0, limit);
  }

  const needle = foldDiacritics(text.toLowerCase());
  const ranked = pool
    .map((entry) => ({
      entry,
      score: Math.max(
        ...Object.values(entry.aliases)
          .flat()
          .map((alias) => searchScore(needle, alias)),
      ),
    }))
    .filter((r) => r.score >= 0.55)
    .sort((a, b) => b.score - a.score || a.entry.avgPrice - b.entry.avgPrice);

  return ranked.slice(0, limit).map((r) => r.entry);
}

/**
 * Scoring for search, which is looser than scoring for item resolution.
 *
 * `similarity` deliberately penalises a short query against a much longer name
 * so that "milk" does not resolve to "almond milk" when adding to the list.
 * Search wants the opposite: "bread" should surface "gluten-free bread". Whole
 * word containment is therefore treated as a strong match here.
 */
function searchScore(needle: string, alias: string): number {
  const key = foldDiacritics(alias.toLowerCase());
  if (key === needle) return 1;
  if (new RegExp(`(^|[^a-z])${escapeRegExp(needle)}([^a-z]|$)`).test(key)) return 0.9;
  return similarity(needle, key);
}

/** Substitutes for an item, resolved to full catalogue entries. */
export function substitutesFor(canonical: string): CatalogEntry[] {
  const entry = byCanonical.get(canonical);
  if (!entry) return [];

  const explicit = entry.substitutes
    .map((s) => byCanonical.get(s))
    .filter((e): e is CatalogEntry => Boolean(e));
  if (explicit.length > 0) return explicit;

  // Fall back to category siblings at a similar price point.
  return CATALOG.filter(
    (e) => e.category === entry.category && e.canonical !== canonical,
  )
    .sort(
      (a, b) =>
        Math.abs(a.avgPrice - entry.avgPrice) - Math.abs(b.avgPrice - entry.avgPrice),
    )
    .slice(0, 3);
}

/** Items in season for a 1-indexed month. */
export function inSeason(month: number): CatalogEntry[] {
  return CATALOG.filter((e) => e.seasonMonths?.includes(month));
}

/** Items flagged as on sale in the seeded catalogue. */
export function onSaleItems(): CatalogEntry[] {
  return CATALOG.filter((e) => e.onSale);
}

/** Display label for an item in the requested language, falling back to English. */
export function labelFor(canonical: string, language: string): string {
  const entry = byCanonical.get(canonical);
  if (!entry) return canonical;
  const code = language.split('-')[0]!.toLowerCase();
  return entry.aliases[code]?.[0] ?? entry.canonical;
}
