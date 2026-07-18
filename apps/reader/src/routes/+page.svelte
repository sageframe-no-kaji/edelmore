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
import NarrationControls from '$lib/components/NarrationControls.svelte';
import PageView from '$lib/components/PageView.svelte';
import PersonPicker from '$lib/components/PersonPicker.svelte';
import type { NormalizedBook } from '$lib/epub/model.js';
import {
  type NarrationEngine,
  type NarrationPhase,
  createNarrationEngine,
} from '$lib/narration-engine.js';
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
// Spreads the ACTIVE chapter paginates into — drives the narration boundary
// target (last spread → no boundary; the chapter simply ends).
const activeCount = $derived(spreadCountOf(activeSplits));

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
  // A failed shelf fetch must never crash the book (and must not surface as
  // an unhandled rejection from the mount-time call) — the shelf stays empty
  // and the library page says so.
  try {
    books = await fetchShelf();
  } catch {
    books = [];
    return;
  }
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
  let res: Response;
  try {
    res = await fetch(`/api/books/${id}`);
  } catch {
    return;
  }
  if (!res.ok) return;
  const book = (await res.json()) as NormalizedBook;
  bookCache.set(id, book);
  activeBook = book;
}

function onPerson(name: string | null): void {
  person = name;
  // Shelf loads on mount regardless; choosing a person afterwards applies
  // their most-recent stored place (their bookmark takes over).
  if (name && shelfLoaded) {
    const restore = pickRestore(books, name);
    if (restore) {
      restorePos = { chapterIdx: restore.chapterIdx, charOffset: restore.charOffset };
      void loadBook(restore.bookId);
    }
  }
}

async function selectBook(id: string): Promise<void> {
  // Switching books stops any narration of the outgoing book.
  stopNarrationOnManualNav();
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

// ── Narration engine ────────────────────────────────────────────────────────
//
// The dev route (routes/dev/book/[id]) is the reference wiring; this is the
// same composition against the real book's state machine. The headless engine
// narrates the CURRENT chapter from the current spread's start to the chapter
// end in one stream (whole-chapter model). Its callbacks push into $state so
// the template reacts; the engine holds no Svelte state. Controls render only on
// chapter spreads — never closed/title/library.
const DEFAULT_VOICE = 'bf_emma';

let narrationPhase = $state<NarrationPhase>('idle');
// True when a play attempt died before any audio (loading → idle without ever
// reaching 'playing') — the TTS service is unreachable or errored. The silent
// version of this failure has bitten twice; the reader says so out loud now.
// Provisional copy/placement; the ribbon ho designs its real form.
let voiceResting = $state(false);
let narrationRate = $state(1.0);
// Chapter-absolute char index of the currently narrated word (null = none).
let currentCharIndex = $state<number | null>(null);
// Guards the manual-flip-stops-narration rule: a flip the engine itself
// requested at a spread boundary must NOT stop the audio, whereas a flip the
// reader initiates (zone tap, arrow key, library) must. Set true only for the
// duration of an engine-initiated flip.
let narrationFlip = false;

const engine: NarrationEngine = createNarrationEngine({
  fetchSpeak: ({ text, speed, signal }) =>
    fetch('/api/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: DEFAULT_VOICE, speed }),
      signal,
    }),
  onPhaseChange: (p) => {
    if (p === 'loading' || p === 'playing') voiceResting = false;
    if (narrationPhase === 'loading' && p === 'idle') voiceResting = true;
    narrationPhase = p;
    if (p === 'idle') currentCharIndex = null;
  },
  onWordHighlight: (absCharIndex) => {
    currentCharIndex = absCharIndex;
  },
  onPageBoundaryReached: () => {
    // Consumer of the highlight timeline: flip forward without stopping audio.
    narrationFlip = true;
    void flipForNarration().finally(() => {
      narrationFlip = false;
    });
  },
});

// Keep the engine's page-boundary target aligned with the visible spread. The
// boundary fires when the highlight crosses the current spread's end offset
// (splitPoints[2*spread+1]); on the last spread of a chapter (or any non-chapter
// spread) there is no next spread, so the target is null — no flip, the chapter
// simply ends.
$effect(() => {
  const st = spreadState;
  if (st.kind !== 'chapter') {
    engine.setPageEndOffset(null);
    return;
  }
  const isLastSpread = st.spread >= activeCount - 1;
  engine.setPageEndOffset(isLastSpread ? null : (activeSplits[st.spread * 2 + 1] ?? null));
});

function startNarration(): void {
  if (spreadState.kind !== 'chapter' || !activeChapter) return;
  // Whole-chapter model: from the current spread's start to the chapter end.
  void engine.play(activeChapter.text, slices.leftStart);
}

function changeRate(delta: number): void {
  engine.setRate(engine.getRate() + delta);
  narrationRate = engine.getRate();
}

function resetRate(): void {
  engine.setRate(1.0);
  narrationRate = engine.getRate();
}

// AUTO-ADVANCE ACROSS CHAPTERS IS AN OPEN DESIGN DECISION. At chapter end the
// engine goes idle and stays there; the reader continues by flipping to the
// next chapter and pressing play again. Whether narration should roll straight
// into the next chapter (and how that interacts with the physical-book page
// turn) belongs to the ribbon ho, not this wiring (same decision as the dev
// route).

// A flip the reader initiates stops narration; a flip the engine requested at a
// spread boundary (narrationFlip) does not — the audio rolls on across the page
// turn. Entering title/library or switching books also stops.
function stopNarrationOnManualNav(): void {
  if (narrationFlip) return;
  if (engine.getPhase() !== 'idle') engine.stop();
}

// The engine-initiated forward flip: advance one spread through the state
// machine WITHOUT stopping the audio. The boundary only fires mid-chapter
// (pageEndOffset is null on the last spread), so this never crosses a chapter.
async function flipForNarration(): Promise<void> {
  if (!canNext) return;
  await bookFlip('forward', flipNext(spreadState, shape));
}

// ── Navigation ───────────────────────────────────────────────────────────────
function onFlipNext(): void {
  if (!canNext) return;
  stopNarrationOnManualNav();
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

// The provisional "Library" control (jumps back to the library spread). A
// manual nav — stops any narration of the current chapter.
function onLibrary(): void {
  stopNarrationOnManualNav();
  void bookFlip('backward', { kind: 'library' });
}

function onFlipPrev(): void {
  if (!canPrev) return;
  // Backward is only ever reader-initiated (the engine never flips back).
  stopNarrationOnManualNav();
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
  // The shelf loads immediately — reading is never gated on identity (the
  // household model: the network is the gate; a person name is attribution).
  void loadShelf();
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
      <button type="button" class="library-link" onclick={onLibrary}>
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
                  {currentCharIndex}
                />
              </div>
            </div>
          {/if}
        {/snippet}

        {#snippet rightPage()}
          {#if spreadState.kind === 'closed'}
            <div class="cover-bleed">
              <div class="placeholder-cover"><span>{bookTitle}</span></div>
            </div>
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
                  {currentCharIndex}
                />
              </div>
            </div>
          {/if}
        {/snippet}
      </Spread>
    </BookShell>
  </div>

  <!-- Provisional narration controls — chapter spreads only (never
       closed/title/library). The physical-book ribbon replaces these later. -->
  {#if spreadState.kind === 'chapter'}
    <div class="narration-dock">
    <NarrationControls
      phase={narrationPhase}
      rate={narrationRate}
      onPlay={startNarration}
      onPause={() => engine.pause()}
      onResume={() => engine.resume()}
      onStop={() => engine.stop()}
      onSlower={() => changeRate(-0.1)}
      onResetRate={resetRate}
      onFaster={() => changeRate(0.1)}
    />
    {#if voiceResting}
      <p class="voice-resting">The voice is resting — is the narration service awake?</p>
    {/if}
    </div>
  {/if}

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
    background-image: url('/background.png');
    background-repeat: repeat;
    background-size: 627px 627px;
    padding: 2rem;
  }

  /* Bookplate card, top-left — out of the book's way. Provisional. */
  .reader-topbar {
    position: absolute;
    top: 1.25rem;
    left: 1.5rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 0.9rem;
    background: rgba(254, 252, 247, 0.92);
    border: 1px solid #dfc9a4;
    border-radius: 0.5rem;
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
    color: #4a3728;
    font-family: 'EB Garamond', Georgia, serif;
    z-index: 40;
  }

  .library-link {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 0.9rem;
    color: #8b6914;
    background: transparent;
    border: 1px solid #dfc9a4;
    border-radius: 0.35rem;
    padding: 0.15rem 0.6rem;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .library-link:hover {
    opacity: 0.7;
  }

  .book-wrap {
    width: 100%;
    max-width: 72rem;
    margin-top: 2.4rem; /* BookShell pulls itself up 2.4rem */
  }

  /* Out of the document flow: mounting/unmounting the controls must never
     reflow the centered column and bob the book vertically. */
  .narration-dock {
    position: fixed;
    bottom: 1.1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 45;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
  }

  .voice-resting {
    font-family: 'EB Garamond', Georgia, serif;
    font-style: italic;
    font-size: 0.9rem;
    color: #8b6914;
    background: rgba(254, 252, 247, 0.94);
    border: 1px solid #dfc9a4;
    border-radius: 0.5rem;
    padding: 0.25rem 0.7rem;
    margin: 0;
  }

  /* Closed-book state: the cover stands at the leather FRAME's footprint,
     not the inner page box — the boards of a closed book are the frame.
     Same treatment as the diary (shell is 93% of the frame). Requires the
     cover-state page's overflow:visible (Spread.svelte, ho-04 C). */
  .cover-bleed {
    position: absolute;
    left: 0;
    right: 0;
    top: -3.7634%;
    bottom: -3.7634%;
  }

  /* Provisional leather board — layered gradients standing in for cover art
     until the practitioner's design pass. Spine shading at the left edge,
     tooled double border, gold-leaf title. */
  .placeholder-cover {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background:
      linear-gradient(to right, rgba(0, 0, 0, 0.35) 0%, rgba(0, 0, 0, 0.12) 4%, transparent 9%),
      radial-gradient(ellipse at 30% 25%, rgba(255, 225, 180, 0.10) 0%, transparent 55%),
      radial-gradient(ellipse at 70% 80%, rgba(0, 0, 0, 0.22) 0%, transparent 60%),
      linear-gradient(135deg, #6b4a30 0%, #57381f 45%, #4a2e18 100%);
    border-radius: 4px 10px 10px 4px;
    box-shadow:
      inset 0 0 0 6px rgba(0, 0, 0, 0.18),
      inset 0 0 0 7px rgba(228, 197, 144, 0.28),
      inset 0 0 0 14px rgba(0, 0, 0, 0.10),
      inset 0 0 60px rgba(0, 0, 0, 0.35),
      0 20px 60px rgba(0, 0, 0, 0.45),
      0 6px 18px rgba(0, 0, 0, 0.3);
    color: #e9d6a3;
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 6.5cqw;
    letter-spacing: 0.14em;
    text-shadow:
      0 1px 0 rgba(0, 0, 0, 0.55),
      0 0 12px rgba(255, 220, 150, 0.18);
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
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 17px;
    line-height: 1.65;
    color: #3b2f1e;
  }

  .page-plain {
    flex: 1;
    overflow: hidden;
    font-family: 'EB Garamond', Georgia, serif;
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
    font-size: 2.4rem;
    font-weight: 500;
    letter-spacing: 0.06em;
    color: #4a2e18;
  }

  .title-author {
    margin-top: 1rem;
    font-style: italic;
    color: #6e5a3c;
  }

  .library-page h2 {
    font-size: 1.15rem;
    font-style: italic;
    font-weight: 500;
    color: #6e5a3c;
    margin-bottom: 1.2rem;
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
    font-size: 1.05rem;
    text-align: left;
    background: transparent;
    border: none;
    padding: 0.25rem 0;
    cursor: pointer;
    color: #3b2f1e;
    border-bottom: 1px solid #c8b888;
    width: 100%;
    transition: color 0.15s;
  }

  .library-item:hover {
    color: #8b6914;
  }

  .library-item.is-active {
    font-weight: 700;
  }

  .library-empty {
    font-style: italic;
    color: #6e5a3c;
  }
</style>
