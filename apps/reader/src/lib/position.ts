/**
 * Reading-position persistence — the bookmark that holds your place. Positions
 * are per-person and shared-visibility (parent note, decision D: a library in a
 * house, not accounts); the server keys them on `(person, book)` and returns
 * every person's position on a book. This module is the client's side: read a
 * person's stored place, and write it back — debounced as they turn pages,
 * immediately when the book closes or the tab goes away.
 *
 * A position is `(chapterIdx, charOffset)`. The offset is the character spine
 * (pagination.ts, model.ts): the start of what's on screen. Everything here is
 * pure logic or a thin fetch wrapper, injectable and unit-tested — no Svelte,
 * no DOM.
 */

/** A place in a book. */
export interface Position {
  chapterIdx: number;
  charOffset: number;
}

/** One person's position on a book, as GET /api/books returns it. */
export interface ShelfPosition extends Position {
  person: string;
  updatedAt: string;
}

/** One book on the household shelf, as GET /api/books returns it. */
export interface ShelfBook {
  id: string;
  title: string;
  author: string | null;
  cover: string | null;
  addedBy: string;
  positions: ShelfPosition[];
}

/** Fetch the whole household shelf (every book, every person's position). */
export async function fetchShelf(fetchFn: typeof fetch = fetch): Promise<ShelfBook[]> {
  const res = await fetchFn('/api/books');
  if (!res.ok) throw new Error(`shelf fetch failed: HTTP ${res.status}`);
  const body = (await res.json()) as { books: ShelfBook[] };
  return body.books;
}

/** A person's stored position on one specific book, or null if they have none. */
export function positionForBook(
  books: readonly ShelfBook[],
  bookId: string,
  person: string
): Position | null {
  const book = books.find((b) => b.id === bookId);
  const p = book?.positions.find((pos) => pos.person === person);
  return p ? { chapterIdx: p.chapterIdx, charOffset: p.charOffset } : null;
}

/** The book + place a person was most recently reading, across the whole shelf.
 *  Drives restore-on-open: reopen the book the person last had open. Null when
 *  the person has never opened anything. */
export function pickRestore(
  books: readonly ShelfBook[],
  person: string
): { bookId: string; chapterIdx: number; charOffset: number } | null {
  let best: { bookId: string; pos: ShelfPosition } | null = null;
  for (const book of books) {
    for (const pos of book.positions) {
      if (pos.person !== person) continue;
      if (!best || pos.updatedAt > best.pos.updatedAt) best = { bookId: book.id, pos };
    }
  }
  return best
    ? { bookId: best.bookId, chapterIdx: best.pos.chapterIdx, charOffset: best.pos.charOffset }
    : null;
}

/** PUT one person's position on a book. `keepalive` lets the request outlive a
 *  closing tab (pagehide). Rejections are the caller's to swallow. */
export async function putPosition(
  bookId: string,
  person: string,
  pos: Position,
  fetchFn: typeof fetch = fetch,
  keepalive = false
): Promise<void> {
  await fetchFn(`/api/books/${bookId}/position`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ person, chapterIdx: pos.chapterIdx, charOffset: pos.charOffset }),
    keepalive,
  });
}

/** A pending save target: who, which book, where. */
export interface SaveTarget {
  bookId: string;
  person: string;
  pos: Position;
}

export interface PositionSaverOptions {
  /** Debounce window before a page-turn save fires (default 1000ms). */
  delayMs?: number;
  fetchFn?: typeof fetch;
}

export interface PositionSaver {
  /** Record a new place; the PUT fires `delayMs` after the last call (debounced
   *  so a run of quick page-turns writes once, after it settles). */
  save(target: SaveTarget): void;
  /** Send the pending save now, with keepalive — for close-to-cover and
   *  pagehide, where the debounce would otherwise be cancelled by teardown. */
  flush(): void;
  /** Drop the pending save without sending (e.g. leaving chapters for title). */
  cancel(): void;
}

/**
 * A debounced position writer. One instance per reader; `save` coalesces a
 * burst of page-turns into a single settled write, `flush` forces the pending
 * write out immediately when the book closes or the tab goes away.
 */
export function createPositionSaver(options: PositionSaverOptions = {}): PositionSaver {
  const delayMs = options.delayMs ?? 1000;
  const fetchFn = options.fetchFn ?? fetch;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: SaveTarget | null = null;

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return {
    save(target: SaveTarget): void {
      pending = target;
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        const t = pending;
        pending = null;
        if (t) void putPosition(t.bookId, t.person, t.pos, fetchFn).catch(() => {});
      }, delayMs);
    },
    flush(): void {
      clearTimer();
      const t = pending;
      pending = null;
      if (t) void putPosition(t.bookId, t.person, t.pos, fetchFn, true).catch(() => {});
    },
    cancel(): void {
      clearTimer();
      pending = null;
    },
  };
}
