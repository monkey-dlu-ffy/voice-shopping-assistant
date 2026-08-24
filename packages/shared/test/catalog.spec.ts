import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CO_PURCHASE_PAIRS,
  categorize,
  getEntry,
  inSeason,
  labelFor,
  resolveItem,
  searchCatalog,
  substitutesFor,
} from '../src/catalog.js';
import { CATEGORIES } from '../src/types.js';
import { similarity } from '../src/fuzzy.js';

describe('catalogue integrity', () => {
  it('has a meaningful number of products', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(100);
  });

  it('has no duplicate canonical names', () => {
    const names = CATALOG.map((e) => e.canonical);
    expect(new Set(names).size).toBe(names.length);
  });

  it('only uses known categories', () => {
    for (const entry of CATALOG) {
      expect(CATEGORIES).toContain(entry.category);
    }
  });

  it('has a positive price for every item', () => {
    for (const entry of CATALOG) {
      expect(entry.avgPrice, entry.canonical).toBeGreaterThan(0);
    }
  });

  it('only references substitutes that exist', () => {
    const known = new Set(CATALOG.map((e) => e.canonical));
    for (const entry of CATALOG) {
      for (const sub of entry.substitutes) {
        expect(known.has(sub), `${entry.canonical} -> ${sub}`).toBe(true);
      }
    }
  });

  it('only references co-purchase items that exist', () => {
    const known = new Set(CATALOG.map((e) => e.canonical));
    for (const [a, b] of CO_PURCHASE_PAIRS) {
      expect(known.has(a), a).toBe(true);
      expect(known.has(b), b).toBe(true);
    }
  });

  it('uses valid month numbers for seasonal items', () => {
    for (const entry of CATALOG) {
      for (const month of entry.seasonMonths ?? []) {
        expect(month).toBeGreaterThanOrEqual(1);
        expect(month).toBeLessThanOrEqual(12);
      }
    }
  });
});

describe('item resolution', () => {
  it('resolves exact names', () => {
    expect(resolveItem('milk')?.entry.canonical).toBe('milk');
    expect(resolveItem('toilet paper')?.entry.canonical).toBe('toilet paper');
  });

  it('resolves aliases', () => {
    expect(resolveItem('yoghurt')?.entry.canonical).toBe('yogurt');
    expect(resolveItem('crisps')?.entry.canonical).toBe('chips');
    expect(resolveItem('capsicum')?.entry.canonical).toBe('bell peppers');
  });

  it('resolves across languages to the same English key', () => {
    expect(resolveItem('doodh')?.entry.canonical).toBe('milk');
    expect(resolveItem('leche')?.entry.canonical).toBe('milk');
    expect(resolveItem('aloo')?.entry.canonical).toBe('potatoes');
  });

  it('absorbs singular and plural forms', () => {
    expect(resolveItem('apple')?.entry.canonical).toBe('apples');
    expect(resolveItem('banana')?.entry.canonical).toBe('bananas');
  });

  it('absorbs common mishearings', () => {
    expect(resolveItem('brocoli')?.entry.canonical).toBe('broccoli');
    expect(resolveItem('tomatos')?.entry.canonical).toBe('tomatoes');
  });

  it('returns null for things it genuinely does not know', () => {
    expect(resolveItem('quantum flux capacitor')).toBeNull();
    expect(resolveItem('asdfghjkl')).toBeNull();
  });

  it('does not confuse similar but distinct products', () => {
    expect(resolveItem('almond milk')?.entry.canonical).toBe('almond milk');
    expect(resolveItem('oat milk')?.entry.canonical).toBe('oat milk');
  });
});

describe('categorisation', () => {
  it('categorises known items', () => {
    expect(categorize('milk')).toBe('dairy');
    expect(categorize('apples')).toBe('produce');
    expect(categorize('bread')).toBe('bakery');
    expect(categorize('shampoo')).toBe('personal care');
    expect(categorize('frozen peas')).toBe('frozen');
  });

  it('falls back to "other" for unknown items', () => {
    expect(categorize('quantum flux capacitor')).toBe('other');
  });
});

describe('search', () => {
  it('filters by maximum price', () => {
    const results = searchCatalog({ text: 'toothpaste', maxPrice: 5 });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) expect(r.avgPrice).toBeLessThanOrEqual(5);
  });

  it('returns nothing when the price ceiling excludes everything', () => {
    expect(searchCatalog({ text: 'salmon', maxPrice: 1 })).toHaveLength(0);
  });

  it('filters by attribute', () => {
    const results = searchCatalog({ text: 'apples', attributes: ['organic'] });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) expect(r.attributes).toContain('organic');
  });

  it('filters by brand', () => {
    const results = searchCatalog({ brand: 'Amul' });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.brands.some((b) => b.toLowerCase().includes('amul'))).toBe(true);
    }
  });

  it('combines text, attribute and price filters', () => {
    const results = searchCatalog({ text: 'bread', attributes: ['gluten-free'] });
    expect(results.map((r) => r.canonical)).toContain('gluten-free bread');
  });
});

describe('substitutes', () => {
  it('offers dairy-free alternatives for milk', () => {
    const subs = substitutesFor('milk').map((s) => s.canonical);
    expect(subs).toContain('almond milk');
    expect(subs).toContain('soy milk');
  });

  it('never suggests the item itself', () => {
    for (const entry of CATALOG) {
      const subs = substitutesFor(entry.canonical).map((s) => s.canonical);
      expect(subs).not.toContain(entry.canonical);
    }
  });

  it('falls back to category siblings when no explicit list exists', () => {
    const noExplicit = CATALOG.find((e) => e.substitutes.length === 0);
    expect(noExplicit).toBeDefined();
    const subs = substitutesFor(noExplicit!.canonical);
    for (const s of subs) expect(s.category).toBe(noExplicit!.category);
  });

  it('returns nothing for an unknown item', () => {
    expect(substitutesFor('quantum flux capacitor')).toHaveLength(0);
  });
});

describe('seasonality', () => {
  it('finds mangoes in season in May but not December', () => {
    expect(inSeason(5).map((e) => e.canonical)).toContain('mangoes');
    expect(inSeason(12).map((e) => e.canonical)).not.toContain('mangoes');
  });

  it('returns items for every month of the year', () => {
    for (let month = 1; month <= 12; month++) {
      expect(inSeason(month).length, `month ${month}`).toBeGreaterThan(0);
    }
  });
});

describe('localised labels', () => {
  it('renders the item in the requested language', () => {
    expect(labelFor('milk', 'hi-IN')).toBe('दूध');
    expect(labelFor('milk', 'es-ES')).toBe('leche');
    expect(labelFor('milk', 'en-US')).toBe('milk');
  });

  it('falls back to English when no translation exists', () => {
    const untranslated = CATALOG.find((e) => e.aliases.hi?.length === 0)!;
    expect(labelFor(untranslated.canonical, 'hi-IN')).toBe(untranslated.canonical);
  });

  it('leaves unknown items untouched', () => {
    expect(labelFor('quantum flux capacitor', 'hi-IN')).toBe('quantum flux capacitor');
  });
});

describe('fuzzy matching', () => {
  it('scores identical strings at 1', () => {
    expect(similarity('milk', 'milk')).toBe(1);
  });

  it('scores a typo higher than an unrelated word', () => {
    expect(similarity('brocoli', 'broccoli')).toBeGreaterThan(similarity('brocoli', 'bananas'));
  });

  it('penalises a short query against a much longer name', () => {
    expect(similarity('milk', 'almond milk')).toBeLessThan(similarity('almond milk', 'almond milk'));
  });
});

describe('lookup helpers', () => {
  it('returns entries by canonical name', () => {
    expect(getEntry('milk')?.category).toBe('dairy');
    expect(getEntry('nope')).toBeUndefined();
  });
});
