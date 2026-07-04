import { describe, expect, it } from 'vitest';
import type { NormalizedBook } from './epub/model.js';
import { MAX_PERSON_NAME_LENGTH, parsePersonName, parseSpot } from './validate.js';

describe('parsePersonName', () => {
  it('accepts and trims a plain name', () => {
    expect(parsePersonName('  Iona ')).toBe('Iona');
  });

  it('accepts a name of exactly the maximum length', () => {
    expect(parsePersonName('a'.repeat(MAX_PERSON_NAME_LENGTH))).toBe(
      'a'.repeat(MAX_PERSON_NAME_LENGTH)
    );
  });

  it('rejects non-strings, empties, and over-long names', () => {
    expect(parsePersonName(undefined)).toBeNull();
    expect(parsePersonName(42)).toBeNull();
    expect(parsePersonName('')).toBeNull();
    expect(parsePersonName('   ')).toBeNull();
    expect(parsePersonName('a'.repeat(MAX_PERSON_NAME_LENGTH + 1))).toBeNull();
  });
});

describe('parseSpot', () => {
  const book: NormalizedBook = {
    id: 'hash-1',
    title: 'T',
    author: null,
    language: null,
    coverImage: null,
    chapters: [
      { idx: 0, title: null, text: 'Ten chars.', emphasis: [], images: [] },
      { idx: 1, title: null, text: '', emphasis: [], images: [] },
    ],
  };

  it('accepts an in-bounds spot', () => {
    expect(parseSpot(book, 0, 5)).toEqual({ chapterIdx: 0, charOffset: 5 });
  });

  it('accepts offset === text length (end of chapter)', () => {
    expect(parseSpot(book, 0, 10)).toEqual({ chapterIdx: 0, charOffset: 10 });
    expect(parseSpot(book, 1, 0)).toEqual({ chapterIdx: 1, charOffset: 0 });
  });

  it('rejects non-integer or non-number inputs', () => {
    expect(parseSpot(book, '0', 5)).toBeNull();
    expect(parseSpot(book, 0.5, 5)).toBeNull();
    expect(parseSpot(book, 0, '5')).toBeNull();
    expect(parseSpot(book, 0, 5.5)).toBeNull();
    expect(parseSpot(book, undefined, undefined)).toBeNull();
  });

  it('rejects out-of-bounds chapters and offsets', () => {
    expect(parseSpot(book, -1, 0)).toBeNull();
    expect(parseSpot(book, 2, 0)).toBeNull();
    expect(parseSpot(book, 0, -1)).toBeNull();
    expect(parseSpot(book, 0, 11)).toBeNull();
    expect(parseSpot(book, 1, 1)).toBeNull();
  });
});
