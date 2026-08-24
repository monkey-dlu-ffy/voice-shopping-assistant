import type { Lexicon } from './lexicon/index.js';

/**
 * Combining diacritical marks, U+0300-U+036F. Built via the RegExp constructor
 * from escape sequences so this source file stays pure ASCII.
 */
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036F]', 'g');

/**
 * Punctuation stripped before parsing. The last two entries are the Devanagari
 * danda (U+0964) and double danda (U+0965), which act as full stops in Hindi.
 */
const PUNCTUATION = new RegExp('[!"#%&()*+,\\-/:;<=>?@\\[\\]^_`{|}~\\u0964\\u0965]', 'g');

/**
 * A period is punctuation only when it is not a decimal point, so a spoken
 * price like "5.99" survives normalisation intact.
 */
const SENTENCE_DOT = /(?<!\d)\.|\.(?!\d)/g;

/**
 * Strip Latin diacritics so an accented spelling and its plain form are one token
 * ("anade" === "añade").
 *
 * NFD decomposition splits an accented Latin letter into base + combining mark,
 * and those marks live in U+0300-U+036F. Devanagari matras (U+093E-U+094D) and
 * the nukta (U+093C) fall outside that block, so Hindi passes through intact -
 * which matters, because stripping them would destroy the word.
 */
export function foldDiacritics(text: string): string {
  return text.normalize('NFD').replace(COMBINING_MARKS, '').normalize('NFC');
}

/** Escape a string for safe interpolation into a RegExp. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface NormalizeResult {
  /** Cleaned, filler-free, digit-normalised text the parser works on. */
  normalized: string;
  /** The original input, trimmed. Kept for display and for the LLM prompt. */
  original: string;
}

/**
 * Turn raw speech-recognition output into a canonical form.
 *
 * Order matters: fillers are removed before number words are converted, so
 * "I'd like to get two apples" loses "i'd like to" and only then sees "two".
 */
export function normalizeUtterance(text: string, lex: Lexicon): NormalizeResult {
  const original = text.trim();

  let s = foldDiacritics(original.toLowerCase());
  // Apostrophes survive (don't, what's). Currency symbols and decimal points are
  // consumed by the price patterns, which run against this same string.
  s = s.replace(PUNCTUATION, ' ').replace(SENTENCE_DOT, ' ');
  s = s.replace(/\s+/g, ' ').trim();

  s = stripFillers(s, lex);
  s = convertNumberWords(s, lex);

  return { normalized: s.replace(/\s+/g, ' ').trim(), original };
}

/** Remove filler phrases, longest first so "i want to" beats "i". */
export function stripFillers(text: string, lex: Lexicon): string {
  const ordered = [...lex.fillers].sort((a, b) => b.length - a.length);
  let out = ` ${text} `;
  for (const filler of ordered) {
    const folded = foldDiacritics(filler.toLowerCase());
    out = out.replace(new RegExp(`(?<=\\s)${escapeRegExp(folded)}(?=\\s)`, 'g'), ' ');
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Replace spoken numbers with digits.
 *
 * Words that are also units are deliberately skipped: "a dozen eggs" must stay
 * "1 dozen eggs" (quantity 1, unit dozen) rather than collapsing to "1 12 eggs".
 */
export function convertNumberWords(text: string, lex: Lexicon): string {
  const usable = Object.entries(lex.numberWords).filter(
    ([word]) => !(word.toLowerCase() in lex.units),
  );

  // Short words meaning "one" are usually articles ("a", "an", "un", "ek").
  const isArticle = ([word, value]: [string, number]) => value === 1 && word.length <= 3;
  const counters = usable.filter((e) => !isArticle(e)).sort((a, b) => b[0].length - a[0].length);
  const articles = usable.filter(isArticle).sort((a, b) => b[0].length - a[0].length);

  let out = ` ${text} `;

  const apply = (entries: [string, number][], lookahead: string) => {
    // Each substitution pads with spaces, so collapse before the next pass -
    // otherwise the article lookahead sees whitespace instead of the digit a
    // previous pass just wrote, and "a couple" collapses to 1 rather than 2.
    out = ` ${out.replace(/\s+/g, ' ').trim()} `;
    for (const [word, value] of entries) {
      const folded = foldDiacritics(word.toLowerCase());
      out = out.replace(
        new RegExp(`(?<=\\s)${escapeRegExp(folded)}(?=\\s${lookahead})`, 'g'),
        ` ${value} `,
      );
    }
  };

  apply(counters, '');
  // Articles convert only when a real number does not already follow, so
  // "a couple of lemons" yields 2 rather than 1.
  apply(articles, '(?!\\d)');

  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Remove noise words from a candidate item name.
 * Applied only after quantity, unit and attributes have been pulled out, so
 * "of" in "2 bottles of water" has already done its job.
 */
export function stripStopWords(text: string, lex: Lexicon): string {
  const stops = new Set(lex.stopWords.map((w) => foldDiacritics(w.toLowerCase())));
  return text
    .split(/\s+/)
    .filter((tok) => tok.length > 0 && !stops.has(tok))
    .join(' ')
    .trim();
}

/** Stable cache key for a parsed utterance. */
export function cacheKey(normalized: string, language: string): string {
  return `${language.toLowerCase()}::${normalized}`;
}
