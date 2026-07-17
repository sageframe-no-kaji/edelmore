<script lang="ts">
/**
 * Dev-only pagination testbed: pages a stored book through BookShell/Spread
 * with working flips, chapter→chapter continuation included. Deliberately
 * unstyled beyond legible parchment — this is the mechanical substrate the
 * practitioner builds the real book UI on. No cover art, no ribbon, no
 * transform, no narration.
 *
 * Known testbed limits (deliberate): split points are computed once per
 * chapter at mount and not recomputed on window resize; all chapters are
 * paginated up front (per-chapter timings land in the console via
 * console.debug), so every flip afterwards only slices cached splitPoints.
 *
 * R-AT-06 adds the headless narration engine on top of this substrate: plain
 * unstyled controls (NarrationControls) drive createNarrationEngine, which
 * highlights words in PageView and flips the spread when the highlight crosses
 * the current spread's end. The real ribbon replaces these controls later.
 */
import { BookShell, Spread } from '@edelmore/book';
import ChapterMeasurer from '$lib/components/ChapterMeasurer.svelte';
import NarrationControls from '$lib/components/NarrationControls.svelte';
import PageView from '$lib/components/PageView.svelte';
import type { EmphasisRange } from '$lib/epub/model.js';
import {
  createNarrationEngine,
  type NarrationEngine,
  type NarrationPhase,
} from '$lib/narration-engine.js';
import { spreadCount, spreadSlices } from '$lib/pagination.js';
import { openingChapter, paginateBook } from '$lib/use-pagination.js';
import type { PageData } from './$types';

const DEFAULT_VOICE = 'bf_emma';

const { data }: { data: PageData } = $props();
const book = $derived(data.book);

// Structural type for the package component instances — diary layout idiom.
// biome-ignore lint/style/useConst: bind:this requires let
let shell: {
  flip: (
    direction: 'forward' | 'backward',
    mutate: () => void | Promise<void>
  ) => Promise<void>;
} | null = $state(null);
// biome-ignore lint/style/useConst: bind:this requires let
let measurer: {
  paginate: (referenceEl: HTMLElement, text: string, emphasis: EmphasisRange[]) => number[];
} | null = $state(null);
// biome-ignore lint/style/useConst: bind:this requires let
let referenceEl: HTMLDivElement | undefined = $state();

let chapterIdx = $state(0);
let spread = $state(0);
// Missing entry = not measured yet; the page renders (overflowing, clipped)
// meanwhile, which is exactly the live layout the measurer copies its metrics
// from.
let chapterSplits = $state<number[][]>([]);

$effect(() => {
  const m = measurer;
  const ref = referenceEl;
  const b = book;
  if (!m || !ref || b.chapters.length === 0) return;
  // Open on the first chapter that has text — cover-image-only spine entries
  // (0 chars) render blank and make the book look broken as an opening state.
  chapterIdx = openingChapter(b.chapters);
  spread = 0;
  // Measure-once-cache-splits: opening chapter first (painted immediately), the
  // rest one per macrotask so first paint is never blocked. Shared with the
  // real book route via $lib/use-pagination.
  return paginateBook({
    book: b,
    measurer: m,
    referenceEl: ref,
    onSplits: (i, points) => {
      chapterSplits[i] = points;
    },
    log: (msg) => console.debug(msg),
  });
});

const chapter = $derived(book.chapters[chapterIdx]);
const splits = $derived(chapterSplits[chapterIdx] ?? []);
const count = $derived(spreadCount(splits));
const slices = $derived(spreadSlices(splits, spread, chapter?.text.length ?? 0));
const canPrev = $derived(spread > 0 || chapterIdx > 0);
const canNext = $derived(spread < count - 1 || chapterIdx < book.chapters.length - 1);

// ── Narration engine ───────────────────────────────────────────────────────
//
// The headless engine narrates the CURRENT chapter from the current spread's
// start to the chapter end in one stream (whole-chapter model). Its callbacks
// push into $state so the template reacts; the engine holds no Svelte state.
let narrationPhase = $state<NarrationPhase>('idle');
let narrationRate = $state(1.0);
// Chapter-absolute char index of the currently narrated word (null = none).
let currentCharIndex = $state<number | null>(null);
// Guards the manual-flip-stops-narration rule: a flip the engine itself
// requested at a spread boundary must NOT stop the audio, whereas a flip the
// reader initiates (zone tap, arrow key) must. Set true only for the duration
// of an engine-initiated flip.
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
    narrationPhase = p;
    if (p === 'idle') currentCharIndex = null;
  },
  onWordHighlight: (absCharIndex) => {
    currentCharIndex = absCharIndex;
  },
  onPageBoundaryReached: () => {
    // Consumer of the highlight timeline: flip forward without stopping audio.
    // fromNarration=true suppresses the manual-flip stop.
    narrationFlip = true;
    void flipNext(true).finally(() => {
      narrationFlip = false;
    });
  },
});

// Keep the engine's page-boundary target aligned with the visible spread. The
// boundary fires when the highlight crosses the current spread's end offset
// (splitPoints[2*spread+1]); on the last spread of a chapter there is no next
// spread, so the target is null (no flip — the chapter simply ends).
$effect(() => {
  const isLastSpread = spread >= count - 1;
  engine.setPageEndOffset(isLastSpread ? null : (splits[spread * 2 + 1] ?? null));
});

function startNarration(): void {
  if (!chapter) return;
  // Whole-chapter model: from the current spread's start to the chapter end.
  void engine.play(chapter.text, slices.leftStart);
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
// turn) belongs to the ribbon ho, not this testbed.

// Char-based progress for the shell's page-stack thickness.
const totalChars = $derived(book.chapters.reduce((n, c) => n + c.text.length, 0));
const charsBefore = $derived(
  book.chapters.slice(0, chapterIdx).reduce((n, c) => n + c.text.length, 0) + slices.leftStart
);
const progress = $derived(totalChars === 0 ? 0 : charsBefore / totalChars);

// A flip the reader initiates stops narration; a flip the engine requested at a
// spread boundary (fromNarration=true) does not — the audio rolls on across the
// page turn. narrationFlip covers the engine path even for callers that pass no
// argument (e.g. the Spread component's onFlipNext).
function stopNarrationOnManualFlip(fromNarration: boolean): void {
  if (fromNarration || narrationFlip) return;
  if (engine.getPhase() !== 'idle') engine.stop();
}

async function flipNext(fromNarration = false): Promise<void> {
  if (!canNext) return;
  stopNarrationOnManualFlip(fromNarration);
  const mutate = () => {
    if (spread < count - 1) {
      spread += 1;
    } else {
      chapterIdx += 1;
      spread = 0;
    }
  };
  if (shell) await shell.flip('forward', mutate);
  else mutate();
}

async function flipPrev(): Promise<void> {
  if (!canPrev) return;
  // Backward is only ever reader-initiated (the engine never flips back).
  stopNarrationOnManualFlip(false);
  const mutate = () => {
    if (spread > 0) {
      spread -= 1;
    } else {
      const prevIdx = chapterIdx - 1;
      chapterIdx = prevIdx;
      spread = spreadCount(chapterSplits[prevIdx] ?? []) - 1;
    }
  };
  if (shell) await shell.flip('backward', mutate);
  else mutate();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowRight') void flipNext();
  else if (event.key === 'ArrowLeft') void flipPrev();
}
</script>

<svelte:head>
  <title>{book.title || 'Edelmore'} — pagination testbed</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<main class="dev-main">
  <p class="dev-status">
    {book.title}{book.author ? ` — ${book.author}` : ''}
    · chapter {chapterIdx + 1}/{book.chapters.length}
    · spread {spread + 1}/{count}
    {chapterSplits[chapterIdx] ? '' : '· measuring…'}
  </p>
  <div class="book-wrap">
    <BookShell bind:this={shell} {progress}>
      <Spread
        onFlipPrev={() => flipPrev()}
        onFlipNext={() => flipNext()}
        canFlipPrev={canPrev}
        canFlipNext={canNext}
        spreadIndex={spread}
        spreadCount={count}
        prevZonePct={12}
        nextZonePct={12}
      >
        {#snippet leftPage()}
          <div class="page-pad">
            <div class="page-body" bind:this={referenceEl}>
              {#if chapter}
                <PageView
                  text={chapter.text.slice(slices.leftStart, slices.leftEnd)}
                  sliceStart={slices.leftStart}
                  emphasis={chapter.emphasis}
                  {currentCharIndex}
                />
              {/if}
            </div>
          </div>
        {/snippet}
        {#snippet rightPage()}
          <div class="page-pad">
            <div class="page-body">
              {#if chapter}
                <PageView
                  text={chapter.text.slice(slices.rightStart, slices.rightEnd)}
                  sliceStart={slices.rightStart}
                  emphasis={chapter.emphasis}
                  {currentCharIndex}
                />
              {/if}
            </div>
          </div>
        {/snippet}
      </Spread>
    </BookShell>
  </div>
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
  <ChapterMeasurer bind:this={measurer} />
</main>

<style>
  /* Mechanics testbed: dim backdrop so the parchment spread reads, monospace
     status line for debugging. No design work here — practitioner territory. */
  .dev-main {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.5rem;
    background: #3a3128;
    padding: 2rem;
  }

  .dev-status {
    color: #e8ddb5;
    font-family: monospace;
    font-size: 0.8rem;
  }

  .book-wrap {
    width: 100%;
    max-width: 72rem;
    /* BookShell pulls itself up 2.4rem (translateY); keep it off the status line. */
    margin-top: 2.4rem;
  }

  /* Padding lives on this wrapper, NOT on .page-body: the measurer copies
     .page-body's metrics and a padding-free box keeps its scrollHeight vs
     clientHeight comparison exact (see ChapterMeasurer). */
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
</style>
