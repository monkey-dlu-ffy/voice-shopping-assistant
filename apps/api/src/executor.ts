import { randomUUID } from 'node:crypto';
import {
  categorize,
  getEntry,
  labelFor,
  lexiconFor,
  resolveItem,
  searchCatalog,
  type CatalogEntry,
  type CommandResult,
  type Intent,
  type ParsedItem,
  type ShoppingItem,
} from '@vsa/shared';
import { popUndo, pushUndo, type PurchaseRecord, type Repository } from './store/index.js';
import { substitutePrompt } from './suggestions/engine.js';

/**
 * Applies an `Intent` to a session's list.
 *
 * Kept entirely separate from parsing: the executor neither knows nor cares
 * whether an intent came from the rule parser or the LLM, which is the whole
 * point of having a single Intent contract.
 */

/**
 * Units that read naturally as a direct modifier ("1 dozen eggs") rather than
 * through "of" ("2 bottles of water").
 */
const DIRECT_UNITS = new Set(['dozen']);

function describe(item: ShoppingItem, language: string): string {
  const label = labelFor(item.canonical, language);

  if (!item.unit) {
    return item.quantity > 1 ? `${item.quantity} ${label}` : label;
  }

  // With a unit the count always shows, otherwise "1 dozen eggs" reads as
  // "dozen of eggs".
  const plural = item.quantity > 1 ? `${item.unit}s` : item.unit;
  return DIRECT_UNITS.has(item.unit)
    ? `${item.quantity} ${item.unit} ${label}`
    : `${item.quantity} ${plural} of ${label}`;
}

/** Join names using the speaker's own conjunction, not a hardcoded "and". */
function list(names: string[], language: string): string {
  if (names.length <= 1) return names[0] ?? '';
  const conjunction = lexiconFor(language).conjunctions[0] ?? 'and';
  return `${names.slice(0, -1).join(', ')} ${conjunction} ${names[names.length - 1]}`;
}

function toShoppingItem(parsed: ParsedItem): ShoppingItem {
  const resolved = resolveItem(parsed.canonical);
  const canonical = resolved?.entry.canonical ?? parsed.canonical;
  return {
    id: randomUUID(),
    canonical,
    raw: parsed.raw || canonical,
    quantity: parsed.quantity ?? 1,
    unit: parsed.unit,
    category: parsed.category ?? categorize(canonical),
    done: false,
    addedAt: new Date().toISOString(),
  };
}

/** Find a list entry by canonical name, tolerating near-misses in the spoken name. */
function findItem(items: ShoppingItem[], canonical: string): ShoppingItem | undefined {
  const exact = items.find((i) => i.canonical === canonical);
  if (exact) return exact;
  const resolved = resolveItem(canonical);
  if (!resolved) return undefined;
  return items.find((i) => i.canonical === resolved.entry.canonical);
}

export interface ExecuteOptions {
  intent: Intent;
  sessionId: string;
  repo: Repository;
}

export async function execute({ intent, sessionId, repo }: ExecuteOptions): Promise<CommandResult> {
  const language = intent.language || 'en-US';
  const responses = lexiconFor(language).responses;
  const current = await repo.getList(sessionId);

  const finish = async (
    items: ShoppingItem[],
    speak: string,
    extra: Partial<CommandResult> = {},
  ): Promise<CommandResult> => {
    await repo.saveList(sessionId, items);
    return { intent, list: items, speak, ...extra };
  };

  switch (intent.intent) {
    case 'add': {
      if (intent.items.length === 0) {
        return { intent, list: current, speak: responses.notUnderstood() };
      }
      pushUndo(sessionId, current);

      const next = [...current];
      const added: string[] = [];

      for (const parsed of intent.items) {
        const candidate = toShoppingItem(parsed);
        const existing = findItem(next, candidate.canonical);

        if (existing) {
          // Saying "add milk" twice bumps the count rather than duplicating the row.
          existing.quantity += candidate.quantity;
          existing.done = false;
          added.push(describe(existing, language));
        } else {
          next.push(candidate);
          added.push(describe(candidate, language));
        }
      }

      // Offer alternatives for the last item added, if it has any.
      const lastCanonical = intent.items[intent.items.length - 1]!.canonical;
      const options = substitutePrompt(
        resolveItem(lastCanonical)?.entry.canonical ?? lastCanonical,
        next,
      );

      return finish(
        next,
        responses.added(list(added, language)),
        options.length > 0 ? { substitutes: { forItem: lastCanonical, options } } : {},
      );
    }

    case 'remove': {
      if (intent.items.length === 0) {
        return { intent, list: current, speak: responses.notUnderstood() };
      }
      pushUndo(sessionId, current);

      let next = [...current];
      const removed: string[] = [];

      for (const parsed of intent.items) {
        const match = findItem(next, parsed.canonical);
        if (!match) continue;
        removed.push(describe(match, language));
        next = next.filter((i) => i.id !== match.id);
      }

      if (removed.length === 0) {
        const label = labelFor(intent.items[0]!.canonical, language);
        return { intent, list: current, speak: `${label} is not on your list` };
      }
      return finish(next, responses.removed(list(removed, language)));
    }

    case 'update_quantity': {
      const target = intent.items[0];
      if (!target || target.quantity === null) {
        return { intent, list: current, speak: responses.notUnderstood() };
      }
      pushUndo(sessionId, current);

      const next = [...current];
      // A bare "make it 3" applies to the most recently added item.
      const match = target.canonical
        ? findItem(next, target.canonical)
        : next[next.length - 1];

      if (!match) {
        return { intent, list: current, speak: responses.notUnderstood() };
      }
      match.quantity = target.quantity;
      return finish(next, responses.updated(describe(match, language)));
    }

    case 'mark_bought': {
      pushUndo(sessionId, current);
      const next = [...current];
      const marked: ShoppingItem[] = [];

      if (intent.items.length === 0) {
        // "I got everything" - complete the whole list.
        for (const item of next.filter((i) => !i.done)) {
          item.done = true;
          marked.push(item);
        }
      } else {
        for (const parsed of intent.items) {
          const match = findItem(next, parsed.canonical);
          if (!match) continue;
          match.done = true;
          marked.push(match);
        }
      }

      if (marked.length === 0) {
        return { intent, list: current, speak: responses.notUnderstood() };
      }

      // Completing an item is what feeds the replenishment model.
      const records: PurchaseRecord[] = marked.map((item) => ({
        canonical: item.canonical,
        quantity: item.quantity,
        purchasedAt: new Date(),
      }));
      await repo.recordPurchases(sessionId, records);

      return finish(next, responses.bought(list(marked.map((m) => describe(m, language)), language)));
    }

    case 'clear_list': {
      pushUndo(sessionId, current);
      return finish([], responses.cleared());
    }

    case 'undo': {
      const previous = popUndo(sessionId);
      if (!previous) {
        return { intent, list: current, speak: 'Nothing to undo' };
      }
      await repo.saveList(sessionId, previous);
      return { intent, list: previous, speak: responses.undone() };
    }

    case 'read_list': {
      const pending = current.filter((i) => !i.done);
      const speak =
        pending.length === 0
          ? responses.listEmpty()
          : responses.listIs(list(pending.map((i) => describe(i, language)), language));
      return { intent, list: current, speak };
    }

    case 'search': {
      const text = intent.items[0]?.canonical;
      const results = searchCatalog({
        text,
        maxPrice: intent.filters.maxPrice,
        minPrice: intent.filters.minPrice,
        brand: intent.filters.brand,
        attributes: intent.filters.attributes,
        limit: 8,
      });

      return {
        intent,
        list: current,
        speak: results.length === 0 ? responses.nothingFound() : responses.found(results.length),
        searchResults: results,
      };
    }

    case 'unknown':
    default:
      return { intent, list: current, speak: responses.notUnderstood() };
  }
}

/** Substitutes for an explicit "what else could I get instead" request. */
export function substitutesForItem(canonical: string, current: ShoppingItem[]): CatalogEntry[] {
  const entry = getEntry(canonical);
  if (!entry) return [];
  return substitutePrompt(entry.canonical, current);
}
