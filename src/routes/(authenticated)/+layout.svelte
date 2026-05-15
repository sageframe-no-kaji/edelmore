<script lang="ts">
import { goto } from '$app/navigation';
import { page } from '$app/stores';
import Spread from '$lib/components/Spread.svelte';
import TocPage from '$lib/components/TocPage.svelte';
import type { EntryDatePreview } from '$lib/db.js';
import { findSplitIndex, fixWidowOrphan, snapToWordBreak } from '$lib/overflow.js';
import type { Snippet } from 'svelte';
import { onMount, untrack } from 'svelte';

type SpreadState = { kind: 'cover' } | { kind: 'toc' } | { kind: 'entry'; date: string };

const { children }: { children: Snippet } = $props();

let spreadState: SpreadState = $state(
  untrack(() =>
    $page.params.date
      ? { kind: 'entry' as const, date: $page.params.date }
      : { kind: 'cover' as const }
  )
);
// biome-ignore lint/suspicious/noExplicitAny: layout has no type access to child page data
let content = $state(untrack(() => ($page.data as any).content ?? ''));
// biome-ignore lint/suspicious/noExplicitAny: layout has no type access to child page data
let serverContent = untrack(() => ($page.data as any).content ?? '');
let saved = $state(false);
// biome-ignore lint/suspicious/noExplicitAny: layout has no type access to child page data
let prevDate: string | null = $state(untrack(() => ($page.data as any).prevDate ?? null));
// biome-ignore lint/suspicious/noExplicitAny: layout has no type access to child page data
let nextDate: string | null = $state(untrack(() => ($page.data as any).nextDate ?? null));
let entryDatePreviews: EntryDatePreview[] = $state(
  // biome-ignore lint/suspicious/noExplicitAny: layout has no type access to child page data
  untrack(() => ($page.data as any).entryDatePreviews ?? [])
);

// Sync when SvelteKit navigates to a new [date] route.
$effect(() => {
  const date = $page.params.date;
  // biome-ignore lint/suspicious/noExplicitAny: layout has no type access to child page data
  const d = $page.data as any;
  untrack(() => {
    if (date) {
      spreadState = { kind: 'entry', date };
      content = d.content ?? '';
      serverContent = d.content ?? '';
      prevDate = d.prevDate ?? null;
      nextDate = d.nextDate ?? null;
      entryDatePreviews = d.entryDatePreviews ?? [];
    }
  });
});

// Autosave — fires only when content differs from what the server has.
$effect(() => {
  const c = content;
  if (c === serverContent) return;
  const date = spreadState.kind === 'entry' ? spreadState.date : null;
  if (!date) return;
  const timer = setTimeout(async () => {
    /* v8 ignore next 8 */
    await fetch('/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, content: c }),
    });
    serverContent = c;
    saved = true;
    setTimeout(() => {
      saved = false;
    }, 1000);
  }, 1500);
  return () => clearTimeout(timer);
});

async function navigateTo(date: string) {
  /* v8 ignore next 7 */
  const res = await fetch(`/api/entries/${date}`);
  if (res.ok) {
    const data = await res.json();
    content = data.content;
    serverContent = data.content;
  }
  await goto(`/${date}`);
}

function onFlipNext() {
  if (spreadState.kind === 'cover') {
    spreadState = { kind: 'toc' };
  } else if (spreadState.kind === 'toc') {
    if (entryDatePreviews.length > 0) {
      navigateTo(entryDatePreviews[0].entry_date);
    }
  } else if (spreadState.kind === 'entry') {
    if (entryPageSpread < entrySpreadCount - 1) {
      entryPageSpread += 1;
    } else if (nextDate) {
      navigateTo(nextDate);
    }
  }
}

function onFlipPrev() {
  if (spreadState.kind === 'entry') {
    if (entryPageSpread > 0) {
      entryPageSpread -= 1;
    } else if (prevDate) {
      navigateTo(prevDate);
    } else {
      spreadState = { kind: 'toc' };
    }
  } else if (spreadState.kind === 'toc') {
    spreadState = { kind: 'cover' };
  }
}

const canFlipPrev = $derived(spreadState.kind !== 'cover');
function computeCanFlipNext(): boolean {
  if (spreadState.kind === 'cover') return true;
  if (spreadState.kind === 'toc') return entryDatePreviews.length > 0;
  return entryPageSpread < entrySpreadCount - 1 || nextDate !== null;
}
const canFlipNext = $derived(computeCanFlipNext());

function getSpreadIndex(): number {
  if (spreadState.kind === 'cover') return 0;
  if (spreadState.kind === 'toc') return 1;
  const idx = entryDatePreviews.findIndex(
    (e) =>
      spreadState.kind === 'entry' &&
      e.entry_date === (spreadState as { kind: 'entry'; date: string }).date
  );
  return idx >= 0 ? idx + 2 : 2;
}
const spreadIndex = $derived(getSpreadIndex());
const spreadCount = $derived(entryDatePreviews.length + 2);
// Primitive value — only changes when the actual date changes, not on same-date object reassignment.
const entryDate = $derived(spreadState.kind === 'entry' ? spreadState.date : null);

let splitPoints: number[] = $state([]);
let entryPageSpread = $state(0);
// biome-ignore lint/style/useConst: bind:this requires let
let textareaEl: HTMLTextAreaElement | null = $state(null);
// biome-ignore lint/style/useConst: bind:this requires let
let rightTextareaEl: HTMLTextAreaElement | null = $state(null);
let measureEl: HTMLTextAreaElement | null = null;
let targetScrollTopLeft = $state(0);
let targetScrollTopRight = $state(0);

const entrySpreadCount = $derived(Math.floor(splitPoints.length / 2) + 1);
const hasMoreContent = $derived(entryPageSpread < entrySpreadCount - 1);

/* v8 ignore next 8 */
onMount(() => {
  measureEl = document.createElement('textarea');
  measureEl.style.cssText =
    'position:absolute;visibility:hidden;pointer-events:none;overflow:hidden;resize:none;top:-9999px;left:-9999px;';
  document.body.appendChild(measureEl);
  return () => measureEl?.remove();
});

// Reset split points and page when the entry date genuinely changes (not on same-date reassignment).
$effect(() => {
  void entryDate;
  untrack(() => {
    splitPoints = [];
    entryPageSpread = 0;
    targetScrollTopLeft = 0;
    targetScrollTopRight = 0;
  });
});

// Debounced multi-page split computation — runs when content changes.
$effect(() => {
  const c = content;
  /* v8 ignore next 46 */
  const timer = setTimeout(() => {
    if (!textareaEl || !measureEl || spreadState.kind !== 'entry') return;
    const style = getComputedStyle(textareaEl);
    measureEl.style.width = style.width;
    measureEl.style.height = style.height;
    measureEl.style.font = style.font;
    measureEl.style.lineHeight = style.lineHeight;
    measureEl.style.padding = style.padding;
    const maxH = textareaEl.clientHeight;
    const points: number[] = [];
    let offset = 0;
    // biome-ignore lint/style/noNonNullAssertion: guarded by null check above closure
    measureEl!.value = 'A';
    // biome-ignore lint/style/noNonNullAssertion: guarded by null check above closure
    const singleLineH = measureEl!.scrollHeight;
    const isSingleLine = (text: string): boolean => {
      // biome-ignore lint/style/noNonNullAssertion: guarded by null check above closure
      measureEl!.value = text;
      // biome-ignore lint/style/noNonNullAssertion: guarded by null check above closure
      return measureEl!.scrollHeight <= singleLineH * 1.2;
    };
    while (offset < c.length) {
      const remaining = c.slice(offset);
      // biome-ignore lint/style/noNonNullAssertion: guarded by null check above closure
      measureEl!.value = remaining;
      // biome-ignore lint/style/noNonNullAssertion: guarded by null check above closure
      if (measureEl!.scrollHeight <= maxH) break;
      const relSplit = findSplitIndex(remaining, (n) => {
        // biome-ignore lint/style/noNonNullAssertion: guarded by null check above closure
        measureEl!.value = remaining.slice(0, n);
        // biome-ignore lint/style/noNonNullAssertion: guarded by null check above closure
        return measureEl!.scrollHeight <= maxH;
      });
      if (relSplit === 0) break;
      const rawSplit = offset + relSplit;
      const snapped = snapToWordBreak(c, rawSplit);
      const preFix = snapped > offset ? snapped : rawSplit;
      const actualSplit = fixWidowOrphan(c, offset, preFix, isSingleLine);
      if (actualSplit <= offset) break;
      points.push(actualSplit);
      offset = actualSplit;
    }
    splitPoints = points;
    const newSpreadCount = Math.floor(points.length / 2) + 1;
    if (entryPageSpread >= newSpreadCount) entryPageSpread = newSpreadCount - 1;
  }, 300);
  return () => clearTimeout(timer);
});

// Recompute page scroll offsets when split points or spread index changes.
$effect(() => {
  const spread = entryPageSpread;
  const points = splitPoints;
  /* v8 ignore next 22 */
  untrack(() => {
    if (!measureEl || !textareaEl) return;
    const c = content;
    const style = getComputedStyle(textareaEl);
    measureEl.style.width = style.width;
    measureEl.style.height = style.height;
    measureEl.style.font = style.font;
    measureEl.style.lineHeight = style.lineHeight;
    measureEl.style.padding = style.padding;
    const leftStart = spread === 0 ? 0 : (points[spread * 2 - 1] ?? 0);
    // biome-ignore lint/style/noNonNullAssertion: guarded by null check above closure
    measureEl!.value = c.slice(0, leftStart);
    // biome-ignore lint/style/noNonNullAssertion: guarded by null check above closure
    targetScrollTopLeft = leftStart === 0 ? 0 : measureEl!.scrollHeight;
    const rightStart = points[spread * 2];
    if (rightStart !== undefined) {
      // biome-ignore lint/style/noNonNullAssertion: guarded by null check above closure
      measureEl!.value = c.slice(0, rightStart);
      // biome-ignore lint/style/noNonNullAssertion: guarded by null check above closure
      targetScrollTopRight = measureEl!.scrollHeight;
    }
  });
});

// Apply scroll positions to textarea elements when they change.
/* v8 ignore next 3 */
$effect(() => {
  if (textareaEl) textareaEl.scrollTop = targetScrollTopLeft;
});
/* v8 ignore next 3 */
$effect(() => {
  if (rightTextareaEl) rightTextareaEl.scrollTop = targetScrollTopRight;
});
</script>

<!-- Full-height book container -->
<div class="h-screen bg-stone-900 flex flex-col">

	<!-- Desktop: CSS 3D Spread -->
	<div class="hidden md:flex flex-1 items-center justify-center p-8">
		<div class="relative w-full max-w-5xl h-full max-h-[80vh]">
			<Spread
				{onFlipPrev}
				{onFlipNext}
				{canFlipPrev}
				{canFlipNext}
				{spreadIndex}
				{spreadCount}
			>
				{#snippet leftPage()}
					{#if spreadState.kind === 'entry'}
						<div class="h-full flex flex-col px-10 py-8 font-serif">
							<div class="text-xs text-stone-400 mb-4 tracking-wide uppercase">
								{($page.data as any).displayDate ?? ''}
							</div>
							<textarea
								bind:this={textareaEl}
								bind:value={content}
								onscroll={() => { if (textareaEl) textareaEl.scrollTop = targetScrollTopLeft; }}
								class="flex-1 w-full resize-none overflow-hidden bg-transparent text-ink-900 font-serif text-sm leading-relaxed outline-none"
								placeholder="Begin writing…"
							></textarea>
							{#if saved}
								<span class="text-xs text-stone-400 italic mt-2">Saved</span>
							{/if}
						</div>
					{/if}
				{/snippet}
				{#snippet rightPage()}
					{#if spreadState.kind === 'entry' && entryPageSpread * 2 < splitPoints.length}
						<div class="relative h-full flex flex-col px-10 py-8 font-serif">
							<textarea
								bind:this={rightTextareaEl}
								bind:value={content}
								onscroll={() => { if (rightTextareaEl) rightTextareaEl.scrollTop = targetScrollTopRight; }}
								class="flex-1 w-full resize-none overflow-hidden bg-transparent text-ink-900 font-serif text-sm leading-relaxed outline-none"
							></textarea>
							{#if hasMoreContent}
								<div class="absolute bottom-2 right-3 text-xs text-stone-400 italic pointer-events-none">→ continued</div>
							{/if}
						</div>
					{:else if spreadState.kind === 'toc'}
						<TocPage entries={entryDatePreviews} onNavigate={navigateTo} />
					{:else if spreadState.kind === 'cover'}
						<div class="h-full flex flex-col items-center justify-center font-serif text-stone-600">
							<p class="text-2xl tracking-widest">Edelmore Diary</p>
							<p class="text-xs mt-3 text-stone-400 tracking-wide uppercase">flip to open →</p>
						</div>
					{/if}
				{/snippet}
			</Spread>
		</div>
	</div>

	<!-- Mobile: single page with nav buttons -->
	<div class="md:hidden flex-1 flex flex-col bg-[#fdf6e3]">
		{#if spreadState.kind === 'entry'}
			<div class="flex items-center justify-between px-4 py-2 border-b border-stone-200">
				<button
					type="button"
					onclick={onFlipPrev}
					disabled={!canFlipPrev}
					class="text-sm text-stone-500 disabled:opacity-30"
				>← Prev</button>
				<span class="text-xs text-stone-400 font-serif">
					{($page.data as any).displayDate ?? ''}
				</span>
				<button
					type="button"
					onclick={onFlipNext}
					disabled={!canFlipNext}
					class="text-sm text-stone-500 disabled:opacity-30"
				>Next →</button>
			</div>
			<div class="flex-1 flex flex-col p-4">
				<textarea
					bind:value={content}
					class="flex-1 w-full resize-none bg-transparent font-serif text-sm leading-relaxed outline-none"
					placeholder="Begin writing…"
				></textarea>
				{#if saved}
					<span class="text-xs text-stone-400 italic mt-2">Saved</span>
				{/if}
			</div>
		{:else if spreadState.kind === 'toc'}
			<div class="flex items-center px-4 py-2 border-b border-stone-200">
				<button type="button" onclick={onFlipPrev} class="text-sm text-stone-500">← Back</button>
			</div>
			<TocPage entries={entryDatePreviews} onNavigate={navigateTo} />
		{:else}
			<div class="flex-1 flex flex-col items-center justify-center font-serif text-stone-600 bg-[#fdf6e3]">
				<p class="text-2xl tracking-widest">Edelmore Diary</p>
				<button type="button" onclick={onFlipNext} class="text-sm text-stone-400 mt-4 underline">
					Open →
				</button>
			</div>
		{/if}
	</div>

</div>

<!-- SvelteKit requires children to be rendered; content lives in the layout, not the page. -->
<div class="hidden">{@render children()}</div>
