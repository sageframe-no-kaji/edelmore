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
 */
import { BookShell, Spread } from '@edelmore/book';
import ChapterMeasurer from '$lib/components/ChapterMeasurer.svelte';
import PageView from '$lib/components/PageView.svelte';
import type { EmphasisRange } from '$lib/epub/model.js';
import { spreadCount, spreadSlices } from '$lib/pagination.js';
import type { PageData } from './$types';

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
  const firstText = Math.max(
    0,
    b.chapters.findIndex((c) => c.text.length > 0)
  );
  chapterIdx = firstText;
  spread = 0;
  // Measure the opening chapter first and paint it immediately; the rest
  // paginate one per macrotask so the main thread (and first paint) is never
  // blocked — dev-mode measurement runs ~1-2s per chapter, and a synchronous
  // all-chapters loop froze the page for the whole book.
  const order = [firstText, ...b.chapters.map((_, i) => i).filter((i) => i !== firstText)];
  let cancelled = false;
  void (async () => {
    for (const i of order) {
      if (cancelled) return;
      const chapter = b.chapters[i];
      const t0 = performance.now();
      chapterSplits[i] = m.paginate(ref, chapter.text, chapter.emphasis);
      console.debug(
        `[dev/book] chapter ${chapter.idx} (${chapter.text.length} chars) paginated in ${Math.round(performance.now() - t0)}ms`
      );
      await new Promise((r) => setTimeout(r, 0));
    }
  })();
  return () => {
    cancelled = true;
  };
});

const chapter = $derived(book.chapters[chapterIdx]);
const splits = $derived(chapterSplits[chapterIdx] ?? []);
const count = $derived(spreadCount(splits));
const slices = $derived(spreadSlices(splits, spread, chapter?.text.length ?? 0));
const canPrev = $derived(spread > 0 || chapterIdx > 0);
const canNext = $derived(spread < count - 1 || chapterIdx < book.chapters.length - 1);

// Char-based progress for the shell's page-stack thickness.
const totalChars = $derived(book.chapters.reduce((n, c) => n + c.text.length, 0));
const charsBefore = $derived(
  book.chapters.slice(0, chapterIdx).reduce((n, c) => n + c.text.length, 0) + slices.leftStart
);
const progress = $derived(totalChars === 0 ? 0 : charsBefore / totalChars);

async function flipNext(): Promise<void> {
  if (!canNext) return;
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
        onFlipPrev={flipPrev}
        onFlipNext={flipNext}
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
                />
              {/if}
            </div>
          </div>
        {/snippet}
      </Spread>
    </BookShell>
  </div>
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
