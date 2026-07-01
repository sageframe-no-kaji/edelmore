import { findWordIndex, tokenize } from '@edelmore/narration/tokenize';
import { describe, expect, it } from 'vitest';

describe('tokenize', () => {
  it('returns an empty array for empty input', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('splits a single word into one word token', () => {
    expect(tokenize('hello')).toEqual([{ text: 'hello', start: 0, end: 5, isWord: true }]);
  });

  it('alternates word and whitespace tokens with correct offsets', () => {
    const tokens = tokenize('hello world');
    expect(tokens).toEqual([
      { text: 'hello', start: 0, end: 5, isWord: true },
      { text: ' ', start: 5, end: 6, isWord: false },
      { text: 'world', start: 6, end: 11, isWord: true },
    ]);
  });

  it('treats trailing punctuation as part of the preceding word', () => {
    const tokens = tokenize('Hello, world!');
    expect(tokens.filter((t) => t.isWord).map((t) => t.text)).toEqual(['Hello,', 'world!']);
  });

  it('keeps a hyphenated word as a single token', () => {
    const tokens = tokenize('well-known fact');
    expect(tokens[0]).toEqual({ text: 'well-known', start: 0, end: 10, isWord: true });
  });

  it('keeps an em-dashed sequence attached to the preceding word', () => {
    const tokens = tokenize('yes—but');
    expect(tokens.filter((t) => t.isWord)).toEqual([
      { text: 'yes—but', start: 0, end: 7, isWord: true },
    ]);
  });

  it('treats an ellipsis as part of the surrounding non-whitespace run', () => {
    const tokens = tokenize('I think… maybe');
    expect(tokens.filter((t) => t.isWord).map((t) => t.text)).toEqual(['I', 'think…', 'maybe']);
  });

  it('emits paragraph-break whitespace as a single whitespace token', () => {
    const tokens = tokenize('one.\n\ntwo.');
    expect(tokens).toEqual([
      { text: 'one.', start: 0, end: 4, isWord: true },
      { text: '\n\n', start: 4, end: 6, isWord: false },
      { text: 'two.', start: 6, end: 10, isWord: true },
    ]);
  });
});

describe('findWordIndex', () => {
  const tokens = tokenize('alpha beta gamma');
  // tokens: [alpha 0-5][space 5-6][beta 6-10][space 10-11][gamma 11-16]

  it('returns -1 for an empty token list', () => {
    expect(findWordIndex([], 0)).toBe(-1);
  });

  it('finds the word at the start of the text', () => {
    expect(findWordIndex(tokens, 0)).toBe(0);
  });

  it('finds a word from a char index inside the word', () => {
    expect(findWordIndex(tokens, 8)).toBe(2);
  });

  it('finds the word at the very end of a word range', () => {
    expect(findWordIndex(tokens, 9)).toBe(2);
  });

  it('returns the previous word when the char index is inside whitespace', () => {
    expect(findWordIndex(tokens, 5)).toBe(0);
  });

  it('returns -1 when the char index is past the end', () => {
    expect(findWordIndex(tokens, 999)).toBe(-1);
  });

  it('returns -1 when the char index is negative', () => {
    expect(findWordIndex(tokens, -1)).toBe(-1);
  });

  it('returns -1 when leading whitespace has no preceding word', () => {
    const leading = tokenize('   hello');
    expect(findWordIndex(leading, 1)).toBe(-1);
  });
});
