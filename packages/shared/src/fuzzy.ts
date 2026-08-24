/**
 * Small string-similarity helpers used to resolve spoken item names against the
 * catalogue. Speech recognition mishears ("brocoli", "tomatos", "yoghurt"), so
 * an exact-match-only lookup would push far too much traffic to the LLM.
 */

/** Character bigrams of a string, e.g. "milk" -> ["mi","il","lk"]. */
function bigrams(text: string): string[] {
  const s = text.replace(/\s+/g, ' ').trim();
  if (s.length < 2) return [s];
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

/**
 * Sorensen-Dice coefficient over character bigrams. Good at catching
 * transpositions and shared substrings; cheap enough to run against the whole
 * catalogue on every utterance.
 */
export function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.length === 0 || B.length === 0) return 0;

  const counts = new Map<string, number>();
  for (const g of A) counts.set(g, (counts.get(g) ?? 0) + 1);

  let matches = 0;
  for (const g of B) {
    const n = counts.get(g) ?? 0;
    if (n > 0) {
      counts.set(g, n - 1);
      matches++;
    }
  }
  return (2 * matches) / (A.length + B.length);
}

/** Classic Levenshtein edit distance, two-row variant. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length]!;
}

/** Edit distance rescaled to 0..1, where 1 is identical. */
export function levenshteinRatio(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - levenshtein(a, b) / longest;
}

/**
 * Combined similarity in 0..1.
 *
 * Dice alone over-rewards long shared substrings ("milk" vs "almond milk"
 * scores well but is a different product), and Levenshtein alone is harsh on
 * word-order differences. Taking the max of the two, then penalising a large
 * length mismatch, behaves sensibly on real grocery names.
 */
export function similarity(a: string, b: string): number {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  if (x === y) return 1;

  const base = Math.max(diceCoefficient(x, y), levenshteinRatio(x, y));
  const lengthRatio = Math.min(x.length, y.length) / Math.max(x.length, y.length);
  // A short query matching a much longer name is usually a different product.
  return base * (0.6 + 0.4 * lengthRatio);
}

export interface RankedMatch<T> {
  value: T;
  score: number;
}

/** Rank candidates by best similarity across each candidate's search keys. */
export function bestMatches<T>(
  query: string,
  candidates: T[],
  keysOf: (candidate: T) => string[],
  minScore = 0.72,
): RankedMatch<T>[] {
  const ranked: RankedMatch<T>[] = [];
  for (const candidate of candidates) {
    let best = 0;
    for (const key of keysOf(candidate)) {
      const score = similarity(query, key);
      if (score > best) best = score;
      if (best === 1) break;
    }
    if (best >= minScore) ranked.push({ value: candidate, score: best });
  }
  return ranked.sort((a, b) => b.score - a.score);
}
