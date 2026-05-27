<script lang="ts">
import { goto, invalidateAll } from '$app/navigation';
import { page } from '$app/stores';
import CalendarModal from '$lib/components/CalendarModal.svelte';
import CoverPage from '$lib/components/CoverPage.svelte';
import ExLibrisPage from '$lib/components/ExLibrisPage.svelte';
import MicQuill from '$lib/components/MicQuill.svelte';
import Spread from '$lib/components/Spread.svelte';
import TocPage from '$lib/components/TocPage.svelte';
import { findCover } from '$lib/covers.js';
import { insertAtCursor } from '$lib/cursor.js';
import { todayIso } from '$lib/dates.js';
import type { EntryDatePreview } from '$lib/db.js';
import { findSplitIndex, snapToWordBreak } from '$lib/overflow.js';
import type { Snippet } from 'svelte';
import { onMount, tick, untrack } from 'svelte';
import { cubicOut } from 'svelte/easing';
import { tweened } from 'svelte/motion';

type SpreadState =
  | { kind: 'cover' }
  | { kind: 'frontEndpaper' }
  | { kind: 'toc' }
  | { kind: 'entry'; date: string }
  | { kind: 'settings' }
  | { kind: 'backEndpaper' }
  | { kind: 'backCover' };

const { children }: { children: Snippet } = $props();

// ── Page-flip primitive (two-faced 3D rotation around the spine) ───────────
//
// Forward: only the right page rotates, pivoting at its left edge (= spine).
// Backward: only the left page rotates, pivoting at its right edge (= spine).
//
// The rotating wrapper has TWO absolutely-positioned faces:
//   - front: clone of the OLD page (snapshot taken before mutation)
//   - back: clone of the NEW page (snapshot taken after mutation),
//           pre-rotated 180° so its content reads correctly when revealed.
// Both faces use `backface-visibility: hidden` so each is visible only on
// the matching half of the rotation arc.
//
// The live (now-new-content) page underneath is hidden via `visibility`
// during the rotation so it doesn't bleed around the rotating wrapper.
const flipDurationMs = 700;
const flipAngle = tweened(0, { duration: flipDurationMs, easing: cubicOut });
let isFlipping = $state(false);
// biome-ignore lint/style/useConst: bind:this requires let — Biome doesn't see template bindings
let bookShellEl: HTMLDivElement | null = $state(null);

function getLivePage(direction: 'forward' | 'backward'): HTMLElement | null {
  const selector = direction === 'forward' ? '.page-right' : '.page-left';
  return bookShellEl?.querySelector<HTMLElement>(`.spread ${selector}`) ?? null;
}

function makeFace(source: HTMLElement, isBack: boolean): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  clone.style.position = 'absolute';
  clone.style.top = '0';
  clone.style.left = '0';
  clone.style.width = '100%';
  clone.style.height = '100%';
  clone.style.margin = '0';
  clone.style.backfaceVisibility = 'hidden';
  // Strip page edge artifacts:
  //  - filter:drop-shadow would double up against the live page underneath
  //  - boxShadow: the outer-edge 2px strip becomes visible at edge-on angles
  //  - clipPath: the clone's clip-path must not differ subpixel-wise from
  //    the live page's, otherwise the live's 2px inset strip peeks out at
  //    the bump points. Making the clone a clean rectangle guarantees full
  //    coverage with no peek.
  clone.style.filter = 'none';
  clone.style.boxShadow = 'none';
  clone.style.clipPath = 'none';
  clone.style.visibility = 'visible';
  if (isBack) clone.style.transform = 'rotateY(180deg)';
  return clone;
}

async function flip(direction: 'forward' | 'backward', mutate: () => void | Promise<void>) {
  if (isFlipping) return;
  if (!bookShellEl) {
    await mutate();
    return;
  }
  if (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    await mutate();
    return;
  }
  // Front face = OLD page being turned (forward = right; backward = left).
  // Opposite = the OLD page on the other side, which stays visible during
  // the first half of the flip (so the user sees the OLD spread until the
  // turning page passes 90°).
  const oldFront = getLivePage(direction);
  const oppositeDirection = direction === 'forward' ? 'backward' : 'forward';
  const oldOpposite = getLivePage(oppositeDirection);
  if (!oldFront) {
    await mutate();
    return;
  }

  if (direction === 'forward') {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  isFlipping = true;

  // Snapshot the OLD turning page (front face) and OLD opposite-side page
  // (static overlay) — both BEFORE mutation, so they hold the OLD content.
  const frontFace = makeFace(oldFront, false);
  const oppositeOverlay = oldOpposite
    ? (() => {
        const clone = oldOpposite.cloneNode(true) as HTMLElement;
        clone.style.position = 'absolute';
        clone.style.top = '0';
        clone.style.width = '50%';
        clone.style.height = '100%';
        clone.style.left = oppositeDirection === 'backward' ? '0' : '50%';
        clone.style.margin = '0';
        clone.style.pointerEvents = 'none';
        clone.style.zIndex = '45';
        clone.style.filter = 'none';
        clone.style.boxShadow = 'none';
        clone.style.clipPath = 'none';
        clone.style.visibility = 'visible';
        return clone;
      })()
    : null;

  // Build the rotating wrapper with the front face. Back face is added
  // after mutation. The wrapper at rotateY(0deg) sits on the same-side
  // half showing the OLD turning page content. All positioning is inline
  // (not via CSS classes) so there's zero risk of cascade/specificity
  // putting the wrapper on the wrong half.
  const wrapper = document.createElement('div');
  wrapper.style.position = 'absolute';
  wrapper.style.top = '0';
  wrapper.style.width = '50%';
  wrapper.style.height = '100%';
  wrapper.style.left = direction === 'forward' ? '50%' : '0';
  wrapper.style.transformOrigin = direction === 'forward' ? 'left center' : 'right center';
  wrapper.style.transformStyle = 'preserve-3d';
  wrapper.style.willChange = 'transform';
  wrapper.style.zIndex = '50';
  wrapper.style.pointerEvents = 'none';
  wrapper.style.transform = 'rotateY(0deg)';
  wrapper.appendChild(frontFace);

  // CRITICAL: insert overlay + wrapper BEFORE awaiting mutate. Once we
  // await, the browser can paint, and live pages will have updated to NEW
  // content under us. The OLD-content overlay must be in place by then.
  // Hide both live pages via the flip-hidden class so neither's NEW content
  // can peek out from under the rotating wrapper (same-side, where the
  // wrapper foreshortens) or from clip-path bump mismatches with the
  // overlay (opposite-side).
  if (oppositeOverlay) bookShellEl.appendChild(oppositeOverlay);
  bookShellEl.appendChild(wrapper);
  const livePages = { same: oldFront, opposite: oldOpposite };
  livePages.same.classList.add('flip-hidden');
  livePages.opposite?.classList.add('flip-hidden');

  // Run the mutation (sync state change, or async routed navigation).
  await Promise.resolve(mutate());
  await tick();

  // Tween the rotation. backFace is NOT appended yet — we add it at the
  // 90° midpoint and remove the frontFace then too. This avoids relying
  // on backface-visibility:hidden, which doesn't always work reliably in
  // nested 3D contexts (without it, the back face's rotateY(180°) shows
  // its NEW content MIRRORED during 0-90°, visible behind the front face).
  // Each face is only in the DOM during the half-rotation it should be
  // visible in.
  let crossedMidpoint = false;
  flipAngle.set(0, { duration: 0 });
  const unsubscribe = flipAngle.subscribe((angle) => {
    wrapper.style.transform = `rotateY(${angle}deg)`;
    if (!crossedMidpoint && Math.abs(angle) >= 90) {
      crossedMidpoint = true;
      // Swap front face out, back face in. Wrapper at 90° is edge-on, so
      // the swap happens during its invisible moment.
      frontFace.remove();
      const newBack = getLivePage(oppositeDirection);
      if (newBack) wrapper.appendChild(makeFace(newBack, true));
      livePages.same.classList.remove('flip-hidden');
      livePages.opposite?.classList.remove('flip-hidden');
      if (oppositeOverlay?.parentNode) oppositeOverlay.remove();
    }
  });
  const target = direction === 'forward' ? -180 : 180;
  await flipAngle.set(target);

  // Cleanup.
  unsubscribe();
  wrapper.remove();
  if (oppositeOverlay?.parentNode) oppositeOverlay.remove();
  livePages.same.classList.remove('flip-hidden');
  livePages.opposite?.classList.remove('flip-hidden');
  isFlipping = false;
}

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
// biome-ignore lint/suspicious/noExplicitAny: layout data merged into $page.data
let voiceURI: string | null = $state(untrack(() => ($page.data as any).user?.voice_uri ?? null));

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
      stopBird();
    }
  });
});

function renderMarkdown(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

/* v8 ignore next 35 */
function handleTranscriptionInsert(text: string) {
  if (!text) return;

  // Target the textarea the user was LAST writing in (sticky across blur).
  // The user just clicked the mic-quill button, so activeEditor is null —
  // lastActiveEditor remembers which side they came from.
  const target = lastActiveEditor === 'right' ? rightTextareaEl : textareaEl;

  if (!target) {
    // No textarea available (rare — would mean entry state but textareas not mounted).
    // Append to content with a leading space if needed.
    const sep = content && !/\s$/.test(content) ? ' ' : '';
    content = content + sep + text;
    return;
  }

  const { newValue, cursorPos } = insertAtCursor(target, text);
  target.value = newValue;

  // Reconstruct `content` from the textarea's slice — same pattern as the
  // oninput handlers on the entry textareas.
  if (target === rightTextareaEl) {
    const rightStart = splitPoints[entryPageSpread * 2];
    const rightEnd = splitPoints[entryPageSpread * 2 + 1];
    if (rightStart === undefined) return;
    const suffix = rightEnd !== undefined ? content.slice(rightEnd) : '';
    content = content.slice(0, rightStart) + target.value + suffix;
  } else {
    const leftStart = entryPageSpread === 0 ? 0 : (splitPoints[entryPageSpread * 2 - 1] ?? 0);
    const leftEnd = splitPoints[entryPageSpread * 2];
    const suffix = leftEnd !== undefined ? content.slice(leftEnd) : '';
    content = content.slice(0, leftStart) + target.value + suffix;
  }

  target.setSelectionRange(cursorPos, cursorPos);
  target.focus();
}

function onFlipNext() {
  if (spreadState.kind === 'cover') {
    flip('forward', () => {
      spreadState = { kind: 'frontEndpaper' };
    });
  } else if (spreadState.kind === 'frontEndpaper') {
    flip('forward', () => {
      spreadState = { kind: 'toc' };
    });
  } else if (spreadState.kind === 'toc') {
    if (entryDatePreviews.length > 0) {
      flip('forward', () => navigateTo(entryDatePreviews[0].entry_date));
    }
  } else if (spreadState.kind === 'entry') {
    if (entryPageSpread < entrySpreadCount - 1) {
      flip('forward', () => {
        entryPageSpread += 1;
      });
    } else if (nextDate) {
      const target = nextDate;
      flip('forward', () => navigateTo(target));
    } else {
      // Last entry — flip into the back of the book.
      flip('forward', () => {
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
      });
    }
  } else if (spreadState.kind === 'settings') {
    flip('forward', () => {
      spreadState = { kind: 'backEndpaper' };
    });
  } else if (spreadState.kind === 'backEndpaper') {
    flip('forward', () => {
      spreadState = { kind: 'backCover' };
    });
  }
}

function onFlipPrev() {
  if (spreadState.kind === 'backCover') {
    flip('backward', () => {
      spreadState = { kind: 'backEndpaper' };
    });
    return;
  }
  if (spreadState.kind === 'backEndpaper') {
    flip('backward', () => {
      spreadState = { kind: 'settings' };
    });
    return;
  }
  if (spreadState.kind === 'settings') {
    closeSettings();
    return;
  }
  if (spreadState.kind === 'entry') {
    if (entryPageSpread > 0) {
      flip('backward', () => {
        entryPageSpread -= 1;
      });
    } else if (prevDate) {
      const target = prevDate;
      flip('backward', () => navigateTo(target));
    } else {
      flip('backward', () => {
        spreadState = { kind: 'toc' };
      });
    }
  } else if (spreadState.kind === 'toc') {
    flip('backward', () => {
      spreadState = { kind: 'frontEndpaper' };
    });
  } else if (spreadState.kind === 'frontEndpaper') {
    flip('backward', () => {
      spreadState = { kind: 'cover' };
    });
  }
}

type BirdPhase = 'idle' | 'playing' | 'paused';
let birdPhase: BirdPhase = $state('idle');
let birdRate = $state(1.0);
// Absolute character position in `content` of the most recent boundary event.
// Used to restart mid-playback at a new rate without losing position.
let birdAbsoluteIndex = 0;
// Spread we last auto-advanced *from*. Each spread auto-advances at most once,
// so a user who manually flips back doesn't get yanked forward immediately.
let birdLastAdvancedFromSpread = -1;
// Set to true when the bird itself triggers a flip; consumed by the
// spread-watching effect so the bird isn't stopped by its own page-turn.
let birdInitiatedFlip = false;

function stopBird() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  birdPhase = 'idle';
}

// Manual page flip (any change in entryPageSpread that didn't come from the
// bird itself) stops playback so the next click starts fresh on whatever
// page the user landed on. Only entryPageSpread is a dependency — read
// birdPhase via untrack so changes to the bird's own state don't re-fire.
$effect(() => {
  void entryPageSpread;
  untrack(() => {
    if (birdInitiatedFlip) {
      birdInitiatedFlip = false;
      return;
    }
    if (birdPhase !== 'idle') stopBird();
  });
});

// Speak `content` from an absolute character offset, at the current birdRate.
// Caller is responsible for synth.cancel() if needed.
function speakFromOffset(offset: number) {
  const textFromHere = content.slice(offset);
  if (!textFromHere.trim()) return;
  birdAbsoluteIndex = offset;
  const synth = window.speechSynthesis;
  const u = new SpeechSynthesisUtterance(textFromHere);
  if (voiceURI) {
    const picked = synth.getVoices().find((v) => v.voiceURI === voiceURI);
    if (picked) u.voice = picked;
  }
  u.rate = birdRate;
  u.onstart = () => {
    birdPhase = 'playing';
  };
  u.onboundary = (e) => {
    birdAbsoluteIndex = offset + e.charIndex;
    if (entryPageSpread === birdLastAdvancedFromSpread) return;
    const currentSpreadEnd = splitPoints[entryPageSpread * 2 + 1];
    // ~15 chars of lookahead so the flip lands roughly when speech reaches the
    // boundary, instead of starting ~750ms after speech has already crossed it.
    if (currentSpreadEnd !== undefined && birdAbsoluteIndex > currentSpreadEnd - 15) {
      birdLastAdvancedFromSpread = entryPageSpread;
      birdInitiatedFlip = true;
      onFlipNext();
    }
  };
  u.onend = () => {
    birdPhase = 'idle';
  };
  u.onerror = () => {
    birdPhase = 'idle';
  };
  synth.speak(u);
}

function speakEntry() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const synth = window.speechSynthesis;

  if (birdPhase === 'playing') {
    synth.pause();
    birdPhase = 'paused';
    return;
  }
  if (birdPhase === 'paused') {
    synth.resume();
    birdPhase = 'playing';
    return;
  }

  if (!content?.trim()) return;
  // Start reading from the current spread's first character, not the top of the entry.
  const startOffset = entryPageSpread === 0 ? 0 : (splitPoints[entryPageSpread * 2 - 1] ?? 0);
  birdLastAdvancedFromSpread = -1;
  synth.cancel();
  speakFromOffset(startOffset);
}

function setBirdRate(rate: number) {
  const clamped = Math.max(0.2, Math.min(1.3, Math.round(rate * 100) / 100));
  if (clamped === birdRate) return;
  birdRate = clamped;
  if (birdPhase !== 'playing' && birdPhase !== 'paused') return;
  // Restart from current position at the new rate. The Web Speech API
  // doesn't expose a live rate setter — we have to cancel and re-speak.
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  speakFromOffset(birdAbsoluteIndex);
}

function changeBirdRate(delta: number) {
  setBirdRate(birdRate + delta);
}

function openSettings() {
  flip('forward', () => {
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
  });
}

function closeSettings() {
  if (settingsDirty && !settingsBackArmed) {
    settingsWarning = true;
    settingsBackArmed = true;
    settingsWarningText = 'You have unsaved changes.';
    return;
  }
  flip('backward', () => {
    spreadState = prevSpreadState ?? { kind: 'cover' };
    prevSpreadState = null;
    settingsWarning = false;
    settingsBackArmed = false;
    settingsWarningText = 'You have unsaved changes.';
  });
}

function computeCanFlipPrev(): boolean {
  return spreadState.kind !== 'cover';
}
const canFlipPrev = $derived(computeCanFlipPrev());
function computeCanFlipNext(): boolean {
  if (spreadState.kind === 'backCover') return false;
  if (spreadState.kind === 'toc') return entryDatePreviews.length > 0;
  return true;
}
const canFlipNext = $derived(computeCanFlipNext());

function getSpreadIndex(): number {
  if (spreadState.kind === 'cover') return 0;
  if (spreadState.kind === 'frontEndpaper') return 1;
  if (spreadState.kind === 'toc') return 2;
  if (spreadState.kind === 'settings') return Math.max(spreadCount - 3, 3);
  if (spreadState.kind === 'backEndpaper') return Math.max(spreadCount - 2, 4);
  if (spreadState.kind === 'backCover') return Math.max(spreadCount - 1, 5);
  const idx = entryDatePreviews.findIndex(
    (e) =>
      spreadState.kind === 'entry' &&
      e.entry_date === (spreadState as { kind: 'entry'; date: string }).date
  );
  return idx >= 0 ? idx + 3 : 3;
}
const spreadIndex = $derived(getSpreadIndex());
const spreadCount = $derived(entryDatePreviews.length + 6);

const progress = $derived(
  spreadCount > 1 ? Math.min(Math.max(spreadIndex / (spreadCount - 1), 0), 1) : 0
);
const compressedProgress = $derived(progress ** 0.85);
const leftStack = $derived(compressedProgress);
const rightStack = $derived(1 - compressedProgress);
// Cover: whole right page (front cover) is the click target to open.
// TOC: whole left page (Ex Libris) clicks back to cover; narrow right margin clicks forward.
// Entry: narrow margin strips on both sides; text area in between is unobstructed.
function computePrevZonePct(): number {
  if (spreadState.kind === 'cover') return 0;
  if (spreadState.kind === 'backCover') return 8;
  if (spreadState.kind === 'toc') return 50;
  // 3% = page-stack strip only. 100rem overhang covers leather frame + wallpaper.
  return 3;
}
const prevZonePct = $derived(computePrevZonePct());
function computeNextZonePct(): number {
  if (spreadState.kind === 'cover') return 0;
  if (spreadState.kind === 'backCover') return 0;
  return 3;
}
const nextZonePct = $derived(computeNextZonePct());
// 100rem extends the click zone into the wallpaper beside the book at any
// desktop viewport size. overflow-x: clip on body prevents a scrollbar.
const flipOverhangRem = $derived(spreadIndex === 0 ? 0 : 100);
const entryDate = $derived(spreadState.kind === 'entry' ? spreadState.date : null);
const entryDates = $derived(new Set(entryDatePreviews.map((e) => e.entry_date)));

type JournalFont = 'eb-garamond' | 'cedarville-cursive';
const JOURNAL_FONT_OPTIONS: { value: JournalFont; label: string; family: string }[] = [
  {
    value: 'cedarville-cursive',
    label: 'Cedarville Cursive',
    family: 'Cedarville Cursive, cursive',
  },
  { value: 'eb-garamond', label: 'EB Garamond', family: 'EB Garamond, Georgia, serif' },
];

let draftUsername = $state(untrack(() => username));
let draftDiaryTitle = $state(untrack(() => diaryTitle));
let draftFontSizeCqw = $state(untrack(() => fontSizeCqw));
let draftJournalFont = $state(untrack(() => journalFont as JournalFont));
let draftPin = $state('');
let draftConfirm = $state('');
// English voices installed on this device, refreshed when speechSynthesis
// fires `voiceschanged` (Chrome loads voices asynchronously on first paint).
// We key by voiceURI because macOS ships duplicate `name`s (e.g. two "Daniel").
type VoiceOption = { uri: string; name: string; lang: string; isDefault: boolean };
let voiceOptions: VoiceOption[] = $state([]);
let draftVoiceURI: string | null = $state(untrack(() => voiceURI));

$effect(() => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const synth = window.speechSynthesis;
  const refresh = () => {
    voiceOptions = synth
      .getVoices()
      .filter((v) => v.lang.toLowerCase().startsWith('en'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((v) => ({ uri: v.voiceURI, name: v.name, lang: v.lang, isDefault: v.default }));
    // Fall back to device default only when nothing has been saved or picked.
    if (!voiceURI && !draftVoiceURI && voiceOptions.length > 0) {
      const fallback = voiceOptions.find((v) => v.isDefault) ?? voiceOptions[0];
      draftVoiceURI = fallback.uri;
    }
  };
  refresh();
  synth.addEventListener('voiceschanged', refresh);
  return () => {
    synth.removeEventListener('voiceschanged', refresh);
  };
});

function previewVoice() {
  if (typeof window === 'undefined' || !window.speechSynthesis || !draftVoiceURI) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance('Welcome to Edelmore.');
  const picked = synth.getVoices().find((v) => v.voiceURI === draftVoiceURI);
  if (picked) u.voice = picked;
  synth.speak(u);
}
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
    draftVoiceURI !== voiceURI ||
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
    voiceURI = user.voice_uri ?? null;
    if (spreadState.kind !== 'settings') {
      draftUsername = username;
      draftDiaryTitle = diaryTitle;
      draftFontSizeCqw = fontSizeCqw;
      draftJournalFont = journalFont as JournalFont;
      draftVoiceURI = voiceURI;
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
// biome-ignore lint/style/useConst: reassigned in template event handlers — Biome doesn't see those
let activeEditor: 'left' | 'right' | null = $state(null);
// Sticky version of activeEditor — set on focus, NOT cleared on blur.
// Used by the mic-quill so transcription inserts into the textarea the
// user was last writing in, even after clicking the mic button steals
// focus from the textarea.
// biome-ignore lint/style/useConst: reassigned in template event handlers
let lastActiveEditor: 'left' | 'right' = $state('left');
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
  formData.set('voice_uri', draftVoiceURI ?? '');
  formData.set('pin', draftPin);
  formData.set('confirm', draftConfirm);
  const response = await fetch('/settings?/saveSettings', {
    method: 'POST',
    body: formData,
  });
  savingSettings = false;
  // SvelteKit form actions always return HTTP 200; success/failure is in the JSON body.
  let result: { type?: string; data?: string } | null = null;
  try {
    result = await response.json();
  } catch {
    /* non-JSON — treat as failure */
  }
  if (result?.type !== 'success') {
    let errorMessage = 'Could not save settings. Please try again.';
    if (result?.type === 'redirect') {
      errorMessage = 'Session expired. Please reload the page.';
    } else if (typeof result?.data === 'string') {
      try {
        // SvelteKit encodes fail() data as devalue: [{key: index}, ...values]
        const parts: unknown[] = JSON.parse(result.data);
        if (Array.isArray(parts) && typeof parts[1] === 'string') errorMessage = parts[1];
      } catch {
        // keep fallback message
      }
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
  voiceURI = draftVoiceURI;
  draftPin = '';
  draftConfirm = '';
  settingsWarning = false;
  settingsBackArmed = false;
  flip('backward', () => {
    spreadState = prevSpreadState ?? { kind: 'cover' };
    prevSpreadState = null;
  });
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
		<div
			class="book-frame flip-stage relative w-full max-w-5xl aspect-[331/194]"
			class:is-closed={spreadState.kind === 'cover' || spreadState.kind === 'backCover'}
			class:is-cover-state={spreadState.kind === 'cover'}
			class:is-back-cover-state={spreadState.kind === 'backCover'}
		>
		<div class="book-shadow-backdrop" aria-hidden="true"></div>
		<div
				bind:this={bookShellEl}
				class="book-shell"
				class:is-closed={spreadState.kind === 'cover' || spreadState.kind === 'backCover'}
				class:hide-left-stack={spreadState.kind === 'frontEndpaper'}
				class:hide-right-stack={spreadState.kind === 'backEndpaper'}
				style="--page-font-size: {draftFontSizeCqw}cqw; --left-stack: {leftStack}; --right-stack: {rightStack};"
			>
				<div class="book-shell-inner">
				<div class="shell-stack shell-stack-left" aria-hidden="true"></div>
				<div class="shell-stack shell-stack-right" aria-hidden="true"></div>
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
				hideRightPage={spreadState.kind === 'backCover'}
				noBackground={spreadState.kind === 'frontEndpaper' || spreadState.kind === 'backEndpaper' || spreadState.kind === 'cover' || spreadState.kind === 'backCover'}
			>
				{#snippet leftPage()}
					{#if spreadState.kind === 'cover'}
						<!-- blank — front cover fills only the right page -->
					{:else if spreadState.kind === 'frontEndpaper'}
						<div class="endpaper-wrap">
							<div class="endpaper-fill endpaper-fill-left">
								<div class="endpaper-plate-wrap">
									<ExLibrisPage username={username} transparent={true} />
								</div>
							</div>
						</div>
					{:else if spreadState.kind === 'toc'}
						<div class="toc-ornament-page">
							<svg class="toc-ornament-svg" viewBox="0 0 300 400" preserveAspectRatio="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
								<rect x="18" y="18" width="264" height="364" fill="none" stroke="#5c3d1e" stroke-width="1.1"/>
								<rect x="24" y="24" width="252" height="352" fill="none" stroke="#5c3d1e" stroke-width="0.5"/>
								<path d="M18,38 L18,18 L38,18"   fill="none" stroke="#5c3d1e" stroke-width="0.8" stroke-linecap="round"/>
								<path d="M282,38 L282,18 L262,18" fill="none" stroke="#5c3d1e" stroke-width="0.8" stroke-linecap="round"/>
								<path d="M18,362 L18,382 L38,382" fill="none" stroke="#5c3d1e" stroke-width="0.8" stroke-linecap="round"/>
								<path d="M282,362 L282,382 L262,382" fill="none" stroke="#5c3d1e" stroke-width="0.8" stroke-linecap="round"/>
								<circle cx="150" cy="18" r="2"  fill="#5c3d1e"/>
								<circle cx="150" cy="382" r="2" fill="#5c3d1e"/>
								<circle cx="18"  cy="200" r="2" fill="#5c3d1e"/>
								<circle cx="282" cy="200" r="2" fill="#5c3d1e"/>
							</svg>
						</div>
					{:else if spreadState.kind === 'settings'}
						<div class="h-full w-full bg-transparent"></div>
					{:else if spreadState.kind === 'backEndpaper'}
						<div class="endpaper-wrap">
							<div class="endpaper-fill endpaper-fill-left">
								<img src="/girls.png" alt="" aria-hidden="true" class="about-girls-left" />
							</div>
						</div>
					{:else if spreadState.kind === 'backCover'}
						<div role="presentation" class="h-full w-full">
							<CoverPage config={activeCover} {username} {diaryTitle} backCover={true} />
						</div>
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
								onfocus={() => { activeEditor = 'left'; lastActiveEditor = 'left'; }}
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
					<!-- settings button moved to spell panel ribbon -->

					{#if spreadState.kind === 'settings'}
						<div class="absolute inset-0 px-8 pt-10 pb-8 overflow-hidden font-serif">
							<div class="flex h-full flex-col">
								<div class="flex-1 space-y-4">
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
										<p class="text-[0.6rem] tracking-[0.22em] uppercase text-stone-400 mb-2">Reading Voice</p>
										{#if voiceOptions.length === 0}
											<p class="text-[0.7rem] italic text-stone-400">No voices on this device yet.</p>
										{:else}
											<div class="flex items-center gap-2">
												<select bind:value={draftVoiceURI} class="flex-1 bg-transparent border-b border-stone-300 text-ink-900 text-sm pb-1 outline-none focus:border-stone-500 transition-colors">
													{#each voiceOptions as v}
														<option value={v.uri}>{v.name} ({v.lang})</option>
													{/each}
												</select>
												<button type="button" onclick={previewVoice} aria-label="Preview voice" class="w-7 h-7 border border-stone-300 text-stone-500 text-sm leading-none hover:border-stone-500 hover:text-ornament-gold transition-colors flex items-center justify-center">▶</button>
											</div>
										{/if}
									</section>

									<section>
										<p class="text-[0.6rem] tracking-[0.22em] uppercase text-stone-400 mb-1">Change PIN</p>
										<p class="text-[0.6rem] italic text-stone-400 mb-2">4 digits — no current PIN required</p>
										<input type="password" bind:value={draftPin} inputmode="numeric" pattern="\d{4}" maxlength="4" placeholder="New PIN" class="mb-2 w-full bg-transparent border-b border-stone-300 text-ink-900 text-sm pb-1 outline-none focus:border-stone-500 transition-colors" />
										<input type="password" bind:value={draftConfirm} inputmode="numeric" pattern="\d{4}" maxlength="4" placeholder="Confirm PIN" class="w-full bg-transparent border-b border-stone-300 text-ink-900 text-sm pb-1 outline-none focus:border-stone-500 transition-colors" />
									</section>
								</div>

								<div class="mt-4 flex items-end justify-end gap-3">
									{#if settingsWarning}
										<span class="settings-warning-text">{settingsWarningText}</span>
									{/if}
									<a href="/logout" data-sveltekit-reload class="settings-logout-link">Log out</a>
									<button type="button" onclick={closeSettings} class="settings-back-link">← Back</button>
									<button type="button" onclick={saveSettings} disabled={!settingsDirty || savingSettings} class="settings-save-link">{savingSettings ? 'Saving…' : 'Save'}</button>
								</div>
							</div>
						</div>
					{:else if spreadState.kind === 'entry'}
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
								onfocus={() => { activeEditor = 'right'; lastActiveEditor = 'right'; }}
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
					{:else if spreadState.kind === 'frontEndpaper'}
						<div class="endpaper-wrap"><div class="endpaper-fill endpaper-fill-right"></div></div>
					{:else if spreadState.kind === 'toc'}
						<TocPage entries={entryDatePreviews} onNavigate={navigateTo} />
					{:else if spreadState.kind === 'cover'}
						<div role="presentation" class="h-full w-full cursor-pointer" onclick={onFlipNext}>
							<CoverPage config={activeCover} {username} {diaryTitle} showSettings={true} buttonLabel="Turn to today" onOpenSettings={() => { void flip('forward', () => navigateTo(todayIso())); }} />
						</div>
					{:else if spreadState.kind === 'backEndpaper'}
						<div class="endpaper-wrap">
							<div class="endpaper-fill endpaper-fill-right">
							<div class="back-label-sticker">
								<img src="/label.png" alt="" aria-hidden="true" class="back-label-img" />
								<div class="back-label-text">
									<p class="ep-about-section">About</p>
									<p class="ep-about-title">Edelmore</p>
									<p class="ep-about-subtitle">(Edelweiss + Evermore)</p>
									<p class="ep-about-body">A private diary shaped like a book.</p>
									<p class="ep-about-body">Made for Iona, Ada, &amp; Isla — and anyone else who wants a quiet place that belongs to them — by their dad, Andrew. atmarcus.net</p>
									<p class="ep-about-body">Inspired by <em>Little House on the Prairie</em>, <em>All-of-a-Kind Family</em>, and <em>the diary of Anne Frank</em>.</p>
									<p class="ep-about-body">Saves itself. Tells your story. Listens when your hands are tired.</p>
									<p class="ep-about-body">Built with Universal Design for Learning. udlguidelines.cast.org</p>
									<p class="ep-about-body">Runs at home.</p>
								</div>
							</div>
						</div>
						</div>
					{/if}
				{/snippet}
			</Spread>
				<div class="shell-seam" aria-hidden="true"></div>
				</div><!-- /book-shell-inner -->
		</div><!-- /book-shell -->
		{#if spreadState.kind !== 'cover' && spreadState.kind !== 'backCover'}
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
									<li><span class="spell-code">_word_</span> <u>extra important</u></li>
									<li><span class="spell-code">~word~</span> <s>crossed out</s></li>
							</ul>
							<div class="spell-buttons">
								<div class="spell-quill">
									<MicQuill oninsert={handleTranscriptionInsert} />
								</div>
								<div class="spell-bird-cluster">
									<button type="button" onclick={speakEntry} class="spell-bird" class:is-playing={birdPhase === 'playing'} class:is-paused={birdPhase === 'paused'} aria-label={birdPhase === 'playing' ? 'Pause' : birdPhase === 'paused' ? 'Resume' : 'Listen'}>
										<img src="/bird.svg" style="width: 100%; height: 100%; object-fit: contain" alt="" />
										<span class="spell-bird-note" aria-hidden="true">♪</span>
									</button>
									<div class="spell-bird-speed" class:is-visible={birdPhase !== 'idle'}>
										<button type="button" onclick={() => changeBirdRate(-0.2)} class="spell-bird-tortoise" aria-label="Slower" disabled={birdRate <= 0.2}>
											<img src="/tortoise.png" alt="" />
										</button>
										<button type="button" onclick={() => setBirdRate(1.0)} class="spell-bird-rate-reset" aria-label="Reset speed" disabled={birdRate === 1.0}></button>
										<button type="button" onclick={() => changeBirdRate(0.05)} class="spell-bird-hare" aria-label="Faster" disabled={birdRate >= 1.3}>
											<img src="/hare.png" alt="" />
										</button>
									</div>
								</div>
								<button type="button" onclick={() => { void flip('backward', () => { spreadState = { kind: 'toc' }; }); }} class="spell-entries" aria-label="Recent entries">
									<img src="/entries.svg" style="width: 100%; height: 100%; object-fit: contain" alt="" />
								</button>
									<button type="button" onclick={() => { void flip('forward', () => navigateTo(todayIso())); }} class="spell-today" aria-label="Turn to today">
										<img src="/now.svg" style="width: 100%; height: 100%; object-fit: contain" alt="" />
									</button>
								<button type="button" onclick={openSettings} class="spell-settings" aria-label="Settings">
									<img src="/edelweiss.svg" style="width: 100%; height: 100%; object-fit: contain" alt="" />
								</button>
							</div>
							</div>
					</div>
				</div>
		{/if}
		</div><!-- /book-frame -->
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
					<div class="mobile-mic-quill">
						<MicQuill oninsert={handleTranscriptionInsert} />
					</div>
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
					<a href="/logout" data-sveltekit-reload class="settings-logout-link" aria-label="Log out">Log out</a>
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

	.settings-logout-link {
		font-family: 'Rouge Script', cursive;
		font-size: 1.6rem;
		color: #8b6914;
		text-decoration: none;
		margin-right: auto;
		text-shadow:
			0 1px 2px rgba(255, 250, 230, 0.45),
			0 -1px 0 rgba(0, 0, 0, 0.25);
		transition: opacity 0.15s;
	}

	.settings-logout-link:hover {
		opacity: 0.7;
	}

	.settings-back-link {
		font-family: 'Rouge Script', cursive;
		font-size: 1.6rem;
		color: #8b6914;
		text-shadow:
			0 1px 2px rgba(255, 250, 230, 0.45),
			0 -1px 0 rgba(0, 0, 0, 0.25);
	}

	/* ── TOC left page decorative border ────────────────────────────────── */

	.toc-ornament-page {
		position: relative;
		width: 100%;
		height: 100%;
	}

	.toc-ornament-svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	/* ── Endpaper pages (front + back) ──────────────────────────────────── */

	.endpaper-wrap {
		position: absolute;
		inset: 0;
		border-radius: 5px;
		overflow: hidden;
	}

	.endpaper-fill {
		position: absolute;
		inset: 0;
		background: url('/marble.png') center / cover;
		/* Pressed-flat feel — deeper corner vignette */
		box-shadow: inset 0 0 50px rgba(0, 0, 0, 0.10);
	}

	/* Gutter shadow: glued edge where the paper meets the spine */
	.endpaper-fill-left {
		box-shadow:
			inset -10px 0 24px rgba(0, 0, 0, 0.18),
			inset 0 0 40px rgba(0, 0, 0, 0.08);
		clip-path: polygon(
			0% 0%, 100% 0%, 100% 100%, 0% 100%,
			3px 82%, 1px 60%, 4px 38%, 0px 16%, 0% 0%
		);
	}

	.endpaper-fill-right {
		box-shadow:
			inset 10px 0 24px rgba(0, 0, 0, 0.18),
			inset 0 0 40px rgba(0, 0, 0, 0.08);
		clip-path: polygon(
			0% 0%,
			calc(100% - 2px) 0%, 100% 18%,
			calc(100% - 3px) 42%, 100% 64%,
			calc(100% - 1px) 86%, 100% 100%,
			0% 100%
		);
	}

	/* Bookplate centered on the left front endpaper */
	.endpaper-plate-wrap {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
	}

	.endpaper-plate-wrap > :global(*) {
		width: 62%;
		height: auto;
		position: relative;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.22), 0 1px 3px rgba(0, 0, 0, 0.12);
	}

	/* Girls photo on back endpaper left page */
	.about-girls-left {
		position: absolute;
		bottom: 16%;
		right: 14%;
		width: 54%;
		height: auto;
		object-fit: contain;
		pointer-events: none;
	}

	/* Back endpaper: label centered at 40% page width; text scales with sticker */
	.back-label-sticker {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 65%;
		container-type: inline-size;
	}

	.back-label-img {
		width: 100%;
		height: auto;
		display: block;
		pointer-events: none;
	}

	.back-label-text {
		position: absolute;
		inset: 12% 8% 8% 8%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		gap: 0.8cqi;
		overflow: hidden;
	}

	.ep-about-section {
		font-family: 'EB Garamond', Georgia, serif;
		font-size: 5cqi;
		color: #6a4a28;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		margin: 0 0 0.5cqi;
		flex-shrink: 0;
	}

	.ep-about-title {
		font-family: 'Rouge Script', cursive;
		font-size: 14cqi;
		color: #3a2510;
		font-weight: 400;
		line-height: 1.0;
		margin: 0;
		flex-shrink: 0;
	}

	.ep-about-subtitle {
		font-family: 'EB Garamond', Georgia, serif;
		font-size: 4.5cqi;
		color: #6a4a28;
		font-style: italic;
		margin: 0 0 1cqi;
		flex-shrink: 0;
	}

	.ep-about-body {
		font-family: 'EB Garamond', Georgia, serif;
		font-size: 4.5cqi;
		color: #4a3520;
		line-height: 1.4;
		margin: 0;
		flex-shrink: 0;
	}

	/* ── Shell stack suppression for endpaper states ────────────────────── */

	.book-shell.hide-left-stack .shell-stack-left {
		opacity: 0;
	}

	.book-shell.hide-right-stack .shell-stack-right {
		opacity: 0;
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
		left: 50%;
		transform: translateX(-50%);
		z-index: 30;
		width: 93%;
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
		overflow: visible;
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
		width: 100%;
		flex: 1 1 auto;
		gap: 1cqi;
		min-width: 0;
		overflow: visible;
		opacity: 0;
		transform: translateX(-0.5rem);
		pointer-events: none;
		/* Closing transition: fade out fast and immediately, so the content
		   is gone before the panel finishes shrinking — otherwise the panel
		   is small but the spell-list text is still visible "ghosted" outside
		   the panel's box (panel has overflow:visible so the tooltip can
		   render below). The opening transition is overridden by the
		   .is-open rule below with a delay so the text appears after the
		   panel has grown. */
		transition: opacity 0.25s ease 0s, transform 0.25s ease 0s;
	}

	.spell-panel.is-open .spell-panel-content {
		opacity: 1;
		transform: translateX(0);
		pointer-events: auto;
		/* Opening: delay until the panel has mostly grown, then fade in. */
		transition: opacity 0.45s ease 0.45s, transform 0.45s ease 0.45s;
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
		gap: 1.0cqi;
		font-size: 1.42cqi;
		white-space: nowrap;
	}

	.spell-list li {
		display: flex;
		align-items: center;
		gap: 0.5cqi;
	}

	.spell-code {
		font-family: 'Courier New', monospace;
		font-size: 1.3cqi;
		color: #8b6914;
		background: rgba(139, 105, 20, 0.08);
		padding: 0 0.4cqi;
		border-radius: 2px;
	}

	.spell-buttons {
		margin-left: auto;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 0.4cqi;
	}

	.spell-settings,
	.spell-today,
	.spell-entries,
	.spell-bird {
		position: relative;
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 0.22cqi;
		opacity: 0.65;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 3.6cqi;
		height: 3.6cqi;
	}

	/* MicQuill wrapper — sized to match the existing ribbon buttons. The
	   component itself is layout-agnostic; this wrapper provides the slot. */
	.spell-quill {
		position: relative;
		width: 3.6cqi;
		height: 3.6cqi;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* MicQuill on mobile top nav — fixed rem sizing (no container query). */
	.mobile-mic-quill {
		position: relative;
		width: 1.5rem;
		height: 1.5rem;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.spell-settings:hover,
	.spell-today:hover,
	.spell-entries:hover,
	.spell-bird:hover,
	.spell-bird.is-playing,
	.spell-bird.is-paused {
		opacity: 1;
	}

	.spell-bird-note {
		position: absolute;
		top: 0.2cqi;
		right: 0.2cqi;
		font-size: 1.6cqi;
		line-height: 1;
		color: #c8362d;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.15s ease;
	}
	.spell-bird.is-playing .spell-bird-note {
		opacity: 1;
	}
	.spell-bird.is-paused .spell-bird-note {
		opacity: 0.35;
	}

	/* Bird + speed-control cluster. The cluster takes the same slot the bird
	   used to take; the speed control floats below the bird as an overlay so
	   it doesn't change the ribbon's layout. */
	.spell-bird-cluster {
		position: relative;
		width: 3.6cqi;
		height: 3.6cqi;
		flex-shrink: 0;
	}
	.spell-bird-cluster .spell-bird {
		width: 100%;
		height: 100%;
	}
	.spell-bird-speed {
		position: absolute;
		top: calc(100% + 1.2cqi);
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: flex-end;
		justify-content: center;
		gap: 1cqi;
		padding: 0.4cqi 0.9cqi;
		background: rgba(254, 252, 247, 0.96);
		border: 1px solid #dfc9a4;
		border-radius: 1.4cqi;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.2s ease;
		z-index: 40;
	}
	.spell-bird-speed.is-visible {
		opacity: 1;
		pointer-events: auto;
	}
	.spell-bird-tortoise,
	.spell-bird-hare {
		width: 2.4cqi;
		height: 2.4cqi;
		background: transparent;
		border: none;
		padding: 0;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.spell-bird-tortoise img,
	.spell-bird-hare img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		object-position: center bottom;
		opacity: 0.5;
		transition: opacity 0.15s ease;
	}
	.spell-bird-tortoise:hover:not(:disabled) img,
	.spell-bird-hare:hover:not(:disabled) img {
		opacity: 1;
	}
	.spell-bird-tortoise:disabled,
	.spell-bird-hare:disabled {
		cursor: not-allowed;
	}
	.spell-bird-tortoise:disabled img,
	.spell-bird-hare:disabled img {
		opacity: 0.2;
	}

	.spell-bird-rate-reset {
		align-self: center;
		width: 0.7cqi;
		height: 0.7cqi;
		border-radius: 50%;
		background: #4a3728;
		border: none;
		padding: 0;
		cursor: pointer;
		opacity: 0.45;
		transition: opacity 0.15s ease;
	}
	.spell-bird-rate-reset:hover:not(:disabled) {
		opacity: 1;
	}
	.spell-bird-rate-reset:disabled {
		cursor: default;
		opacity: 0.2;
	}

	/* ── Ribbon tooltips ─────────────────────────────────────────────────── */
	.spell-panel.is-closed .spell-flower::after { content: "open"; }
	.spell-panel.is-open  .spell-flower::after  { content: "close"; }
	.spell-quill::after    { content: "speak"; }
	.spell-bird::after     { content: "listen"; }
	.spell-today::after    { content: "today"; }
	.spell-entries::after  { content: "recent entries"; }
	.spell-settings::after { content: "settings"; }

	.spell-flower::after,
	.spell-quill::after,
	.spell-bird::after,
	.spell-today::after,
	.spell-entries::after,
	.spell-settings::after {
		position: absolute;
		top: calc(100% + 1.2cqi);
		left: 50%;
		transform: translateX(-50%) scale(0.88);
		font-family: 'Rouge Script', cursive;
		font-size: 1.9cqi;
		color: #4a3728;
		background: rgba(254, 252, 247, 0.96);
		border: 1px solid #dfc9a4;
		padding: 0.12cqi 0.55cqi;
		border-radius: 0.5cqi;
		white-space: nowrap;
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.18s ease, transform 0.18s ease;
		z-index: 40;
	}

	.spell-flower:hover::after,
	.spell-flower:focus-visible::after,
	.spell-quill:hover::after,
	.spell-quill:focus-within::after,
	.spell-bird:hover::after,
	.spell-bird:focus-visible::after,
	.spell-today:hover::after,
	.spell-today:focus-visible::after,
	.spell-entries:hover::after,
	.spell-entries:focus-visible::after,
	.spell-settings:hover::after,
	.spell-settings:focus-visible::after {
		opacity: 1;
		transform: translateX(-50%) scale(1);
	}

	.book-frame {
		/* spell-anchor uses cqi units; book-frame is its container since AT-01
		   moved spell-anchor out of book-shell. */
		container-type: inline-size;
	}

	/* Leather edge is on a pseudo so we can fade it (image backgrounds can't
	   transition smoothly between url() and none). */
	.book-frame::before {
		content: '';
		position: absolute;
		inset: 0;
		background: url('/edge.png') center / 100% 100% no-repeat;
		z-index: -1;
		transition: opacity 700ms cubic-bezier(0.4, 0, 0.2, 1);
	}

	.book-frame.is-closed::before {
		opacity: 0;
	}

	.book-shell {
		position: absolute;
		width: 93%;
		height: 93%;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		container-type: inline-size;
		/* Depth shadow lives on .book-shell-inner (below). The rotating flip
		   wrapper is appended to .book-shell as a sibling of .book-shell-inner,
		   so the filter only traces the static content (stacks + spread +
		   seam) and is unaffected by the rotation and the flip-hidden lives. */
		/* Smooth the open ↔ closed structural transition so the book reshapes
		   in sync with the page-flip rotation rather than snapping instantly. */
		transition:
			width 700ms cubic-bezier(0.4, 0, 0.2, 1),
			height 700ms cubic-bezier(0.4, 0, 0.2, 1),
			top 700ms cubic-bezier(0.4, 0, 0.2, 1),
			left 700ms cubic-bezier(0.4, 0, 0.2, 1),
			transform 700ms cubic-bezier(0.4, 0, 0.2, 1);
	}

	/* .book-shell stays at 93%×93% in all states (open and closed). Earlier
	   .is-closed sized it to 100%×100% to make the closed cover fill the
	   book-frame, but that produced a visible shift+zoom during open/close
	   transitions: book-shell and its contents resized while the leather
	   frame faded in. Keeping the size constant means the physical book
	   doesn't appear to change size when opened — only the leather frame
	   and the page rotation animate. */

	/* Wraps the static content (stacks + spread + seam). No filter — the
	   depth shadow now lives on a dedicated .book-shadow-backdrop element
	   that the flip mechanics never touch, so it's genuinely static. */
	.book-shell-inner {
		position: absolute;
		inset: 0;
	}

	/* Static depth shadow. Sized to match the visible book silhouette for
	   each state (open / cover / backCover). Sits behind .book-shell, has
	   no children, no flips touch it — its box-shadow never recomputes
	   during a flip, so there's no flash. */
	.book-shadow-backdrop {
		position: absolute;
		width: 93%;
		height: 93%;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		box-shadow:
			0 20px 60px rgba(0, 0, 0, 0.45),
			0 6px 18px  rgba(0, 0, 0, 0.30),
			0 2px 4px   rgba(0, 0, 0, 0.20);
		pointer-events: none;
		z-index: 0;
		border-radius: 4px;
		transition:
			width 700ms cubic-bezier(0.4, 0, 0.2, 1),
			height 700ms cubic-bezier(0.4, 0, 0.2, 1),
			top 700ms cubic-bezier(0.4, 0, 0.2, 1),
			left 700ms cubic-bezier(0.4, 0, 0.2, 1),
			transform 700ms cubic-bezier(0.4, 0, 0.2, 1),
			opacity 700ms cubic-bezier(0.4, 0, 0.2, 1);
	}

	/* Cover/back-cover (closed): hide the rectangular backdrop. The
	   filter:drop-shadow on .cover-photo (in CoverPage.svelte) provides
	   the shadow, tracing the image's actual alpha mask so soft edges in
	   the PNG get followed organically. */
	.book-frame.is-cover-state .book-shadow-backdrop,
	.book-frame.is-back-cover-state .book-shadow-backdrop {
		opacity: 0;
	}

	/* Re-add the flip-hidden class for the live-page hide during flips. */
	:global(.flip-hidden) {
		visibility: hidden !important;
	}



	/* ── Shell stacks (procedural, no DOM per leaf) ──────────────────────── */

	.shell-stack {
		position: absolute;
		top: 0;
		bottom: 0;
		pointer-events: none;
		z-index: 0;
		transition: opacity 700ms cubic-bezier(0.4, 0, 0.2, 1);
	}

	.shell-stack-left {
		left: calc(-1 * var(--left-stack) * 3cqw);
		width: calc(var(--left-stack) * 3cqw);
		border-radius: 3px 0 0 3px;
		background:
			linear-gradient(to right, rgba(0, 0, 0, 0) 40%, rgba(0, 0, 0, 0.10) 100%),
			repeating-linear-gradient(
				to right,
				#f0e3c6 0,             #f0e3c6 2px,
				rgba(0,0,0,0.28) 2px,  rgba(0,0,0,0.28) 2.5px,
				#ece0bc 2.5px,         #ece0bc 4.5px,
				rgba(0,0,0,0.22) 4.5px, rgba(0,0,0,0.22) 5px,
				#f3e7cb 5px,           #f3e7cb 7px,
				rgba(0,0,0,0.25) 7px,  rgba(0,0,0,0.25) 7.5px,
				#e8d9b2 7.5px,         #e8d9b2 9.5px,
				rgba(0,0,0,0.22) 9.5px, rgba(0,0,0,0.22) 10px
			);
		mask-image: linear-gradient(to right, black 60%, rgba(0, 0, 0, 0.75) 100%);
	}

	.shell-stack-right {
		right: calc(-1 * var(--right-stack) * 3cqw);
		width: calc(var(--right-stack) * 3cqw);
		border-radius: 0 3px 3px 0;
		background:
			linear-gradient(to left, rgba(0, 0, 0, 0) 40%, rgba(0, 0, 0, 0.10) 100%),
			repeating-linear-gradient(
				to left,
				#f0e3c6 0,             #f0e3c6 2px,
				rgba(0,0,0,0.28) 2px,  rgba(0,0,0,0.28) 2.5px,
				#ece0bc 2.5px,         #ece0bc 4.5px,
				rgba(0,0,0,0.22) 4.5px, rgba(0,0,0,0.22) 5px,
				#f3e7cb 5px,           #f3e7cb 7px,
				rgba(0,0,0,0.25) 7px,  rgba(0,0,0,0.25) 7.5px,
				#e8d9b2 7.5px,         #e8d9b2 9.5px,
				rgba(0,0,0,0.22) 9.5px, rgba(0,0,0,0.22) 10px
			);
		mask-image: linear-gradient(to left, black 60%, rgba(0, 0, 0, 0.75) 100%);
	}

	/* ── Gutter seam (persistent, above spread, below modals) ───────────── */

	.shell-seam {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 50%;
		width: 6px;
		transform: translateX(-50%);
		pointer-events: none;
		z-index: 5;
		transition: opacity 700ms cubic-bezier(0.4, 0, 0.2, 1);
		background:
			linear-gradient(
				to right,
				rgba(0, 0, 0, 0.18) 0%,
				rgba(0, 0, 0, 0.05) 30%,
				rgba(0, 0, 0, 0.08) 50%,
				rgba(0, 0, 0, 0.05) 70%,
				rgba(0, 0, 0, 0.18) 100%
			);
	}

	.book-shell.is-closed .shell-seam,
	.book-shell.is-closed .shell-stack {
		opacity: 0;
		transition: none;
	}

	.spell-flower {
		position: relative;
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
