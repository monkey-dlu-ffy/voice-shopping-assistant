import { describe, it, expect } from 'vitest';
import type { ShoppingItem } from '@vsa/shared';
import {
  buildReplenishmentModels,
  buildSuggestions,
  coPurchaseSuggestions,
  replenishmentSuggestions,
  seasonalSuggestions,
  substitutePrompt,
} from '../src/suggestions/engine.js';
import type { PurchaseRecord } from '../src/store/repository.js';
import { buildDemoHistory } from '../src/routes/demo.js';

const NOW = new Date('2026-05-15T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

/** Build a purchase history: `canonical` bought every `everyDays`, last `lastDaysAgo` ago. */
function history(canonical: string, everyDays: number, lastDaysAgo: number, count = 5): PurchaseRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    canonical,
    quantity: 1,
    purchasedAt: new Date(NOW.getTime() - (lastDaysAgo + i * everyDays) * DAY),
  }));
}

function listOf(...canonicals: string[]): ShoppingItem[] {
  return canonicals.map((canonical, i) => ({
    id: `id-${i}`,
    canonical,
    raw: canonical,
    quantity: 1,
    unit: null,
    category: 'other' as const,
    done: false,
    addedAt: NOW.toISOString(),
  }));
}

describe('replenishment model', () => {
  it('recovers the interval it was generated from', () => {
    const models = buildReplenishmentModels(history('milk', 7, 3), NOW);
    expect(models).toHaveLength(1);
    expect(models[0]!.canonical).toBe('milk');
    expect(models[0]!.averageIntervalDays).toBeCloseTo(7, 5);
    expect(models[0]!.daysSinceLast).toBeCloseTo(3, 5);
  });

  it('ignores items bought only once - one observation is not an interval', () => {
    const single: PurchaseRecord[] = [
      { canonical: 'saffron', quantity: 1, purchasedAt: new Date(NOW.getTime() - 5 * DAY) },
    ];
    expect(buildReplenishmentModels(single, NOW)).toHaveLength(0);
  });

  it('deduplicates purchases recorded at the same instant', () => {
    const at = new Date(NOW.getTime() - 5 * DAY);
    const duplicated: PurchaseRecord[] = [
      { canonical: 'milk', quantity: 1, purchasedAt: at },
      { canonical: 'milk', quantity: 2, purchasedAt: at },
    ];
    expect(buildReplenishmentModels(duplicated, NOW)).toHaveLength(0);
  });

  it('ranks the most overdue item first', () => {
    const models = buildReplenishmentModels(
      [...history('milk', 7, 14), ...history('rice', 30, 2)],
      NOW,
    );
    expect(models[0]!.canonical).toBe('milk');
    expect(models[0]!.ratio).toBeGreaterThan(models[1]!.ratio);
  });

  it('handles an empty history', () => {
    expect(buildReplenishmentModels([], NOW)).toEqual([]);
  });
});

describe('replenishment suggestions', () => {
  it('suggests an item that is past its usual cycle', () => {
    const suggestions = replenishmentSuggestions({
      list: [],
      purchases: history('milk', 6, 7),
      now: NOW,
    });
    expect(suggestions.map((s) => s.canonical)).toContain('milk');
  });

  it('does not suggest an item bought yesterday', () => {
    const suggestions = replenishmentSuggestions({
      list: [],
      purchases: history('milk', 30, 1),
      now: NOW,
    });
    expect(suggestions.map((s) => s.canonical)).not.toContain('milk');
  });

  it('never suggests something already on the list', () => {
    const suggestions = replenishmentSuggestions({
      list: listOf('milk'),
      purchases: history('milk', 6, 7),
      now: NOW,
    });
    expect(suggestions.map((s) => s.canonical)).not.toContain('milk');
  });

  it('explains itself with the actual interval it measured', () => {
    const [suggestion] = replenishmentSuggestions({
      list: [],
      purchases: history('bread', 6, 7),
      now: NOW,
    });
    expect(suggestion!.reason).toMatch(/bread/);
    expect(suggestion!.reason).toMatch(/6 days/);
    expect(suggestion!.reason).toMatch(/7/);
  });
});

describe('co-purchase suggestions', () => {
  it('suggests pasta sauce when pasta is on the list', () => {
    const suggestions = coPurchaseSuggestions({ list: listOf('pasta'), purchases: [], now: NOW });
    expect(suggestions.map((s) => s.canonical)).toContain('pasta sauce');
  });

  it('works in both directions of a pair', () => {
    const suggestions = coPurchaseSuggestions({
      list: listOf('pasta sauce'),
      purchases: [],
      now: NOW,
    });
    expect(suggestions.map((s) => s.canonical)).toContain('pasta');
  });

  it('produces nothing for an empty list', () => {
    expect(coPurchaseSuggestions({ list: [], purchases: [], now: NOW })).toEqual([]);
  });

  it('names the item that triggered it', () => {
    const [suggestion] = coPurchaseSuggestions({
      list: listOf('pasta'),
      purchases: [],
      now: NOW,
    });
    expect(suggestion!.reason).toMatch(/pasta/);
  });
});

describe('seasonal suggestions', () => {
  it('suggests mangoes in May', () => {
    const suggestions = seasonalSuggestions({ list: [], purchases: [], now: NOW });
    expect(suggestions.map((s) => s.canonical)).toContain('mangoes');
  });

  it('does not suggest mangoes in December', () => {
    const december = new Date('2026-12-15T12:00:00Z');
    const suggestions = seasonalSuggestions({ list: [], purchases: [], now: december });
    expect(suggestions.map((s) => s.canonical)).not.toContain('mangoes');
  });

  it('names the month in its reason', () => {
    const [suggestion] = seasonalSuggestions({ list: [], purchases: [], now: NOW });
    expect(suggestion!.reason).toMatch(/May/);
  });
});

describe('merged suggestions', () => {
  it('ranks a measured repurchase above a generic seasonal tip', () => {
    const suggestions = buildSuggestions({
      list: [],
      purchases: history('milk', 6, 8),
      now: NOW,
    });
    const milk = suggestions.findIndex((s) => s.canonical === 'milk');
    const seasonal = suggestions.findIndex((s) => s.kind === 'seasonal');
    expect(milk).toBeGreaterThanOrEqual(0);
    if (seasonal >= 0) expect(milk).toBeLessThan(seasonal);
  });

  it('never repeats an item across signals', () => {
    const suggestions = buildSuggestions({
      list: listOf('pasta'),
      purchases: history('pasta sauce', 5, 9),
      now: NOW,
    });
    const names = suggestions.map((s) => s.canonical);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every suggestion a non-empty reason', () => {
    const suggestions = buildSuggestions({
      list: listOf('pasta'),
      purchases: history('milk', 6, 8),
      now: NOW,
    });
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) expect(s.reason.length).toBeGreaterThan(0);
  });

  it('respects the limit', () => {
    expect(buildSuggestions({ list: [], purchases: [], now: NOW, limit: 3 }).length).toBeLessThanOrEqual(3);
  });

  it('still produces something useful with no history at all', () => {
    // Cold start must not be an empty screen: seasonal and deal signals carry it.
    expect(buildSuggestions({ list: [], purchases: [], now: NOW }).length).toBeGreaterThan(0);
  });
});

describe('substitute prompts', () => {
  it('offers dairy-free options for milk', () => {
    expect(substitutePrompt('milk', []).map((s) => s.canonical)).toContain('almond milk');
  });

  it('skips substitutes already on the list', () => {
    const options = substitutePrompt('milk', listOf('almond milk')).map((s) => s.canonical);
    expect(options).not.toContain('almond milk');
  });
});

describe('demo history', () => {
  it('produces enough history to fit intervals', () => {
    const records = buildDemoHistory(NOW);
    expect(records.length).toBeGreaterThan(50);
    expect(buildReplenishmentModels(records, NOW).length).toBeGreaterThan(8);
  });

  it('is deterministic, so the demo always tells the same story', () => {
    expect(buildDemoHistory(NOW)).toEqual(buildDemoHistory(NOW));
  });

  it('immediately yields visible replenishment suggestions', () => {
    const suggestions = buildSuggestions({
      list: [],
      purchases: buildDemoHistory(NOW),
      now: NOW,
    });
    const replenishments = suggestions.filter((s) => s.kind === 'replenishment');
    expect(replenishments.length).toBeGreaterThanOrEqual(3);
  });

  it('does not suggest items bought only days ago', () => {
    const suggestions = buildSuggestions({
      list: [],
      purchases: buildDemoHistory(NOW),
      now: NOW,
    });
    expect(suggestions.map((s) => s.canonical)).not.toContain('chicken breast');
  });
});
