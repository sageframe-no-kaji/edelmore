<script lang="ts">
/**
 * The magic book — the reader's spine. One BookShell whose spreads run
 * closed cover → title page → library page → chapter spreads, driven by the
 * pure state machine in $lib/book-state. The library is a spread INSIDE the
 * book (parent note, decision C: "Other books in this series…"): choosing a
 * book there swaps this one book's cover/title/content. Reading position is the
 * bookmark that holds your place — restored when you open, saved as you turn.
 *
 * STRUCTURAL SUBSTRATE, PLACEHOLDER VISUALS. Every surface here is plain
 * parchment and legible text. Cover art, the magical book-swap transform, the
 * narration ribbon, and dog-ear rendering are practitioner-designed later hos —
 * deliberately absent. The mechanics are the deliverable; the design is not.
 */
import { BookShell, Spread } from '@edelmore/book';
import {
  type BookShape,
  type SpreadState,
  CLOSED,
  TITLE,
  bookProgress,
  canFlipNext,
  canFlipPrev,
  chapterSpread,
  flipNext,
  flipPrev,
} from '$lib/book-state.js';
import ChapterMeasurer from '$lib/components/ChapterMeasurer.svelte';
import PageView from '$lib/components/PageView.svelte';
import PersonPicker from '$lib/components/PersonPicker.svelte';
import type { NormalizedBook } from '$lib/epub/model.js';
import {
  spreadCount as spreadCountOf,
  spreadForOffset,
  spreadSlices,
} from '$lib/pagination.js';
import {
  type Position,
  type ShelfBook,
  createPositionSaver,
  fetchShelf,
  pickRestore,
  positionForBook,
} from '$lib/position.js';
import { openingChapter, paginateBook } from '$lib/use-pagination.js';
import { onMount } from 'svelte';

// ── Reader identity (provisional — see PersonPicker) ────────────────────────
let person = $state<string | null>(null);

// ── Shelf + active book ─────────────────────────────────────────────────────
let books = $state<ShelfBook[]>([]);
let shelfLoaded = $state(false);
let activeBookId = $state<string | null>(null);
let activeBook = $state<NormalizedBook | null>(null);

// Per-book caches so switching back to a book is instant (task req. 3).
const bookCache = new Map<string, NormalizedBook>();
const paginationCache = new Map<string, number[][]>();

// Split points for the ACTIVE book, one entry per chapter. Sparse until each
// chapter is measured; an unmeasured chapter reads as a single spread.
let chapterSplits = $state<number[][]>([]);

// ── Spread-state machine ────────────────────────────────────────────────────
let spreadState = $state<SpreadState>(CLOSED);

// A stored place to land on when ENTERING the active book's chapters (restore
// on open, and after a library selection). Consumed once, at the library→
// chapter / cover→chapter boundary.
let restorePos = $state<Position | null>(null);
// After landing on the restore chapter, the exact spread is resolved once that
// chapter is measured (charOffset → spread). Held here until then.
let pendingSpreadRestore = $state<Position | null>(null);

// ── Position persistence ────────────────────────────────────────────────────
// Wrapper defers to the live global fetch so a test can stub it after mount.
const saver = createPositionSaver({
  delayMs: 1000,
  fetchFn: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
});

// ── Book-flip primitive (diary idiom) ───────────────────────────────────────
// biome-ignore lint/style/useConst: bind:this requires let
let shell: {
  flip: (direction: 'forward' | 'backward', mutate: () => void | Promise<void>) => Promise<void>;
} | null = $state(null);
// biome-ignore lint/style/useConst: bind:this requires let
let measurer: {
  paginate: (referenceEl: HTMLElement, text: string, emphasis: NormalizedBook['chapters'][number]['emphasis']) => number[];
} | null = $state(null);
// The live left page-body — the box the measurer copies its metrics from. Only
// present in chapter state, so pagination begins when chapters are first shown.
// biome-ignore lint/style/useConst: bind:this requires let
let referenceEl: HTMLDivElement | undefined = $state();

async function bookFlip(
  direction: 'forward' | 'backward',
  next: SpreadState
): Promise<void> {
  if (shell) await shell.flip(direction, () => { spreadState = next; });
  else spreadState = next;
}

// ── Derived book shape + navigation gates ───────────────────────────────────
const shape = $derived<BookShape>({
  chapterCount: activeBook?.chapters.length ?? 0,
  firstTextChapter: activeBook ? openingChapter(activeBook.chapters) : 0,
  spreadCount: (i) => spreadCountOf(chapterSplits[i] ?? []),
});
const canNext = $derived(canFlipNext(spreadState, shape));
const canPrev = $derived(canFlipPrev(spreadState));

const chapterCharCounts = $derived(activeBook?.chapters.map((c) => c.text.length) ?? []);
const activeChapter = $derived(
  spreadState.kind === 'chapter' ? (activeBook?.chapters[spreadState.chapterIdx] ?? null) : null
);
const activeSplits = $derived(
  spreadState.kind === 'chapter' ? (chapterSplits[spreadState.chapterIdx] ?? []) : []
);
const slices = $derived(
  spreadState.kind === 'chapter' && activeChapter
    ? spreadSlices(activeSplits, spreadState.spread, activeChapter.text.length)
    : { leftStart: 0, leftEnd: 0, rightStart: 0, rightEnd: 0 }
);
const progress = $derived(bookProgress(spreadState, chapterCharCounts, slices.leftStart));

// The book's title, shown on the placeholder cover and title page.
const bookTitle = $derived(activeBook?.title || 'Edelmore');

// ── Flip zones — wide-overhang pattern (parent note 2026-07-04) ──────────────
// Zones reach 100rem into the backdrop beside the book, not narrow in-page
// strips. On the library page the left half flips back and only a 3% right
// margin flips forward, so the book-list links stay clickable.
function prevZonePct(): number {
  if (spreadState.kind === 'closed') return 0;
  if (spreadState.kind === 'library') return 50;
  return 3;
}
function nextZonePct(): number {
  if (spreadState.kind === 'closed') return 100; // whole cover opens the book
  return 3;
}
const overhangRem = $derived(spreadState.kind === 'closed' ? 0 : 100);

// ── Data loading ─────────────────────────────────────────────────────────────
async function loadShelf(): Promise<void> {
  books = await fetchShelf();
  shelfLoaded = true;
  const restore = person ? pickRestore(books, person) : null;
  if (restore) {
    restorePos = { chapterIdx: restore.chapterIdx, charOffset: restore.charOffset };
    await loadBook(restore.bookId);
  } else {
    restorePos = null;
    const first = books[0]?.id ?? null;
    if (first) await loadBook(first);
  }
}

async function loadBook(id: string): Promise<void> {
  activeBookId = id;
  chapterSplits = paginationCache.get(id) ?? [];
  const cached = bookCache.get(id);
  if (cached) {
    activeBook = cached;
    return;
  }
  const res = await fetch(`/api/books/${id}`);
  if (!res.ok) return;
  const book = (await res.json()) as NormalizedBook;
  bookCache.set(id, book);
  activeBook = book;
}

function onPerson(name: string | null): void {
  person = name;
  if (name && !shelfLoaded) void loadShelf();
}

async function selectBook(id: string): Promise<void> {
  // Selection lands on the chosen book's title page; its stored position is
  // applied when the reader enters its chapters (task req. 3).
  restorePos = person ? positionForBook(books, id, person) : null;
  await loadBook(id);
  spreadState = TITLE;
}

// ── Pagination — measure once, cache per book ────────────────────────────────
$effect(() => {
  const ref = referenceEl;
  const b = activeBook;
  const id = activeBookId;
  const m = measurer;
  if (!ref || !b || !id || !m) return;
  if (paginationCache.has(id)) return; // already measured this book
  let done = 0;
  return paginateBook({
    book: b,
    measurer: m,
    referenceEl: ref,
    onSplits: (i, points) => {
      chapterSplits[i] = points;
      done += 1;
      if (done === b.chapters.length) paginationCache.set(id, [...chapterSplits]);
    },
  });
});

// ── Restore: resolve charOffset → spread once the target chapter is measured ──
$effect(() => {
  const st = spreadState;
  const restore = pendingSpreadRestore;
  const splits = chapterSplits;
  if (!restore || st.kind !== 'chapter' || st.chapterIdx !== restore.chapterIdx) return;
  const chSplits = splits[st.chapterIdx];
  if (chSplits === undefined) return; // not measured yet
  pendingSpreadRestore = null;
  const target = spreadForOffset(chSplits, restore.charOffset);
  if (st.spread !== target) spreadState = chapterSpread(st.chapterIdx, target);
});

// ── Position save — debounced on every chapter spread settle ─────────────────
$effect(() => {
  const st = spreadState;
  const who = person;
  const id = activeBookId;
  const leftStart = slices.leftStart;
  if (st.kind !== 'chapter' || !who || !id) return;
  saver.save({ bookId: id, person: who, pos: { chapterIdx: st.chapterIdx, charOffset: leftStart } });
});

// ── Navigation ───────────────────────────────────────────────────────────────
function onFlipNext(): void {
  if (!canNext) return;
  // Opening the cover, or entering chapters from the library, honors a stored
  // position (restore-on-open). Consumed once; the spread is resolved after
  // measurement by the restore effect above.
  if ((spreadState.kind === 'closed' || spreadState.kind === 'library') && restorePos) {
    const target = chapterSpread(restorePos.chapterIdx, 0);
    pendingSpreadRestore = restorePos;
    restorePos = null;
    void bookFlip('forward', target);
    return;
  }
  void bookFlip('forward', flipNext(spreadState, shape));
}

function onFlipPrev(): void {
  if (!canPrev) return;
  const next = flipPrev(spreadState, shape);
  void bookFlip('backward', next);
  // Closing to the cover flushes the pending place immediately (keepalive).
  if (next.kind === 'closed') saver.flush();
}

function onKeydown(event: KeyboardEvent): void {
  // Bare arrows only outside form fields — the library has no fields, but a
  // future ribbon might; match the diary's guard.
  const tag = (document.activeElement as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (event.key === 'ArrowRight' && canNext) {
    event.preventDefault();
    onFlipNext();
  } else if (event.key === 'ArrowLeft' && canPrev) {
    event.preventDefault();
    onFlipPrev();
  }
}

onMount(() => {
  // Last-chance save when the tab closes or is hidden (lid shut, tab switch).
  function flush(): void {
    saver.flush();
  }
  function onVisibility(): void {
    if (document.visibilityState === 'hidden') saver.flush();
  }
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    window.removeEventListener('pagehide', flush);
    document.removeEventListener('visibilitychange', onVisibility);
  };
});
</script>

<svelte:head>
  <title>Edelmore</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<main class="reader-main">
  <div class="reader-topbar">
    <PersonPicker {person} {onPerson} />
    {#if spreadState.kind === 'chapter'}
      <!-- Placeholder library control (NOT the ribbon — that is a later ho). The
           real "flip back to the library page" control lives in the narration
           ribbon another task owns; this bare link keeps book-switching reachable
           without flipping through the whole book. -->
      <button type="button" class="library-link" onclick={() => bookFlip('backward', { kind: 'library' })}>
        Library
      </button>
    {/if}
  </div>

  <div class="book-wrap">
    <BookShell
      bind:this={shell}
      {progress}
      isClosed={spreadState.kind === 'closed'}
      isCoverState={spreadState.kind === 'closed'}
    >
      <Spread
        {onFlipPrev}
        {onFlipNext}
        canFlipPrev={canPrev}
        canFlipNext={canNext}
        prevZonePct={prevZonePct()}
        nextZonePct={nextZonePct()}
        {overhangRem}
        hideLeftPage={spreadState.kind === 'closed'}
        noBackground={spreadState.kind === 'closed'}
      >
        {#snippet leftPage()}
          {#if spreadState.kind === 'title'}
            <div class="page-pad"><div class="page-plain"></div></div>
          {:else if spreadState.kind === 'library'}
            <div class="page-pad"><div class="page-plain"></div></div>
          {:else if spreadState.kind === 'chapter' && activeChapter}
            <div class="page-pad">
              <div class="page-body" bind:this={referenceEl}>
                <PageView
                  text={activeChapter.text.slice(slices.leftStart, slices.leftEnd)}
                  sliceStart={slices.leftStart}
                  emphasis={activeChapter.emphasis}
                />
              </div>
            </div>
          {/if}
        {/snippet}

        {#snippet rightPage()}
          {#if spreadState.kind === 'closed'}
            <div class="placeholder-cover"><span>{bookTitle}</span></div>
          {:else if spreadState.kind === 'title'}
            <div class="page-pad">
              <div class="page-plain title-page">
                <h1>{bookTitle}</h1>
                {#if activeBook?.author}<p class="title-author">{activeBook.author}</p>{/if}
              </div>
            </div>
          {:else if spreadState.kind === 'library'}
            <div class="page-pad">
              <div class="page-plain library-page">
                <h2>Other books in this series…</h2>
                {#if books.length === 0}
                  <p class="library-empty">The shelf is empty.</p>
                {:else}
                  <ul class="library-list">
                    {#each books as book (book.id)}
                      <li>
                        <button
                          type="button"
                          class="library-item"
                          class:is-active={book.id === activeBookId}
                          onclick={() => selectBook(book.id)}
                        >
                          {book.title || 'Untitled'}{book.author ? ` — ${book.author}` : ''}
                        </button>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>
            </div>
          {:else if spreadState.kind === 'chapter' && activeChapter}
            <div class="page-pad">
              <div class="page-body">
                <PageView
                  text={activeChapter.text.slice(slices.rightStart, slices.rightEnd)}
                  sliceStart={slices.rightStart}
                  emphasis={activeChapter.emphasis}
                />
              </div>
            </div>
          {/if}
        {/snippet}
      </Spread>
    </BookShell>
  </div>

  <ChapterMeasurer bind:this={measurer} />
</main>

<style>
  /* Placeholder visuals only — plain parchment and legible serif. The
     practitioner designs every surface later. */
  .reader-main {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.5rem;
    background: #3a3128;
    padding: 2rem;
  }

  .reader-topbar {
    display: flex;
    align-items: center;
    gap: 1rem;
    color: #e8ddb5;
  }

  .library-link {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 0.85rem;
    color: #e8ddb5;
    background: transparent;
    border: 1px solid #6e5a3c;
    padding: 0.15rem 0.6rem;
    cursor: pointer;
  }

  .book-wrap {
    width: 100%;
    max-width: 72rem;
    margin-top: 2.4rem; /* BookShell pulls itself up 2.4rem */
  }

  .placeholder-cover {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #5a3d2b;
    border-radius: 4px 8px 8px 4px;
    box-shadow:
      0 20px 60px rgba(0, 0, 0, 0.45),
      0 6px 18px rgba(0, 0, 0, 0.3);
    color: #e8ddb5;
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 8cqw;
    text-align: center;
    padding: 1rem;
  }

  .page-pad {
    position: absolute;
    inset: 0;
    padding: 6% 7%;
    display: flex;
  }

  .page-body {
    flex: 1;
    overflow: hidden;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 16px;
    line-height: 1.6;
    color: #3b2f1e;
  }

  .page-plain {
    flex: 1;
    overflow: hidden;
    font-family: Georgia, 'Times New Roman', serif;
    color: #3b2f1e;
  }

  .title-page {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .title-page h1 {
    font-size: 1.8rem;
    font-weight: 600;
  }

  .title-author {
    margin-top: 1rem;
    font-style: italic;
  }

  .library-page h2 {
    font-size: 1.1rem;
    font-style: italic;
    margin-bottom: 1rem;
  }

  .library-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .library-item {
    font: inherit;
    text-align: left;
    background: transparent;
    border: none;
    padding: 0.2rem 0;
    cursor: pointer;
    color: #3b2f1e;
    border-bottom: 1px solid #c8b888;
    width: 100%;
  }

  .library-item.is-active {
    font-weight: 700;
  }

  .library-empty {
    font-style: italic;
    color: #6e5a3c;
  }
</style>
