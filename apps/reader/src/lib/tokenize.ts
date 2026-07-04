/**
 * Word/whitespace tokenizer for read-only page rendering — the diary's
 * tokenize.ts idiom copied and adapted per-app, NOT imported. The reader's
 * tokens differ from the diary's in two decided ways: offsets are
 * chapter-absolute (`charStart`/`charEnd` include the page slice's offset, so
 * they key directly into the character-offset spine), and each token carries
 * the emphasis kinds of any EmphasisRange overlapping it.
 */

import type { EmphasisRange } from './epub/model.js';

export type EmphasisKind = EmphasisRange['kind'];

export interface ReaderToken {
  text: string;
  /** Chapter-absolute offset of the token's first character. */
  charStart: number;
  /** Chapter-absolute offset one past the token's last character. */
  charEnd: number;
  isWord: boolean;
  /**
   * Emphasis kinds whose ranges overlap this token — deduped, in ascending
   * range-start order. Overlap is whole-token: a range touching any character
   * of a token emphasizes the whole token (word granularity; the parser emits
   * character-exact ranges that align with word boundaries in practice).
   */
  emphasis: EmphasisKind[];
}

/**
 * Tokenize one page slice. `text` is the slice, `sliceStart` its
 * chapter-absolute offset, `emphasis` the CHAPTER-absolute ranges (ranges not
 * overlapping the slice simply attach to no token). Tokens concatenate back to
 * `text` exactly; offsets are contiguous.
 */
export function tokenize(
  text: string,
  sliceStart = 0,
  emphasis: EmphasisRange[] = []
): ReaderToken[] {
  const tokens: ReaderToken[] = [];
  if (text.length === 0) return tokens;

  // Sorted by start so the scan below can early-exit; parser order is not
  // assumed and overlapping ranges are permitted.
  const ranges = [...emphasis].sort((a, b) => a.start - b.start);

  const re = /(\s+)|(\S+)/g;
  // First range that could still overlap the current (and any later) token.
  // Ranges are only pruned when everything before them is exhausted, so a long
  // range enclosing later short ones keeps the short ones scannable.
  let cursor = 0;
  let match: RegExpExecArray | null = re.exec(text);
  while (match !== null) {
    const charStart = sliceStart + match.index;
    const charEnd = charStart + match[0].length;
    while (cursor < ranges.length && ranges[cursor].end <= charStart) cursor++;
    const kinds: EmphasisKind[] = [];
    for (let i = cursor; i < ranges.length; i++) {
      const range = ranges[i];
      if (range.start >= charEnd) break;
      if (range.end > charStart && !kinds.includes(range.kind)) kinds.push(range.kind);
    }
    tokens.push({
      text: match[0],
      charStart,
      charEnd,
      isWord: match[1] === undefined,
      emphasis: kinds,
    });
    match = re.exec(text);
  }
  return tokens;
}

/**
 * Index of the word token containing chapter-absolute `charIndex`. A hit on
 * whitespace resolves to the preceding word (a narration timestamp mid-gap
 * highlights the word just spoken). Returns -1 when the offset is outside the
 * tokenized slice or precedes the first word.
 */
export function findWordIndex(tokens: ReaderToken[], charIndex: number): number {
  let lo = 0;
  let hi = tokens.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const tok = tokens[mid];
    if (charIndex < tok.charStart) {
      hi = mid - 1;
    } else if (charIndex >= tok.charEnd) {
      lo = mid + 1;
    } else {
      if (tok.isWord) return mid;
      for (let j = mid - 1; j >= 0; j--) {
        if (tokens[j].isWord) return j;
      }
      return -1;
    }
  }
  return -1;
}
