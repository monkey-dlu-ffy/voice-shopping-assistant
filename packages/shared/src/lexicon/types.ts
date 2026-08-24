import type { IntentKind } from '../types.js';

export interface Lexicon {
  /** Short language code, e.g. "en". */
  code: string;
  /** BCP-47 tags that resolve to this pack, e.g. ["en", "en-US", "en-GB"]. */
  tags: string[];
  /** Display name shown in the language picker. */
  label: string;
  /**
   * Verb-final languages (Hindi is SOV: "दूध खरीदो" = "milk buy") put the verb
   * after the object. The parser strips matched verbs from either end rather
   * than assuming they lead, so this flag only affects tie-breaking.
   */
  verbFinal: boolean;
  /** Phrases removed wholesale before parsing. Matched longest-first. */
  fillers: string[];
  /** Spoken numbers mapped to digits. */
  numberWords: Record<string, number>;
  /** Intent verbs. Multi-word entries are matched as phrases. */
  verbs: Partial<Record<IntentKind, string[]>>;
  /** Spoken unit -> canonical unit. */
  units: Record<string, string>;
  /** Spoken modifier -> canonical attribute. */
  attributes: Record<string, string>;
  /** Words joining multiple items: "milk and eggs". */
  conjunctions: string[];
  /** Noise words stripped from an item name once quantity/unit are extracted. */
  stopWords: string[];
  /** Patterns yielding a maximum price. Capture group 1 must be the number. */
  maxPricePatterns: RegExp[];
  /** Patterns yielding a minimum price. Capture group 1 must be the number. */
  minPricePatterns: RegExp[];
  /** Confirmation templates, used for on-screen and spoken feedback. */
  responses: {
    added: (what: string) => string;
    removed: (what: string) => string;
    updated: (what: string) => string;
    cleared: () => string;
    bought: (what: string) => string;
    listEmpty: () => string;
    listIs: (what: string) => string;
    found: (n: number) => string;
    nothingFound: () => string;
    undone: () => string;
    notUnderstood: () => string;
  };
}
