<script lang="ts" module>
export type BirdPhase = 'idle' | 'loading' | 'playing' | 'paused';

export interface BirdNarratorApi {
  play: (fromOffset: number, untilOffset?: number | null) => Promise<void>;
  pause: () => void;
  resume: () => void;
  seekTo: (absCharIndex: number, opts?: { play?: boolean }) => Promise<void>;
  stop: () => void;
  preloadNext: (fromOffset: number, untilOffset?: number | null) => Promise<void>;
}

const DEFAULT_KOKORO_VOICE = 'bf_emma';
const RATE_MIN = 0.5;
const RATE_MAX = 1.6;
// Fire onPageBoundaryReached when the currently-highlighted word is within
// this many chars of pageEndOffset — about half a line of text. Language-
// agnostic; doesn't depend on audio.duration being known.
const BOUNDARY_LOOKAHEAD_CHARS = 30;
// When the chain fires (preload is ready), cut current audio and wait this
// long before playing preload's first chunk. Set to 0 for no perceptible
// gap — audio effectively hands off from current spread to next. Bump if a
// "beat" between spreads is desired.
const CHAIN_GAP_MS = 0;
</script>

<script lang="ts">
import { onDestroy } from 'svelte';
import {
  audioBlobUrlFromBase64,
  isKokoroVoiceUri,
  type StreamChunk,
  type WordTiming,
} from './narration.js';

interface Props {
  text: string;
  voiceURI: string | null;
  startOffset: number;
  untilOffset?: number | null;
  pageEndOffset?: number | null;
  onWordHighlight?: (absCharIndex: number) => void;
  onPageBoundaryReached?: () => void;
  onNarrationEnd?: () => void;
  onPhaseChange?: (phase: BirdPhase) => void;
}

let {
  text,
  voiceURI,
  startOffset,
  untilOffset = null,
  pageEndOffset = null,
  onWordHighlight,
  onPageBoundaryReached,
  onNarrationEnd,
  onPhaseChange,
}: Props = $props();

let phase: BirdPhase = $state('idle');
let rate = $state(1.0);

// ── StreamCtx ─────────────────────────────────────────────────────────────
//
// One stream context per /api/speak request. The bird keeps a `current`
// context (the one whose audio is in or about to be in the audio element)
// and an optional `preload` context (the next spread's audio, fetched ahead
// of time so it can chain on immediately when current ends).

type QueuedChunk = {
  blobUrl: string;
  audioEl: HTMLAudioElement;
  audioOffset: number;
  // Prewarmed = decoder + audio pipeline are fully initialized. When true,
  // play() at swap time hits an already-warm element and starts instantly
  // (no perceptible pause). Preload chunks get prewarmed via a muted
  // play/pause dance in the background; current-stream chunks skip prewarm
  // (they'll play in sequence and the pipeline is already active).
  warm: boolean;
};

type StreamCtx = {
  reader: ReadableStreamDefaultReader<Uint8Array> | null;
  fetchAbort: AbortController | null;
  timings: WordTiming[];
  audioQueue: QueuedChunk[];
  baseOffset: number;
  done: boolean;
};

let current: StreamCtx | null = null;
let preload: StreamCtx | null = null;
// chainArmed: boundary fired, want to cut current and chain as soon as
//   preload has a chunk. Set true on boundary fire, false once we initiate
//   the chain OR once current naturally ends (in which case chainPending
//   takes over).
// chainPending: current's audio has fully drained but preload is still
//   fetching its first chunk. When that chunk arrives, swap immediately
//   (no extra delay — silence is already happening).
let chainArmed = false;
let chainPending = false;
let chainGapTimer: ReturnType<typeof setTimeout> | null = null;

// Active playback head — derived from whichever StreamCtx is current.
let audioEl: HTMLAudioElement | null = null;
let audioBlobUrl: string | null = null;
let chunkTimeOffset = 0;
let boundaryInterval: ReturnType<typeof setInterval> | null = null;
let boundaryIdx = 0;
let lastAdvancedFromOffset: number | null = null;
let lastEmittedCharPos: number | null = null;

function newStreamCtx(baseOffset: number): StreamCtx {
  return {
    reader: null,
    fetchAbort: null,
    timings: [],
    audioQueue: [],
    baseOffset,
    done: false,
  };
}

function setPhase(p: BirdPhase) {
  if (phase === p) return;
  phase = p;
  onPhaseChange?.(p);
}

function resolveVoice(uri: string | null | undefined): string {
  return isKokoroVoiceUri(uri) ? (uri as string) : DEFAULT_KOKORO_VOICE;
}

function cleanupCtx(ctx: StreamCtx | null) {
  if (!ctx) return;
  ctx.fetchAbort?.abort();
  ctx.fetchAbort = null;
  void ctx.reader?.cancel();
  ctx.reader = null;
  for (const item of ctx.audioQueue) {
    item.audioEl.onplay = null;
    item.audioEl.onpause = null;
    item.audioEl.onended = null;
    item.audioEl.onerror = null;
    item.audioEl.pause();
    item.audioEl.src = '';
    URL.revokeObjectURL(item.blobUrl);
  }
  ctx.audioQueue = [];
  ctx.timings = [];
  ctx.done = false;
}

function stopAll() {
  if (boundaryInterval) {
    clearInterval(boundaryInterval);
    boundaryInterval = null;
  }
  if (audioEl) {
    audioEl.onplay = null;
    audioEl.onpause = null;
    audioEl.onended = null;
    audioEl.onerror = null;
    audioEl.pause();
    audioEl.src = '';
    audioEl = null;
  }
  if (audioBlobUrl) {
    URL.revokeObjectURL(audioBlobUrl);
    audioBlobUrl = null;
  }
  chunkTimeOffset = 0;
  boundaryIdx = 0;
  lastAdvancedFromOffset = null;
  lastEmittedCharPos = null;
  chainArmed = false;
  chainPending = false;
  if (chainGapTimer) {
    clearTimeout(chainGapTimer);
    chainGapTimer = null;
  }
  cleanupCtx(current);
  current = null;
  cleanupCtx(preload);
  preload = null;
}

async function playInternal(fromOffset: number, until: number | null) {
  stopAll();
  const slice = text.slice(fromOffset, until ?? undefined);
  if (!slice.trim()) {
    setPhase('idle');
    return;
  }
  current = newStreamCtx(fromOffset);
  setPhase('loading');
  await startFetch(current, slice);
}

async function startFetch(ctx: StreamCtx, slice: string) {
  ctx.fetchAbort = new AbortController();
  let response: Response;
  try {
    response = await fetch('/api/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: slice, voice: resolveVoice(voiceURI), speed: rate }),
      signal: ctx.fetchAbort.signal,
    });
    if (!response.ok) throw new Error(`TTS HTTP ${response.status}`);
  } catch (e) {
    if (ctx === current || ctx === preload) {
      ctx.done = true;
      console.warn('Kokoro fetch failed', e);
      if (ctx === current && phase === 'loading') setPhase('idle');
      if (ctx === preload && chainPending) chainOrEnd();
    }
    return;
  }
  // Bail out if the ctx was cleaned up while the headers were in flight.
  if (ctx !== current && ctx !== preload) return;

  const body = response.body;
  if (!body) {
    ctx.done = true;
    if (ctx === current && phase === 'loading') setPhase('idle');
    if (ctx === preload && chainPending) chainOrEnd();
    return;
  }
  ctx.reader = body.getReader();
  void readStream(ctx);
}

async function readStream(ctx: StreamCtx) {
  const reader = ctx.reader;
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      // If our ctx was cleaned up, bail.
      if (ctx !== current && ctx !== preload) {
        void reader.cancel();
        return;
      }
      if (done) {
        const remaining = buffer.trim();
        if (remaining) {
          try {
            ingestChunk(ctx, JSON.parse(remaining) as StreamChunk);
          } catch {
            /* skip malformed */
          }
        }
        ctx.done = true;
        // Current stream ended with no audio at all → idle.
        if (ctx === current && phase === 'loading' && audioEl === null) {
          setPhase('idle');
        }
        // Preload stream ended; if a chain is waiting, swap (or end if empty).
        if (ctx === preload && chainPending) chainOrEnd();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      let newlineIdx: number;
      // biome-ignore lint/suspicious/noAssignInExpressions: drain complete NDJSON lines
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        if (!line) continue;
        try {
          ingestChunk(ctx, JSON.parse(line) as StreamChunk);
        } catch {
          /* skip malformed */
        }
      }
    }
  } catch (e) {
    if (ctx !== current && ctx !== preload) return;
    console.warn('TTS stream error', e);
    ctx.done = true;
    if (ctx === current && phase === 'loading') setPhase('idle');
    if (ctx === preload && chainPending) chainOrEnd();
  }
}

function ingestChunk(ctx: StreamCtx, chunk: StreamChunk) {
  ctx.timings.push(...chunk.words);
  const blobUrl = audioBlobUrlFromBase64(chunk.audio, chunk.format);
  const el = new Audio();
  el.preload = 'auto';
  el.src = blobUrl;
  el.playbackRate = rate;
  el.load();
  // Only prewarm preload chunks — current-stream chunks play in sequence
  // with an already-active audio pipeline. Prewarm is deferred/async; the
  // chunk is added to the queue immediately with warm=false, and warm flips
  // true when the muted-play/pause dance completes. tryChainNow only cuts
  // current when the first preload chunk is warm, so our onpause handler is
  // never installed while a prewarm pause() is still in flight (avoiding
  // the race that stalls highlights after swap).
  const queued: QueuedChunk = {
    blobUrl,
    audioEl: el,
    audioOffset: chunk.audioOffset,
    warm: ctx !== preload,
  };
  ctx.audioQueue.push(queued);
  if (ctx === preload) {
    void prewarmChunk(queued);
  }

  // First chunk into current with no playback head yet → start playing.
  if (ctx === current && audioEl === null) {
    startNextChunkFromCurrent();
    return;
  }
  // Preload chunk arrived while we want to chain — try now.
  if (ctx === preload && chainArmed) {
    tryChainNow();
    return;
  }
  // Preload chunk arrived while current already finished — swap immediately.
  if (ctx === preload && chainPending) {
    chainOrEnd();
  }
}

function startNextChunkFromCurrent() {
  if (!current) return;
  const next = current.audioQueue.shift();
  if (!next) return;
  startChunkPlayback(next.blobUrl, next.audioEl, next.audioOffset);
}

function startChunkPlayback(blobUrl: string, el: HTMLAudioElement, audioOffset: number) {
  audioEl = el;
  audioBlobUrl = blobUrl;
  chunkTimeOffset = audioOffset;
  el.playbackRate = rate;

  el.onplay = () => {
    setPhase('playing');
    startBoundaryPolling();
  };
  el.onpause = () => {
    // Fires asynchronously — guard against rapid pause→resume.
    if (phase === 'playing' && audioEl?.paused) setPhase('paused');
  };
  el.onended = () => advanceToNextChunk();
  el.onerror = () => {
    stopAll();
    setPhase('idle');
  };

  void el.play();
}

function advanceToNextChunk() {
  if (audioBlobUrl) {
    URL.revokeObjectURL(audioBlobUrl);
    audioBlobUrl = null;
  }
  audioEl = null;

  if (!current) return;
  if (current.audioQueue.length > 0) {
    startNextChunkFromCurrent();
    return;
  }
  if (current.done) {
    // Audio naturally ended. Drop the "armed for cut" flag — chainOrEnd
    // handles the wait-for-preload case via chainPending and skips the
    // 250ms gap (silence is already happening).
    chainArmed = false;
    chainOrEnd();
    return;
  }
  // Stream is still pushing chunks — wait for ingestChunk to call us.
}

function chainOrEnd() {
  if (preload && preload.audioQueue.length > 0) {
    // If the first preload chunk isn't warm yet (prewarm still running),
    // wait — swapping mid-prewarm hits the same handler race that stalls
    // highlights.
    if (!preload.audioQueue[0].warm) {
      chainPending = true;
      setPhase('loading');
      return;
    }
    swapCurrentToPreload();
    return;
  }
  if (preload && preload.done) {
    // Preload stream closed with no playable chunks. Drop and end.
    cleanupCtx(preload);
    preload = null;
    handleEnd();
    return;
  }
  if (preload) {
    // Still fetching the next spread — hold and wait for first chunk.
    chainPending = true;
    setPhase('loading');
    return;
  }
  handleEnd();
}

function swapCurrentToPreload() {
  if (!preload) return;
  cleanupCtx(current);
  current = preload;
  preload = null;
  chainPending = false;
  chainArmed = false;
  boundaryIdx = 0;
  lastAdvancedFromOffset = null;
  lastEmittedCharPos = null;
  startNextChunkFromCurrent();
}

function handleEnd() {
  stopAll();
  setPhase('idle');
  onNarrationEnd?.();
}

// ── Chain-now plumbing ───────────────────────────────────────────────────
//
// On boundary fire (the moment the consumer flips + preloads), set chainArmed.
// As soon as preload has a chunk available, cut current audio immediately,
// wait CHAIN_GAP_MS for the user-perceived "beat," then swap to preload.

async function prewarmChunk(item: QueuedChunk) {
  // Start muted playback to force the browser to allocate decoder + audio-
  // output resources. Immediately pause and rewind to 0 so the real play()
  // call later starts from the beginning at zero latency. Mark warm=true
  // ONLY after the full dance completes so tryChainNow doesn't set our
  // pause/play handlers while this pause() is still queued.
  const el = item.audioEl;
  el.muted = true;
  try {
    await el.play();
    el.pause();
    try {
      el.currentTime = 0;
    } catch {
      /* some browsers throw setting currentTime pre-metadata */
    }
    el.muted = false;
  } catch {
    el.muted = false;
  }
  item.warm = true;
  // If a chain has been waiting for warmup, take another crack at it.
  if (chainArmed) tryChainNow();
  if (chainPending) chainOrEnd();
}

function tryChainNow() {
  if (!chainArmed) return;
  if (!preload || preload.audioQueue.length === 0) return;
  // Wait for the first preload chunk to finish prewarming — cutting current
  // now would install our onpause handler and the still-queued prewarm
  // pause() would flip phase to 'paused' and stall highlights.
  if (!preload.audioQueue[0].warm) return;
  chainArmed = false;
  cutCurrentAudio();
  if (chainGapTimer) clearTimeout(chainGapTimer);
  chainGapTimer = setTimeout(() => {
    chainGapTimer = null;
    if (!preload) {
      handleEnd();
      return;
    }
    swapCurrentToPreload();
  }, CHAIN_GAP_MS);
}

function cutCurrentAudio() {
  if (boundaryInterval) {
    clearInterval(boundaryInterval);
    boundaryInterval = null;
  }
  if (audioEl) {
    audioEl.onplay = null;
    audioEl.onpause = null;
    audioEl.onended = null;
    audioEl.onerror = null;
    audioEl.pause();
    audioEl.src = '';
    audioEl = null;
  }
  if (audioBlobUrl) {
    URL.revokeObjectURL(audioBlobUrl);
    audioBlobUrl = null;
  }
}

function startBoundaryPolling() {
  if (boundaryInterval) clearInterval(boundaryInterval);
  boundaryInterval = setInterval(() => {
    if (!audioEl || audioEl.paused || !current) return;
    const t = chunkTimeOffset + audioEl.currentTime;

    // Emit word highlights from the current stream's timings.
    while (
      boundaryIdx < current.timings.length &&
      current.timings[boundaryIdx].start <= t
    ) {
      const word = current.timings[boundaryIdx];
      if (word.char_end > word.char_start) {
        const pos = current.baseOffset + word.char_start;
        lastEmittedCharPos = pos;
        onWordHighlight?.(pos);
      }
      boundaryIdx += 1;
    }

    // Boundary fire: when the currently-highlighted word's char position is
    // within BOUNDARY_LOOKAHEAD_CHARS of pageEndOffset (≈ half a line of
    // text before the end), fire ONCE for this spread. The consumer flips +
    // calls preloadNext; the bird arms chainNow so audio cuts as soon as
    // preload chunks arrive.
    if (
      pageEndOffset !== null &&
      pageEndOffset !== undefined &&
      pageEndOffset !== lastAdvancedFromOffset &&
      lastEmittedCharPos !== null &&
      lastEmittedCharPos >= pageEndOffset - BOUNDARY_LOOKAHEAD_CHARS
    ) {
      lastAdvancedFromOffset = pageEndOffset;
      onPageBoundaryReached?.();
      chainArmed = true;
      tryChainNow();
    }
  }, 50);
}

// ── Bird click dispatcher ─────────────────────────────────────────────────

function onBirdClick() {
  if (typeof window === 'undefined') return;
  if (phase === 'loading') {
    stop();
    return;
  }
  if (phase === 'playing') {
    pause();
    return;
  }
  if (phase === 'paused') {
    resume();
    return;
  }
  void playInternal(startOffset, untilOffset);
}

// ── Rate control ──────────────────────────────────────────────────────────

function setRate(n: number) {
  const clamped = Math.max(RATE_MIN, Math.min(RATE_MAX, Math.round(n * 100) / 100));
  if (clamped === rate) return;
  rate = clamped;
  if (phase !== 'playing' && phase !== 'paused') return;
  if (audioEl) {
    audioEl.playbackRate = clamped;
    if (current) {
      for (const item of current.audioQueue) item.audioEl.playbackRate = clamped;
    }
    if (preload) {
      for (const item of preload.audioQueue) item.audioEl.playbackRate = clamped;
    }
  }
}

function changeRate(delta: number) {
  setRate(rate + delta);
}

// ── Imperative API exposed via bind:this ──────────────────────────────────

export function play(fromOffset: number, until?: number | null): Promise<void> {
  return playInternal(fromOffset, until ?? null);
}

export function preloadNext(
  fromOffset: number,
  until?: number | null
): Promise<void> {
  if (preload) {
    cleanupCtx(preload);
    preload = null;
  }
  const slice = text.slice(fromOffset, until ?? undefined);
  if (!slice.trim()) return Promise.resolve();
  preload = newStreamCtx(fromOffset);
  return startFetch(preload, slice);
}

export function pause() {
  if (phase !== 'playing') return;
  if (audioEl) audioEl.pause();
  setPhase('paused');
}

export function resume() {
  if (phase !== 'paused') return;
  if (audioEl) void audioEl.play();
  setPhase('playing');
}

export async function seekTo(
  absCharIndex: number,
  opts?: { play?: boolean }
): Promise<void> {
  const shouldPlay = opts?.play ?? true;
  if (shouldPlay) {
    await playInternal(absCharIndex, untilOffset);
    return;
  }
  stopAll();
  setPhase('idle');
  onWordHighlight?.(absCharIndex);
}

export function stop() {
  stopAll();
  setPhase('idle');
}

onDestroy(() => stop());
</script>

<button
  type="button"
  onclick={onBirdClick}
  class="spell-bird"
  class:is-loading={phase === 'loading'}
  class:is-playing={phase === 'playing'}
  class:is-paused={phase === 'paused'}
  aria-label={phase === 'loading'
    ? 'Preparing narration…'
    : phase === 'playing'
      ? 'Pause'
      : phase === 'paused'
        ? 'Resume'
        : 'Listen'}
>
  <img src="/bird.svg" alt="" />
  <span class="spell-bird-note" aria-hidden="true">♪</span>
</button>

{#if phase !== 'idle'}
  <button type="button" onclick={stop} class="spell-nest" aria-label="Stop reading">
    <img src="/nest.svg" alt="" />
  </button>
{/if}

<div class="spell-bird-speed" class:is-visible={phase !== 'idle'}>
  <button
    type="button"
    onclick={() => changeRate(-0.2)}
    class="spell-bird-tortoise"
    aria-label="Slower"
    disabled={rate <= RATE_MIN}
  >
    <img src="/tortoise.png" alt="" />
  </button>
  <button
    type="button"
    onclick={() => setRate(1.0)}
    class="spell-bird-rate-reset"
    aria-label="Reset speed"
    disabled={rate === 1.0}
  ></button>
  <button
    type="button"
    onclick={() => changeRate(0.05)}
    class="spell-bird-hare"
    aria-label="Faster"
    disabled={rate >= RATE_MAX}
  >
    <img src="/hare.png" alt="" />
  </button>
</div>

<style>
  /* The bird inhabits a consumer-supplied cluster wrapper (diary uses
     .spell-bird-cluster). The wrapper sets position: relative and a
     concrete size; everything here positions relative to that. */
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
    width: 100%;
    height: 100%;
  }

  .spell-bird img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

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

  /* Nest of twigs — appears only while the bird is reading; tap to stop. */
  .spell-nest {
    position: absolute;
    top: 50%;
    left: 100%;
    transform: translateY(-50%);
    margin-left: 0.6cqi;
    width: calc(var(--spell-icon-size) * 0.85);
    height: calc(var(--spell-icon-size) * 0.85);
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
    opacity: 0.75;
    transition: opacity 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 41;
  }
  .spell-nest:hover,
  .spell-nest:focus-visible {
    opacity: 1;
  }
  .spell-nest img {
    width: 100%;
    height: 100%;
    object-fit: contain;
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

  /* ── Tooltips ──────────────────────────────────────────────────────── */
  .spell-bird::after  { content: "listen"; }
  .spell-nest::after  { content: "stop"; }

  .spell-bird::after,
  .spell-nest::after {
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

  .spell-bird:hover::after,
  .spell-bird:focus-visible::after,
  .spell-nest:hover::after,
  .spell-nest:focus-visible::after {
    opacity: 1;
    transform: translateX(-50%) scale(1);
  }
</style>
