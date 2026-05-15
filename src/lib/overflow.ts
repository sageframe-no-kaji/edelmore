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
 * Snaps a character-level split point backward to the nearest paragraph break (\n\n)
 * or, failing that, to the nearest line break (\n), to avoid mid-sentence page splits.
 * Returns splitAt unchanged if no suitable break precedes it.
 */
export function snapToWordBreak(content: string, splitAt: number): number {
  const before = content.slice(0, splitAt);
  const paraBreak = before.lastIndexOf('\n\n');
  if (paraBreak >= 0) return paraBreak + 2;
  const lineBreak = before.lastIndexOf('\n');
  if (lineBreak >= 0) return lineBreak + 1;
  const wordBreak = before.lastIndexOf(' ');
  if (wordBreak >= 0) return wordBreak + 1;
  return splitAt;
}
