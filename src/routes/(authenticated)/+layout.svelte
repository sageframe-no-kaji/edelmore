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
import { findSplitIndex, snapToWordBreak } from '$lib/overflow.js';
import type { Snippet } from 'svelte';
import { onMount, tick, untrack } from 'svelte';

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
// biome-ignore lint/suspicious/noExplicitAny: layout data merged into $page.data
const fontSizeCqw = $derived(($page.data as any).user?.font_size ?? 3.4);
// biome-ignore lint/suspicious/noExplicitAny: layout data merged into $page.data
const diaryTitle = $derived(($page.data as any).user?.diary_title ?? 'D I A R Y');

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
// Cover: whole right page (front cover) is the click target to open.
// TOC: whole left page (Ex Libris) clicks back to cover; narrow right margin clicks forward.
// Entry: narrow margin strips on both sides; text area in between is unobstructed.
const prevZonePct = $derived(spreadIndex === 0 ? 0 : spreadIndex === 1 ? 50 : 5);
const nextZonePct = $derived(spreadIndex === 0 ? 0 : 5);
const flipOverhangRem = $derived(spreadIndex === 0 ? 0 : 4);
const entryDate = $derived(spreadState.kind === 'entry' ? spreadState.date : null);
const entryDates = $derived(new Set(entryDatePreviews.map((e) => e.entry_date)));

// biome-ignore lint/style/useConst: $state requires let for mutation
let showCalendar = $state(false);

let splitPoints: number[] = $state([]);
let entryPageSpread = $state(0);
// biome-ignore lint/style/useConst: bind:this requires let
let textareaEl: HTMLTextAreaElement | null = $state(null);
// biome-ignore lint/style/useConst: bind:this requires let
let rightTextareaEl: HTMLTextAreaElement | null = $state(null);
let measureEl: HTMLTextAreaElement | null = null;
let pendingCursorRestore: { absPos: number; side: 'left' | 'right' } | null = null;

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
  });
});

$effect(() => {
  const c = content;
  /* v8 ignore next 28 */
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
      const actualSplit = snapped > offset ? snapped : rawSplit;
      points.push(actualSplit);
      offset = actualSplit;
    }
    splitPoints = points;
    const newSpreadCount = Math.floor(points.length / 2) + 1;
    if (entryPageSpread >= newSpreadCount) entryPageSpread = newSpreadCount - 1;
  }, 50);
  return () => clearTimeout(timer);
});

// Push new slices into the uncontrolled textareas when split boundaries change.
// Does NOT track `content` directly — avoids firing on every keystroke.
$effect(() => {
  const sp = splitPoints;
  const spread = entryPageSpread;
  const restore = pendingCursorRestore;
  pendingCursorRestore = null;
  const c = untrack(() => content);
  tick().then(() => {
    if (textareaEl) {
      const ls = spread === 0 ? 0 : (sp[spread * 2 - 1] ?? 0);
      const le = sp[spread * 2];
      textareaEl.value = c.slice(ls, le);
      if (restore?.side === 'left') {
        const localPos = Math.max(0, Math.min(restore.absPos - ls, textareaEl.value.length));
        textareaEl.setSelectionRange(localPos, localPos);
      }
    }
    if (rightTextareaEl) {
      const rs = sp[spread * 2];
      const re = sp[spread * 2 + 1];
      rightTextareaEl.value = c.slice(rs, re);
      if (restore?.side === 'right') {
        const localPos = Math.max(0, Math.min(restore.absPos - rs, rightTextareaEl.value.length));
        rightTextareaEl.setSelectionRange(localPos, localPos);
      }
    }
  });
});
</script>

<!-- Full-height book container -->
<div class="h-screen flex flex-col" style="background-image: url('/background.png'); background-repeat: repeat; background-size: auto;">

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
		<div class="relative w-full max-w-5xl aspect-[3/2] max-h-[80vh]" style="--page-font-size: {fontSizeCqw}cqw">
			<Spread
				{onFlipPrev}
				{onFlipNext}
				{canFlipPrev}
				{canFlipNext}
				{spreadIndex}
				{spreadCount}
				{prevZonePct}
				{nextZonePct}
				overhangRem={flipOverhangRem}
				hideLeftPage={spreadState.kind === 'cover'}
			>
				{#snippet leftPage()}
					{#if spreadState.kind === 'cover'}
						<!-- blank — front cover is the only thing visible on this spread -->
					{:else if spreadState.kind === 'toc'}
						<ExLibrisPage username={username} />
					{:else if spreadState.kind === 'entry'}
						{@const leftStart = entryPageSpread === 0 ? 0 : (splitPoints[entryPageSpread * 2 - 1] ?? 0)}
						{@const leftEnd = splitPoints[entryPageSpread * 2]}
						<div class="relative h-full">
							<button
								type="button"
								onclick={() => { showCalendar = true; }}
								class="absolute top-5 left-8 z-10 text-xs text-stone-400 tracking-wide uppercase hover:text-ornament-gold transition-colors"
								aria-label="Open calendar"
							>{($page.data as any).displayDate ?? ''}</button>
							<textarea
								bind:this={textareaEl}
								oninput={(e) => {
									pendingCursorRestore = { absPos: leftStart + e.currentTarget.selectionStart, side: 'left' };
									const suffix = leftEnd !== undefined ? content.slice(leftEnd) : '';
									content = content.slice(0, leftStart) + e.currentTarget.value + suffix;
								}}
								class="absolute inset-0 w-full resize-none overflow-hidden px-8 pt-12 pb-8 bg-transparent text-ink-900 font-serif leading-relaxed outline-none"
								style="font-size: var(--page-font-size)"
								placeholder="Begin writing…"
							></textarea>
							{#if saved}
								<span class="absolute bottom-2 left-8 z-10 text-xs text-stone-400 italic pointer-events-none">Saved</span>
							{/if}
						</div>
					{/if}
				{/snippet}
				{#snippet rightPage()}
					{#if spreadState.kind === 'entry'}
						<!-- TOC link — center top of right page, sits within the pt-12 top margin -->
						<button
							type="button"
							onclick={() => { spreadState = { kind: 'toc' }; }}
							class="absolute top-5 left-1/2 -translate-x-1/2 z-10 text-xs text-stone-400 tracking-wide uppercase hover:text-ornament-gold transition-colors"
						>TOC</button>
						{@const rightStart = splitPoints[entryPageSpread * 2]}
						{@const rightEnd = splitPoints[entryPageSpread * 2 + 1]}
						{#if rightStart !== undefined}
							<textarea
								bind:this={rightTextareaEl}
								oninput={(e) => {
									pendingCursorRestore = { absPos: rightStart + e.currentTarget.selectionStart, side: 'right' };
									const suffix = rightEnd !== undefined ? content.slice(rightEnd) : '';
									content = content.slice(0, rightStart) + e.currentTarget.value + suffix;
								}}
								class="absolute inset-0 w-full resize-none overflow-hidden px-8 pt-12 pb-8 bg-transparent text-ink-900 font-serif leading-relaxed outline-none"
								style="font-size: var(--page-font-size)"
							></textarea>
							{#if hasMoreContent}
								<div class="absolute bottom-2 right-3 text-xs text-stone-400 italic pointer-events-none">→ continued</div>
							{/if}
						{/if}
					{:else if spreadState.kind === 'toc'}
						<TocPage entries={entryDatePreviews} onNavigate={navigateTo} />
					{:else if spreadState.kind === 'cover'}
						<div role="presentation" class="h-full w-full cursor-pointer" onclick={onFlipNext}>
							<CoverPage config={activeCover} {username} {diaryTitle} showSettings={true} />
						</div>
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
				<CoverPage config={activeCover} {username} {diaryTitle} showSettings={true} />
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
