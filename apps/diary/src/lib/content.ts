/**
 * The entry-content model. `content` is a single authoritative string; the book
 * paginates it into page-slices via `splitPoints`. These functions are the only
 * sanctioned writers-back into `content` and the offset math the view-restore
 * needs — all pure, so the path that corrupted a real entry on 2026-06-12 is
 * verifiable here rather than buried in the layout component.
 *
 * The 2026-06-12 corruption: the old editor rebuilt `content` on every keystroke
 * as `content.slice(0, pageStart) + textareaValue + content.slice(end)`, where
 * `end` was read from `splitPoints`. `splitPoints` lags `content` by the 50ms
 * pagination debounce, so two keystrokes inside that window used a stale `end`
 * that pointed into the middle of text the textarea already held — re-appending
 * a duplicate suffix. The word-boundary resnap on each recompute shaved one word
 * per pass, producing the shrinking-suffix cascade that ballooned the entry to
 * 16k characters. `applyPageEdit` removes the dependency on `splitPoints` at edit
 * time; `insertAtAnchor` removes it from the voice path.
 */

import { composeInsertion } from './cursor.js';

/**
 * Rebuild the whole entry string after a paginated page's textarea changed.
 *
 * The textarea is a window over `content` at `[pageStart, pageStart + oldSlice.length)`.
 * `oldSlice` is what the textarea held BEFORE this edit — taken from the textarea's
 * own previous value, never from a stored split point. Deriving the window end from
 * the prior slice rather than from `splitPoints` is the fix: it is correct even when
 * pagination has not yet caught up to `content`.
 */
export function applyPageEdit(
  content: string,
  pageStart: number,
  oldSlice: string,
  newValue: string
): string {
  const end = pageStart + oldSlice.length;
  return content.slice(0, pageStart) + newValue + content.slice(end);
}

/**
 * Splice transcribed `text` into `content` at an absolute character offset.
 *
 * `anchor` is captured when recording STARTS — an index into the whole string —
 * so the insertion lands where the recording began regardless of page flips,
 * reflow, or spread changes during the recording. The same composition touches
 * as `insertAtCursor` apply (leading space, mid-sentence lowercasing). Returns
 * the new content and the cursor position at the end of the inserted text.
 */
export function insertAtAnchor(
  content: string,
  anchor: number,
  text: string
): { content: string; cursorPos: number } {
  const pos = Math.max(0, Math.min(anchor, content.length));
  const before = content.slice(0, pos);
  const after = content.slice(pos);

  const insertion = composeInsertion(before, text);
  return { content: before + insertion + after, cursorPos: pos + insertion.length };
}

/**
 * The spread index whose page range contains absolute offset `offset`.
 *
 * `splitPoints` is the flat array of page boundaries; spread S spans
 * `[leftStart, splitPoints[2S+1])` and the final spread runs to the end of
 * content. Used to flip the view back to where a voice insertion landed.
 */
export function spreadForOffset(splitPoints: number[], offset: number): number {
  const spreadCount = Math.floor(splitPoints.length / 2) + 1;
  for (let s = 0; s < spreadCount - 1; s++) {
    const end = splitPoints[s * 2 + 1];
    if (end === undefined || offset < end) return s;
  }
  return spreadCount - 1;
}

/**
 * Which page of spread `spread` the absolute offset falls on. The spread's
 * left/right boundary is `splitPoints[2*spread]`; offsets before it are on the
 * left page, at-or-after on the right. Drives cursor restore after a voice insert.
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
