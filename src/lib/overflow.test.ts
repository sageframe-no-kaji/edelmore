import { describe, expect, it } from 'vitest';
import { findSplitIndex } from './overflow.js';

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
