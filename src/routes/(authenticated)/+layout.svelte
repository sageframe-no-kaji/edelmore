<script lang="ts">
import { goto } from '$app/navigation';
import { invalidateAll } from '$app/navigation';
import { page } from '$app/stores';
import { todayIso } from '$lib/dates.js';
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
	| { kind: 'settings' }
	| { kind: 'backCover' };

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
let username = $state(untrack(() => ($page.data as any).user?.username ?? ''));
// biome-ignore lint/suspicious/noExplicitAny: layout data merged into $page.data
let fontSizeCqw = $state(untrack(() => ($page.data as any).user?.font_size ?? 3.4));
// biome-ignore lint/suspicious/noExplicitAny: layout data merged into $page.data
let diaryTitle = $state(untrack(() => ($page.data as any).user?.diary_title ?? 'D I A R Y'));
// biome-ignore lint/suspicious/noExplicitAny: layout data merged into $page.data
let journalFont = $state(untrack(() => ($page.data as any).user?.journal_font ?? 'eb-garamond'));

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

function renderMarkdown(text: string): string {
	const escaped = text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');

	return escaped
		.replace(/~~([^~]+)~~/g, '<s>$1</s>')
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/__([^_]+)__/g, '<u>$1</u>')
		.replace(/(?<!_)_([^_\n]+)_(?!_)/g, '<u>$1</u>')
		.replace(/(?<!~)~([^~\n]+)~(?!~)/g, '<s>$1</s>')
		.replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

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
		} else if (entryDatePreviews.length > 0) {
			spreadState = { kind: 'backCover' };
    }
  }
}

function onFlipPrev() {
	if (spreadState.kind === 'backCover') {
		void navigateTo(todayIso());
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

function openSettings() {
  prevSpreadState = spreadState;
  spreadState = { kind: 'settings' };
	settingsWarning = false;
	settingsWarningText = 'You have unsaved changes.';
	settingsBackArmed = false;
	draftUsername = username;
	draftDiaryTitle = diaryTitle;
	draftFontSizeCqw = fontSizeCqw;
	draftJournalFont = journalFont as JournalFont;
	draftPin = '';
	draftConfirm = '';
}

function closeSettings() {
	if (settingsDirty && !settingsBackArmed) {
		settingsWarning = true;
		settingsBackArmed = true;
		settingsWarningText = 'You have unsaved changes.';
		return;
	}
  spreadState = prevSpreadState ?? { kind: 'cover' };
  prevSpreadState = null;
	settingsWarning = false;
	settingsBackArmed = false;
	settingsWarningText = 'You have unsaved changes.';
}

function computeCanFlipPrev(): boolean {
	return spreadState.kind !== 'cover' && spreadState.kind !== 'settings';
}
const canFlipPrev = $derived(computeCanFlipPrev());
function computeCanFlipNext(): boolean {
  if (spreadState.kind === 'cover') return true;
  if (spreadState.kind === 'toc') return entryDatePreviews.length > 0;
  if (spreadState.kind === 'settings') return false;
	if (spreadState.kind === 'backCover') return false;
	return true;
}
const canFlipNext = $derived(computeCanFlipNext());

function getSpreadIndex(): number {
  if (spreadState.kind === 'cover') return 0;
  if (spreadState.kind === 'toc') return 1;
	if (spreadState.kind === 'settings') return Math.max(spreadCount - 2, 2);
	if (spreadState.kind === 'backCover') return Math.max(spreadCount - 1, 3);
  const idx = entryDatePreviews.findIndex(
    (e) =>
      spreadState.kind === 'entry' &&
      e.entry_date === (spreadState as { kind: 'entry'; date: string }).date
  );
  return idx >= 0 ? idx + 2 : 2;
}
const spreadIndex = $derived(getSpreadIndex());
const spreadCount = $derived(entryDatePreviews.length + 3);
// Cover: whole right page (front cover) is the click target to open.
// TOC: whole left page (Ex Libris) clicks back to cover; narrow right margin clicks forward.
// Entry: narrow margin strips on both sides; text area in between is unobstructed.
function computePrevZonePct(): number {
  if (spreadState.kind === 'settings') return 0;
	if (spreadState.kind === 'backCover') return 8;
  if (spreadIndex === 0) return 0;
  if (spreadIndex === 1) return 50;
  return 5;
}
const prevZonePct = $derived(computePrevZonePct());
function computeNextZonePct(): number {
  if (spreadState.kind === 'settings') return 0;
	if (spreadState.kind === 'backCover') return 0;
  if (spreadIndex === 0) return 0;
  return 5;
}
const nextZonePct = $derived(computeNextZonePct());
const flipOverhangRem = $derived(spreadIndex === 0 ? 0 : 4);
const entryDate = $derived(spreadState.kind === 'entry' ? spreadState.date : null);
const entryDates = $derived(new Set(entryDatePreviews.map((e) => e.entry_date)));

type JournalFont = 'eb-garamond' | 'cedarville-cursive';
const JOURNAL_FONT_OPTIONS: { value: JournalFont; label: string; family: string }[] = [
	{ value: 'cedarville-cursive', label: 'Cedarville Cursive', family: 'Cedarville Cursive, cursive' },
	{ value: 'eb-garamond', label: 'EB Garamond', family: 'EB Garamond, Georgia, serif' },
];

let draftUsername = $state(untrack(() => username));
let draftDiaryTitle = $state(untrack(() => diaryTitle));
let draftFontSizeCqw = $state(untrack(() => fontSizeCqw));
let draftJournalFont = $state(untrack(() => journalFont as JournalFont));
let draftPin = $state('');
let draftConfirm = $state('');
let settingsWarning = $state(false);
let settingsWarningText = $state('You have unsaved changes.');
let settingsBackArmed = $state(false);
let savingSettings = $state(false);

const journalFontFamily = $derived(
	JOURNAL_FONT_OPTIONS.find((option) => option.value === journalFont)?.family ??
		'EB Garamond, Georgia, serif'
);

const settingsDirty = $derived(
	draftUsername !== username ||
		draftDiaryTitle !== diaryTitle ||
		draftFontSizeCqw !== fontSizeCqw ||
		draftJournalFont !== journalFont ||
		draftPin.length > 0 ||
		draftConfirm.length > 0
);

$effect(() => {
	// biome-ignore lint/suspicious/noExplicitAny: layout data merged into $page.data
	const user = ($page.data as any).user;
	if (!user) return;
	untrack(() => {
		if (spreadState.kind === 'settings' && settingsDirty) return;
		username = user.username ?? '';
		diaryTitle = user.diary_title ?? 'D I A R Y';
		fontSizeCqw = user.font_size ?? 3.4;
		journalFont = user.journal_font ?? 'eb-garamond';
		if (spreadState.kind !== 'settings') {
			draftUsername = username;
			draftDiaryTitle = diaryTitle;
			draftFontSizeCqw = fontSizeCqw;
			draftJournalFont = journalFont as JournalFont;
		}
	});
});

// Settings overlay
let prevSpreadState: SpreadState | null = $state(null);
const FONT_STEPS = [2.4, 2.8, 3.2, 3.6, 4.0, 4.4];
const draftFontSizeIdx = $derived(FONT_STEPS.indexOf(draftFontSizeCqw));
const draftPrevFontSizeStep = $derived(FONT_STEPS[draftFontSizeIdx - 1] ?? null);
const draftNextFontSizeStep = $derived(FONT_STEPS[draftFontSizeIdx + 1] ?? null);

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
let activeEditor: 'left' | 'right' | null = $state(null);
let spellsOpen = $state(true);

$effect(() => {
	const stored = localStorage.getItem('edelmore-spells-open');
	if (stored !== null) spellsOpen = stored === 'true';
});

$effect(() => {
	localStorage.setItem('edelmore-spells-open', String(spellsOpen));
});

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

async function saveSettings() {
	if (!settingsDirty || savingSettings) return;
	settingsWarning = false;
	settingsBackArmed = false;
	settingsWarningText = 'You have unsaved changes.';
	savingSettings = true;
	const formData = new FormData();
	formData.set('username', draftUsername);
	formData.set('diary_title', draftDiaryTitle);
	formData.set('font_size', String(draftFontSizeCqw));
	formData.set('journal_font', draftJournalFont);
	formData.set('pin', draftPin);
	formData.set('confirm', draftConfirm);
	const response = await fetch('/settings?/saveSettings', {
		method: 'POST',
		body: formData,
	});
	savingSettings = false;
	if (!response.ok) {
		let errorMessage = 'You have unsaved changes.';
		try {
			const payload = await response.json();
			if (typeof payload?.data?.error === 'string') {
				errorMessage = payload.data.error;
			} else if (typeof payload?.error === 'string') {
				errorMessage = payload.error;
			}
		} catch {
			// keep fallback
		}
		settingsWarning = true;
		settingsWarningText = errorMessage;
		settingsBackArmed = true;
		return;
	}
	username = draftUsername;
	diaryTitle = draftDiaryTitle;
	fontSizeCqw = draftFontSizeCqw;
	journalFont = draftJournalFont;
	draftPin = '';
	draftConfirm = '';
	settingsWarning = false;
	settingsBackArmed = false;
	spreadState = prevSpreadState ?? { kind: 'cover' };
	prevSpreadState = null;
	await invalidateAll();
}

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
		class="hidden md:flex flex-1 items-center justify-center px-8 py-0"
		ontouchstart={(e) => { (e.currentTarget as HTMLElement).dataset.touchX = String(e.touches[0].clientX); }}
		ontouchend={(e) => {
			const startX = Number((e.currentTarget as HTMLElement).dataset.touchX ?? 0);
			const delta = e.changedTouches[0].clientX - startX;
			if (Math.abs(delta) > 50) { if (delta < 0 && canFlipNext) onFlipNext(); else if (delta > 0 && canFlipPrev) onFlipPrev(); }
		}}
	>
		<div class="book-shell relative w-full max-w-5xl aspect-[3/2]" style="--page-font-size: {draftFontSizeCqw}cqw">
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
				hideLeftPage={spreadState.kind === 'cover' || spreadState.kind === 'backCover'}
			>
				{#snippet leftPage()}
					{#if spreadState.kind === 'cover'}
						<!-- blank — front cover is the only thing visible on this spread -->
					{:else if spreadState.kind === 'toc'}
						<ExLibrisPage username={username} />
					{:else if spreadState.kind === 'settings'}
						<div class="h-full w-full bg-transparent"></div>
					{:else if spreadState.kind === 'entry'}
						{@const leftStart = entryPageSpread === 0 ? 0 : (splitPoints[entryPageSpread * 2 - 1] ?? 0)}
						{@const leftEnd = splitPoints[entryPageSpread * 2]}
						<div class="relative h-full">
							<button
								type="button"
								onclick={() => { showCalendar = true; }}
								class="absolute top-5 left-8 z-10 page-top-link text-xs text-stone-400 tracking-wide hover:text-ornament-gold transition-colors"
								aria-label="Open calendar"
							>{($page.data as any).displayDate ?? ''}</button>
							<button
								type="button"
								onclick={() => { void navigateTo(todayIso()); }}
								class="absolute top-5 right-8 z-10 page-top-link text-xs text-stone-400 tracking-wide hover:text-ornament-gold transition-colors"
								aria-label="Turn to Today"
							>Turn to today...</button>
							{#if activeEditor !== 'left'}
								<div
									class="absolute inset-0 w-full overflow-hidden px-8 pt-12 pb-8 text-ink-900 leading-relaxed pointer-events-none whitespace-pre-wrap break-words"
									style={`font-size: var(--page-font-size); font-family: ${journalFontFamily}`}
								>
									{@html renderMarkdown(leftEnd !== undefined ? content.slice(leftStart, leftEnd) : content.slice(leftStart))}
								</div>
							{/if}
							<textarea
								bind:this={textareaEl}
								onfocus={() => { activeEditor = 'left'; }}
								onblur={() => { activeEditor = null; }}
								oninput={(e) => {
									const leftEnd = splitPoints[entryPageSpread * 2];
									pendingCursorRestore = { absPos: leftStart + e.currentTarget.selectionStart, side: 'left' };
									const suffix = leftEnd !== undefined ? content.slice(leftEnd) : '';
									content = content.slice(0, leftStart) + e.currentTarget.value + suffix;
								}}
								class={`absolute inset-0 h-full w-full resize-none overflow-hidden px-8 pt-12 pb-8 bg-transparent leading-relaxed outline-none relative ${activeEditor === 'left' ? 'text-ink-900 caret-ink-900' : 'text-transparent caret-transparent'}`}
								style={`font-size: var(--page-font-size); font-family: ${journalFontFamily}`}
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
								class="absolute top-4 right-5 z-20 opacity-70"
							aria-label="Settings"
						><img src="/edelweiss.svg" style="width: 1.6rem; height: auto" alt="" /></button>
					{/if}

					{#if spreadState.kind === 'settings'}
						<div class="absolute inset-0 px-8 pt-10 pb-8 overflow-hidden font-serif">
							<div class="flex h-full flex-col">
								<div class="flex-1 space-y-7">
									<section>
										<p class="text-[0.6rem] tracking-[0.22em] uppercase text-stone-400 mb-2">Display Name</p>
										<input type="text" bind:value={draftUsername} oninput={(e) => { draftUsername = e.currentTarget.value; }} maxlength="40" required class="w-full bg-transparent border-b border-stone-300 text-ink-900 text-base pb-1 outline-none focus:border-stone-500 transition-colors" />
									</section>

									<section>
										<p class="text-[0.6rem] tracking-[0.22em] uppercase text-stone-400 mb-2">Diary Title</p>
										<input type="text" bind:value={draftDiaryTitle} oninput={(e) => { draftDiaryTitle = e.currentTarget.value; }} maxlength="40" required class="w-full bg-transparent border-b border-stone-300 text-ink-900 text-base pb-1 outline-none focus:border-stone-500 transition-colors" />
									</section>

									<section>
										<p class="text-[0.6rem] tracking-[0.22em] uppercase text-stone-400 mb-2">Text Size</p>
										<div class="flex items-center gap-5">
												<button type="button" onclick={() => { draftFontSizeCqw = draftPrevFontSizeStep ?? draftFontSizeCqw; }} disabled={draftPrevFontSizeStep === null} class="w-7 h-7 border border-stone-300 text-stone-500 text-lg leading-none hover:border-stone-500 transition-colors disabled:opacity-20 flex items-center justify-center">−</button>
											<span class="text-stone-500 text-sm">{FONT_STEPS.indexOf(draftFontSizeCqw) + 1} / {FONT_STEPS.length}</span>
												<button type="button" onclick={() => { draftFontSizeCqw = draftNextFontSizeStep ?? draftFontSizeCqw; }} disabled={draftNextFontSizeStep === null} class="w-7 h-7 border border-stone-300 text-stone-500 text-lg leading-none hover:border-stone-500 transition-colors disabled:opacity-20 flex items-center justify-center">+</button>
										</div>
									</section>

									<section>
										<p class="text-[0.6rem] tracking-[0.22em] uppercase text-stone-400 mb-2">Journal Font</p>
										<div class="flex flex-col gap-2">
											{#each JOURNAL_FONT_OPTIONS as option}
												<label class="flex items-center gap-3 text-sm text-stone-500">
													<input type="radio" bind:group={draftJournalFont} value={option.value} />
													<span style={`font-family: ${option.family}`}>{option.label}</span>
												</label>
											{/each}
										</div>
									</section>

									<section>
										<p class="text-[0.6rem] tracking-[0.22em] uppercase text-stone-400 mb-1">Change PIN</p>
										<p class="text-[0.6rem] italic text-stone-400 mb-2">4 digits — no current PIN required</p>
										<input type="password" bind:value={draftPin} inputmode="numeric" pattern="\d{4}" maxlength="4" placeholder="New PIN" class="mb-2 w-full bg-transparent border-b border-stone-300 text-ink-900 text-base pb-1 outline-none focus:border-stone-500 transition-colors" />
										<input type="password" bind:value={draftConfirm} inputmode="numeric" pattern="\d{4}" maxlength="4" placeholder="Confirm PIN" class="w-full bg-transparent border-b border-stone-300 text-ink-900 text-base pb-1 outline-none focus:border-stone-500 transition-colors" />
									</section>
								</div>

								<div class="mt-8 flex items-end justify-end gap-3">
									{#if settingsWarning}
										<span class="settings-warning-text">{settingsWarningText}</span>
									{/if}
									<button type="button" onclick={closeSettings} class="settings-back-link">← Back</button>
									<button type="button" onclick={saveSettings} disabled={!settingsDirty || savingSettings} class="settings-save-link">{savingSettings ? 'Saving…' : 'Save'}</button>
								</div>
							</div>
						</div>
					{:else if spreadState.kind === 'entry'}
						<!-- Recent entries link — center top of right page, sits within the pt-12 top margin -->
						<button
							type="button"
							onclick={() => { spreadState = { kind: 'toc' }; }}
							class="absolute top-5 left-1/2 -translate-x-1/2 z-10 page-top-link text-xs text-stone-400 tracking-wide hover:text-ornament-gold transition-colors"
						>Recent entries</button>
						{@const rightStart = splitPoints[entryPageSpread * 2]}
						{@const rightEnd = splitPoints[entryPageSpread * 2 + 1]}
						{#if rightStart !== undefined}
							{#if activeEditor !== 'right'}
								<div
									class="absolute inset-0 w-full overflow-hidden px-8 pt-12 pb-8 text-ink-900 leading-relaxed pointer-events-none whitespace-pre-wrap break-words"
									style={`font-size: var(--page-font-size); font-family: ${journalFontFamily}`}
								>
									{@html renderMarkdown(rightEnd !== undefined ? content.slice(rightStart, rightEnd) : content.slice(rightStart))}
								</div>
							{/if}
							<textarea
								bind:this={rightTextareaEl}
								onfocus={() => { activeEditor = 'right'; }}
								onblur={() => { activeEditor = null; }}
								oninput={(e) => {
									const rightEnd = splitPoints[entryPageSpread * 2 + 1];
									pendingCursorRestore = { absPos: rightStart + e.currentTarget.selectionStart, side: 'right' };
									const suffix = rightEnd !== undefined ? content.slice(rightEnd) : '';
									content = content.slice(0, rightStart) + e.currentTarget.value + suffix;
								}}
								class={`absolute inset-0 h-full w-full resize-none overflow-hidden px-8 pt-12 pb-8 bg-transparent leading-relaxed outline-none relative ${activeEditor === 'right' ? 'text-ink-900 caret-ink-900' : 'text-transparent caret-transparent'}`}
								style={`font-size: var(--page-font-size); font-family: ${journalFontFamily}`}
							></textarea>
							{#if hasMoreContent}
								<div class="absolute bottom-2 right-3 text-xs text-stone-400 italic pointer-events-none">→ continued</div>
							{/if}
						{/if}
					{:else if spreadState.kind === 'toc'}
						<TocPage entries={entryDatePreviews} onNavigate={navigateTo} />
					{:else if spreadState.kind === 'cover'}
						<div role="presentation" class="h-full w-full cursor-pointer" onclick={onFlipNext}>
							<CoverPage config={activeCover} {username} {diaryTitle} showSettings={true} onOpenSettings={openSettings} />
						</div>
					{:else if spreadState.kind === 'backCover'}
						<div role="presentation" class="h-full w-full">
							<CoverPage config={activeCover} {username} {diaryTitle} backCover={true} />
						</div>
					{/if}
				{/snippet}
			</Spread>
			{#if spreadState.kind === 'entry'}
				<div class="spell-anchor">
					<div class={`spell-panel ${spellsOpen ? 'is-open' : 'is-closed'}`} role="note" aria-label="Magic writing spells">
						<button
							type="button"
							class="spell-flower"
							onclick={() => { spellsOpen = !spellsOpen; }}
							aria-label={spellsOpen ? 'Close magic writing spells' : 'Open magic writing spells'}
							aria-expanded={spellsOpen}
						>
							<svg width="16" height="16" viewBox="0 0 36 36" aria-hidden="true">
								<g opacity="0.82">
									<ellipse cx="18" cy="8" rx="4" ry="7" fill="#d4b0cc"/>
									<ellipse cx="18" cy="8" rx="4" ry="7" transform="rotate(45 18 18)" fill="#c9a8c6"/>
									<ellipse cx="18" cy="8" rx="4" ry="7" transform="rotate(90 18 18)" fill="#d4b0cc"/>
									<ellipse cx="18" cy="8" rx="4" ry="7" transform="rotate(135 18 18)" fill="#c9a8c6"/>
									<ellipse cx="18" cy="8" rx="4" ry="7" transform="rotate(180 18 18)" fill="#d4b0cc"/>
									<ellipse cx="18" cy="8" rx="4" ry="7" transform="rotate(225 18 18)" fill="#c9a8c6"/>
									<ellipse cx="18" cy="8" rx="4" ry="7" transform="rotate(270 18 18)" fill="#d4b0cc"/>
									<ellipse cx="18" cy="8" rx="4" ry="7" transform="rotate(315 18 18)" fill="#c9a8c6"/>
								</g>
								<circle cx="18" cy="18" r="6" fill="#f5d87a"/>
								<circle cx="18" cy="18" r="3.5" fill="#e8c63e"/>
							</svg>
						</button>
						<div class="spell-panel-content" aria-hidden={!spellsOpen}>
							<p class="spell-title">✨ Magic Writing Spells</p>
							<ul class="spell-list">
								<li><span class="spell-code">*word*</span> <em>soft and quiet</em></li>
								<li><span class="spell-code">**word**</span> <strong>strong and loud</strong></li>
									<li><span class="spell-code">_word_ / __word__</span> <u>extra important</u></li>
									<li><span class="spell-code">~word~ / ~~word~~</span> <s>crossed out</s></li>
							</ul>
						</div>
					</div>
				</div>
			{/if}
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
						class="opacity-70"
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
					class="flex-1 w-full resize-none bg-transparent text-sm leading-relaxed outline-none"
					style={`font-family: ${journalFontFamily}`}
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
					class="opacity-70"
					aria-label="Settings"
				><img src="/edelweiss.svg" style="width: 1.25rem; height: auto" alt="" /></button>
			</div>
			<TocPage entries={entryDatePreviews} onNavigate={navigateTo} />
		{:else if spreadState.kind === 'settings'}
			<div class="flex-1 flex flex-col bg-[#fdf6e3] overflow-auto px-6 py-6 font-serif">
				<div class="space-y-6">
					<section>
						<p class="text-[0.6rem] tracking-[0.22em] uppercase text-stone-400 mb-2">Display Name</p>
						<input type="text" bind:value={draftUsername} oninput={(e) => { draftUsername = e.currentTarget.value; }} maxlength="40" required class="w-full bg-transparent border-b border-stone-300 text-ink-900 text-base pb-1 outline-none" />
					</section>

					<section>
						<p class="text-[0.6rem] tracking-[0.22em] uppercase text-stone-400 mb-2">Diary Title</p>
						<input type="text" bind:value={draftDiaryTitle} oninput={(e) => { draftDiaryTitle = e.currentTarget.value; }} maxlength="40" required class="w-full bg-transparent border-b border-stone-300 text-ink-900 text-base pb-1 outline-none" />
					</section>

					<section>
						<p class="text-[0.6rem] tracking-[0.22em] uppercase text-stone-400 mb-2">Text Size</p>
						<div class="flex items-center gap-5">
							<button type="button" onclick={() => { draftFontSizeCqw = draftPrevFontSizeStep ?? draftFontSizeCqw; }} disabled={draftPrevFontSizeStep === null} class="w-7 h-7 border border-stone-300 text-stone-500 text-lg disabled:opacity-20 flex items-center justify-center">−</button>
							<span class="text-stone-500 text-sm">{FONT_STEPS.indexOf(draftFontSizeCqw) + 1} / {FONT_STEPS.length}</span>
							<button type="button" onclick={() => { draftFontSizeCqw = draftNextFontSizeStep ?? draftFontSizeCqw; }} disabled={draftNextFontSizeStep === null} class="w-7 h-7 border border-stone-300 text-stone-500 text-lg disabled:opacity-20 flex items-center justify-center">+</button>
						</div>
					</section>

					<section>
						<p class="text-[0.6rem] tracking-[0.22em] uppercase text-stone-400 mb-2">Journal Font</p>
						<div class="flex flex-col gap-2">
							{#each JOURNAL_FONT_OPTIONS as option}
								<label class="flex items-center gap-3 text-sm text-stone-500">
									<input type="radio" bind:group={draftJournalFont} value={option.value} />
									<span style={`font-family: ${option.family}`}>{option.label}</span>
								</label>
							{/each}
						</div>
					</section>

					<section>
						<p class="text-[0.6rem] tracking-[0.22em] uppercase text-stone-400 mb-1">Change PIN</p>
						<p class="text-[0.6rem] italic text-stone-400 mb-2">4 digits — no current PIN required</p>
						<div class="space-y-2">
							<input type="password" bind:value={draftPin} inputmode="numeric" pattern="\d{4}" maxlength="4" placeholder="New PIN" class="w-full bg-transparent border-b border-stone-300 text-ink-900 text-base pb-1 outline-none" />
							<input type="password" bind:value={draftConfirm} inputmode="numeric" pattern="\d{4}" maxlength="4" placeholder="Confirm PIN" class="w-full bg-transparent border-b border-stone-300 text-ink-900 text-base pb-1 outline-none" />
						</div>
					</section>
				</div>

				<div class="mt-8 flex items-end justify-end gap-3">
					{#if settingsWarning}
						<span class="settings-warning-text">{settingsWarningText}</span>
					{/if}
					<button type="button" onclick={closeSettings} class="settings-back-link">← Back</button>
					<button type="button" onclick={saveSettings} disabled={!settingsDirty || savingSettings} class="settings-save-link">{savingSettings ? 'Saving…' : 'Save'}</button>
				</div>
			</div>
			{:else if spreadState.kind === 'backCover'}
				<div class="flex-1 flex flex-col bg-[#fdf6e3] overflow-hidden">
					<CoverPage config={activeCover} {username} {diaryTitle} backCover={true} />
				</div>
		{:else}
			<div class="flex-1 flex flex-col bg-[#fdf6e3] overflow-hidden">
				<CoverPage config={activeCover} {username} {diaryTitle} showSettings={true} onOpenSettings={openSettings} />
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

<style>
	.page-top-link {
		font-family: 'EB Garamond', Georgia, serif;
	}

	.settings-back-link {
		font-family: 'Rouge Script', cursive;
		font-size: 1.6rem;
		color: #8b6914;
		text-shadow:
			0 1px 2px rgba(255, 250, 230, 0.45),
			0 -1px 0 rgba(0, 0, 0, 0.25);
	}

	.settings-warning-text {
		font-family: 'Rouge Script', cursive;
		font-size: 1.35rem;
		color: #8b6914;
		text-align: left;
		margin-right: auto;
		text-shadow:
			0 1px 2px rgba(255, 250, 230, 0.45),
			0 -1px 0 rgba(0, 0, 0, 0.25);
	}

	.settings-save-link {
		font-family: 'Rouge Script', cursive;
		font-size: 1.6rem;
		color: #8b6914;
		background: transparent;
		border: none;
		padding: 0;
		text-shadow:
			0 1px 2px rgba(255, 250, 230, 0.45),
			0 -1px 0 rgba(0, 0, 0, 0.25);
		transition: opacity 0.15s;
	}

	.settings-save-link:disabled {
		opacity: 0.35;
		cursor: default;
	}

	/* ── Magic Spells flower ─────────────────────────────────────────────── */

	.spell-anchor {
		position: absolute;
		top: calc(100% + 0.6rem);
		left: 0;
		z-index: 30;
		width: 100%;
	}

	.spell-panel {
		--spell-collapsed-size: 5.2cqi;
		background: #fefcf7;
		border: 1px solid #dfc9a4;
		border-radius: 1.45cqi;
		padding: 0.6cqi;
		font-family: 'EB Garamond', Georgia, serif;
		color: #4a3728;
		display: flex;
		align-items: center;
		gap: 1cqi;
		box-shadow: 0 1px 6px rgba(0, 0, 0, 0.06);
		max-width: none;
		height: var(--spell-collapsed-size);
		width: var(--spell-collapsed-size);
		overflow: hidden;
		transform-origin: left center;
		transition: width 1s ease, padding 1s ease;
	}

	.spell-panel.is-open {
		width: 100%;
		padding: 0.6cqi 1.4cqi 0.6cqi 0.6cqi;
	}

	.spell-panel-content {
		display: flex;
		align-items: center;
		gap: 1cqi;
		min-width: 0;
		overflow: hidden;
		opacity: 0;
		transform: translateX(-0.5rem);
		pointer-events: none;
		transition: opacity 0.45s ease 0.45s, transform 0.45s ease 0.45s;
	}

	.spell-panel.is-open .spell-panel-content {
		opacity: 1;
		transform: translateX(0);
		pointer-events: auto;
	}

	.spell-title {
		display: none;
		font-size: 0.9rem;
		color: #8b6914;
		font-weight: 600;
		white-space: nowrap;
		margin: 0;
	}

	.spell-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: row;
		flex-wrap: nowrap;
		gap: 1.2cqi;
		line-height: 2.05cqi;
		font-size: 1.67cqi;
		white-space: nowrap;
	}

	.spell-list li {
		display: flex;
		align-items: center;
		gap: 0.6cqi;
	}

	.spell-code {
		font-family: 'Courier New', monospace;
		font-size: 1.55cqi;
		color: #8b6914;
		background: rgba(139, 105, 20, 0.08);
		padding: 0 0.4cqi;
		border-radius: 2px;
	}

	.book-shell {
		container-type: inline-size;
	}

	.spell-flower {
		background: transparent;
		border: none;
		border-radius: 0;
		cursor: pointer;
		padding: 0.22cqi;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 3.6cqi;
		height: 3.6cqi;
		flex-shrink: 0;
	}

	.spell-flower svg {
		width: 100%;
		height: 100%;
	}

	/* ── Markdown formatting ──────────────────────────────────────────────── */
	:global(em) {
		font-style: italic;
	}

	:global(strong) {
		font-weight: bold;
	}

	:global(u) {
		text-decoration: underline;
	}

	:global(s) {
		text-decoration: line-through;
	}
</style>

<!-- SvelteKit requires children to be rendered; content lives in the layout, not the page. -->
<div class="hidden">{@render children()}</div>
