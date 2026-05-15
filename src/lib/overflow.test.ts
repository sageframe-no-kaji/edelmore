import { describe, expect, it } from 'vitest';
import { findSplitIndex, fixWidowOrphan, snapToWordBreak } from './overflow.js';

describe('findSplitIndex', () => {
  it('returns content.length when entire content fits', () => {
    const content = 'Hello';
    expect(findSplitIndex(content, () => true)).toBe(5);
  });

  it('returns 0 when entire content overflows', () => {
    const content = 'Hello';
    expect(findSplitIndex(content, () => false)).toBe(0);
  });

  it('finds the correct split at the midpoint', () => {
    const content = 'abcdef'; // 6 chars; fits up to 3
    const result = findSplitIndex(content, (n) => n <= 3);
    expect(result).toBe(3);
  });

  it('returns 1 when one character fits but two do not', () => {
    const content = 'ab';
    const result = findSplitIndex(content, (n) => n <= 1);
    expect(result).toBe(1);
  });

  it('handles empty content', () => {
    expect(findSplitIndex('', () => true)).toBe(0);
    expect(findSplitIndex('', () => false)).toBe(0);
  });

  it('works for a long string with an arbitrary threshold', () => {
    const content = 'x'.repeat(1000);
    const result = findSplitIndex(content, (n) => n <= 750);
    expect(result).toBe(750);
  });
});

describe('snapToWordBreak', () => {
  it('snaps to word boundary (space) when there are no newlines', () => {
    // splitAt=8 lands in "wo|rld"; last space before it is at index 5 (after 'hello')
    expect(snapToWordBreak('hello world', 8)).toBe(6);
  });

  it('snaps to paragraph break (double newline)', () => {
    const content = 'First paragraph.\n\nSecond paragraph starts here.';
    expect(snapToWordBreak(content, 40)).toBe(18); // after '\n\n' at index 16
  });

  it('prefers paragraph break over single newline when both exist', () => {
    const content = 'A\n\nB\nC more text here';
    expect(snapToWordBreak(content, 18)).toBe(3); // after '\n\n' at index 1
  });

  it('falls back to single newline when no paragraph break exists', () => {
    const content = 'line one\nline two extra text';
    expect(snapToWordBreak(content, 20)).toBe(9); // after '\n' at index 8
  });

  it('snaps to sentence end before word boundary when no newlines', () => {
    // splitAt=30 lands mid-second-sentence; '. ' at index 18 → return 20
    const content = 'The first sentence. The second begins here.';
    expect(snapToWordBreak(content, 30)).toBe(20);
  });

  it('falls back to word boundary (space) when no sentence end or newlines exist', () => {
    // splitAt=22 lands mid-word "ju|mps"; last space before it is at index 19 (after 'fox')
    const content = 'the quick brown fox jumps over';
    expect(snapToWordBreak(content, 22)).toBe(20); // after space at index 19
  });

  it('returns splitAt when no break precedes it', () => {
    expect(snapToWordBreak('nospace', 5)).toBe(5);
  });
});

describe('fixWidowOrphan', () => {
  it('returns splitAt unchanged when no paragraph breaks exist', () => {
    // No \n\n in content — orphan check skips; widow candidate has no preceding paragraph to snap to
    expect(fixWidowOrphan('hello world', 0, 8, () => true)).toBe(8);
  });

  it('returns splitAt unchanged when isSingleLine always returns false', () => {
    const content = 'first paragraph.\n\nsecond paragraph that is long.';
    expect(fixWidowOrphan(content, 0, 30, () => false)).toBe(30);
  });

  it('fixes orphan — last paragraph fragment on current page is 1 line', () => {
    // 'Long first paragraph.\n\nshort' — 'short' is the orphan at page bottom
    const content = 'Long first paragraph.\n\nshort';
    // \n\n is at index 21; orphan fragment is 'short'
    expect(fixWidowOrphan(content, 0, content.length, (t) => t === 'short')).toBe(21);
  });

  it('fixes widow — first paragraph on next page is 1 line', () => {
    // splitAt=26 is just after '\n\n'; next page starts with 'paragraph two.' (widow)
    const content = 'paragraph one text here.\n\nparagraph two.';
    // \n\n is at index 24; snap back to 24
    expect(fixWidowOrphan(content, 0, 26, (t) => t === 'paragraph two.')).toBe(24);
  });

  it('respects offset — snaps within current page only', () => {
    // 'prev.\n\n' occupies indices 0-6; current page starts at offset=7
    // Last fragment 'orphan.' is 1 line; snap to \n\n at index 19 (within content)
    const content = 'prev.\n\npage2 start.\n\norphan.';
    expect(fixWidowOrphan(content, 7, content.length, (t) => t === 'orphan.')).toBe(19);
  });

  it('returns splitAt unchanged when splitAt <= offset', () => {
    expect(fixWidowOrphan('hello', 5, 5, () => true)).toBe(5);
  });
});
