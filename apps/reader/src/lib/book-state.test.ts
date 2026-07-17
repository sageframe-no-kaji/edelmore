import { describe, expect, it } from 'vitest';
import {
  type BookShape,
  type SpreadState,
  bookProgress,
  canFlipNext,
  canFlipPrev,
  chapterSpread,
  close,
  flipNext,
  flipPrev,
  openBook,
  toLibrary,
} from './book-state';

/**
 * A book of `chapterCount` chapters, each paginating into a fixed number of
 * spreads. `firstTextChapter` defaults to 0. Unlisted chapters report 1 spread.
 */
function shape(
  chapterCount: number,
  spreads: Record<number, number> = {},
  firstTextChapter = 0
): BookShape {
  return {
    chapterCount,
    firstTextChapter,
    spreadCount: (i) => spreads[i] ?? 1,
  };
}

describe('constructors', () => {
  it('openBook opens the closed book onto the title page', () => {
    expect(openBook()).toEqual({ kind: 'title' });
  });
  it('close returns to the cover', () => {
    expect(close()).toEqual({ kind: 'closed' });
  });
  it('toLibrary jumps to the library spread', () => {
    expect(toLibrary()).toEqual({ kind: 'library' });
  });
  it('chapterSpread defaults spread to 0', () => {
    expect(chapterSpread(3)).toEqual({ kind: 'chapter', chapterIdx: 3, spread: 0 });
    expect(chapterSpread(3, 2)).toEqual({ kind: 'chapter', chapterIdx: 3, spread: 2 });
  });
});

describe('flipNext transition table', () => {
  const s = shape(2, { 0: 3, 1: 2 });
  const cases: [SpreadState, SpreadState][] = [
    [{ kind: 'closed' }, { kind: 'title' }],
    [{ kind: 'title' }, { kind: 'library' }],
    [{ kind: 'library' }, chapterSpread(0, 0)],
    [chapterSpread(0, 0), chapterSpread(0, 1)],
    [chapterSpread(0, 2), chapterSpread(1, 0)], // last spread of ch0 → ch1
    [chapterSpread(1, 0), chapterSpread(1, 1)],
    [chapterSpread(1, 1), chapterSpread(1, 1)], // end of book — idempotent
  ];
  for (const [from, to] of cases) {
    it(`${JSON.stringify(from)} → ${JSON.stringify(to)}`, () => {
      expect(flipNext(from, s)).toEqual(to);
    });
  }

  it('library → first TEXT chapter, skipping cover-only spine entries', () => {
    const withCover = shape(3, {}, 2);
    expect(flipNext({ kind: 'library' }, withCover)).toEqual(chapterSpread(2, 0));
  });

  it('library is a no-op when the active book has no chapters', () => {
    expect(flipNext({ kind: 'library' }, shape(0))).toEqual({ kind: 'library' });
  });
});

describe('flipPrev transition table', () => {
  const s = shape(2, { 0: 3, 1: 2 });
  const cases: [SpreadState, SpreadState][] = [
    [{ kind: 'closed' }, { kind: 'closed' }], // idempotent at the cover
    [{ kind: 'title' }, { kind: 'closed' }],
    [{ kind: 'library' }, { kind: 'title' }],
    [chapterSpread(1, 1), chapterSpread(1, 0)],
    [chapterSpread(1, 0), chapterSpread(0, 2)], // first spread of ch1 → last of ch0
    [chapterSpread(0, 1), chapterSpread(0, 0)],
    [chapterSpread(0, 0), { kind: 'library' }], // first chapter → back to library
  ];
  for (const [from, to] of cases) {
    it(`${JSON.stringify(from)} → ${JSON.stringify(to)}`, () => {
      expect(flipPrev(from, s)).toEqual(to);
    });
  }
});

describe('canFlipNext', () => {
  const s = shape(2, { 0: 2, 1: 1 });
  it('is true from closed and title', () => {
    expect(canFlipNext({ kind: 'closed' }, s)).toBe(true);
    expect(canFlipNext({ kind: 'title' }, s)).toBe(true);
  });
  it('is true from library when there are chapters, false when there are none', () => {
    expect(canFlipNext({ kind: 'library' }, s)).toBe(true);
    expect(canFlipNext({ kind: 'library' }, shape(0))).toBe(false);
  });
  it('is true mid-chapter and across chapter boundaries', () => {
    expect(canFlipNext(chapterSpread(0, 0), s)).toBe(true); // more spreads in ch0
    expect(canFlipNext(chapterSpread(0, 1), s)).toBe(true); // last spread → ch1 exists
  });
  it('is false at the last spread of the last chapter', () => {
    expect(canFlipNext(chapterSpread(1, 0), s)).toBe(false);
  });
});

describe('canFlipPrev', () => {
  it('is false only at the closed cover', () => {
    expect(canFlipPrev({ kind: 'closed' })).toBe(false);
    expect(canFlipPrev({ kind: 'title' })).toBe(true);
    expect(canFlipPrev({ kind: 'library' })).toBe(true);
    expect(canFlipPrev(chapterSpread(0, 0))).toBe(true);
  });
});

describe('bookProgress', () => {
  it('is 0 on every non-chapter spread', () => {
    expect(bookProgress({ kind: 'closed' }, [10, 10], 0)).toBe(0);
    expect(bookProgress({ kind: 'title' }, [10, 10], 0)).toBe(0);
    expect(bookProgress({ kind: 'library' }, [10, 10], 0)).toBe(0);
  });
  it('is 0 for an empty book (no characters)', () => {
    expect(bookProgress(chapterSpread(0, 0), [0, 0], 0)).toBe(0);
  });
  it('advances by chapters-before plus the current spread offset', () => {
    // chapter 1 starts at char 100 of 200 total; leftStart 50 → (100+50)/200.
    expect(bookProgress(chapterSpread(1, 0), [100, 100], 50)).toBeCloseTo(0.75);
  });
  it('clamps to [0, 1]', () => {
    expect(bookProgress(chapterSpread(1, 0), [100, 100], 500)).toBe(1);
    expect(bookProgress(chapterSpread(0, 0), [100, 100], -50)).toBe(0);
  });
});
