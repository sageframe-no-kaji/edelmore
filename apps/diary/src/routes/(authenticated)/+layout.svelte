<script lang="ts">
import { deserialize } from '$app/forms';
import { goto, invalidateAll } from '$app/navigation';
import { page } from '$app/stores';
import CalendarModal from '$lib/components/CalendarModal.svelte';
import CoverPage from '$lib/components/CoverPage.svelte';
import ExLibrisPage from '$lib/components/ExLibrisPage.svelte';
import MicQuill from '$lib/components/MicQuill.svelte';
import ReaderView from '$lib/components/ReaderView.svelte';
import { BookShell, Spread } from '@edelmore/book';
import TocPage from '$lib/components/TocPage.svelte';
import { findCover } from '$lib/covers.js';
import { applyPageEdit, insertAtAnchor, sideForOffset, spreadForOffset } from '$lib/content.js';
import { todayIso } from '$lib/dates.js';
import type { EntryDatePreview } from '$lib/db.js';
import {
  audioBlobUrlFromBase64,
  isKokoroVoiceUri,
  type StreamChunk,
  type WordTiming,
} from '$lib/narration.js';
import { findSplitIndex, snapToWordBreak } from '$lib/overflow.js';
import type { Snippet } from 'svelte';
import { onMount, tick, untrack } from 'svelte';
import { cubicInOut } from 'svelte/easing';
import { fade, slide } from 'svelte/transition';

type SpreadState =
  | { kind: 'cover' }
  | { kind: 'frontEndpaper' }
  | { kind: 'toc' }
  | { kind: 'entry'; date: string }
  | { kind: 'settings' }
  | { kind: 'backEndpaper' }
  | { kind: 'backCover' };

const { children }: { children: Snippet } = $props();

// ── Page-flip primitive (now extracted to @edelmore/book) ──────────────────
//
// Visual mechanics live inside <BookShell>. Two diary-specific behaviors
// remain here and wrap the package's flip() via diaryFlip below:
//   - flushPendingSave() before any flip out of an entry, because spreadState
//     change cancels the autosave debounce timer.
//   - restoreRetryNonce += 1 after each flip, because a caret restore that
//     fired during the flip's visibility:hidden window needs to retry once
//     the live pages are visible again.

// biome-ignore lint/style/useConst: bind:this requires let
let shell: {
  flip: (
    direction: 'forward' | 'backward',
    mutate: () => void | Promise<void>
  ) => Promise<void>;
} | null = $state(null);

async function diaryFlip(
  direction: 'forward' | 'backward',
  mutate: () => void | Promise<void>
): Promise<void> {
  if (spreadState.kind === 'entry') void flushPendingSave();
  if (!shell) {
    await mutate();
    return;
  }
  await shell.flip(direction, mutate);
  // Re-apply any caret restore that fired while the live pages were hidden.
  restoreRetryNonce += 1;
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
// True after a failed save; cleared on the next success. Drives the
// "Not saved yet" indicator so failure is never silently shown as "Saved".
let saveFailed = $state(false);
// Bumped after a failed save (3s delay) to re-run the autosave effect.
let saveRetryNonce = $state(0);
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
// Content is only reset when the DATE actually changes: the effect also
// re-fires on any load re-run for the same date (e.g. invalidateAll after
// saving settings), and resetting content then would clobber anything
// typed inside the autosave debounce window.
let lastSyncedDate: string | null = $page.params.date ?? null;
$effect(() => {
  const date = $page.params.date;
  // biome-ignore lint/suspicious/noExplicitAny: layout has no type access to child page data
  const d = $page.data as any;
  untrack(() => {
    if (date) {
      const dateChanged = date !== lastSyncedDate;
      lastSyncedDate = date;
      spreadState = { kind: 'entry', date };
      prevDate = d.prevDate ?? null;
      nextDate = d.nextDate ?? null;
      entryDatePreviews = d.entryDatePreviews ?? [];
      if (dateChanged) {
        content = d.content ?? '';
        serverContent = d.content ?? '';
        stopBird();
      }
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
// On failure the save is NOT marked synced: the failure is shown, and
// saveRetryNonce re-arms the effect so the save retries until it lands.
$effect(() => {
  const c = content;
  void saveRetryNonce; // dependency: bumped after a failed save to retry
  if (c === serverContent) return;
  const date = spreadState.kind === 'entry' ? spreadState.date : null;
  if (!date) return;
  const timer = setTimeout(async () => {
    /* v8 ignore next 31 */
    if (!c.trim()) {
      // Entry emptied — delete the row but STAY on the page. Navigating
      // away mid-edit yanked the book out from under a writer who cleared
      // the page to rewrite it, and the retyped text could land on a
      // different day. flushEmptyEntry still prunes blank pages on leave.
      stopBird();
      try {
        await fetch(`/api/entries/${date}`, { method: 'DELETE' });
        serverContent = c;
        // Keep today's row (the server always lists today); drop others.
        if (date === todayIso()) {
          entryDatePreviews = entryDatePreviews.map((e) =>
            e.entry_date === date ? { entry_date: date, preview: '' } : e
          );
        } else {
          entryDatePreviews = entryDatePreviews.filter((e) => e.entry_date !== date);
        }
      } catch {
        // Delete is retried by flushEmptyEntry when the user leaves.
      }
      return;
    }
    try {
      const res = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, content: c }),
      });
      if (!res.ok) throw new Error(`save failed: HTTP ${res.status}`);
      serverContent = c;
      upsertPreview(date, c);
      saved = true;
      saveFailed = false;
      setTimeout(() => {
        saved = false;
      }, 1000);
    } catch (e) {
      console.warn('Autosave failed; retrying', e);
      saveFailed = true;
      setTimeout(() => {
        saveRetryNonce += 1;
      }, 3000);
    }
  }, 1500);
  return () => clearTimeout(timer);
});

// Keep the TOC preview list in step with what's being written — including
// re-adding a date that the empty-entry delete pruned and was then retyped.
// Mirrors makeEntryPreview in db.ts (not importable client-side: db.ts
// pulls in better-sqlite3).
function upsertPreview(date: string, c: string) {
  const firstLine = c.split('\n')[0].trimStart();
  const preview = firstLine.length <= 20 ? firstLine : `${firstLine.slice(0, 20)}…`;
  const idx = entryDatePreviews.findIndex((e) => e.entry_date === date);
  if (idx >= 0) {
    entryDatePreviews[idx] = { entry_date: date, preview };
  } else {
    entryDatePreviews = [...entryDatePreviews, { entry_date: date, preview }].sort((a, b) =>
      a.entry_date.localeCompare(b.entry_date)
    );
  }
}

// If the entry we're leaving has been emptied, delete it before we go.
// The debounced autosave also deletes empty entries, but a quick navigation
// cancels that timer — so a blank day would otherwise linger in the DB and
// stay flippable. Pruning the preview list here drops it from the book
// immediately; awaiting the DELETE keeps a subsequent server load from
// re-reading the row before it's gone.
async function flushEmptyEntry() {
  if (spreadState.kind !== 'entry') return;
  if (content.trim() !== '') return;
  const date = spreadState.date;
  entryDatePreviews = entryDatePreviews.filter((e) => e.entry_date !== date);
  serverContent = '';
  stopBird();
  await fetch(`/api/entries/${date}`, { method: 'DELETE' });
}

// Flush debounced-but-unsent content before leaving the page. The autosave
// effect's pending timer is destroyed when navigation reassigns `content`,
// so without this, anything typed in the last 1.5s was silently lost.
// keepalive lets the request survive document teardown (tab close).
/* v8 ignore next 17 */
async function flushPendingSave() {
  if (spreadState.kind !== 'entry') return;
  const c = content;
  if (c === serverContent || !c.trim()) return; // empty pages → flushEmptyEntry
  const date = spreadState.date;
  try {
    const res = await fetch('/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, content: c }),
      keepalive: true,
    });
    if (res.ok) serverContent = c;
  } catch {
    // Still on the page → the autosave retry loop picks it up.
  }
}

async function navigateTo(date: string) {
  await flushPendingSave();
  await flushEmptyEntry();
  /* v8 ignore next 7 */
  const res = await fetch(`/api/entries/${date}`);
  if (res.ok) {
    const data = await res.json();
    content = data.content;
    serverContent = data.content;
  }
  await goto(`/${date}`);
}

// Voice anchor — absolute offset into `content`, captured the moment recording
// starts. The transcription lands here regardless of page flips, reflow, or
// spread changes during the recording. null = no anchor captured; append at the
// end of the entry.
let voiceAnchor: number | null = null;
// The entry (day) the anchor indexes into. The absolute offset only means
// something inside this day's `content`; if the reader navigates to another
// day mid-recording, we go back here before inserting.
let voiceAnchorDate: string | null = null;
function handleRecordingStart() {
  voiceAnchorDate = entryDate;
  // The user just clicked the mic button, so activeEditor is already null —
  // lastActiveEditor remembers which side they were writing on (sticky across
  // blur). Recording from outside an entry (toc, settings) has no textarea;
  // the transcription appends to the end of the entry.
  const target = lastActiveEditor === 'right' ? rightTextareaEl : textareaEl;
  if (!target || spreadState.kind !== 'entry') {
    voiceAnchor = content.length;
    return;
  }
  const pageStart =
    lastActiveEditor === 'right'
      ? (splitPoints[entryPageSpread * 2] ?? 0)
      : entryPageSpread === 0
        ? 0
        : (splitPoints[entryPageSpread * 2 - 1] ?? 0);
  voiceAnchor = pageStart + target.selectionStart;
}

async function handleTranscriptionInsert(text: string) {
  if (!text) return;
  const anchor = voiceAnchor ?? content.length;
  const anchorDate = voiceAnchorDate;
  voiceAnchor = null;
  voiceAnchorDate = null;
  // Dictation pins to the entry it began in. If the reader navigated to a
  // different day mid-recording, go back to that day before inserting — the
  // anchor is an offset into THAT day's content, not the current view's.
  if (anchorDate && anchorDate !== entryDate) {
    await navigateTo(anchorDate);
  }
  const result = insertAtAnchor(content, anchor, text);
  content = result.content;
  // Side-less restore: once pagination reflects the grown content, the
  // projection effect jumps to the spread containing the insertion and
  // lands the caret at its end.
  pendingCursorRestore = { absPos: result.cursorPos };
}

function onFlipNext() {
  if (spreadState.kind === 'cover') {
    diaryFlip('forward', () => {
      spreadState = { kind: 'frontEndpaper' };
    });
  } else if (spreadState.kind === 'frontEndpaper') {
    diaryFlip('forward', () => {
      spreadState = { kind: 'toc' };
    });
  } else if (spreadState.kind === 'toc') {
    if (entryDatePreviews.length > 0) {
      diaryFlip('forward', () => navigateTo(entryDatePreviews[0].entry_date));
    } else {
      // First use: no entries yet — flip straight to today so there's
      // somewhere to land and the book doesn't feel broken.
      diaryFlip('forward', () => navigateTo(todayIso()));
    }
  } else if (spreadState.kind === 'entry') {
    if (entryPageSpread < entrySpreadCount - 1) {
      diaryFlip('forward', () => {
        entryPageSpread += 1;
      });
    } else if (nextDate) {
      const target = nextDate;
      diaryFlip('forward', () => navigateTo(target));
    } else {
      // Last entry — flip into the back of the book.
      diaryFlip('forward', () => {
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
    diaryFlip('forward', () => {
      spreadState = { kind: 'backEndpaper' };
    });
  } else if (spreadState.kind === 'backEndpaper') {
    diaryFlip('forward', () => {
      spreadState = { kind: 'backCover' };
    });
  }
}

function onFlipPrev() {
  if (spreadState.kind === 'backCover') {
    diaryFlip('backward', () => {
      spreadState = { kind: 'backEndpaper' };
    });
    return;
  }
  if (spreadState.kind === 'backEndpaper') {
    diaryFlip('backward', () => {
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
      diaryFlip('backward', () => {
        entryPageSpread -= 1;
      });
    } else if (prevDate) {
      const target = prevDate;
      diaryFlip('backward', () => navigateTo(target));
    } else {
      void flushEmptyEntry();
      diaryFlip('backward', () => {
        spreadState = { kind: 'toc' };
      });
    }
  } else if (spreadState.kind === 'toc') {
    diaryFlip('backward', () => {
      spreadState = { kind: 'frontEndpaper' };
    });
  } else if (spreadState.kind === 'frontEndpaper') {
    diaryFlip('backward', () => {
      spreadState = { kind: 'cover' };
    });
  }
}

type BirdPhase = 'idle' | 'loading' | 'playing' | 'paused';
let birdPhase = $state<BirdPhase>('idle');
// True while the bird is actively narrating (playing OR paused). When true,
// the entry page swaps its textareas for a read-only ReaderView with
// word-by-word highlighting. See ho-07.1.
const birdPlaying = $derived(birdPhase === 'playing' || birdPhase === 'paused');
// Absolute char index of the word the bird is currently speaking. Null when
// idle. ReaderView consumes this to highlight the active word.
let currentNarrationCharIndex: number | null = $state(null);
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
// Set when the bird itself ends a spread and wants to continue on the next one.
// Consumed by the spread-watching effect after the flip animation completes.
let birdAutoAdvancePending = false;

// ── TTS (Kokoro) path state ───────────────────────────────────────────────────
// These are only live during Kokoro TTS playback. All are cleaned up by
// cleanupTtsAudio(). The Web Speech path does not use any of these.
let birdAudioEl: HTMLAudioElement | null = null;
let birdAudioBlobUrl: string | null = null;
let birdTtsBoundaryInterval: ReturnType<typeof setInterval> | null = null;
let birdTtsTimings: WordTiming[] = [];
let birdTtsBoundaryIdx = 0;
let birdTtsBaseOffset = 0;
let birdTtsFlipScheduledAt: number | null = null;
// AbortController for the in-flight /api/speak fetch — lets stopBird()
// cancel a loading request immediately instead of waiting for the response.
let birdTtsFetchAbort: AbortController | null = null;
// ReadableStream reader for the NDJSON body — cancelled by cleanupTtsAudio.
let birdStreamReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
// Audio elements queued for sequential playback after the current chunk.
let birdAudioQueue: Array<{ blobUrl: string; audioEl: HTMLAudioElement; audioOffset: number }> = [];
// Absolute audio time (seconds) at which the currently-playing chunk starts.
// Used in boundary polling: t = birdChunkTimeOffset + birdAudioEl.currentTime.
let birdChunkTimeOffset = 0;
// True once the upstream NDJSON stream has closed (no more chunks arriving).
let birdStreamDone = false;
// True when the current audio chunk ended but the next hasn't arrived yet.
// The stream reader sets this to false and immediately starts the queued item.
let birdWaitingForChunk = false;

function stopBird() {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  cleanupTtsAudio();
  birdAutoAdvancePending = false;
  birdPhase = 'idle';
  currentNarrationCharIndex = null;
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
      if (birdAutoAdvancePending) {
        birdAutoAdvancePending = false;
        // Start narration for the new spread from its beginning.
        const startOffset = entryPageSpread === 0 ? 0 : (splitPoints[entryPageSpread * 2 - 1] ?? 0);
        void speakFromOffset(startOffset);
      }
      return;
    }
    if (birdPhase !== 'idle') stopBird();
  });
});

// ── speakFromOffset dispatcher ───────────────────────────────────────────────
//
// Routes to the Kokoro TTS path (speakFromOffsetViaTts) when the selected
// voice is a Kokoro slug; falls back to Web Speech (speakFromOffsetViaWebSpeech)
// otherwise. Also falls back to Web Speech if the TTS path throws.

async function speakFromOffset(offset: number) {
  if (isKokoroVoiceUri(voiceURI)) {
    try {
      await speakFromOffsetViaTts(offset);
      return;
    } catch (e) {
      console.warn('TTS playback failed; falling back to Web Speech', e);
      // Intentional fall-through to Web Speech below.
    }
  }
  speakFromOffsetViaWebSpeech(offset);
}

async function speakFromOffsetViaTts(offset: number) {
  cleanupTtsAudio();

  // Synthesize only the current spread — fast startup, auto-continue on end.
  const spreadEnd = splitPoints[entryPageSpread * 2 + 1]; // undefined = last spread
  const textFromHere = content.slice(offset, spreadEnd);
  if (!textFromHere.trim()) return;

  birdPhase = 'loading';
  birdAbsoluteIndex = offset;
  birdTtsBaseOffset = offset;
  birdChunkTimeOffset = 0;
  birdStreamDone = false;
  birdWaitingForChunk = false;

  birdTtsFetchAbort = new AbortController();
  let response: Response;
  try {
    response = await fetch('/api/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: textFromHere, voice: voiceURI, speed: birdRate }),
      signal: birdTtsFetchAbort.signal,
    });
    if (!response.ok) throw new Error(`TTS HTTP ${response.status}`);
  } catch (e) {
    if (birdPhase === 'loading') birdPhase = 'idle';
    throw e;
  }
  // Keep birdTtsFetchAbort live so cleanupTtsAudio can abort the body stream.

  // Bail out if cancelled while the fetch headers were in flight.
  if (birdPhase !== 'loading') return;

  const body = response.body;
  if (!body) {
    birdPhase = 'idle';
    return;
  }

  birdStreamReader = body.getReader();
  void readTtsStream(birdStreamReader);
}

// ── Streaming audio helpers ───────────────────────────────────────────────────

function startChunkPlayback(blobUrl: string, audioEl: HTMLAudioElement, audioOffset: number) {
  birdAudioEl = audioEl;
  birdAudioBlobUrl = blobUrl;
  birdChunkTimeOffset = audioOffset;
  audioEl.playbackRate = birdRate;

  audioEl.onplay = () => {
    birdPhase = 'playing';
    startBoundaryPolling();
  };
  audioEl.onpause = () => {
    // Fires asynchronously — check paused flag to ignore rapid pause→resume.
    if (birdPhase === 'playing' && birdAudioEl?.paused) birdPhase = 'paused';
  };
  audioEl.onended = () => advanceToNextChunk();
  audioEl.onerror = () => {
    cleanupTtsAudio();
    birdPhase = 'idle';
    currentNarrationCharIndex = null;
  };

  void audioEl.play();
}

function advanceToNextChunk() {
  // Revoke the blob URL for the chunk that just finished.
  if (birdAudioBlobUrl) {
    URL.revokeObjectURL(birdAudioBlobUrl);
    birdAudioBlobUrl = null;
  }
  birdAudioEl = null;

  if (birdAudioQueue.length > 0) {
    const next = birdAudioQueue.shift()!;
    startChunkPlayback(next.blobUrl, next.audioEl, next.audioOffset);
  } else if (birdStreamDone) {
    handleNarrationEnd();
  } else {
    // More chunks are still arriving — wait for the stream reader to deliver one.
    birdWaitingForChunk = true;
  }
}

function handleNarrationEnd() {
  cleanupTtsAudio();
  currentNarrationCharIndex = null;
  const hasNextSpread = entryPageSpread < entrySpreadCount - 1;
  if (hasNextSpread) {
    birdPhase = 'loading';
    birdAutoAdvancePending = true;
    birdInitiatedFlip = true;
    diaryFlip('forward', () => { entryPageSpread += 1; });
  } else {
    birdPhase = 'idle';
  }
}

function handleStreamChunk(chunk: StreamChunk, isFirstChunk: boolean) {
  if (birdPhase === 'idle') return;

  // Extend the cumulative timings so boundary polling and flip scheduling see all words.
  birdTtsTimings = [...birdTtsTimings, ...chunk.words];
  // Compute the flip schedule once we have enough timings.
  if (isFirstChunk || birdTtsFlipScheduledAt === null) {
    birdTtsFlipScheduledAt = computeFlipScheduleTime();
  }

  const blobUrl = audioBlobUrlFromBase64(chunk.audio, chunk.format);
  const audioEl = new Audio(blobUrl);

  if (isFirstChunk || birdWaitingForChunk) {
    birdWaitingForChunk = false;
    startChunkPlayback(blobUrl, audioEl, chunk.audioOffset);
  } else {
    birdAudioQueue.push({ blobUrl, audioEl, audioOffset: chunk.audioOffset });
  }
}

async function readTtsStream(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder();
  let buffer = '';
  let firstChunk = true;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (birdPhase === 'idle') {
        void reader.cancel();
        return;
      }

      if (done) {
        // Flush any partial line (upstream may omit trailing newline).
        const remaining = buffer.trim();
        if (remaining) {
          try {
            handleStreamChunk(JSON.parse(remaining) as StreamChunk, firstChunk);
            firstChunk = false;
          } catch { /* skip malformed */ }
        }
        birdStreamDone = true;
        if (birdWaitingForChunk) {
          // Audio ended while we were waiting for more chunks — narration done.
          birdWaitingForChunk = false;
          handleNarrationEnd();
        } else if (birdPhase === 'loading') {
          // Stream finished with no valid audio at all.
          birdPhase = 'idle';
        }
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        if (!line) continue;
        try {
          handleStreamChunk(JSON.parse(line) as StreamChunk, firstChunk);
          firstChunk = false;
        } catch { /* skip malformed */ }
      }
    }
  } catch (e) {
    if (birdPhase === 'idle') return; // expected — fetch was aborted by cleanupTtsAudio
    console.warn('TTS stream error', e);
    birdStreamDone = true;
    if (birdPhase === 'loading') birdPhase = 'idle';
  }
}

/**
 * Find the first word whose absolute char position is past the current
 * spread's end. Return that word's audio start time minus 250ms (lookahead
 * so the page turn lands just before the boundary word is spoken).
 */
function computeFlipScheduleTime(): number | null {
  if (entryPageSpread === birdLastAdvancedFromSpread) return null;
  const currentSpreadEnd = splitPoints[entryPageSpread * 2 + 1];
  if (currentSpreadEnd === undefined) return null;
  const flipBoundary = currentSpreadEnd - birdTtsBaseOffset;
  for (const w of birdTtsTimings) {
    if (w.char_start > flipBoundary) {
      return Math.max(0, w.start - 0.25);
    }
  }
  return null;
}

function startBoundaryPolling() {
  if (birdTtsBoundaryInterval) clearInterval(birdTtsBoundaryInterval);
  birdTtsBoundaryInterval = setInterval(() => {
    if (!birdAudioEl || birdAudioEl.paused) return;
    // Absolute audio time across all chunks: chunk start offset + element position.
    const t = birdChunkTimeOffset + birdAudioEl.currentTime;

    // Advance the current-word pointer and update the highlight index.
    while (
      birdTtsBoundaryIdx < birdTtsTimings.length &&
      birdTtsTimings[birdTtsBoundaryIdx].start <= t
    ) {
      const word = birdTtsTimings[birdTtsBoundaryIdx];
      birdAbsoluteIndex = birdTtsBaseOffset + word.char_start;
      currentNarrationCharIndex = birdAbsoluteIndex;
      birdTtsBoundaryIdx += 1;
    }

    // Trigger page-turn at the scheduled time.
    if (birdTtsFlipScheduledAt !== null && t >= birdTtsFlipScheduledAt) {
      birdTtsFlipScheduledAt = null;
      birdLastAdvancedFromSpread = entryPageSpread;
      birdInitiatedFlip = true;
      onFlipNext();
    }
  }, 50);
}

function cleanupTtsAudio() {
  if (birdTtsBoundaryInterval) {
    clearInterval(birdTtsBoundaryInterval);
    birdTtsBoundaryInterval = null;
  }
  if (birdAudioEl) {
    // Null handlers before pause so async media events from this element
    // can't corrupt state after we've moved on.
    birdAudioEl.onplay = null;
    birdAudioEl.onpause = null;
    birdAudioEl.onended = null;
    birdAudioEl.onerror = null;
    birdAudioEl.pause();
    birdAudioEl.src = '';
    birdAudioEl = null;
  }
  if (birdAudioBlobUrl) {
    URL.revokeObjectURL(birdAudioBlobUrl);
    birdAudioBlobUrl = null;
  }
  // Clean up any queued (not-yet-playing) chunks.
  for (const item of birdAudioQueue) {
    item.audioEl.onplay = null;
    item.audioEl.onpause = null;
    item.audioEl.onended = null;
    item.audioEl.onerror = null;
    item.audioEl.pause();
    item.audioEl.src = '';
    URL.revokeObjectURL(item.blobUrl);
  }
  birdAudioQueue = [];
  birdChunkTimeOffset = 0;
  birdStreamDone = false;
  birdWaitingForChunk = false;
  // Cancel the NDJSON body stream so no further chunks are processed.
  void birdStreamReader?.cancel();
  birdStreamReader = null;
  birdTtsTimings = [];
  birdTtsBoundaryIdx = 0;
  birdTtsFlipScheduledAt = null;
  // Abort any in-flight fetch so a stale response can't arrive after stopBird.
  birdTtsFetchAbort?.abort();
  birdTtsFetchAbort = null;
}

function speakFromOffsetViaWebSpeech(offset: number) {
  const textFromHere = content.slice(offset);
  if (!textFromHere.trim()) return;
  birdAbsoluteIndex = offset;
  const synth = window.speechSynthesis;
  const u = new SpeechSynthesisUtterance(textFromHere);
  // Only apply the voiceURI when it's a Web Speech URI. If a Kokoro slug fell
  // through here (TTS failure), let the browser pick its default voice.
  if (voiceURI && !isKokoroVoiceUri(voiceURI)) {
    const picked = synth.getVoices().find((v) => v.voiceURI === voiceURI);
    if (picked) u.voice = picked;
  }
  u.rate = birdRate;
  u.onstart = () => {
    birdPhase = 'playing';
  };
  u.onboundary = (e) => {
    birdAbsoluteIndex = offset + e.charIndex;
    currentNarrationCharIndex = birdAbsoluteIndex;
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
    currentNarrationCharIndex = null;
  };
  u.onerror = () => {
    birdPhase = 'idle';
    currentNarrationCharIndex = null;
  };
  synth.speak(u);
}

function speakEntry() {
  if (typeof window === 'undefined') return;
  // Loading: cancel the in-flight request and stop, same as pressing stop.
  if (birdPhase === 'loading') { stopBird(); return; }

  if (birdPhase === 'playing') {
    if (birdAudioEl) {
      birdAudioEl.pause();
    } else if (window.speechSynthesis) {
      window.speechSynthesis.pause();
    }
    birdPhase = 'paused';
    return;
  }
  if (birdPhase === 'paused') {
    if (birdAudioEl) {
      void birdAudioEl.play();
    } else if (window.speechSynthesis) {
      window.speechSynthesis.resume();
    }
    birdPhase = 'playing';
    return;
  }

  if (!content?.trim()) return;
  // Start reading from the current spread's first character, not the top of the entry.
  const startOffset = entryPageSpread === 0 ? 0 : (splitPoints[entryPageSpread * 2 - 1] ?? 0);
  birdLastAdvancedFromSpread = -1;
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  cleanupTtsAudio();
  void speakFromOffset(startOffset);
}

function setBirdRate(rate: number) {
  const clamped = Math.max(0.2, Math.min(1.3, Math.round(rate * 100) / 100));
  if (clamped === birdRate) return;
  birdRate = clamped;
  if (birdPhase !== 'playing' && birdPhase !== 'paused') return;
  if (typeof window === 'undefined') return;
  if (birdAudioEl) {
    // TTS path: HTMLAudioElement supports live playbackRate changes.
    birdAudioEl.playbackRate = clamped;
    // Apply to buffered-but-not-yet-playing chunks too.
    for (const item of birdAudioQueue) {
      item.audioEl.playbackRate = clamped;
    }
  } else if (window.speechSynthesis) {
    // Web Speech has no live rate setter — cancel and restart at new rate.
    window.speechSynthesis.cancel();
    void speakFromOffset(birdAbsoluteIndex);
  }
}

function changeBirdRate(delta: number) {
  setBirdRate(birdRate + delta);
}

function openSettings() {
  diaryFlip('forward', () => {
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
  diaryFlip('backward', () => {
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
// Voice picker state.
//
// Kokoro voices (pre-selected for the picker from the 67 available) are loaded
// once on mount via /api/speak/voices and merged above browser voices in the
// select. The KOKORO_FEATURED_VOICES list matches the four voices the
// practitioner tested; the picker shows only these four, in order.
//
// Browser voices (English only) are loaded from speechSynthesis and refreshed
// on `voiceschanged` (Chrome loads them asynchronously on first paint).
// We key by voiceURI because macOS ships duplicate `name`s (e.g. two "Daniel").
type VoiceOption = {
  uri: string;
  name: string;
  lang: string;
  isDefault: boolean;
  source: 'kokoro' | 'browser';
};
// Ordered list of featured Kokoro voices shown in the picker.
const KOKORO_FEATURED_VOICES = ['bf_emma', 'am_echo', 'af_bella', 'bm_daniel'] as const;
const KOKORO_VOICE_LABELS: Record<string, string> = {
  bf_emma: 'Emma (British)',
  am_echo: 'Echo (American)',
  af_bella: 'Bella (American)',
  bm_daniel: 'Daniel (British)',
};
let browserVoiceOptions: VoiceOption[] = $state([]);
let kokoroVoiceOptions: VoiceOption[] = $state([]);
let voiceOptions: VoiceOption[] = $derived([...kokoroVoiceOptions, ...browserVoiceOptions]);
let kokoroOffline = $state(false);
let draftVoiceURI: string | null = $state(untrack(() => voiceURI));

$effect(() => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const synth = window.speechSynthesis;
  const refresh = () => {
    const seen = new Set<string>();
    const freshBrowserVoices: VoiceOption[] = synth
      .getVoices()
      .filter((v) => v.lang.toLowerCase().startsWith('en'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((v) => ({
        uri: v.voiceURI,
        name: v.name,
        lang: v.lang,
        isDefault: v.default,
        source: 'browser' as const,
      }))
      .filter((v) => { if (seen.has(v.uri)) return false; seen.add(v.uri); return true; });
    // Write once — never read browserVoiceOptions inside this effect.
    browserVoiceOptions = freshBrowserVoices;
    // Fall back to device default only when nothing has been saved or picked.
    // untrack the read of draftVoiceURI so writing it doesn't re-trigger this effect.
    if (!voiceURI && !untrack(() => draftVoiceURI) && freshBrowserVoices.length > 0) {
      const fallback =
        freshBrowserVoices.find((v) => v.isDefault) ?? freshBrowserVoices[0];
      untrack(() => { draftVoiceURI = fallback.uri; });
    }
  };
  refresh();
  synth.addEventListener('voiceschanged', refresh);
  return () => {
    synth.removeEventListener('voiceschanged', refresh);
  };
});

// Fetch Kokoro voices once on mount (async — doesn't block the browser voice load).
$effect(() => {
  if (typeof window === 'undefined') return;
  fetch('/api/speak/voices')
    .then(async (res) => {
      if (!res.ok) {
        kokoroOffline = true;
        return;
      }
      const payload = await res.json();
      const available = new Set(
        (payload.voices ?? []).map((v: { id: string }) => v.id)
      );
      if (available.size === 0) {
        kokoroOffline = true;
        return;
      }
      kokoroVoiceOptions = KOKORO_FEATURED_VOICES.filter((id) =>
        available.has(id)
      ).map((id) => ({
        uri: id,
        name: KOKORO_VOICE_LABELS[id] ?? id,
        lang: 'en',
        isDefault: false,
        source: 'kokoro' as const,
      }));
      kokoroOffline = kokoroVoiceOptions.length === 0;
      // Kokoro is live — if the user has a browser voice selected, upgrade
      // to the first Kokoro voice so the picker doesn't show a blank selection.
      if (kokoroVoiceOptions.length > 0 && !isKokoroVoiceUri(untrack(() => draftVoiceURI))) {
        untrack(() => { draftVoiceURI = kokoroVoiceOptions[0].uri; });
      }
    })
    .catch(() => {
      kokoroOffline = true;
    });
});

function previewVoice() {
  if (typeof window === 'undefined' || !draftVoiceURI) return;
  // Kokoro voices are previewed via the TTS path (full round-trip). Browser
  // voices are previewed via Web Speech directly.
  if (isKokoroVoiceUri(draftVoiceURI)) {
    // Short preview via the TTS shim — fire and forget.
    // Read the first NDJSON chunk (response is now a stream).
    fetch('/api/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Welcome to Edelmore.', voice: draftVoiceURI, speed: 1.0 }),
    })
      .then(async (res) => {
        if (!res.ok) return;
        const text = await res.text();
        const firstLine = text.split('\n').find((l) => l.trim());
        if (!firstLine) return;
        let chunk: { audio?: string; format?: string };
        try { chunk = JSON.parse(firstLine); } catch { return; }
        if (!chunk.audio || !chunk.format) return;
        const url = audioBlobUrlFromBase64(chunk.audio, chunk.format);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        void audio.play();
      })
      .catch(() => {
        // Preview failure is silent — it's cosmetic.
      });
    return;
  }
  if (!window.speechSynthesis) return;
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
// Caret restore — applied by the projection effect. `side` pins the landing
// textarea (arrow-key navigation at spread boundaries, where an offset sits on
// two pages at once); when omitted, the spread and side are derived from the
// absolute position, so a caret that flowed past a page boundary follows its
// text — including onto the next spread.
let pendingCursorRestore: { absPos: number; side?: 'left' | 'right' } | null = null;
// Bumped when a flip finishes: a restore that fired mid-flip found its textarea
// visibility:hidden (focus() silently fails there) and is still pending.
let restoreRetryNonce = $state(0);
// What each page's textarea currently holds, kept in lockstep with the textarea
// (set on focus, on projection, and after each edit). applyPageEdit derives the
// page-window end from this prior value rather than from splitPoints, which lags
// content by the pagination debounce — using the stale split point re-appended a
// duplicate suffix and corrupted a real entry on 2026-06-12.
let lastLeftValue = '';
let lastRightValue = '';
// biome-ignore lint/style/useConst: reassigned in template event handlers — Biome doesn't see those
let activeEditor: 'left' | 'right' | null = $state(null);
// Sticky version of activeEditor — set on focus, NOT cleared on blur.
// Used by the mic-quill so transcription inserts into the textarea the
// user was last writing in, even after clicking the mic button steals
// focus from the textarea.
// biome-ignore lint/style/useConst: reassigned in template event handlers
let lastActiveEditor: 'left' | 'right' = $state('left');
let spellRibbonStep = $state<0 | 1 | 2 | 3>(0);

const spellIconsOpen = $derived(spellRibbonStep !== 0);
const spellHelperOpen = $derived(spellRibbonStep === 2);
const spellRibbonClass = $derived(
  spellRibbonStep === 0 ? 'closed' : spellRibbonStep === 2 ? 'helper' : 'icons'
);
const spellFlowerLabel = $derived(
  spellRibbonStep === 0
    ? 'Open writing tools'
    : spellRibbonStep === 1
      ? 'Open magic writing help'
      : spellRibbonStep === 2
        ? 'Close magic writing help'
        : 'Close writing tools'
);

function cycleSpellRibbon() {
  spellRibbonStep = (((spellRibbonStep + 1) % 4) as 0 | 1 | 2 | 3);
}

const entrySpreadCount = $derived(Math.floor(splitPoints.length / 2) + 1);
const hasMoreContent = $derived(entryPageSpread < entrySpreadCount - 1);

/* v8 ignore next 18 */
onMount(() => {
  spellRibbonStep = 0;

  measureEl = document.createElement('textarea');
  measureEl.style.cssText =
    'position:absolute;visibility:hidden;pointer-events:none;overflow:hidden;resize:none;top:-9999px;left:-9999px;';
  document.body.appendChild(measureEl);

  function onKeyDown(e: KeyboardEvent) {
    const tag = (document.activeElement as HTMLElement)?.tagName;
    const inEditor = tag === 'TEXTAREA' || tag === 'INPUT';
    // Bare arrow keys: page navigation outside editors only.
    // Cmd/Ctrl+Arrow: page navigation always (doesn't conflict with text editing).
    const withMod = e.metaKey || e.ctrlKey;
    if (inEditor && !withMod) return;
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

  // Last-chance flush when the tab closes or goes to the background
  // (lid shut, tab switch). sendBeacon survives document teardown.
  function beaconFlush() {
    if (spreadState.kind !== 'entry') return;
    if (content === serverContent || !content.trim()) return;
    const payload = JSON.stringify({ date: spreadState.date, content });
    navigator.sendBeacon?.('/api/entries', new Blob([payload], { type: 'application/json' }));
  }
  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') beaconFlush();
  }
  window.addEventListener('pagehide', beaconFlush);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    measureEl?.remove();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('pagehide', beaconFlush);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
});

// Reset pagination ONLY when the entry date actually changes. spreadState is
// reassigned to a fresh object on every load re-run (invalidateAll, autosave
// side effects), so `entryDate` can re-fire with an unchanged value — and an
// unguarded reset here yanks the reader back to spread 0 mid-session, e.g.
// during a voice recording, landing the anchored insert on the wrong page.
let lastSpreadResetDate: string | null = null;
$effect(() => {
  const date = entryDate;
  untrack(() => {
    if (date === lastSpreadResetDate) return;
    lastSpreadResetDate = date;
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
  // SvelteKit form actions always return HTTP 200; success/failure is in the
  // body. deserialize() is the framework's own decoder for that payload —
  // sturdier than hand-parsing the devalue encoding.
  let result: ReturnType<typeof deserialize> | null = null;
  try {
    result = deserialize(await response.text());
  } catch {
    /* malformed — treat as failure */
  }
  if (result?.type !== 'success') {
    let errorMessage = 'Could not save settings. Please try again.';
    if (result?.type === 'redirect') {
      errorMessage = 'Session expired. Please reload the page.';
    } else if (result?.type === 'failure') {
      const failData = result.data as { error?: unknown } | undefined;
      if (typeof failData?.error === 'string') errorMessage = failData.error;
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
  diaryFlip('backward', () => {
    spreadState = prevSpreadState ?? { kind: 'cover' };
    prevSpreadState = null;
  });
  await invalidateAll();
}

$effect(() => {
  const c = content;
  // Track entryDate so splits are recomputed when re-entering the entry
  // view from settings (settings clears splitPoints; without this dep the
  // compute never re-fires because `content` didn't change).
  void entryDate;
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
  void restoreRetryNonce; // flip completion re-applies a restore that fired mid-flip
  tick().then(() => {
    // Read content NOW, not at effect time. An input event can land between
    // the effect run and this microtask; projecting the older string would
    // overwrite the textarea (and lastLeft/RightValue) with stale text, and
    // the next applyPageEdit would splice that stale page back into content —
    // the duplication cascade, reborn one layer up.
    const c = untrack(() => content);
    // Never write to the textarea the user is actively editing. Its value is
    // the authoritative input; `content` already mirrors it via applyPageEdit,
    // and the read-only markdown div shows the correct page slice the instant
    // they blur. Projecting a (possibly stale-split) slice over a focused
    // textarea trims text out from under the caret AND desyncs lastLeftValue —
    // that desync is the typing-overflow corruption. Project only idle pages.
    const active = document.activeElement;
    const ls = spread === 0 ? 0 : (sp[spread * 2 - 1] ?? 0);
    const le = sp[spread * 2];
    if (textareaEl && textareaEl !== active) {
      const v = c.slice(ls, le);
      if (textareaEl.value !== v) textareaEl.value = v;
      lastLeftValue = v;
    }
    const rs = sp[spread * 2];
    const re = sp[spread * 2 + 1];
    if (rightTextareaEl && rightTextareaEl !== active) {
      const v = c.slice(rs, re);
      if (rightTextareaEl.value !== v) rightTextareaEl.value = v;
      lastRightValue = v;
    }

    const restore = pendingCursorRestore;
    if (!restore) return;
    if (restore.side === undefined) {
      // Derived restore: follow the caret's absolute position to whatever
      // spread its text flowed onto. Jumping re-runs this effect (the spread
      // is a dependency), which projects the new pages and lands the caret.
      const target = spreadForOffset(sp, restore.absPos);
      if (target !== untrack(() => entryPageSpread)) {
        entryPageSpread = target;
        return;
      }
    }
    const side = restore.side ?? sideForOffset(sp, spread, restore.absPos);
    const el = side === 'right' ? rightTextareaEl : textareaEl;
    if (!el) return;
    // Target is already focused (the user is typing here) — the native caret
    // is exactly where they left it; don't fight it with setSelectionRange.
    if (el === active) {
      pendingCursorRestore = null;
      return;
    }
    const start = side === 'right' ? (rs ?? 0) : ls;
    const localPos = Math.max(0, Math.min(restore.absPos - start, el.value.length));
    el.focus();
    if (document.activeElement === el) {
      el.setSelectionRange(localPos, localPos);
      pendingCursorRestore = null; // consumed only when focus actually landed
    }
    // else: mid-flip, textarea is visibility:hidden and focus() was a no-op —
    // the restore stays pending and restoreRetryNonce re-applies it.
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
		<div class="w-full max-w-5xl" style="--page-font-size: {draftFontSizeCqw}cqw">
		<BookShell
			bind:this={shell}
			progress={progress}
			isClosed={spreadState.kind === 'cover' || spreadState.kind === 'backCover'}
			isCoverState={spreadState.kind === 'cover'}
			isBackCoverState={spreadState.kind === 'backCover'}
			hideLeftStack={spreadState.kind === 'frontEndpaper'}
			hideRightStack={spreadState.kind === 'backEndpaper'}
		>
			<Spread
				{onFlipPrev}
				{onFlipNext}
				{canFlipPrev}
				{canFlipNext}
				{spreadIndex}
				{spreadCount}
				{prevZonePct}
				{nextZonePct}
				nextZoneTopDeadPct={spreadState.kind === 'entry' ? 33.333 : 0}
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
							{#if birdPlaying}
								<div
									class="absolute inset-0 h-full w-full overflow-hidden px-8 pt-12 pb-8 text-ink-900 leading-relaxed"
									style={`font-size: var(--page-font-size); font-family: ${journalFontFamily}`}
								>
									<ReaderView
										text={leftEnd !== undefined ? content.slice(leftStart, leftEnd) : content.slice(leftStart)}
										sliceStart={leftStart}
										currentCharIndex={currentNarrationCharIndex}
									/>
								</div>
							{:else}
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
									onfocus={(e) => { activeEditor = 'left'; lastActiveEditor = 'left'; lastLeftValue = e.currentTarget.value; }}
									onblur={() => { activeEditor = null; }}
									onkeydown={(e) => {
										const ta = e.currentTarget;
										const atEnd = ta.selectionStart === ta.selectionEnd && ta.selectionStart === ta.value.length;
										const atStart = ta.selectionStart === 0 && ta.selectionEnd === 0;
										if (e.key === 'ArrowRight' && atEnd && !e.metaKey && !e.ctrlKey) {
											if (rightTextareaEl) {
												e.preventDefault();
												rightTextareaEl.focus();
												rightTextareaEl.setSelectionRange(0, 0);
											} else if (canFlipNext) {
												e.preventDefault();
												onFlipNext();
											}
										} else if (e.key === 'ArrowLeft' && atStart && !e.metaKey && !e.ctrlKey) {
											if (canFlipPrev && entryPageSpread > 0) {
												e.preventDefault();
												const prev = entryPageSpread - 1;
												const prevRightEnd = splitPoints[prev * 2 + 1];
												const prevLeftEnd = splitPoints[prev * 2];
												if (prevRightEnd !== undefined) pendingCursorRestore = { absPos: prevRightEnd, side: 'right' };
												else if (prevLeftEnd !== undefined) pendingCursorRestore = { absPos: prevLeftEnd, side: 'left' };
												onFlipPrev();
											}
										} else if (e.key === 'Backspace' && atStart && entryPageSpread > 0) {
											// Backspace at start of left page — flip to previous spread (same as ←).
											e.preventDefault();
											const prev = entryPageSpread - 1;
											const prevRightEnd = splitPoints[prev * 2 + 1];
											const prevLeftEnd = splitPoints[prev * 2];
											if (prevRightEnd !== undefined) pendingCursorRestore = { absPos: prevRightEnd, side: 'right' };
											else if (prevLeftEnd !== undefined) pendingCursorRestore = { absPos: prevLeftEnd, side: 'left' };
											onFlipPrev();
										} else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.metaKey && !e.ctrlKey) {
											const before = ta.selectionStart;
											setTimeout(() => {
												if (ta.selectionStart !== before) return;
												if (e.key === 'ArrowDown') {
													if (rightTextareaEl) { rightTextareaEl.focus(); rightTextareaEl.setSelectionRange(0, 0); }
													else if (canFlipNext) onFlipNext();
												} else if (canFlipPrev && entryPageSpread > 0) {
													const prev = entryPageSpread - 1;
													const prevRightEnd = splitPoints[prev * 2 + 1];
													const prevLeftEnd = splitPoints[prev * 2];
													if (prevRightEnd !== undefined) pendingCursorRestore = { absPos: prevRightEnd, side: 'right' };
													else if (prevLeftEnd !== undefined) pendingCursorRestore = { absPos: prevLeftEnd, side: 'left' };
													onFlipPrev();
												}
											}, 0);
										}
									}}
									oninput={(e) => {
										const ta = e.currentTarget;
										content = applyPageEdit(content, leftStart, lastLeftValue, ta.value);
										lastLeftValue = ta.value;
										// Side-pinned while the text fits the page — no bounce. The
										// moment it overflows, switch to the side-less follow so the
										// caret rides its own text onto the next page (the facing
										// right page, or the next spread) instead of scrolling.
										// Overflow is read from the textarea itself, never from the
										// lagging split points.
										const absPos = leftStart + ta.selectionStart;
										pendingCursorRestore =
											ta.scrollHeight > ta.clientHeight ? { absPos } : { absPos, side: 'left' };
									}}
									class={`absolute inset-0 h-full w-full resize-none overflow-hidden px-8 pt-12 pb-8 bg-transparent leading-relaxed outline-none relative ${activeEditor === 'left' ? 'text-ink-900 caret-ink-900' : 'text-transparent caret-transparent'}`}
									style={`font-size: var(--page-font-size); font-family: ${journalFontFamily}`}
									placeholder="Begin writing…"
								></textarea>
							{/if}
							{#if saveFailed}
								<span class="absolute bottom-2 left-8 z-10 text-xs text-red-400 italic pointer-events-none">Not saved yet…</span>
							{:else if saved}
								<span class="absolute bottom-2 left-8 z-10 text-xs text-stone-400 italic pointer-events-none">Saved</span>
							{/if}
						</div>
					{/if}
				{/snippet}
				{#snippet rightPage()}
					<!-- settings button moved to spell panel ribbon -->

					{#if spreadState.kind === 'settings'}
						<div class="absolute inset-0 px-8 pt-8 pb-6 overflow-hidden font-serif">
							<div class="flex h-full flex-col">
								<div class="flex-1 space-y-2">
									<section>
										<p class="text-[0.6rem] tracking-[0.22em] uppercase text-stone-400 mb-1">Display Name</p>
										<input type="text" bind:value={draftUsername} oninput={(e) => { draftUsername = e.currentTarget.value; }} maxlength="40" required class="w-full bg-transparent border-b border-stone-300 text-ink-900 text-sm pb-1 outline-none focus:border-stone-500 transition-colors" />
									</section>

									<section>
										<p class="text-[0.6rem] tracking-[0.22em] uppercase text-stone-400 mb-1">Diary Title</p>
										<input type="text" bind:value={draftDiaryTitle} oninput={(e) => { draftDiaryTitle = e.currentTarget.value; }} maxlength="40" required class="w-full bg-transparent border-b border-stone-300 text-ink-900 text-sm pb-1 outline-none focus:border-stone-500 transition-colors" />
									</section>

									<section>
										<p class="text-[0.6rem] tracking-[0.22em] uppercase text-stone-400 mb-1">Text Size</p>
										<div class="flex items-center gap-5">
												<button type="button" onclick={() => { draftFontSizeCqw = draftPrevFontSizeStep ?? draftFontSizeCqw; }} disabled={draftPrevFontSizeStep === null} class="w-6 h-6 border border-stone-300 text-stone-500 text-base leading-none hover:border-stone-500 transition-colors disabled:opacity-20 flex items-center justify-center">−</button>
											<span class="text-stone-500 text-sm">{FONT_STEPS.indexOf(draftFontSizeCqw) + 1} / {FONT_STEPS.length}</span>
												<button type="button" onclick={() => { draftFontSizeCqw = draftNextFontSizeStep ?? draftFontSizeCqw; }} disabled={draftNextFontSizeStep === null} class="w-6 h-6 border border-stone-300 text-stone-500 text-base leading-none hover:border-stone-500 transition-colors disabled:opacity-20 flex items-center justify-center">+</button>
										</div>
									</section>

									<section>
										<p class="text-[0.6rem] tracking-[0.22em] uppercase text-stone-400 mb-1">Journal Font</p>
										<div class="flex flex-col gap-1">
											{#each JOURNAL_FONT_OPTIONS as option}
												<label class="flex items-center gap-3 text-sm text-stone-500">
													<input type="radio" bind:group={draftJournalFont} value={option.value} />
													<span style={`font-family: ${option.family}`}>{option.label}</span>
												</label>
											{/each}
										</div>
									</section>

									<section>
										<p class="text-[0.6rem] tracking-[0.22em] uppercase text-stone-400 mb-1">Reading Voice</p>
										{#if kokoroVoiceOptions.length === 0 && browserVoiceOptions.length === 0}
											<p class="text-[0.7rem] italic text-stone-400">No voices on this device yet.</p>
										{:else}
											<div class="flex items-center gap-2">
												<select bind:value={draftVoiceURI} class="flex-1 bg-transparent border-b border-stone-300 text-ink-900 text-sm pb-1 outline-none focus:border-stone-500 transition-colors">
													{#if kokoroVoiceOptions.length > 0}
														{#each kokoroVoiceOptions as v (v.uri)}
															<option value={v.uri}>{v.name}</option>
														{/each}
													{:else}
														{#if draftVoiceURI && isKokoroVoiceUri(draftVoiceURI)}
															<!-- Kokoro voice saved but server offline — show as selectable
															     so it stays saved correctly; narration falls back to browser
															     voices until Kokoro is reachable again. -->
															<option value={draftVoiceURI}>
																{KOKORO_VOICE_LABELS[draftVoiceURI] ?? draftVoiceURI}
															</option>
														{:else}
															{#each browserVoiceOptions as v (v.uri)}
																<option value={v.uri}>{v.name} ({v.lang})</option>
															{/each}
														{/if}
													{/if}
												</select>
												<button type="button" onclick={previewVoice} aria-label="Preview voice" class="w-7 h-7 border border-stone-300 text-stone-500 text-sm leading-none hover:border-stone-500 hover:text-ornament-gold transition-colors flex items-center justify-center">▶</button>
											</div>
											{#if kokoroOffline && draftVoiceURI && isKokoroVoiceUri(draftVoiceURI)}
												<p class="text-[0.6rem] italic text-stone-400 mt-1">Voice server is offline — narration will use browser voices until it's back.</p>
											{/if}
										{/if}
									</section>

									<section>
										<p class="text-[0.6rem] tracking-[0.22em] uppercase text-stone-400 mb-1">Change PIN</p>
										<p class="text-[0.6rem] italic text-stone-400 mb-1">4 digits — no current PIN required</p>
										<input type="password" bind:value={draftPin} inputmode="numeric" pattern="\d{4}" maxlength="4" placeholder="New PIN" class="mb-1 w-full bg-transparent border-b border-stone-300 text-ink-900 text-sm pb-1 outline-none focus:border-stone-500 transition-colors" />
										<input type="password" bind:value={draftConfirm} inputmode="numeric" pattern="\d{4}" maxlength="4" placeholder="Confirm PIN" class="w-full bg-transparent border-b border-stone-300 text-ink-900 text-sm pb-1 outline-none focus:border-stone-500 transition-colors" />
									</section>
								</div>

								<div class="mt-2 flex items-end justify-end gap-3">
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
							{#if birdPlaying}
								<div
									class="absolute inset-0 h-full w-full overflow-hidden px-8 pt-12 pb-8 text-ink-900 leading-relaxed"
									style={`font-size: var(--page-font-size); font-family: ${journalFontFamily}`}
								>
									<ReaderView
										text={rightEnd !== undefined ? content.slice(rightStart, rightEnd) : content.slice(rightStart)}
										sliceStart={rightStart}
										currentCharIndex={currentNarrationCharIndex}
									/>
								</div>
							{:else}
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
									onfocus={(e) => { activeEditor = 'right'; lastActiveEditor = 'right'; lastRightValue = e.currentTarget.value; }}
									onblur={() => { activeEditor = null; }}
									onkeydown={(e) => {
										const ta = e.currentTarget;
										const atEnd = ta.selectionStart === ta.selectionEnd && ta.selectionStart === ta.value.length;
										const atStart = ta.selectionStart === 0 && ta.selectionEnd === 0;
										if (e.key === 'ArrowRight' && atEnd && !e.metaKey && !e.ctrlKey) {
											if (canFlipNext) {
												e.preventDefault();
												// Cursor should land at start of the new spread's left page.
												pendingCursorRestore = { absPos: splitPoints[entryPageSpread * 2 + 1] ?? 0, side: 'left' };
												onFlipNext();
											}
										} else if (e.key === 'ArrowLeft' && atStart && !e.metaKey && !e.ctrlKey) {
											if (textareaEl) {
												e.preventDefault();
												textareaEl.focus();
												textareaEl.setSelectionRange(textareaEl.value.length, textareaEl.value.length);
											}
										} else if (e.key === 'Backspace' && atStart) {
											// Backspace at start of right page — delete the char just before
											// this page's split point and merge content back to the left page.
											const rStart = splitPoints[entryPageSpread * 2];
											if (rStart !== undefined && rStart > 0) {
												e.preventDefault();
												content = content.slice(0, rStart - 1) + content.slice(rStart);
												pendingCursorRestore = { absPos: rStart - 1, side: 'left' };
											}
										} else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.metaKey && !e.ctrlKey) {
											const before = ta.selectionStart;
											const spreadAtKey = entryPageSpread;
											setTimeout(() => {
												if (ta.selectionStart !== before) return;
												if (e.key === 'ArrowDown') {
													if (canFlipNext) {
														pendingCursorRestore = { absPos: splitPoints[spreadAtKey * 2 + 1] ?? 0, side: 'left' };
														onFlipNext();
													}
												} else if (textareaEl) {
													textareaEl.focus();
													textareaEl.setSelectionRange(textareaEl.value.length, textareaEl.value.length);
												}
											}, 0);
										}
									}}
									oninput={(e) => {
										const ta = e.currentTarget;
										content = applyPageEdit(content, rightStart, lastRightValue, ta.value);
										lastRightValue = ta.value;
										// See the left textarea: side-pinned until the page overflows,
										// then the side-less follow carries the caret to the next spread.
										const absPos = rightStart + ta.selectionStart;
										pendingCursorRestore =
											ta.scrollHeight > ta.clientHeight ? { absPos } : { absPos, side: 'right' };
									}}
									class={`absolute inset-0 h-full w-full resize-none overflow-hidden px-8 pt-12 pb-8 bg-transparent leading-relaxed outline-none relative ${activeEditor === 'right' ? 'text-ink-900 caret-ink-900' : 'text-transparent caret-transparent'}`}
									style={`font-size: var(--page-font-size); font-family: ${journalFontFamily}`}
								></textarea>
							{/if}
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
							<CoverPage config={activeCover} {username} {diaryTitle} showSettings={true} buttonLabel="Turn to today" onOpenSettings={() => { void diaryFlip('forward', () => navigateTo(todayIso())); }} />
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
				{#if spreadState.kind === 'entry'}
					<div class="page-mic-quill">
						<MicQuill oninsert={handleTranscriptionInsert} onstart={handleRecordingStart} />
					</div>
				{/if}

				{#snippet overlay()}
					{#if spreadState.kind !== 'cover' && spreadState.kind !== 'backCover'}
				<div class="spell-anchor">
					<div class={`spell-panel is-${spellRibbonClass}`} role="note" aria-label="Magic writing spells">
						<div class="spell-icon-row">
							<button
								type="button"
								class="spell-flower"
								onclick={cycleSpellRibbon}
								aria-label={spellFlowerLabel}
								aria-expanded={spellIconsOpen}
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
							{#if spellIconsOpen}
								<button type="button" transition:fade={{ duration: 280 }} onclick={() => { void diaryFlip('backward', () => { spreadState = { kind: 'toc' }; }); }} class="spell-entries" aria-label="Recent entries">
									<img src="/entries.svg" style="width: 100%; height: 100%; object-fit: contain" alt="" />
								</button>
								<button type="button" transition:fade={{ duration: 280 }} onclick={() => { void diaryFlip('forward', () => navigateTo(todayIso())); }} class="spell-today" aria-label="Turn to today">
									<img src="/now.svg" style="width: 100%; height: 100%; object-fit: contain" alt="" />
								</button>
								<button type="button" transition:fade={{ duration: 280 }} onclick={openSettings} class="spell-settings" aria-label="Settings">
									<img src="/edelweiss.svg" style="width: 100%; height: 100%; object-fit: contain" alt="" />
								</button>
								<div class="spell-bird-cluster" transition:fade={{ duration: 280 }}>
									<button type="button" onclick={speakEntry} class="spell-bird" class:is-loading={birdPhase === 'loading'} class:is-playing={birdPhase === 'playing'} class:is-paused={birdPhase === 'paused'} aria-label={birdPhase === 'loading' ? 'Preparing narration…' : birdPhase === 'playing' ? 'Pause' : birdPhase === 'paused' ? 'Resume' : 'Listen'}>
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
								<div class="spell-quill" transition:fade={{ duration: 280 }}>
									<MicQuill oninsert={handleTranscriptionInsert} onstart={handleRecordingStart} />
								</div>
							{/if}
						</div>
						{#if spellHelperOpen}
							<div class="spell-panel-content" transition:slide={{ duration: 520, easing: cubicInOut }}>
								<p class="spell-title">✨ Magic Writing Spells</p>
								<span class="spell-help-label">Decoration options:</span>
								<ul class="spell-list">
									<li><span class="spell-code">*word*</span> <em>soft and quiet</em></li>
									<li><span class="spell-code">**word**</span> <strong>strong and loud</strong></li>
									<li><span class="spell-code">_word_</span> <u>extra important</u></li>
									<li><span class="spell-code">~word~</span> <s>crossed out</s></li>
								</ul>
							</div>
						{/if}
					</div>
				</div>
		{/if}
				{/snippet}
		</BookShell>
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
					<div class="mobile-mic-quill">
						<MicQuill oninsert={handleTranscriptionInsert} onstart={handleRecordingStart} />
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
				{#if saveFailed}
					<span class="text-xs text-red-400 italic mt-2">Not saved yet…</span>
				{:else if saved}
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
		--spell-icon-size: 5.4cqi;
		font-family: 'EB Garamond', Georgia, serif;
		color: #4a3728;
		display: flex;
		flex-direction: column;
		gap: 0.9cqi;
		width: fit-content;
		overflow: visible;
	}

	.spell-panel.is-icons,
	.spell-panel.is-helper {
		width: 100%;
	}

	.spell-icon-row {
		background: #fefcf7;
		border: 1px solid #dfc9a4;
		border-radius: 1.45cqi;
		padding: 0.75cqi;
		/* Explicit collapsed width (flower + padding) so the bar animates to a
		   fixed target on close instead of snapping when fit-content recomputes
		   as the icons unmount — lets the close cleanly mirror the open. */
		width: calc(var(--spell-icon-size) + 1.5cqi);
		display: flex;
		align-items: center;
		/* space-between in every state: on close the visible icons must not snap
		   from spread to centered before the width animates (the lurch). */
		justify-content: space-between;
		gap: 1.2cqi;
		box-shadow: 0 1px 6px rgba(0, 0, 0, 0.06);
		transition: width 0.7s cubic-bezier(0.45, 0, 0.2, 1), padding 0.7s cubic-bezier(0.45, 0, 0.2, 1);
	}

	.spell-panel.is-icons .spell-icon-row,
	.spell-panel.is-helper .spell-icon-row {
		width: 100%;
		justify-content: space-between;
		padding: 0.75cqi 2.2cqi;
	}

	.spell-panel-content {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		padding: 0.75cqi 1.4cqi;
		gap: 2cqi;
		background: #fefcf7;
		border: 1px solid #dfc9a4;
		border-radius: 1.25cqi;
		overflow: hidden;
	}

	.spell-help-label {
		font-family: 'EB Garamond', Georgia, serif;
		font-size: 1.5cqi;
		color: #8b6914;
		font-weight: 600;
		white-space: nowrap;
		opacity: 0.9;
		flex-shrink: 0;
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
		justify-content: center;
		gap: 2.6cqi;
		font-size: 1.42cqi;
		white-space: nowrap;
		width: 100%;
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

	.spell-page-nav {
		background: transparent;
		border: none;
		cursor: pointer;
		font-family: serif;
		font-size: 1.1cqi;
		color: var(--ink-600, #6b5c4e);
		padding: 0 0.2cqi;
		opacity: 0.6;
		transition: opacity 0.15s;
		line-height: 1;
	}
	.spell-page-nav:hover { opacity: 1; }

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
		width: var(--spell-icon-size);
		height: var(--spell-icon-size);
	}

	/* MicQuill wrapper — sized to match the existing ribbon buttons. The
	   component itself is layout-agnostic; this wrapper provides the slot. */
	.spell-quill {
		position: relative;
		width: var(--spell-icon-size);
		height: var(--spell-icon-size);
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

	.page-mic-quill {
		position: absolute;
		top: -10cqi;
		right: -14cqi;
		z-index: 35;
		width: 28cqi;
		height: 22cqi;
	}

	.page-mic-quill :global(.mic-quill) {
		position: relative;
		width: 100%;
		height: 100%;
	}

	.page-mic-quill :global(.quill-svg) {
		position: absolute;
		left: 7.8cqi;
		top: 10.3cqi;
		width: 5.4cqi;
		height: 5.4cqi;
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
		top: 0.6cqi;
		right: 0.6cqi;
		font-size: 3.2cqi;
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

	@keyframes bird-waiting {
		0%, 100% { opacity: 0.65; }
		50%       { opacity: 1;    }
	}
	.spell-bird.is-loading {
		opacity: 1;
		cursor: default;
	}
	.spell-bird.is-loading img {
		animation: bird-waiting 0.9s ease-in-out infinite;
	}
	.spell-bird.is-loading::after { content: "soon…"; }

	/* Bird + speed-control cluster. The cluster takes the same slot the bird
	   used to take; the speed control floats below the bird as an overlay so
	   it doesn't change the ribbon's layout. */
	.spell-bird-cluster {
		position: relative;
		width: var(--spell-icon-size);
		height: var(--spell-icon-size);
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
	.spell-quill::after    { content: "speak"; }
	.spell-bird::after     { content: "listen"; }
	.spell-today::after    { content: "today"; }
	.spell-entries::after  { content: "recent entries"; }
	.spell-settings::after { content: "settings"; }

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
		width: var(--spell-icon-size);
		height: var(--spell-icon-size);
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
