<script lang="ts">
import { enhance } from '$app/forms';
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

type SpreadState =
  | { kind: 'cover' }
  | { kind: 'toc' }
  | { kind: 'entry'; date: string }
  | { kind: 'settings' };

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

function openSettings() {
  prevSpreadState = spreadState;
  spreadState = { kind: 'settings' };
}

function closeSettings() {
  spreadState = prevSpreadState ?? { kind: 'cover' };
  prevSpreadState = null;
}

function computeCanFlipPrev(): boolean {
  return spreadState.kind !== 'cover' && spreadState.kind !== 'settings';
}
const canFlipPrev = $derived(computeCanFlipPrev());
function computeCanFlipNext(): boolean {
  if (spreadState.kind === 'cover') return true;
  if (spreadState.kind === 'toc') return entryDatePreviews.length > 0;
  if (spreadState.kind === 'settings') return false;
  return entryPageSpread < entrySpreadCount - 1 || nextDate !== null;
}
const canFlipNext = $derived(computeCanFlipNext());

function getSpreadIndex(): number {
  if (spreadState.kind === 'cover') return 0;
  if (spreadState.kind === 'toc') return 1;
  if (spreadState.kind === 'settings') return Math.max(spreadCount - 1, 2);
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
function computePrevZonePct(): number {
  if (spreadState.kind === 'settings') return 0;
  if (spreadIndex === 0) return 0;
  if (spreadIndex === 1) return 50;
  return 5;
}
const prevZonePct = $derived(computePrevZonePct());
function computeNextZonePct(): number {
  if (spreadState.kind === 'settings') return 0;
  if (spreadIndex === 0) return 0;
  return 5;
}
const nextZonePct = $derived(computeNextZonePct());
const flipOverhangRem = $derived(spreadIndex === 0 ? 0 : 4);
const entryDate = $derived(spreadState.kind === 'entry' ? spreadState.date : null);
const entryDates = $derived(new Set(entryDatePreviews.map((e) => e.entry_date)));

// Settings overlay
let prevSpreadState: SpreadState | null = $state(null);
const FONT_STEPS = [2.4, 2.8, 3.2, 3.6, 4.0, 4.4];
const fontSizeIdx = $derived(FONT_STEPS.indexOf(fontSizeCqw));
const prevFontSizeStep = $derived(FONT_STEPS[fontSizeIdx - 1] ?? null);
const nextFontSizeStep = $derived(FONT_STEPS[fontSizeIdx + 1] ?? null);

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
<div class="h-screen flex flex-col" style="background-image: url('/background.png'); background-repeat: repeat; background-size: 627px 627px;">

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
					{:else if spreadState.kind === 'settings'}
						<div class="absolute inset-0 px-8 pt-10 pb-8 overflow-hidden font-serif">
							<button
								type="button"
								onclick={closeSettings}
								class="text-xs tracking-widest uppercase text-stone-400 hover:text-stone-600 transition-colors"
							>← Back</button>

							<div class="mt-10">
								<p class="text-[0.6rem] tracking-[0.22em] uppercase text-stone-400 mb-3">Display Name</p>
								<form method="POST" action="/settings?/updateName" use:enhance>
									<div class="flex items-end gap-4">
										<input
											type="text"
											name="username"
											value={username}
											maxlength="40"
											required
											class="flex-1 bg-transparent border-b border-stone-300 text-ink-900 text-base pb-1 outline-none focus:border-stone-500 transition-colors"
										/>
										<button type="submit" class="text-xs tracking-widest uppercase text-stone-400 hover:text-stone-600 transition-colors pb-1">Save</button>
									</div>
								</form>
							</div>

							<div class="mt-10">
								<p class="text-[0.6rem] tracking-[0.22em] uppercase text-stone-400 mb-3">Diary Title</p>
								<form method="POST" action="/settings?/updateDiaryTitle" use:enhance>
									<div class="flex items-end gap-4">
										<input
											type="text"
											name="diary_title"
											value={diaryTitle}
											maxlength="40"
											required
											class="flex-1 bg-transparent border-b border-stone-300 text-ink-900 text-base pb-1 outline-none focus:border-stone-500 transition-colors"
										/>
										<button type="submit" class="text-xs tracking-widest uppercase text-stone-400 hover:text-stone-600 transition-colors pb-1">Save</button>
									</div>
								</form>
							</div>
						</div>
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
					<!-- edelweiss settings shortcut — entry and toc only -->
					{#if spreadState.kind === 'entry' || spreadState.kind === 'toc'}
						<button
							type="button"
							onclick={openSettings}
							class="absolute top-4 right-5 z-20 opacity-25 hover:opacity-75 transition-opacity"
							aria-label="Settings"
						><img src="/edelweiss.svg" style="width: 1.6rem; height: auto" alt="" /></button>
					{/if}

					{#if spreadState.kind === 'settings'}
						<div class="absolute inset-0 px-8 pt-10 pb-8 overflow-hidden font-serif">
							<div class="mt-4">
								<p class="text-[0.6rem] tracking-[0.22em] uppercase text-stone-400 mb-3">Text Size</p>
								<div class="flex items-center gap-5">
									<form method="POST" action="/settings?/updateFontSize" use:enhance>
										<input type="hidden" name="font_size" value={prevFontSizeStep ?? fontSizeCqw} />
										<button
											type="submit"
											disabled={prevFontSizeStep === null}
											class="w-7 h-7 border border-stone-300 text-stone-500 text-lg leading-none hover:border-stone-500 transition-colors disabled:opacity-20 flex items-center justify-center"
										>−</button>
									</form>
									<span class="text-stone-500 text-sm">{fontSizeIdx + 1} / {FONT_STEPS.length}</span>
									<form method="POST" action="/settings?/updateFontSize" use:enhance>
										<input type="hidden" name="font_size" value={nextFontSizeStep ?? fontSizeCqw} />
										<button
											type="submit"
											disabled={nextFontSizeStep === null}
											class="w-7 h-7 border border-stone-300 text-stone-500 text-lg leading-none hover:border-stone-500 transition-colors disabled:opacity-20 flex items-center justify-center"
										>+</button>
									</form>
								</div>
							</div>

							<div class="mt-10">
								<p class="text-[0.6rem] tracking-[0.22em] uppercase text-stone-400 mb-1">Change PIN</p>
								<p class="text-[0.6rem] italic text-stone-400 mb-3">4 digits — no current PIN required</p>
								<form method="POST" action="/settings?/updatePin" use:enhance>
									<div class="flex items-end gap-3 flex-wrap">
										<input
											type="password"
											name="pin"
											inputmode="numeric"
											pattern="\d{4}"
											maxlength="4"
											placeholder="New PIN"
											required
											class="bg-transparent border-b border-stone-300 text-ink-900 text-base pb-1 outline-none focus:border-stone-500 transition-colors"
											style="width: 5rem"
										/>
										<input
											type="password"
											name="confirm"
											inputmode="numeric"
											pattern="\d{4}"
											maxlength="4"
											placeholder="Confirm"
											required
											class="bg-transparent border-b border-stone-300 text-ink-900 text-base pb-1 outline-none focus:border-stone-500 transition-colors"
											style="width: 5rem"
										/>
										<button type="submit" class="text-xs tracking-widest uppercase text-stone-400 hover:text-stone-600 transition-colors pb-1">Set</button>
									</div>
								</form>
							</div>
						</div>
					{:else if spreadState.kind === 'entry'}
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
				<div class="flex items-center gap-3">
					<button
						type="button"
						onclick={openSettings}
						class="opacity-30 hover:opacity-70 transition-opacity"
						aria-label="Settings"
					><img src="/edelweiss.svg" style="width: 1.25rem; height: auto" alt="" /></button>
					<button
						type="button"
						onclick={onFlipNext}
						disabled={!canFlipNext}
						class="text-sm text-stone-500 disabled:opacity-30"
					>Next →</button>
				</div>
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
			<div class="flex items-center justify-between px-4 py-2 border-b border-stone-200">
				<button type="button" onclick={onFlipPrev} class="text-sm text-stone-500">← Back</button>
				<button
					type="button"
					onclick={openSettings}
					class="opacity-30 hover:opacity-70 transition-opacity"
					aria-label="Settings"
				><img src="/edelweiss.svg" style="width: 1.25rem; height: auto" alt="" /></button>
			</div>
			<TocPage entries={entryDatePreviews} onNavigate={navigateTo} />
		{:else if spreadState.kind === 'settings'}
			<div class="flex-1 flex flex-col bg-[#fdf6e3] overflow-auto px-6 py-6 font-serif">
				<button
					type="button"
					onclick={closeSettings}
					class="text-xs tracking-widest uppercase text-stone-400 hover:text-stone-600 transition-colors self-start mb-8"
				>← Back</button>

				<div class="mb-8">
					<p class="text-[0.6rem] tracking-[0.22em] uppercase text-stone-400 mb-2">Display Name</p>
					<form method="POST" action="/settings?/updateName" use:enhance>
						<div class="flex items-end gap-3">
							<input type="text" name="username" value={username} maxlength="40" required
								class="flex-1 bg-transparent border-b border-stone-300 text-ink-900 text-base pb-1 outline-none" />
							<button type="submit" class="text-xs tracking-widest uppercase text-stone-400 pb-1">Save</button>
						</div>
					</form>
				</div>

				<div class="mb-8">
					<p class="text-[0.6rem] tracking-[0.22em] uppercase text-stone-400 mb-2">Diary Title</p>
					<form method="POST" action="/settings?/updateDiaryTitle" use:enhance>
						<div class="flex items-end gap-3">
							<input type="text" name="diary_title" value={diaryTitle} maxlength="40" required
								class="flex-1 bg-transparent border-b border-stone-300 text-ink-900 text-base pb-1 outline-none" />
							<button type="submit" class="text-xs tracking-widest uppercase text-stone-400 pb-1">Save</button>
						</div>
					</form>
				</div>

				<div class="mb-8">
					<p class="text-[0.6rem] tracking-[0.22em] uppercase text-stone-400 mb-3">Text Size</p>
					<div class="flex items-center gap-5">
						<form method="POST" action="/settings?/updateFontSize" use:enhance>
							<input type="hidden" name="font_size" value={prevFontSizeStep ?? fontSizeCqw} />
							<button type="submit" disabled={prevFontSizeStep === null}
								class="w-7 h-7 border border-stone-300 text-stone-500 text-lg disabled:opacity-20 flex items-center justify-center">−</button>
						</form>
						<span class="text-stone-500 text-sm">{fontSizeIdx + 1} / {FONT_STEPS.length}</span>
						<form method="POST" action="/settings?/updateFontSize" use:enhance>
							<input type="hidden" name="font_size" value={nextFontSizeStep ?? fontSizeCqw} />
							<button type="submit" disabled={nextFontSizeStep === null}
								class="w-7 h-7 border border-stone-300 text-stone-500 text-lg disabled:opacity-20 flex items-center justify-center">+</button>
						</form>
					</div>
				</div>

				<div class="mb-8">
					<p class="text-[0.6rem] tracking-[0.22em] uppercase text-stone-400 mb-1">Change PIN</p>
					<p class="text-[0.6rem] italic text-stone-400 mb-3">4 digits — no current PIN required</p>
					<form method="POST" action="/settings?/updatePin" use:enhance>
						<div class="flex items-end gap-3 flex-wrap">
							<input type="password" name="pin" inputmode="numeric" pattern="\d{4}" maxlength="4" placeholder="New PIN" required
								class="bg-transparent border-b border-stone-300 text-ink-900 text-base pb-1 outline-none" style="width:5rem" />
							<input type="password" name="confirm" inputmode="numeric" pattern="\d{4}" maxlength="4" placeholder="Confirm" required
								class="bg-transparent border-b border-stone-300 text-ink-900 text-base pb-1 outline-none" style="width:5rem" />
							<button type="submit" class="text-xs tracking-widest uppercase text-stone-400 pb-1">Set</button>
						</div>
					</form>
				</div>
			</div>
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
