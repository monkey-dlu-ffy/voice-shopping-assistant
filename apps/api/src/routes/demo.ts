import type { PurchaseRecord } from '../store/repository.js';

/**
 * Synthetic purchase history for the demo button.
 *
 * A reviewer opens the hosted app to an empty list, and an empty list produces
 * no replenishment suggestions - which hides the single most interesting part of
 * the system. Seeding 90 days of plausible history makes the recommendation
 * engine visible within seconds of a cold open.
 *
 * The intervals below are deliberately varied so the fitted models differ, and
 * `daysAgoOfLast` is tuned so a handful of items land just past their cycle and
 * appear as "due" immediately.
 */

interface SeedSpec {
  canonical: string;
  /** Typical days between purchases. */
  intervalDays: number;
  /** How long ago the most recent purchase was. */
  daysAgoOfLast: number;
  quantity?: number;
}

const SEED: SeedSpec[] = [
  // Overdue - these drive the visible "you are running low" suggestions.
  { canonical: 'milk', intervalDays: 5, daysAgoOfLast: 6 },
  { canonical: 'bread', intervalDays: 6, daysAgoOfLast: 7 },
  { canonical: 'eggs', intervalDays: 9, daysAgoOfLast: 10 },
  { canonical: 'bananas', intervalDays: 7, daysAgoOfLast: 7 },

  // Approaching their cycle.
  { canonical: 'coffee', intervalDays: 21, daysAgoOfLast: 18 },
  { canonical: 'yogurt', intervalDays: 10, daysAgoOfLast: 8 },

  // Recently bought - present in history but correctly not suggested yet.
  { canonical: 'rice', intervalDays: 30, daysAgoOfLast: 3 },
  { canonical: 'olive oil', intervalDays: 45, daysAgoOfLast: 5 },
  { canonical: 'toilet paper', intervalDays: 24, daysAgoOfLast: 2 },
  { canonical: 'chicken breast', intervalDays: 8, daysAgoOfLast: 1 },
  { canonical: 'tomatoes', intervalDays: 7, daysAgoOfLast: 2 },
  { canonical: 'onions', intervalDays: 14, daysAgoOfLast: 4 },
  { canonical: 'shampoo', intervalDays: 40, daysAgoOfLast: 12 },
  { canonical: 'pasta', intervalDays: 16, daysAgoOfLast: 6 },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_WINDOW_DAYS = 90;

/**
 * Build the seed history.
 *
 * A small deterministic jitter is applied to each gap so the fitted intervals
 * are means over slightly irregular data, as they would be in reality, rather
 * than a perfectly periodic signal.
 */
export function buildDemoHistory(now = new Date()): PurchaseRecord[] {
  const records: PurchaseRecord[] = [];

  SEED.forEach((spec, specIndex) => {
    let daysAgo = spec.daysAgoOfLast;
    let occurrence = 0;

    while (daysAgo <= HISTORY_WINDOW_DAYS) {
      // Deterministic pseudo-jitter: repeatable across runs, so the demo always
      // tells the same story.
      const jitter = ((specIndex * 7 + occurrence * 13) % 5) - 2;
      records.push({
        canonical: spec.canonical,
        quantity: spec.quantity ?? 1,
        purchasedAt: new Date(now.getTime() - daysAgo * DAY_MS),
      });
      daysAgo += Math.max(2, spec.intervalDays + jitter);
      occurrence++;
    }
  });

  return records.sort((a, b) => a.purchasedAt.getTime() - b.purchasedAt.getTime());
}
