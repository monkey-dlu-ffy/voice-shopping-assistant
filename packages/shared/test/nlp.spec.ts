import { describe, it, expect } from 'vitest';
import { parseWithRules, isConfident } from '../src/ruleParser.js';
import type { IntentFilters, IntentKind } from '../src/types.js';

/**
 * The NLP corpus.
 *
 * This is the evidence behind the "understands varied phrasing" requirement.
 * Each row is a real utterance with the exact Intent it must produce, so a
 * regression in the parser fails here rather than in a demo.
 *
 * Rows marked `escalates` are the other half of the story: phrasings the rule
 * parser is deliberately NOT confident about, which `interpret()` hands to the
 * LLM. Asserting on those keeps the fallback boundary honest - if the rules
 * silently start "handling" them with a wrong answer, this fails.
 */
interface Case {
  utterance: string;
  lang?: string;
  intent: IntentKind;
  /** Canonical item names, in order. */
  items?: string[];
  quantities?: (number | null)[];
  units?: (string | null)[];
  filters?: IntentFilters;
  /** Expect the rule parser to defer to the LLM. */
  escalates?: boolean;
}

const ENGLISH_ADD: Case[] = [
  { utterance: 'add milk', intent: 'add', items: ['milk'] },
  { utterance: 'Add milk to my list', intent: 'add', items: ['milk'] },
  { utterance: 'I need apples', intent: 'add', items: ['apples'] },
  { utterance: 'I want to buy bananas', intent: 'add', items: ['bananas'] },
  { utterance: 'buy bread', intent: 'add', items: ['bread'] },
  { utterance: 'get some eggs', intent: 'add', items: ['eggs'] },
  { utterance: 'grab a loaf of bread', intent: 'add', items: ['bread'], quantities: [1], units: ['loaf'] },
  { utterance: 'pick up tomatoes', intent: 'add', items: ['tomatoes'] },
  { utterance: 'put rice on the list', intent: 'add', items: ['rice'] },
  { utterance: 'we are out of coffee', intent: 'add', items: ['coffee'] },
  { utterance: 'stock up on toilet paper', intent: 'add', items: ['toilet paper'] },
  { utterance: 'please add chicken breast', intent: 'add', items: ['chicken breast'] },
  { utterance: 'milk', intent: 'add', items: ['milk'] },
  { utterance: 'umm can you add yogurt', intent: 'add', items: ['yogurt'] },
];

const ENGLISH_QUANTITIES: Case[] = [
  { utterance: 'add 2 bottles of water', intent: 'add', items: ['water'], quantities: [2], units: ['bottle'] },
  { utterance: 'buy 5 oranges', intent: 'add', items: ['oranges'], quantities: [5], units: [null] },
  { utterance: 'I need two bottles of water', intent: 'add', items: ['water'], quantities: [2], units: ['bottle'] },
  { utterance: 'add a dozen eggs', intent: 'add', items: ['eggs'], quantities: [1], units: ['dozen'] },
  { utterance: 'get 3 kg of potatoes', intent: 'add', items: ['potatoes'], quantities: [3], units: ['kg'] },
  { utterance: 'add twelve bananas', intent: 'add', items: ['bananas'], quantities: [12], units: [null] },
  { utterance: 'buy a couple of lemons', intent: 'add', items: ['lemons'], quantities: [2] },
  { utterance: 'add 500 grams of cheese', intent: 'add', items: ['cheese'], quantities: [500], units: ['g'] },
  { utterance: 'grab two packets of chips', intent: 'add', items: ['chips'], quantities: [2], units: ['packet'] },
];

const ENGLISH_MULTI: Case[] = [
  { utterance: 'add milk and eggs', intent: 'add', items: ['milk', 'eggs'] },
  { utterance: 'add milk and eggs and bread', intent: 'add', items: ['milk', 'eggs', 'bread'] },
  { utterance: 'I need onions and garlic', intent: 'add', items: ['onions', 'garlic'] },
  { utterance: 'buy 2 bottles of water and 5 oranges', intent: 'add', items: ['water', 'oranges'], quantities: [2, 5] },
];

const ENGLISH_REMOVE: Case[] = [
  { utterance: 'remove milk', intent: 'remove', items: ['milk'] },
  { utterance: 'Remove milk from my list', intent: 'remove', items: ['milk'] },
  { utterance: 'delete the bread', intent: 'remove', items: ['bread'] },
  { utterance: "don't need eggs", intent: 'remove', items: ['eggs'] },
  { utterance: 'take butter off the list', intent: 'remove', items: ['butter'] },
  { utterance: 'get rid of the cola', intent: 'remove', items: ['cola'] },
  { utterance: 'drop tomatoes', intent: 'remove', items: ['tomatoes'] },
];

const ENGLISH_OTHER_INTENTS: Case[] = [
  { utterance: 'change milk to 3', intent: 'update_quantity', items: ['milk'], quantities: [3] },
  { utterance: 'make it 5', intent: 'update_quantity', quantities: [5] },
  { utterance: 'I bought the eggs', intent: 'mark_bought', items: ['eggs'] },
  { utterance: 'check off bread', intent: 'mark_bought', items: ['bread'] },
  { utterance: "what's on my list", intent: 'read_list' },
  { utterance: 'read my list', intent: 'read_list' },
  { utterance: 'what do I need', intent: 'read_list' },
  { utterance: 'clear my list', intent: 'clear_list' },
  { utterance: 'empty the list', intent: 'clear_list' },
  { utterance: 'start over', intent: 'clear_list' },
  { utterance: 'undo that', intent: 'undo' },
  { utterance: 'never mind', intent: 'undo' },
];

const ENGLISH_SEARCH: Case[] = [
  { utterance: 'find organic apples', intent: 'search', items: ['apples'], filters: { attributes: ['organic'] } },
  { utterance: 'find me organic apples', intent: 'search', items: ['apples'], filters: { attributes: ['organic'] } },
  { utterance: 'find toothpaste under $5', intent: 'search', items: ['toothpaste'], filters: { maxPrice: 5 } },
  { utterance: 'find organic apples under $5', intent: 'search', items: ['apples'], filters: { maxPrice: 5, attributes: ['organic'] } },
  // 'gluten free' is lifted into a filter rather than baked into the item name,
  // which is what lets searchCatalog narrow the whole bread aisle by attribute.
  { utterance: 'search for gluten free bread', intent: 'search', items: ['bread'], filters: { attributes: ['gluten-free'] } },
  { utterance: 'look for coffee below 10', intent: 'search', items: ['coffee'], filters: { maxPrice: 10 } },
  { utterance: 'find cheese more than 5', intent: 'search', items: ['cheese'], filters: { minPrice: 5 } },
];

/** Speech recognition mishears constantly; fuzzy resolution must absorb it. */
const MISHEARD: Case[] = [
  { utterance: 'add brocoli', intent: 'add', items: ['broccoli'] },
  { utterance: 'add tomatos', intent: 'add', items: ['tomatoes'] },
  { utterance: 'add yoghurt', intent: 'add', items: ['yogurt'] },
  { utterance: 'add banana', intent: 'add', items: ['bananas'] },
  { utterance: 'add potatoe', intent: 'add', items: ['potatoes'] },
];

const HINDI: Case[] = [
  { utterance: 'dudh kharido', lang: 'hi-IN', intent: 'add', items: ['milk'] },
  { utterance: 'doodh chahiye', lang: 'hi-IN', intent: 'add', items: ['milk'] },
  { utterance: 'do bottle pani chahiye', lang: 'hi-IN', intent: 'add', items: ['water'], quantities: [2], units: ['bottle'] },
  { utterance: 'paanch seb kharido', lang: 'hi-IN', intent: 'add', items: ['apples'], quantities: [5] },
  { utterance: 'bread hatao', lang: 'hi-IN', intent: 'remove', items: ['bread'] },
  { utterance: 'ande nahi chahiye', lang: 'hi-IN', intent: 'remove', items: ['eggs'] },
  { utterance: 'list mein kya hai', lang: 'hi-IN', intent: 'read_list' },
  { utterance: 'sab hatao', lang: 'hi-IN', intent: 'clear_list' },
  { utterance: 'aloo aur pyaz chahiye', lang: 'hi-IN', intent: 'add', items: ['potatoes', 'onions'] },
];

const SPANISH: Case[] = [
  { utterance: 'anade leche', lang: 'es-ES', intent: 'add', items: ['milk'] },
  { utterance: 'necesito manzanas', lang: 'es-ES', intent: 'add', items: ['apples'] },
  { utterance: 'necesito dos botellas de agua', lang: 'es-ES', intent: 'add', items: ['water'], quantities: [2], units: ['bottle'] },
  { utterance: 'compra cinco naranjas', lang: 'es-ES', intent: 'add', items: ['oranges'], quantities: [5] },
  { utterance: 'quita el pan', lang: 'es-ES', intent: 'remove', items: ['bread'] },
  { utterance: 'que hay en mi lista', lang: 'es-ES', intent: 'read_list' },
  { utterance: 'busca manzanas menos de 5', lang: 'es-ES', intent: 'search', items: ['apples'], filters: { maxPrice: 5 } },
  { utterance: 'anade huevos y pan', lang: 'es-ES', intent: 'add', items: ['eggs', 'bread'] },
];

/**
 * Phrasings the rules should refuse rather than guess at. These are what the
 * LLM fallback exists for.
 */
const ESCALATES: Case[] = [
  { utterance: 'grab whatever we need for tacos', intent: 'add', escalates: true },
  { utterance: 'we are running low on the usual breakfast stuff', intent: 'add', escalates: true },
  { utterance: 'put together something for a barbecue', intent: 'add', escalates: true },
  { utterance: 'the thing I usually get for the kids lunches', intent: 'add', escalates: true },
  { utterance: 'hello there', intent: 'unknown', escalates: true },
  { utterance: 'asdfghjkl', intent: 'unknown', escalates: true },
];

function check(c: Case) {
  const lang = c.lang ?? 'en-US';
  const result = parseWithRules(c.utterance, lang);
  const label = `[${lang}] "${c.utterance}"`;

  if (c.escalates) {
    expect(isConfident(result), `${label} should escalate to the LLM`).toBe(false);
    return;
  }

  expect(isConfident(result), `${label} should be handled by rules`).toBe(true);
  expect(result.intent, `${label} intent`).toBe(c.intent);
  expect(result.source).toBe('rules');

  if (c.items) {
    expect(result.items.map((i) => i.canonical), `${label} items`).toEqual(c.items);
  }
  if (c.quantities) {
    expect(result.items.map((i) => i.quantity), `${label} quantities`).toEqual(c.quantities);
  }
  if (c.units) {
    expect(result.items.map((i) => i.unit), `${label} units`).toEqual(c.units);
  }
  if (c.filters) {
    for (const [key, value] of Object.entries(c.filters)) {
      expect(result.filters[key as keyof IntentFilters], `${label} filter ${key}`).toEqual(value);
    }
  }
}

const SUITES: [string, Case[]][] = [
  ['English - adding items', ENGLISH_ADD],
  ['English - quantities and units', ENGLISH_QUANTITIES],
  ['English - multiple items', ENGLISH_MULTI],
  ['English - removing items', ENGLISH_REMOVE],
  ['English - list commands', ENGLISH_OTHER_INTENTS],
  ['English - search and price filters', ENGLISH_SEARCH],
  ['Misheard speech', MISHEARD],
  ['Hindi', HINDI],
  ['Spanish', SPANISH],
  ['Escalates to the LLM', ESCALATES],
];

describe('rule-based intent parser', () => {
  for (const [name, cases] of SUITES) {
    describe(name, () => {
      for (const c of cases) {
        it(`${c.lang ?? 'en-US'}: ${c.utterance}`, () => check(c));
      }
    });
  }

  it('covers a meaningful corpus', () => {
    const total = SUITES.reduce((n, [, cases]) => n + cases.length, 0);
    expect(total).toBeGreaterThanOrEqual(70);
  });

  it('is fast enough to run on every keystroke', () => {
    const started = performance.now();
    for (let i = 0; i < 200; i++) parseWithRules('add 2 bottles of water and 5 oranges', 'en-US');
    const perParse = (performance.now() - started) / 200;
    expect(perParse).toBeLessThan(15);
  });
});
