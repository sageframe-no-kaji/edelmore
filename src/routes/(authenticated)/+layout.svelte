<script lang="ts">
import { goto } from '$app/navigation';
import { page } from '$app/stores';
import CalendarModal from '$lib/components/CalendarModal.svelte';
import CoverPage from '$lib/components/CoverPage.svelte';
import ExLibrisPage from '$lib/components/ExLibrisPage.svelte';
import Spread from '$lib/components/Spread.svelte';
import TocPage from '$lib/components/TocPage.svelte';
import { findCover } from '$lib/covers.js';
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

// Active cover — derived from the layout-level user data.
// biome-ignore lint/suspicious/noExplicitAny: layout data merged into $page.data
const coverId = $derived(($page.data as any).user?.cover_id ?? 'meadow');
const activeCover = $derived(findCover(coverId));
// biome-ignore lint/suspicious/noExplicitAny: layout data merged into $page.data
const username = $derived(($page.data as any).user?.username ?? '');

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

// --- Cascade flip state ---
let flipDuration = $state(500);
let cascadeRemaining = $state(0);
let cascadeTargetDate = $state<string | null>(null);
let flipTrigger = $state(0);
let flipTriggerDir = $state<'next' | 'prev'>('next');

async function doNavigateTo(date: string) {
  /* v8 ignore next 7 */
  const res = await fetch(`/api/entries/${date}`);
  if (res.ok) {
    const data = await res.json();
    content = data.content;
    serverContent = data.content;
  }
  await goto(`/${date}`);
}

async function navigateTo(date: string) {
  const targetIdx = entryDatePreviews.findIndex((e) => e.entry_date === date);
  // +2: cover (0) + toc (1) + entry spreads
  const targetSpreadIdx = targetIdx >= 0 ? targetIdx + 2 : 2;
  const delta = targetSpreadIdx - spreadIndex;

  if (Math.abs(delta) <= 1) {
    /* v8 ignore next */
    await doNavigateTo(date);
    return;
  }

  // Cascade: animate through intermediate pages, capped at ~1.5s total.
  const steps = Math.min(Math.abs(delta) - 1, 18);
  cascadeRemaining = steps;
  cascadeTargetDate = date;
  flipTriggerDir = delta > 0 ? 'next' : 'prev';
  flipDuration = 80;
  /* v8 ignore next */
  flipTrigger += 1;
}

function onFlipNext() {
  if (cascadeRemaining > 0) {
    cascadeRemaining--;
    if (cascadeRemaining === 0) {
      flipDuration = 500;
      const target = cascadeTargetDate ?? '/';
      cascadeTargetDate = null;
      /* v8 ignore next */
      doNavigateTo(target);
    } else {
      /* v8 ignore next */
      flipTrigger += 1;
    }
    return;
  }

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
  if (cascadeRemaining > 0) {
    cascadeRemaining--;
    if (cascadeRemaining === 0) {
      flipDuration = 500;
      const target = cascadeTargetDate ?? '/';
      cascadeTargetDate = null;
      /* v8 ignore next */
      doNavigateTo(target);
    } else {
      /* v8 ignore next */
      flipTrigger += 1;
    }
    return;
  }

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
// Cover: whole right page clickable. TOC: whole left page clickable.
// Entry: no click zones — keyboard (arrow keys) and swipe only.
const prevZonePct = $derived(spreadIndex === 1 ? 50 : 0);
const nextZonePct = $derived(spreadIndex === 0 ? 50 : 0);
const entryDate = $derived(spreadState.kind === 'entry' ? spreadState.date : null);
const entryDates = $derived(new Set(entryDatePreviews.map((e) => e.entry_date)));

// biome-ignore lint/style/useConst: $state requires let for mutation
let showCalendar = $state(false);

let splitPoints: number[] = $state([]);
let entryPageSpread = $state(0);
// biome-ignore lint/style/useConst: bind:this requires let
let textareaEl: HTMLTextAreaElement | null = $state(null);
let measureEl: HTMLTextAreaElement | null = null;
let targetScrollTopLeft = $state(0);

const entrySpreadCount = $derived(Math.floor(splitPoints.length / 2) + 1);
const hasMoreContent = $derived(entryPageSpread < entrySpreadCount - 1);

/* v8 ignore next 18 */
onMount(() => {
  measureEl = document.createElement('textarea');
  measureEl.style.cssText =
    'position:absolute;visibility:hidden;pointer-events:none;overflow:hidden;resize:none;top:-9999px;left:-9999px;';
  document.body.appendChild(measureEl);

  function onKeyDown(e: KeyboardEvent) {
    const tag = (document.activeElement as HTMLElement)?.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') return;
    if (e.key === 'ArrowRight' && canFlipNext) {
      e.preventDefault();
      onFlipNext();
    }
    if (e.key === 'ArrowLeft' && canFlipPrev) {
      e.preventDefault();
      onFlipPrev();
    }
  }
  window.addEventListener('keydown', onKeyDown);

  return () => {
    measureEl?.remove();
    window.removeEventListener('keydown', onKeyDown);
  };
});

$effect(() => {
  void entryDate;
  untrack(() => {
    splitPoints = [];
    entryPageSpread = 0;
    targetScrollTopLeft = 0;
  });
});

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

$effect(() => {
  const spread = entryPageSpread;
  const points = splitPoints;
  /* v8 ignore next 16 */
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
  });
});

/* v8 ignore next 3 */
$effect(() => {
  if (textareaEl) textareaEl.scrollTop = targetScrollTopLeft;
});
</script>

<!-- Full-height book container -->
<div class="h-screen bg-stone-900 flex flex-col">

	<!-- Desktop: CSS 3D Spread -->
	<div
		role="presentation"
		class="hidden md:flex flex-1 items-center justify-center p-8"
		ontouchstart={(e) => { (e.currentTarget as HTMLElement).dataset.touchX = String(e.touches[0].clientX); }}
		ontouchend={(e) => {
			const startX = Number((e.currentTarget as HTMLElement).dataset.touchX ?? 0);
			const delta = e.changedTouches[0].clientX - startX;
			if (Math.abs(delta) > 50) { if (delta < 0 && canFlipNext) onFlipNext(); else if (delta > 0 && canFlipPrev) onFlipPrev(); }
		}}
	>
		<div class="relative w-full max-w-5xl h-full max-h-[80vh]">
			<Spread
				{onFlipPrev}
				{onFlipNext}
				{canFlipPrev}
				{canFlipNext}
				{spreadIndex}
				{spreadCount}
				{flipDuration}
				{flipTrigger}
				{flipTriggerDir}
				{prevZonePct}
				{nextZonePct}
			>
				{#snippet leftPage()}
					{#if spreadState.kind === 'cover'}
						<CoverPage config={activeCover} username="" showTitle={false} showSettings={false} />
					{:else if spreadState.kind === 'toc'}
						<ExLibrisPage username={username} />
					{:else if spreadState.kind === 'entry'}
						<div class="h-full flex flex-col px-8 pt-5 pb-4 font-serif">
							<button
								type="button"
								onclick={() => { showCalendar = true; }}
								class="text-xs text-stone-400 mb-3 tracking-wide uppercase hover:text-ornament-gold transition-colors text-left shrink-0"
								aria-label="Open calendar"
							>
								{($page.data as any).displayDate ?? ''}
							</button>
							<textarea
								bind:this={textareaEl}
								bind:value={content}
								onscroll={() => { if (textareaEl) textareaEl.scrollTop = targetScrollTopLeft; }}
								class="flex-1 w-full resize-none overflow-hidden bg-transparent text-ink-900 font-serif text-sm leading-relaxed outline-none"
								placeholder="Begin writing…"
							></textarea>
							{#if saved}
								<span class="text-xs text-stone-400 italic mt-1 shrink-0">Saved</span>
							{/if}
						</div>
					{/if}
				{/snippet}
				{#snippet rightPage()}
					{#if spreadState.kind === 'entry'}
						{@const rightStart = splitPoints[entryPageSpread * 2]}
						{#if rightStart !== undefined}
							<div class="absolute inset-0 overflow-hidden px-8 pt-5 pb-4 font-serif text-sm leading-relaxed text-ink-900">
								<p class="whitespace-pre-wrap m-0">{content.slice(rightStart)}</p>
								{#if hasMoreContent}
									<div class="absolute bottom-2 right-3 text-xs text-stone-400 italic pointer-events-none">→ continued</div>
								{/if}
							</div>
						{/if}
					{:else if spreadState.kind === 'toc'}
						<TocPage entries={entryDatePreviews} onNavigate={navigateTo} />
					{:else if spreadState.kind === 'cover'}
						<CoverPage config={activeCover} {username} showSettings={true} />
					{/if}
				{/snippet}
			</Spread>
		</div>
	</div>

	<!-- Mobile: single page with nav buttons -->
	<div
		role="presentation"
		class="md:hidden flex-1 flex flex-col bg-[#fdf6e3]"
		ontouchstart={(e) => { (e.currentTarget as HTMLElement).dataset.touchX = String(e.touches[0].clientX); }}
		ontouchend={(e) => {
			const startX = Number((e.currentTarget as HTMLElement).dataset.touchX ?? 0);
			const delta = e.changedTouches[0].clientX - startX;
			if (Math.abs(delta) > 50) { if (delta < 0 && canFlipNext) onFlipNext(); else if (delta > 0 && canFlipPrev) onFlipPrev(); }
		}}
	>
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
			<div class="flex-1 flex flex-col bg-[#fdf6e3] overflow-hidden">
				<CoverPage config={activeCover} {username} showSettings={true} />
			</div>
		{/if}
	</div>

	{#if showCalendar && spreadState.kind === 'entry'}
		<CalendarModal
			{entryDates}
			currentDate={spreadState.date}
			onClose={() => { showCalendar = false; }}
			onNavigate={navigateTo}
		/>
	{/if}
</div>

<!-- SvelteKit requires children to be rendered; content lives in the layout, not the page. -->
<div class="hidden">{@render children()}</div>
