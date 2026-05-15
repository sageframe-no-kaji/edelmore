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
 * Snaps a character-level split point backward to the nearest paragraph break (\n\n),
 * line break (\n), sentence end (. ! ?), or word boundary ( ).
 * Returns splitAt unchanged if no suitable break precedes it.
 */
export function snapToWordBreak(content: string, splitAt: number): number {
  const before = content.slice(0, splitAt);
  const paraBreak = before.lastIndexOf('\n\n');
  if (paraBreak >= 0) return paraBreak + 2;
  const lineBreak = before.lastIndexOf('\n');
  if (lineBreak >= 0) return lineBreak + 1;
  const sentenceEnd = Math.max(
    before.lastIndexOf('. '),
    before.lastIndexOf('! '),
    before.lastIndexOf('? ')
  );
  if (sentenceEnd >= 0) return sentenceEnd + 2;
  const wordBreak = before.lastIndexOf(' ');
  if (wordBreak >= 0) return wordBreak + 1;
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
