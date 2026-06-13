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
 * preserving: snapping to it would strand more than a line of blank space at the
 * bottom of the page. The pathological case is a long unbreakable token (a URL
 * with no spaces) — without the cap, the split snaps back to the newline before
 * the URL and bumps the entire URL to the next page, leaving the rest of the
 * current page empty. With the cap, no break is found in-window and the token is
 * hard-split, so the URL wraps across the page boundary (matching `break-words`)
 * and the page fills.
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

/**
 * Adjusts a split point to prevent widows (1-line paragraph fragment at top of next page)
 * and orphans (1-line paragraph fragment at bottom of current page).
 *
 * isSingleLine: returns true if the given text renders as exactly one line.
 * Returns a (possibly earlier) split position, always >= offset.
 */
export function fixWidowOrphan(
  content: string,
  offset: number,
  splitAt: number,
  isSingleLine: (text: string) => boolean
): number {
  if (splitAt <= offset) return splitAt;

  let result = splitAt;

  // Orphan: last paragraph fragment on current page is 1 line
  const pageStr = content.slice(offset, result);
  const lastPara = pageStr.lastIndexOf('\n\n');
  if (lastPara >= 0) {
    const frag = pageStr.slice(lastPara + 2).trimEnd();
    if (frag.length > 0 && isSingleLine(frag)) {
      const fix = offset + lastPara;
      if (fix > offset) result = fix;
    }
  }

  // Widow: first paragraph fragment on next page is 1 line
  const afterStr = content.slice(result).replace(/^\n+/, '');
  const paraEnd = afterStr.indexOf('\n\n');
  const widowFrag = (paraEnd >= 0 ? afterStr.slice(0, paraEnd) : afterStr).trimEnd();
  if (widowFrag.length > 0 && isSingleLine(widowFrag)) {
    const beforeFix = content.slice(offset, result);
    const lastPara2 = beforeFix.lastIndexOf('\n\n');
    const fix = lastPara2 >= 0 ? offset + lastPara2 : offset;
    if (fix > offset) result = fix;
  }

  return result;
}
