import {
  CO_PURCHASE_PAIRS,
  getEntry,
  inSeason,
  labelFor,
  onSaleItems,
  type CatalogEntry,
  type ShoppingItem,
  type Suggestion,
} from '@vsa/shared';
import type { PurchaseRecord } from '../store/repository.js';

/**
 * Suggestion engine.
 *
 * Four independent signals produce one ranked list. Every suggestion carries a
 * human-readable `reason` that is rendered verbatim in the UI - the difference
 * between a recommendation a user can trust and a hardcoded array.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Below this many observations there is no interval to speak of. */
const MIN_PURCHASES_FOR_INTERVAL = 2;

/** Surface a replenishment once the user is 80% of the way through a typical cycle. */
const REPLENISH_TRIGGER = 0.8;

export interface ReplenishmentModel {
  canonical: string;
  purchaseCount: number;
  /** Mean days between consecutive purchases. */
  averageIntervalDays: number;
  daysSinceLast: number;
  /** daysSinceLast / averageIntervalDays. >= 1 means overdue. */
  ratio: number;
}

/**
 * Fit a per-item repurchase interval from observed history.
 *
 * Deliberately simple - the mean gap between consecutive purchases - because
 * with a handful of observations per item anything fancier would be fitting
 * noise. Items bought once are skipped rather than guessed at.
 */
export function buildReplenishmentModels(
  purchases: PurchaseRecord[],
  now = new Date(),
): ReplenishmentModel[] {
  const byItem = new Map<string, number[]>();
  for (const record of purchases) {
    const times = byItem.get(record.canonical) ?? [];
    times.push(new Date(record.purchasedAt).getTime());
    byItem.set(record.canonical, times);
  }

  const models: ReplenishmentModel[] = [];
  for (const [canonical, rawTimes] of byItem) {
    const times = [...new Set(rawTimes)].sort((a, b) => a - b);
    if (times.length < MIN_PURCHASES_FOR_INTERVAL) continue;

    let totalGap = 0;
    for (let i = 1; i < times.length; i++) totalGap += times[i]! - times[i - 1]!;
    const averageIntervalDays = totalGap / (times.length - 1) / DAY_MS;
    if (averageIntervalDays <= 0) continue;

    const daysSinceLast = (now.getTime() - times[times.length - 1]!) / DAY_MS;
    models.push({
      canonical,
      purchaseCount: times.length,
      averageIntervalDays,
      daysSinceLast,
      ratio: daysSinceLast / averageIntervalDays,
    });
  }

  return models.sort((a, b) => b.ratio - a.ratio);
}

function round(value: number): number {
  return Math.max(1, Math.round(value));
}

function suggestionFrom(entry: CatalogEntry, kind: Suggestion['kind'], reason: string, score: number): Suggestion {
  return {
    canonical: entry.canonical,
    kind,
    reason,
    score,
    category: entry.category,
    avgPrice: entry.avgPrice,
  };
}

export interface SuggestionInput {
  list: ShoppingItem[];
  purchases: PurchaseRecord[];
  language?: string;
  now?: Date;
  limit?: number;
}

/** Items already on the list should never be suggested back to the user. */
function excluded(list: ShoppingItem[]): Set<string> {
  return new Set(list.filter((i) => !i.done).map((i) => i.canonical));
}

/** Signal 1: the user is due to rebuy something they buy regularly. */
export function replenishmentSuggestions(input: SuggestionInput): Suggestion[] {
  const now = input.now ?? new Date();
  const skip = excluded(input.list);
  const language = input.language ?? 'en-US';

  return buildReplenishmentModels(input.purchases, now)
    .filter((m) => m.ratio >= REPLENISH_TRIGGER && !skip.has(m.canonical))
    .flatMap((model) => {
      const entry = getEntry(model.canonical);
      if (!entry) return [];

      const every = round(model.averageIntervalDays);
      const since = round(model.daysSinceLast);
      const label = labelFor(model.canonical, language);
      const reason =
        model.ratio >= 1
          ? `You buy ${label} about every ${every} days - it has been ${since}.`
          : `You usually buy ${label} every ${every} days, and it has been ${since}.`;

      // Cap the score so a wildly overdue item cannot crowd out everything else.
      return [suggestionFrom(entry, 'replenishment', reason, Math.min(model.ratio, 2))];
    });
}

/** Signal 2: things people buy alongside what is already on the list. */
export function coPurchaseSuggestions(input: SuggestionInput): Suggestion[] {
  const onList = input.list.filter((i) => !i.done).map((i) => i.canonical);
  const skip = excluded(input.list);
  const language = input.language ?? 'en-US';
  if (onList.length === 0) return [];

  const scored = new Map<string, { partner: string; hits: number }>();
  for (const [a, b] of CO_PURCHASE_PAIRS) {
    for (const [source, partner] of [
      [a, b],
      [b, a],
    ] as const) {
      if (!onList.includes(source) || skip.has(partner)) continue;
      const existing = scored.get(partner);
      scored.set(partner, { partner: source, hits: (existing?.hits ?? 0) + 1 });
    }
  }

  return [...scored.entries()].flatMap(([canonical, { partner, hits }]) => {
    const entry = getEntry(canonical);
    if (!entry) return [];
    const reason = `Often bought with ${labelFor(partner, language)}.`;
    // Below replenishment: a real repurchase signal beats a generic pairing.
    return [suggestionFrom(entry, 'co-purchase', reason, 0.5 + 0.1 * hits)];
  });
}

/** Signal 3: produce that is at its best right now. */
export function seasonalSuggestions(input: SuggestionInput): Suggestion[] {
  const now = input.now ?? new Date();
  const month = now.getMonth() + 1;
  const monthName = now.toLocaleString('en-US', { month: 'long' });
  const skip = excluded(input.list);
  const language = input.language ?? 'en-US';

  return inSeason(month)
    .filter((entry) => !skip.has(entry.canonical))
    .map((entry) =>
      suggestionFrom(
        entry,
        'seasonal',
        `${labelFor(entry.canonical, language)} are in season in ${monthName}.`,
        0.45,
      ),
    );
}

/** Signal 4: seeded promotions. */
export function dealSuggestions(input: SuggestionInput): Suggestion[] {
  const skip = excluded(input.list);
  const language = input.language ?? 'en-US';

  return onSaleItems()
    .filter((entry) => !skip.has(entry.canonical))
    .map((entry) =>
      suggestionFrom(
        entry,
        'deal',
        `${labelFor(entry.canonical, language)} is on offer this week.`,
        0.4,
      ),
    );
}

/**
 * Merge every signal into one ranked list.
 *
 * When two signals suggest the same item the stronger one wins, so a
 * replenishment reason ("you buy this every 6 days") is never replaced by a
 * weaker generic one ("in season").
 */
export function buildSuggestions(input: SuggestionInput): Suggestion[] {
  const all = [
    ...replenishmentSuggestions(input),
    ...coPurchaseSuggestions(input),
    ...seasonalSuggestions(input),
    ...dealSuggestions(input),
  ];

  const best = new Map<string, Suggestion>();
  for (const suggestion of all) {
    const existing = best.get(suggestion.canonical);
    if (!existing || suggestion.score > existing.score) {
      best.set(suggestion.canonical, suggestion);
    }
  }

  return [...best.values()]
    .sort((a, b) => b.score - a.score || a.canonical.localeCompare(b.canonical))
    .slice(0, input.limit ?? 6);
}

/**
 * Substitute prompts for an item, e.g. almond milk when the user adds milk.
 * Returned separately from suggestions because the UI attaches them to a
 * specific list row rather than to the list as a whole.
 */
export function substitutePrompt(canonical: string, list: ShoppingItem[]): CatalogEntry[] {
  const skip = excluded(list);
  const entry = getEntry(canonical);
  if (!entry) return [];
  return entry.substitutes
    .filter((s) => !skip.has(s))
    .map((s) => getEntry(s))
    .filter((e): e is CatalogEntry => Boolean(e))
    .slice(0, 3);
}
