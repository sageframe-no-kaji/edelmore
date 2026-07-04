import { describe, expect, it } from 'vitest';
import type { EmphasisRange } from './epub/model.js';
import { findWordIndex, tokenize } from './tokenize.js';

/** Build a chapter-absolute range by locating `needle` in `text`. */
function rangeOver(text: string, needle: string, kind: EmphasisRange['kind']): EmphasisRange {
  const start = text.indexOf(needle);
  expect(start).toBeGreaterThanOrEqual(0);
  return { start, end: start + needle.length, kind };
}

describe('tokenize', () => {
  it('returns [] for empty text', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('emits alternating word/whitespace tokens that reconstruct the text', () => {
    const text = '  Once upon\n\na time  ';
    const tokens = tokenize(text);
    expect(tokens.map((t) => t.text).join('')).toBe(text);
    // Contiguous absolute offsets from sliceStart 0.
    let cursor = 0;
    for (const tok of tokens) {
      expect(tok.charStart).toBe(cursor);
      expect(tok.charEnd).toBe(cursor + tok.text.length);
      expect(tok.isWord).toBe(!/^\s+$/.test(tok.text));
      cursor = tok.charEnd;
    }
    expect(cursor).toBe(text.length);
  });

  it('offsets tokens by sliceStart (chapter-absolute spine)', () => {
    const chapter = 'The fox ran far away';
    const sliceStart = 8; // page slice begins at 'ran'
    const slice = chapter.slice(sliceStart);
    const tokens = tokenize(slice, sliceStart);
    for (const tok of tokens) {
      // Assert by slicing the CHAPTER text — offsets key into the whole chapter.
      expect(chapter.slice(tok.charStart, tok.charEnd)).toBe(tok.text);
    }
    expect(tokens[0]).toMatchObject({ text: 'ran', charStart: 8, charEnd: 11 });
  });

  it('attaches emphasis kinds to exactly the overlapped tokens', () => {
    const text = 'plain emphatic strong-word both plain';
    const emphasis = [
      rangeOver(text, 'emphatic', 'em'),
      rangeOver(text, 'strong-word', 'strong'),
      rangeOver(text, 'both', 'em'),
      rangeOver(text, 'both', 'strong'),
    ];
    const tokens = tokenize(text, 0, emphasis);
    const byText = new Map(tokens.filter((t) => t.isWord).map((t) => [t.text, t.emphasis]));
    expect(byText.get('plain')).toEqual([]);
    expect(byText.get('emphatic')).toEqual(['em']);
    expect(byText.get('strong-word')).toEqual(['strong']);
    expect(byText.get('both')).toEqual(['em', 'strong']);
  });

  it('applies a range spanning several words to every token it touches, whitespace included', () => {
    const text = 'aa bb cc dd';
    const emphasis = [rangeOver(text, 'bb cc', 'em')];
    const tokens = tokenize(text, 0, emphasis);
    const emphasized = tokens.filter((t) => t.emphasis.includes('em'));
    expect(emphasized.map((t) => t.text)).toEqual(['bb', ' ', 'cc']);
    // Assert by slicing: every emphasized token overlaps the range's slice.
    const range = emphasis[0];
    for (const tok of emphasized) {
      expect(tok.charStart).toBeLessThan(range.end);
      expect(tok.charEnd).toBeGreaterThan(range.start);
    }
  });

  it('treats range boundaries as half-open (no touch, no emphasis)', () => {
    const text = 'aa bb cc';
    // Ends exactly where 'bb' starts / starts exactly where 'bb' ends.
    const emphasis: EmphasisRange[] = [
      { start: 0, end: 3, kind: 'em' },
      { start: 5, end: 8, kind: 'strong' },
    ];
    const tokens = tokenize(text, 0, emphasis);
    const bb = tokens.find((t) => t.text === 'bb');
    expect(bb?.emphasis).toEqual([]);
  });

  it('emphasizes a whole token on partial overlap (word granularity)', () => {
    const text = 'unbreakable';
    const tokens = tokenize(text, 0, [{ start: 2, end: 5, kind: 'em' }]);
    expect(tokens[0].emphasis).toEqual(['em']);
  });

  it('dedupes repeated kinds and accepts unsorted, nested ranges', () => {
    const text = 'one two three four';
    const emphasis: EmphasisRange[] = [
      rangeOver(text, 'three', 'em'),
      { start: 0, end: text.length, kind: 'strong' }, // encloses everything
      rangeOver(text, 'three', 'em'), // duplicate
      rangeOver(text, 'one', 'em'),
    ];
    const tokens = tokenize(text, 0, emphasis);
    const three = tokens.find((t) => t.text === 'three');
    expect(three?.emphasis.sort()).toEqual(['em', 'strong']);
    const two = tokens.find((t) => t.text === 'two');
    expect(two?.emphasis).toEqual(['strong']);
    // The long enclosing range must not be pruned by the earlier-ending short
    // ones before it (cursor pruning is exhaustion-ordered).
    const four = tokens.find((t) => t.text === 'four');
    expect(four?.emphasis).toEqual(['strong']);
  });

  it('ignores ranges that do not overlap the slice', () => {
    const chapter = 'first page text SECOND page text';
    const sliceStart = 16;
    const emphasis = [rangeOver(chapter, 'first', 'em')];
    const tokens = tokenize(chapter.slice(sliceStart), sliceStart, emphasis);
    expect(tokens.every((t) => t.emphasis.length === 0)).toBe(true);
  });
});

describe('findWordIndex', () => {
  const text = '  alpha beta  gamma';
  const tokens = tokenize(text, 0);

  it('returns the word token containing the offset', () => {
    expect(findWordIndex(tokens, text.indexOf('alpha'))).toBe(1);
    expect(findWordIndex(tokens, text.indexOf('beta') + 2)).toBe(3);
    // Last char of gamma.
    expect(findWordIndex(tokens, text.length - 1)).toBe(5);
  });

  it('resolves whitespace hits to the preceding word', () => {
    expect(findWordIndex(tokens, text.indexOf('beta') - 1)).toBe(1); // gap after alpha
    expect(findWordIndex(tokens, text.indexOf('gamma') - 1)).toBe(3); // gap after beta
  });

  it('returns -1 before the first word and outside the slice', () => {
    expect(findWordIndex(tokens, 0)).toBe(-1); // leading whitespace, no prior word
    expect(findWordIndex(tokens, -5)).toBe(-1);
    expect(findWordIndex(tokens, text.length)).toBe(-1);
    expect(findWordIndex([], 3)).toBe(-1);
  });

  it('works with sliceStart-offset (chapter-absolute) tokens', () => {
    const offsetTokens = tokenize('alpha beta', 100);
    expect(findWordIndex(offsetTokens, 100)).toBe(0);
    expect(findWordIndex(offsetTokens, 106)).toBe(2);
    expect(findWordIndex(offsetTokens, 50)).toBe(-1);
  });
});
