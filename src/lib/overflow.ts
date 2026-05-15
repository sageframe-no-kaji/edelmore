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
