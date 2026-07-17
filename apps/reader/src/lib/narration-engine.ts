/**
 * narration-engine.ts — the reader's headless whole-chapter narration engine.
 *
 * This is the diary's post-ho-13 BirdNarrator engine shape
 * (apps/diary/src/lib/components/BirdNarrator.svelte) copied and adapted
 * per-app — NOT imported. The diary's engine lives inside a Svelte component
 * because the diary's narration UI is a bird; the reader's UI is a physical-book
 * ribbon that comes later, so the reader's engine is a plain module with an
 * imperative API. The route (or, eventually, the ribbon) owns the controls and
 * drives this engine.
 *
 * The port is deliberate about what changed and what did not:
 *   - `phase` and `rate` were Svelte `$state`; here they are plain closure
 *     variables. `onPhaseChange` still fires on every transition — the only
 *     thing `$state` bought the diary was template re-render, which a headless
 *     engine has no use for.
 *   - `pageEndOffset` was a reactive prop; here it is set imperatively via
 *     `setPageEndOffset` (the route raises it after each flip).
 *   - The wire is injected as `fetchSpeak` rather than hard-coded to
 *     `fetch('/api/speak')`, so the route bakes in the voice and tests can stub
 *     it. Everything below the fetch — the StreamCtx, the chunk queue with its
 *     `pumpQueue()` chokepoint, the `userPaused` flag, and the boundary poll —
 *     is a faithful transcription. The engine shape survived the extraction with
 *     no Svelte-reactivity dependency in its core (see R-AT-06 stop condition).
 *
 * One stream per play: a play() call synthesises the CURRENT chapter from the
 * current spread's start offset to the END of the chapter in a single request.
 * Chunks arrive progressively over NDJSON and play in sequence; the page turn
 * is a consumer of the highlight timeline (onPageBoundaryReached), never a
 * driver of the audio.
 */

import { type StreamChunk, audioBlobUrlFromBase64 } from '@edelmore/narration';
import type { WordTiming } from '@edelmore/narration';

export type NarrationPhase = 'idle' | 'loading' | 'playing' | 'paused';

/** Playback-rate bounds (playbackRate-based; server always generates at 1.0). */
export const RATE_MIN = 0.5;
export const RATE_MAX = 1.6;

/** The request the engine hands to its injected wire. */
export interface SpeakRequest {
  /** The chapter slice to synthesise: chapter text from the play offset to end. */
  text: string;
  /** Current playback rate — forwarded to the shim (server generates at 1.0). */
  speed: number;
  /** Aborted when the engine stops or a new play() supersedes this stream. */
  signal: AbortSignal;
}

export interface NarrationEngineConfig {
  /**
   * The wire: performs the /api/speak POST and resolves to the NDJSON Response.
   * Injected so the route bakes in the voice and tests can stub the transport.
   */
  fetchSpeak: (req: SpeakRequest) => Promise<Response>;
  /** Fired with the chapter-absolute char index of each highlighted word. */
  onWordHighlight?: (absCharIndex: number) => void;
  /** Fired once when the highlight crosses the current spread's end offset. */
  onPageBoundaryReached?: () => void;
  /** Fired on every phase transition. */
  onPhaseChange?: (phase: NarrationPhase) => void;
  /** Fired once when a chapter's narration reaches its natural end (→ idle). */
  onNarrationEnd?: () => void;
}

export interface NarrationEngine {
  /** Narrate `text` from `fromOffset` to its end. One stream; supersedes any prior. */
  play: (text: string, fromOffset: number) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  /** Clamp to [0.5, 1.6] and apply to the live + queued audio elements. */
  setRate: (rate: number) => void;
  /**
   * Raise the current spread's end offset (chapter-absolute). The boundary poll
   * fires onPageBoundaryReached when the highlight crosses it; the route raises
   * it to the next spread's end after each flip so the guard re-arms. `null`
   * disables boundary firing (single-spread chapter).
   */
  setPageEndOffset: (offset: number | null) => void;
  getPhase: () => NarrationPhase;
  getRate: () => number;
}

type QueuedChunk = {
  blobUrl: string;
  audioEl: HTMLAudioElement;
  audioOffset: number;
};

type StreamCtx = {
  reader: ReadableStreamDefaultReader<Uint8Array> | null;
  fetchAbort: AbortController | null;
  timings: WordTiming[];
  audioQueue: QueuedChunk[];
  baseOffset: number;
  done: boolean;
};

export function createNarrationEngine(config: NarrationEngineConfig): NarrationEngine {
  let phase: NarrationPhase = 'idle';
  let rate = 1.0;
  let pageEndOffset: number | null = null;

  // One stream context per play — the whole current chapter in a single request.
  let current: StreamCtx | null = null;

  // Active playback head — derived from the current StreamCtx.
  let audioEl: HTMLAudioElement | null = null;
  let audioBlobUrl: string | null = null;
  let chunkTimeOffset = 0;
  let boundaryInterval: ReturnType<typeof setInterval> | null = null;
  let boundaryIdx = 0;
  let lastAdvancedFromOffset: number | null = null;
  let lastEmittedCharPos: number | null = null;
  // Set by pause() (even between chunks, when audioEl is null); the chunk-
  // advance path refuses to start the next chunk while it's set, so a pause that
  // lands in a chunk gap holds until resume() clears it (diary ho-13 Decision 4).
  let userPaused = false;

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

  function setPhase(p: NarrationPhase): void {
    if (phase === p) return;
    phase = p;
    config.onPhaseChange?.(p);
  }

  function cleanupCtx(ctx: StreamCtx | null): void {
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

  function stopAll(): void {
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
    userPaused = false;
    cleanupCtx(current);
    current = null;
  }

  async function playInternal(text: string, fromOffset: number): Promise<void> {
    stopAll();
    // One stream per chapter: synthesize from the current spread's start offset
    // to the END of the chapter (diary ho-13 Decision 1). No untilOffset — the
    // page turn is driven by the highlight timeline, not a per-spread request.
    const slice = text.slice(fromOffset);
    if (!slice.trim()) {
      setPhase('idle');
      return;
    }
    current = newStreamCtx(fromOffset);
    setPhase('loading');
    await startFetch(current, slice);
  }

  async function startFetch(ctx: StreamCtx, slice: string): Promise<void> {
    ctx.fetchAbort = new AbortController();
    let response: Response;
    try {
      response = await config.fetchSpeak({
        text: slice,
        speed: rate,
        signal: ctx.fetchAbort.signal,
      });
      if (!response.ok) throw new Error(`TTS HTTP ${response.status}`);
    } catch (e) {
      if (ctx === current) {
        ctx.done = true;
        console.warn('Kokoro fetch failed', e);
        if (phase === 'loading') setPhase('idle');
      }
      return;
    }
    // Bail out if the ctx was cleaned up while the headers were in flight.
    if (ctx !== current) return;

    const body = response.body;
    if (!body) {
      ctx.done = true;
      if (phase === 'loading') setPhase('idle');
      return;
    }
    ctx.reader = body.getReader();
    void readStream(ctx);
  }

  async function readStream(ctx: StreamCtx): Promise<void> {
    const reader = ctx.reader;
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        // If our ctx was cleaned up, bail.
        if (ctx !== current) {
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
          // Stream ended with no audio at all → idle.
          if (phase === 'loading' && audioEl === null) {
            setPhase('idle');
            return;
          }
          // Stream finished after the last chunk already drained → the chapter
          // is over. pumpQueue ends it (respecting userPaused, so a pause in the
          // tail gap won't end early).
          pumpQueue();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        let newlineIdx: number = buffer.indexOf('\n');
        while (newlineIdx !== -1) {
          const line = buffer.slice(0, newlineIdx).trim();
          buffer = buffer.slice(newlineIdx + 1);
          if (line) {
            try {
              ingestChunk(ctx, JSON.parse(line) as StreamChunk);
            } catch {
              /* skip malformed */
            }
          }
          newlineIdx = buffer.indexOf('\n');
        }
      }
    } catch (e) {
      if (ctx !== current) return;
      console.warn('TTS stream error', e);
      ctx.done = true;
      if (phase === 'loading') setPhase('idle');
    }
  }

  function ingestChunk(ctx: StreamCtx, chunk: StreamChunk): void {
    ctx.timings.push(...chunk.words);
    const blobUrl = audioBlobUrlFromBase64(chunk.audio, chunk.format);
    const el = new Audio();
    el.preload = 'auto';
    el.src = blobUrl;
    el.playbackRate = rate;
    el.load();
    ctx.audioQueue.push({ blobUrl, audioEl: el, audioOffset: chunk.audioOffset });

    // A chunk arrived. If nothing is playing right now, start it — unless the
    // user has paused (pumpQueue respects userPaused), in which case it waits
    // for resume().
    pumpQueue();
  }

  // Start the next queued chunk when the pipeline is free: nothing playing, not
  // paused, and a chunk is available. Empty queue + stream done → chapter ended.
  function pumpQueue(): void {
    if (!current || audioEl !== null || userPaused) return;
    if (current.audioQueue.length > 0) {
      startNextChunkFromCurrent();
      return;
    }
    if (current.done) {
      handleEnd();
    }
    // else: stream is still delivering — wait for the next ingestChunk.
  }

  function startNextChunkFromCurrent(): void {
    if (!current) return;
    const next = current.audioQueue.shift();
    if (!next) return;
    startChunkPlayback(next.blobUrl, next.audioEl, next.audioOffset);
  }

  function startChunkPlayback(blobUrl: string, el: HTMLAudioElement, audioOffset: number): void {
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

  function advanceToNextChunk(): void {
    if (audioBlobUrl) {
      URL.revokeObjectURL(audioBlobUrl);
      audioBlobUrl = null;
    }
    audioEl = null;
    // The queue drives itself: play the next ready chunk unless paused; end the
    // chapter if the stream is drained. A pause that landed in this gap is held
    // by userPaused until resume() calls pumpQueue again.
    pumpQueue();
  }

  function handleEnd(): void {
    stopAll();
    setPhase('idle');
    config.onNarrationEnd?.();
  }

  function startBoundaryPolling(): void {
    if (boundaryInterval) clearInterval(boundaryInterval);
    boundaryInterval = setInterval(() => {
      if (!audioEl || audioEl.paused || !current) return;
      const t = chunkTimeOffset + audioEl.currentTime;

      // Emit word highlights from the current stream's timings.
      while (boundaryIdx < current.timings.length && current.timings[boundaryIdx].start <= t) {
        const w = current.timings[boundaryIdx];
        if (w.char_end > w.char_start) {
          const pos = current.baseOffset + w.char_start;
          lastEmittedCharPos = pos;
          config.onWordHighlight?.(pos);
        }
        boundaryIdx += 1;
      }

      // Boundary crossing (diary ho-13 Decision 2): the page turn consumes the
      // highlight timeline. When the highlighted word's absolute char index
      // crosses the current spread's end (pageEndOffset), fire ONCE for this
      // spread. The consumer flips; audio never stops. After the flip the route
      // raises pageEndOffset to the next spread's end, re-arming the guard.
      if (
        pageEndOffset !== null &&
        pageEndOffset !== lastAdvancedFromOffset &&
        lastEmittedCharPos !== null &&
        lastEmittedCharPos >= pageEndOffset
      ) {
        lastAdvancedFromOffset = pageEndOffset;
        config.onPageBoundaryReached?.();
      }
    }, 50);
  }

  // ── Imperative API ─────────────────────────────────────────────────────────

  function setRate(n: number): void {
    const clamped = Math.max(RATE_MIN, Math.min(RATE_MAX, Math.round(n * 100) / 100));
    if (clamped === rate) return;
    rate = clamped;
    if (phase !== 'playing' && phase !== 'paused') return;
    if (audioEl) {
      audioEl.playbackRate = clamped;
      if (current) {
        for (const item of current.audioQueue) item.audioEl.playbackRate = clamped;
      }
    }
  }

  function pause(): void {
    if (phase !== 'playing') return;
    // Set userPaused even when audioEl is null (a pause landing in a chunk gap).
    // pumpQueue refuses to start the next chunk while it's set, so the pause
    // holds until resume() (diary ho-13 Decision 4).
    userPaused = true;
    if (audioEl) audioEl.pause();
    setPhase('paused');
  }

  function resume(): void {
    if (phase !== 'paused') return;
    userPaused = false;
    setPhase('playing');
    if (audioEl) {
      // Paused mid-chunk — resume the same element.
      void audioEl.play();
    } else {
      // Paused in a chunk gap — start the pending chunk now (or end if the
      // stream drained while paused).
      pumpQueue();
    }
  }

  function stop(): void {
    stopAll();
    setPhase('idle');
  }

  return {
    play: playInternal,
    pause,
    resume,
    stop,
    setRate,
    setPageEndOffset: (offset: number | null) => {
      pageEndOffset = offset;
    },
    getPhase: () => phase,
    getRate: () => rate,
  };
}
