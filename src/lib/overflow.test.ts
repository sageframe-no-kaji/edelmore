import { describe, expect, it } from 'vitest';
import { findSplitIndex, snapToWordBreak } from './overflow.js';

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

  it('falls back to word boundary (space) when no newlines exist', () => {
    // splitAt=22 lands mid-word "ju|mps"; last space before it is at index 19 (after 'fox')
    const content = 'the quick brown fox jumps over';
    expect(snapToWordBreak(content, 22)).toBe(20); // after space at index 19
  });

  it('returns splitAt when no break precedes it', () => {
    expect(snapToWordBreak('nospace', 5)).toBe(5);
  });
});
