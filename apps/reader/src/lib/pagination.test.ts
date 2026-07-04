import { describe, expect, it } from 'vitest';
import {
  computeSplitPoints,
  findSplitIndex,
  sideForOffset,
  snapToWordBreak,
  spreadCount,
  spreadForOffset,
  spreadSlices,
} from './pagination.js';

/** A fits predicate that also verifies the (slice, start) contract. */
function charCapFits(text: string, cap: number) {
  const calls: Array<{ length: number; start: number }> = [];
  const fits = (slice: string, start: number): boolean => {
    // Contract: slice is always text.slice(start, start + slice.length).
    expect(text.slice(start, start + slice.length)).toBe(slice);
    calls.push({ length: slice.length, start });
    return slice.length <= cap;
  };
  return { fits, calls };
}

function words(n: number, word = 'aurora'): string {
  return Array.from({ length: n }, () => word).join(' ');
}

describe('findSplitIndex', () => {
  it('returns content.length when everything fits', () => {
    expect(findSplitIndex('abcdef', () => true)).toBe(6);
  });

  it('returns 0 when nothing fits', () => {
    expect(findSplitIndex('abcdef', (n) => n === 0)).toBe(0);
  });

  it('finds the largest fitting prefix for a monotone predicate', () => {
    for (const cap of [1, 3, 5]) {
      expect(findSplitIndex('abcdef', (n) => n <= cap)).toBe(cap);
    }
  });
});

describe('snapToWordBreak', () => {
  it('snaps back to just after the nearest space', () => {
    const text = 'hello brave world';
    // Split mid-'world' → snap to the char after the space before it.
    expect(snapToWordBreak(text, 14)).toBe(12);
  });

  it('prefers a line break over a space', () => {
    const text = 'hello\nbrave world';
    expect(snapToWordBreak(text, 14)).toBe(6);
  });

  it('returns splitAt unchanged when no break exists in the window', () => {
    const url = 'x'.repeat(120);
    expect(snapToWordBreak(url, 100)).toBe(100);
  });

  it('does not look past the ~one-line window for a break', () => {
    // Space at index 5, split at 60: the space is 55 chars back — outside the
    // 40-char window, so the long token is hard-split instead.
    const text = `intro ${'y'.repeat(200)}`;
    expect(snapToWordBreak(text, 60)).toBe(60);
  });
});

describe('computeSplitPoints', () => {
  it('returns [] for empty text without probing', () => {
    const { fits, calls } = charCapFits('', 10);
    expect(computeSplitPoints('', fits)).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('returns [] when the whole text fits on one page', () => {
    const text = words(5);
    const { fits } = charCapFits(text, text.length);
    expect(computeSplitPoints(text, fits)).toEqual([]);
  });

  it('splits at word breaks and covers the full text', () => {
    const text = words(100);
    const { fits } = charCapFits(text, 50);
    const points = computeSplitPoints(text, fits);
    expect(points.length).toBeGreaterThan(0);
    // Strictly increasing, interior offsets only.
    for (let i = 0; i < points.length; i++) {
      expect(points[i]).toBeGreaterThan(i === 0 ? 0 : points[i - 1]);
      expect(points[i]).toBeLessThan(text.length);
      // Word-break snap: each page starts right after a space.
      expect(text[points[i] - 1]).toBe(' ');
    }
    // Page slices reconstruct the text and each fits the cap.
    const bounds = [0, ...points, text.length];
    let rebuilt = '';
    for (let i = 1; i < bounds.length; i++) {
      const page = text.slice(bounds[i - 1], bounds[i]);
      expect(page.length).toBeLessThanOrEqual(50);
      rebuilt += page;
    }
    expect(rebuilt).toBe(text);
  });

  it('snaps to line breaks when paragraphs are present', () => {
    const text = `${words(6)}\n${words(6)}\n${words(6)}`;
    const { fits } = charCapFits(text, 45);
    const points = computeSplitPoints(text, fits);
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) {
      expect([' ', '\n']).toContain(text[p - 1]);
    }
  });

  it('hard-splits a long unbreakable token instead of stranding a page', () => {
    const text = 'z'.repeat(100);
    const { fits } = charCapFits(text, 30);
    const points = computeSplitPoints(text, fits);
    expect(points).toEqual([30, 60, 90]);
  });

  it('uses the raw split when the snap would not advance past the offset', () => {
    // Page 2 starts right after the only space; the next 200 chars are
    // unbreakable, so its snap lands back AT the page's own start (no
    // progress) and the raw split must win.
    const text = `ab ${'z'.repeat(200)}`;
    const { fits } = charCapFits(text, 30);
    const points = computeSplitPoints(text, fits);
    expect(points[0]).toBe(3); // snapped to just after 'ab '
    expect(points[1]).toBe(33); // raw split: 3 + 30, snap refused
  });

  it('bails out when not even one character fits (degenerate page)', () => {
    const text = words(10);
    expect(computeSplitPoints(text, () => false)).toEqual([]);
  });

  it('produces identical points regardless of the probe window size', () => {
    const text = `${words(80)}\n\n${words(80, 'meadowlark')}`;
    const reference = computeSplitPoints(text, (s) => s.length <= 71);
    for (const windowSize of [1, 7, 64, 4096, 100000]) {
      expect(computeSplitPoints(text, (s) => s.length <= 71, { windowSize })).toEqual(reference);
    }
  });

  it('keeps probe slices bounded near page size (the diary-idiom deviation)', () => {
    const text = words(2000);
    const cap = 300;
    const { fits, calls } = charCapFits(text, cap);
    computeSplitPoints(text, fits, { windowSize: 64 });
    const maxProbe = Math.max(...calls.map((c) => c.length));
    // The adaptive window doubles until it overflows, so no probe should ever
    // render more than ~2× a page worth of text.
    expect(maxProbe).toBeLessThanOrEqual(2 * cap);
  });

  it('paginates a ~5,000-word chapter within the flip budget headroom', () => {
    // Stop-condition fixture: ~5,000 words with paragraph breaks. The pure
    // algorithm must be far under the <100ms flip budget — the DOM probe cost
    // is measured in the browser (dev route logs per-chapter timings).
    const paragraph = words(250, 'brambleberry');
    const text = Array.from({ length: 20 }, () => paragraph).join('\n\n');
    const cap = 1200; // ≈ a dense page of prose
    const { fits, calls } = charCapFits(text, cap);
    const t0 = performance.now();
    const points = computeSplitPoints(text, fits);
    const elapsed = performance.now() - t0;
    const bounds = [0, ...points, text.length];
    for (let i = 1; i < bounds.length; i++) {
      expect(bounds[i] - bounds[i - 1]).toBeLessThanOrEqual(cap);
    }
    // Probe economy: a handful of DOM renders per page, not hundreds.
    expect(calls.length / (points.length + 1)).toBeLessThan(20);
    expect(elapsed).toBeLessThan(100);
  });
});

describe('spread math', () => {
  it('spreadCount: one spread per two points, plus the tail', () => {
    expect(spreadCount([])).toBe(1);
    expect(spreadCount([10])).toBe(1);
    expect(spreadCount([10, 20])).toBe(2);
    expect(spreadCount([10, 20, 30])).toBe(2);
    expect(spreadCount([10, 20, 30, 40])).toBe(3);
  });

  it('spreadForOffset walks the flat boundary array', () => {
    const points = [10, 20, 30, 40];
    expect(spreadForOffset(points, 0)).toBe(0);
    expect(spreadForOffset(points, 19)).toBe(0);
    expect(spreadForOffset(points, 20)).toBe(1);
    expect(spreadForOffset(points, 39)).toBe(1);
    expect(spreadForOffset(points, 40)).toBe(2);
    expect(spreadForOffset(points, 999)).toBe(2);
  });

  it('spreadForOffset handles an odd point count (open-ended last spread)', () => {
    const points = [10, 20, 30];
    expect(spreadForOffset(points, 25)).toBe(1);
    expect(spreadForOffset(points, 35)).toBe(1);
  });

  it('spreadForOffset returns 0 for an unpaginated chapter', () => {
    expect(spreadForOffset([], 123)).toBe(0);
  });

  it('sideForOffset splits a spread at its mid boundary', () => {
    const points = [10, 20];
    expect(sideForOffset(points, 0, 9)).toBe('left');
    expect(sideForOffset(points, 0, 10)).toBe('right');
    // Spread 1's mid is points[2] — absent, so everything is 'left'.
    expect(sideForOffset(points, 1, 25)).toBe('left');
  });

  it('spreadSlices clamps missing boundaries to the text length', () => {
    expect(spreadSlices([], 0, 50)).toEqual({
      leftStart: 0,
      leftEnd: 50,
      rightStart: 50,
      rightEnd: 50,
    });
    expect(spreadSlices([10], 0, 50)).toEqual({
      leftStart: 0,
      leftEnd: 10,
      rightStart: 10,
      rightEnd: 50,
    });
    expect(spreadSlices([10, 20, 30], 1, 50)).toEqual({
      leftStart: 20,
      leftEnd: 30,
      rightStart: 30,
      rightEnd: 50,
    });
    // Spread past the pagination: everything clamps to the end (empty pages).
    expect(spreadSlices([10], 1, 50)).toEqual({
      leftStart: 50,
      leftEnd: 50,
      rightStart: 50,
      rightEnd: 50,
    });
  });

  it('round-trips: every offset lands inside the spread and side it resolves to', () => {
    const text = `${words(120)}\n\n${words(120, 'thistledown')}`;
    const points = computeSplitPoints(text, (s) => s.length <= 90);
    expect(points.length).toBeGreaterThan(2);
    for (let offset = 0; offset < text.length; offset++) {
      const s = spreadForOffset(points, offset);
      const { leftStart, leftEnd, rightStart, rightEnd } = spreadSlices(points, s, text.length);
      const side = sideForOffset(points, s, offset);
      if (side === 'left') {
        expect(offset).toBeGreaterThanOrEqual(leftStart);
        expect(offset).toBeLessThan(leftEnd);
      } else {
        expect(offset).toBeGreaterThanOrEqual(rightStart);
        expect(offset).toBeLessThan(rightEnd);
      }
    }
  });
});
