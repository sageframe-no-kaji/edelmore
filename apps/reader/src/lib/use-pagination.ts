/**
 * Measure-once-cache-splits scheduling, factored out of the dev pagination
 * testbed (routes/dev/book/[id]/+page.svelte) so the real book route and the
 * testbed share ONE implementation. The DOM-and-binary-search half already
 * lives in pagination.ts (`computeSplitPoints`) and components/
 * ChapterMeasurer.svelte (`paginate`); this module owns the ORCHESTRATION: which
 * chapter to open on, what order to measure the rest in, and how to spread that
 * work across macrotasks so first paint is never blocked.
 *
 * The scheduling core is pure and unit-tested. `paginateBook` is a thin async
 * driver over an injected measurer, cancellable, and driven by the same
 * one-chapter-per-macrotask loop the testbed used inline.
 */

import type { EmphasisRange } from './epub/model.js';

/** The measurer's contract — implemented by components/ChapterMeasurer.svelte. */
export interface Paginator {
  paginate(referenceEl: HTMLElement, text: string, emphasis: EmphasisRange[]): number[];
}

/** The slice of a chapter this module needs — text (for length) and emphasis. */
export interface PaginableChapter {
  text: string;
  emphasis: EmphasisRange[];
}

/**
 * First chapter carrying text, else 0. Cover-image-only spine entries (0 chars)
 * render blank and make the book look broken as an opening state, so the book
 * opens on the first chapter that actually has prose.
 */
export function openingChapter(chapters: readonly { text: string }[]): number {
  const idx = chapters.findIndex((c) => c.text.length > 0);
  return idx < 0 ? 0 : idx;
}

/**
 * The order to paginate a book's chapters: the opening chapter first (so it
 * paints immediately), then every other chapter in ascending spine order.
 */
export function paginationOrder(chapterCount: number, opening: number): number[] {
  const rest: number[] = [];
  for (let i = 0; i < chapterCount; i++) if (i !== opening) rest.push(i);
  return chapterCount === 0 ? [] : [opening, ...rest];
}

export interface PaginateBookOptions {
  book: { chapters: readonly PaginableChapter[] };
  measurer: Paginator;
  referenceEl: HTMLElement;
  /** Called as each chapter's split points land, in pagination order. */
  onSplits: (chapterIdx: number, points: number[]) => void;
  /** Injectable clock + logger — the testbed logs per-chapter timings. */
  now?: () => number;
  log?: (message: string) => void;
}

/**
 * Paginate every chapter of a book, opening chapter first, one per macrotask so
 * the main thread (and first paint) is never blocked — dev-mode measurement
 * runs ~1-2s per chapter and a synchronous all-chapters loop froze the page for
 * the whole book. Returns a cancel function; calling it stops any chapters not
 * yet measured.
 */
export function paginateBook(options: PaginateBookOptions): () => void {
  const { book, measurer, referenceEl, onSplits } = options;
  const now = options.now ?? (() => performance.now());
  const opening = openingChapter(book.chapters);
  const order = paginationOrder(book.chapters.length, opening);

  let cancelled = false;
  void (async () => {
    for (const i of order) {
      if (cancelled) return;
      const chapter = book.chapters[i];
      const t0 = now();
      const points = measurer.paginate(referenceEl, chapter.text, chapter.emphasis);
      if (cancelled) return;
      onSplits(i, points);
      options.log?.(
        `[book] chapter ${i} (${chapter.text.length} chars) paginated in ${Math.round(now() - t0)}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  })();

  return () => {
    cancelled = true;
  };
}
