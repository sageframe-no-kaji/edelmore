/**
 * The magic book's spread-state machine — the reader's counterpart to the
 * diary layout's `SpreadState` idiom (apps/diary/src/routes/(authenticated)/
 * +layout.svelte). Same shape: a discriminated union of book positions plus
 * pure transition functions. The reader's is simpler than the diary's — there
 * is no editing, no settings spread, no per-day navigation — so this module is
 * pure logic with no Svelte, no DOM, no async, and is exhaustively unit-tested.
 *
 * The one-magic-book model (parent note, decisions C/D): there is a single
 * book. Its spreads run
 *
 *     closed (cover) → title → library → chapter(0,0) → chapter(0,1) → …
 *
 * where `library` is the diegetic "Other books in this series…" spread that
 * lives INSIDE the book, first spread after the title page. Choosing a
 * different book from the library swaps the active book's cover/title/content;
 * the machine's chapter coordinates are always relative to whichever book is
 * active. Book identity itself is component state — this machine only knows the
 * active book's SHAPE (chapter count, per-chapter spread count), supplied by
 * the caller's pagination cache.
 */

/** Where in the book we are. Chapter coordinates are relative to the active book. */
export type SpreadState =
  | { kind: 'closed' }
  | { kind: 'title' }
  | { kind: 'library' }
  | { kind: 'chapter'; chapterIdx: number; spread: number };

/**
 * The active book's pagination shape, as the transitions need it. Supplied by
 * the caller from its per-book split-point cache; an unmeasured chapter reports
 * a spread count of 1 (it renders as a single overflowing page until measured,
 * exactly the dev route's behavior).
 */
export interface BookShape {
  /** Number of chapters in the active book. */
  chapterCount: number;
  /**
   * First chapter index that carries text — where the book opens when entering
   * chapters fresh. Cover-image-only spine entries (0 chars) are skipped so the
   * opening spread is never blank.
   */
  firstTextChapter: number;
  /** Spreads chapter `chapterIdx` paginates into (>= 1). Unmeasured → 1. */
  spreadCount: (chapterIdx: number) => number;
}

export const CLOSED: SpreadState = { kind: 'closed' };
export const TITLE: SpreadState = { kind: 'title' };
export const LIBRARY: SpreadState = { kind: 'library' };

/** A chapter spread position. */
export function chapterSpread(chapterIdx: number, spread = 0): SpreadState {
  return { kind: 'chapter', chapterIdx, spread };
}

/** Open the closed book onto its title page. Restore-to-position is layered on
 *  top by the caller (see position.ts) — the machine's own "open" is title. */
export function openBook(): SpreadState {
  return TITLE;
}

/** Close the book from anywhere — the automatic bookmark holds the place. */
export function close(): SpreadState {
  return CLOSED;
}

/** Jump to the library spread from anywhere (the "library" ribbon control). */
export function toLibrary(): SpreadState {
  return LIBRARY;
}

/**
 * Advance one spread forward. Idempotent at the end of the last chapter
 * (returns the same state) — `canFlipNext` gates the UI so this is only a
 * safety net.
 *
 * Transition table (forward):
 *   closed              → title
 *   title               → library
 *   library             → chapter(firstTextChapter, 0)   [when chapterCount > 0]
 *   chapter(i, s)       → chapter(i, s+1)                 [s < spreadCount(i) - 1]
 *   chapter(i, last)    → chapter(i+1, 0)                 [i < chapterCount - 1]
 *   chapter(last, last) → (unchanged)
 */
export function flipNext(state: SpreadState, shape: BookShape): SpreadState {
  switch (state.kind) {
    case 'closed':
      return TITLE;
    case 'title':
      return LIBRARY;
    case 'library':
      return shape.chapterCount > 0 ? chapterSpread(shape.firstTextChapter, 0) : LIBRARY;
    case 'chapter': {
      const lastSpread = shape.spreadCount(state.chapterIdx) - 1;
      if (state.spread < lastSpread) return chapterSpread(state.chapterIdx, state.spread + 1);
      if (state.chapterIdx < shape.chapterCount - 1) return chapterSpread(state.chapterIdx + 1, 0);
      return state;
    }
  }
}

/**
 * Retreat one spread backward. Idempotent at the closed cover.
 *
 * Transition table (backward):
 *   closed         → (unchanged)
 *   title          → closed
 *   library        → title
 *   chapter(i, s)  → chapter(i, s-1)                       [s > 0]
 *   chapter(i>0,0) → chapter(i-1, lastSpread(i-1))
 *   chapter(0, 0)  → library
 */
export function flipPrev(state: SpreadState, shape: BookShape): SpreadState {
  switch (state.kind) {
    case 'closed':
      return state;
    case 'title':
      return CLOSED;
    case 'library':
      return TITLE;
    case 'chapter': {
      if (state.spread > 0) return chapterSpread(state.chapterIdx, state.spread - 1);
      if (state.chapterIdx > 0) {
        const prev = state.chapterIdx - 1;
        return chapterSpread(prev, shape.spreadCount(prev) - 1);
      }
      return LIBRARY;
    }
  }
}

/** Whether a forward flip changes state. */
export function canFlipNext(state: SpreadState, shape: BookShape): boolean {
  switch (state.kind) {
    case 'closed':
    case 'title':
      return true;
    case 'library':
      return shape.chapterCount > 0;
    case 'chapter':
      return (
        state.spread < shape.spreadCount(state.chapterIdx) - 1 ||
        state.chapterIdx < shape.chapterCount - 1
      );
  }
}

/** Whether a backward flip changes state (everything but the closed cover). */
export function canFlipPrev(state: SpreadState): boolean {
  return state.kind !== 'closed';
}

/**
 * Char-based progress through the book, 0..1 — drives the shell's page-stack
 * thickness (the dev route's formula, made pure). Non-chapter spreads sit at
 * the front of the book (0). `leftStart` is the current spread's left-page
 * offset into the active chapter, so progress advances within a chapter, not
 * just at chapter boundaries.
 */
export function bookProgress(
  state: SpreadState,
  chapterCharCounts: number[],
  leftStart: number
): number {
  if (state.kind !== 'chapter') return 0;
  const total = chapterCharCounts.reduce((sum, n) => sum + n, 0);
  if (total === 0) return 0;
  const before = chapterCharCounts.slice(0, state.chapterIdx).reduce((sum, n) => sum + n, 0);
  const p = (before + leftStart) / total;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}
