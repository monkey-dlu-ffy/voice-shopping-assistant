import type { Lexicon } from './types.js';
import { en } from './en.js';
import { hi } from './hi.js';
import { es } from './es.js';

export type { Lexicon } from './types.js';
export { en, hi, es };

export const LEXICONS: Lexicon[] = [en, hi, es];

export interface LanguageOption {
  code: string;
  label: string;
  /** The BCP-47 tag handed to the Web Speech API. */
  speechTag: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = LEXICONS.map((l) => ({
  code: l.code,
  label: l.label,
  speechTag: l.tags[1] ?? l.tags[0]!,
}));

/** Resolve a BCP-47 tag (or bare code) to a lexicon, falling back to English. */
export function lexiconFor(language: string | undefined | null): Lexicon {
  if (!language) return en;
  const tag = language.toLowerCase();
  const exact = LEXICONS.find((l) => l.tags.some((t) => t.toLowerCase() === tag));
  if (exact) return exact;
  const base = tag.split('-')[0]!;
  return LEXICONS.find((l) => l.code === base) ?? en;
}
