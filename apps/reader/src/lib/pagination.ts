/**
 * Measurement-based pagination for read-only chapter text.
 *
 * This is the diary's `splitPoints` idiom (apps/diary/src/lib/overflow.ts and
 * the `measureEl` effect in its authenticated layout) copied and adapted
 * per-app — NOT imported. The diary paginates editable textarea content; the
 * reader paginates read-only word-span markup whose metrics differ (emphasis
 * renders as real `em`/`strong`), so the two implementations are expected to
 * diverge.
 *
 * Character offsets into a chapter's `text` are the system's spine —
 * positions, dog-ears, and word timings all key on them — so split points are
 * absolute character offsets and everything in this module is pure logic
 * driven by an injected `fits` predicate. The DOM half (the hidden measuring
 * element) lives in components/ChapterMeasurer.svelte.
 */

/**
 * Does `slice` fit on one page? `slice` always equals
 * `chapterText.slice(start, start + slice.length)` — the absolute `start` is
 * passed so a DOM-backed predicate can align chapter-absolute emphasis ranges
 * with the probe markup (an italic word wraps differently than a roman one;
 * measuring without emphasis would compute split points the live page
 * overflows).
 */
export type FitsPredicate = (slice: string, start: number) => boolean;

/**
 * Returns the largest n in [0, content.length] such that measure(n) returns true.
 * Assumes measure is monotone: if measure(n) is false, measure(m) is false for all m > n.
 */
export function findSplitIndex(content: string, measure: (n: number) => boolean): number {
  if (measure(content.length)) return content.length;
  let lo = 0;
  let hi = content.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (measure(mid)) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

/**
 * Snaps a character-level split point backward to the nearest line break (\n) or
 * word boundary (space) within a small window. Avoids mid-word splits without
 * jumping back to a distant paragraph boundary and creating a large blank gap.
 * Returns splitAt unchanged if no suitable break precedes it.
 *
 * The window is ~one line wide. A break further back than that is not worth
 * preserving: snapping to it would strand more than a line of blank space at
 * the bottom of the page. The pathological case is a long unbreakable token (a
 * URL with no spaces) — without the cap, the split snaps back to the newline
 * before the URL and bumps the entire URL to the next page, leaving the rest
 * of the current page empty. With the cap, no break is found in-window and the
 * token is hard-split, so it wraps across the page boundary (matching
 * `overflow-wrap: break-word`) and the page fills.
 */
const SNAP_WINDOW = 40;
export function snapToWordBreak(content: string, splitAt: number): number {
  const windowStart = Math.max(0, splitAt - SNAP_WINDOW);
  const before = content.slice(windowStart, splitAt);
  const lineBreak = before.lastIndexOf('\n');
  if (lineBreak >= 0) return windowStart + lineBreak + 1;
  const wordBreak = before.lastIndexOf(' ');
  if (wordBreak >= 0) return windowStart + wordBreak + 1;
  return splitAt;
}

export interface ComputeSplitPointsOptions {
  /**
   * Initial probe-window size in characters. The window grows (doubles) until
   * it overflows a page, so an undersized value is safe — merely slower. The
   * default comfortably exceeds a dense page of prose.
   */
  windowSize?: number;
}

const DEFAULT_WINDOW_SIZE = 4096;

/**
 * Compute a chapter's page boundaries: absolute character offsets where each
 * new page starts, in increasing order. `[]` means the whole chapter fits on
 * one page. Page k's slice is `[points[k-1] ?? 0, points[k] ?? text.length)`.
 *
 * Port of the diary layout's pagination loop, with one deliberate deviation:
 * the diary binary-searches the FULL remaining text, which renders
 * multi-thousand-token probe slices; here each search runs inside a bounded
 * window (grown adaptively when a whole window fits), so every probe the DOM
 * measurer renders stays around page size. Same split points, cheaper probes.
 *
 * Plates (PlateRef) anchor at offsets but occupy no characters, so chapters
 * containing them paginate unaffected.
 */
export function computeSplitPoints(
  text: string,
  fits: FitsPredicate,
  options: ComputeSplitPointsOptions = {}
): number[] {
  const points: number[] = [];
  let windowSize = Math.max(1, options.windowSize ?? DEFAULT_WINDOW_SIZE);
  let offset = 0;
  while (offset < text.length) {
    let windowEnd = Math.min(offset + windowSize, text.length);
    while (fits(text.slice(offset, windowEnd), offset)) {
      // The whole window fits. Either the remainder fits (done) or the window
      // is too small to contain the split point — grow it and re-probe.
      if (windowEnd >= text.length) return points;
      windowSize *= 2;
      windowEnd = Math.min(offset + windowSize, text.length);
    }
    const windowText = text.slice(offset, windowEnd);
    const relSplit = findSplitIndex(windowText, (n) => fits(windowText.slice(0, n), offset));
    // Degenerate: not even one character fits (zero-height page). Bail rather
    // than loop forever; the page renders what it can under overflow:hidden.
    if (relSplit === 0) break;
    const rawSplit = offset + relSplit;
    const snapped = snapToWordBreak(text, rawSplit);
    const actualSplit = snapped > offset ? snapped : rawSplit;
    points.push(actualSplit);
    offset = actualSplit;
  }
  return points;
}

/** Number of spreads a splitPoints array paginates into (diary content.ts idiom). */
export function spreadCount(splitPoints: number[]): number {
  return Math.floor(splitPoints.length / 2) + 1;
}

/**
 * The spread index whose page range contains absolute offset `offset`.
 *
 * `splitPoints` is the flat array of page boundaries; spread S spans
 * `[leftStart, splitPoints[2S+1])` and the final spread runs to the end of the
 * chapter. This is what positions and dog-ears resolve through.
 */
export function spreadForOffset(splitPoints: number[], offset: number): number {
  const count = spreadCount(splitPoints);
  for (let s = 0; s < count - 1; s++) {
    const end = splitPoints[s * 2 + 1];
    if (end === undefined || offset < end) return s;
  }
  return count - 1;
}

/**
 * Which page of spread `spread` the absolute offset falls on. The spread's
 * left/right boundary is `splitPoints[2*spread]`; offsets before it are on the
 * left page, at-or-after on the right.
 */
export function sideForOffset(
  splitPoints: number[],
  spread: number,
  offset: number
): 'left' | 'right' {
  const mid = splitPoints[spread * 2];
  if (mid === undefined) return 'left';
  return offset < mid ? 'left' : 'right';
}

/** Half-open slice bounds for one spread's two pages. */
export interface SpreadSlices {
  leftStart: number;
  leftEnd: number;
  rightStart: number;
  rightEnd: number;
}

/**
 * The two page slices of spread `spread`: left is
 * `[leftStart, leftEnd)`, right is `[rightStart, rightEnd)`. Boundaries past
 * the end of `splitPoints` clamp to `textLength`, so a single-page chapter
 * (`splitPoints === []`) yields the whole text on the left and an empty right
 * page.
 */
export function spreadSlices(
  splitPoints: number[],
  spread: number,
  textLength: number
): SpreadSlices {
  const leftStart = spread === 0 ? 0 : (splitPoints[spread * 2 - 1] ?? textLength);
  const leftEnd = splitPoints[spread * 2] ?? textLength;
  const rightEnd = splitPoints[spread * 2 + 1] ?? textLength;
  return { leftStart, leftEnd, rightStart: leftEnd, rightEnd };
}
