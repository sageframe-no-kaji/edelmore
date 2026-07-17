import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EmphasisRange } from './epub/model.js';
import {
  type PaginableChapter,
  type Paginator,
  openingChapter,
  paginateBook,
  paginationOrder,
} from './use-pagination';

describe('openingChapter', () => {
  it('returns the first chapter with text', () => {
    expect(openingChapter([{ text: '' }, { text: 'prose' }, { text: 'more' }])).toBe(1);
  });
  it('returns 0 when the first chapter already has text', () => {
    expect(openingChapter([{ text: 'a' }, { text: 'b' }])).toBe(0);
  });
  it('returns 0 when no chapter has text (all cover-only)', () => {
    expect(openingChapter([{ text: '' }, { text: '' }])).toBe(0);
  });
  it('returns 0 for an empty book', () => {
    expect(openingChapter([])).toBe(0);
  });
});

describe('paginationOrder', () => {
  it('puts the opening chapter first, then the rest ascending', () => {
    expect(paginationOrder(4, 2)).toEqual([2, 0, 1, 3]);
  });
  it('is just the opening chapter for a one-chapter book', () => {
    expect(paginationOrder(1, 0)).toEqual([0]);
  });
  it('is empty for a book with no chapters', () => {
    expect(paginationOrder(0, 0)).toEqual([]);
  });
});

describe('paginateBook', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function fakeBook(texts: string[]): { chapters: PaginableChapter[] } {
    return { chapters: texts.map((text) => ({ text, emphasis: [] as EmphasisRange[] })) };
  }

  // A measurer that returns a canned split for each chapter and records the
  // order it was asked to paginate them in.
  function fakeMeasurer(seen: number[]): { measurer: Paginator; splitsFor: Map<string, number[]> } {
    const splitsFor = new Map<string, number[]>();
    const measurer: Paginator = {
      paginate: (_ref, text) => {
        seen.push(text.length);
        return splitsFor.get(text) ?? [];
      },
    };
    return { measurer, splitsFor };
  }

  it('measures the opening chapter first, then the rest in ascending order', async () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    const { measurer } = fakeMeasurer(seen);
    const book = fakeBook(['', 'AAAA', 'BB']); // opening = chapter 1
    const landed: Array<[number, number[]]> = [];
    const ref = {} as HTMLElement;

    paginateBook({
      book,
      measurer,
      referenceEl: ref,
      onSplits: (idx, points) => landed.push([idx, points]),
      now: () => 0,
    });

    // The opening chapter measures synchronously (before any macrotask) so it
    // paints first; the rest follow one per macrotask.
    await Promise.resolve();
    expect(landed.map(([i]) => i)).toEqual([1]);

    // Draining all pending macrotasks yields opening-first, then ascending.
    await vi.advanceTimersByTimeAsync(10);
    expect(landed.map(([i]) => i)).toEqual([1, 0, 2]);
  });

  it('passes the measurer output straight through to onSplits', async () => {
    vi.useFakeTimers();
    const { measurer, splitsFor } = fakeMeasurer([]);
    splitsFor.set('AAAA', [2]);
    const book = fakeBook(['AAAA']);
    const landed: Array<[number, number[]]> = [];

    paginateBook({
      book,
      measurer,
      referenceEl: {} as HTMLElement,
      onSplits: (idx, points) => landed.push([idx, points]),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(landed).toEqual([[0, [2]]]);
  });

  it('cancel stops chapters not yet measured', async () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    const { measurer } = fakeMeasurer(seen);
    const book = fakeBook(['A', 'BB', 'CCC']);
    const landed: number[] = [];

    const cancel = paginateBook({
      book,
      measurer,
      referenceEl: {} as HTMLElement,
      onSplits: (idx) => landed.push(idx),
    });
    await Promise.resolve(); // opening chapter (0) lands
    cancel();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(landed).toEqual([0]); // chapters 1 and 2 never measured
  });

  it('does nothing for a book with no chapters', async () => {
    vi.useFakeTimers();
    const { measurer } = fakeMeasurer([]);
    const landed: number[] = [];
    paginateBook({
      book: fakeBook([]),
      measurer,
      referenceEl: {} as HTMLElement,
      onSplits: (idx) => landed.push(idx),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(landed).toEqual([]);
  });

  it('logs per-chapter timing through the injected logger', async () => {
    vi.useFakeTimers();
    const { measurer } = fakeMeasurer([]);
    const logs: string[] = [];
    let t = 0;
    const now = () => {
      t += 5;
      return t;
    };
    paginateBook({
      book: fakeBook(['AAA']),
      measurer,
      referenceEl: {} as HTMLElement,
      onSplits: () => {},
      now,
      log: (m) => logs.push(m),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('chapter 0');
    expect(logs[0]).toContain('3 chars');
  });
});
