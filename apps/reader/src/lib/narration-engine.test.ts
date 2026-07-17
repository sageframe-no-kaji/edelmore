import type { StreamChunk, WordTiming } from '@edelmore/narration';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type NarrationEngine,
  type NarrationPhase,
  type SpeakRequest,
  createNarrationEngine,
} from './narration-engine.js';

// ── Test doubles ────────────────────────────────────────────────────────────
//
// The headless engine touches three surfaces we stub: the injected fetchSpeak
// wire, HTMLAudioElement (one per chunk, global `Audio`), and URL blob helpers.
// The stubs are controllable so a test can drive playback tick by tick — the
// same harness shape as the diary's BirdNarrator suite, minus the component.

class MockAudio {
  static instances: MockAudio[] = [];
  static reset() {
    MockAudio.instances = [];
  }

  src = '';
  preload = '';
  playbackRate = 1;
  muted = false;
  currentTime = 0;
  paused = true;
  onplay: (() => void) | null = null;
  onpause: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;

  play = vi.fn(() => {
    this.paused = false;
    this.onplay?.();
    return Promise.resolve();
  });
  pause = vi.fn(() => {
    this.paused = true;
    this.onpause?.();
  });
  load = vi.fn();

  constructor() {
    MockAudio.instances.push(this);
  }

  fireEnded() {
    this.paused = true;
    this.onended?.();
  }
}

// A controllable NDJSON stream. `push` delivers one framed chunk line;
// `pushRaw` delivers arbitrary bytes (for trailing-partial / malformed cases);
// `close` ends the body; `errorNext` makes the next read reject.
function makeStream() {
  const enc = new TextEncoder();
  const pending: Uint8Array[] = [];
  let resolveRead: ((r: ReadableStreamReadResult<Uint8Array>) => void) | null = null;
  let rejectRead: ((e: unknown) => void) | null = null;
  let closed = false;
  let errorPending: unknown = null;
  const cancel = vi.fn();

  const reader = {
    read(): Promise<ReadableStreamReadResult<Uint8Array>> {
      return new Promise((resolve, reject) => {
        if (errorPending) {
          const e = errorPending;
          errorPending = null;
          reject(e);
          return;
        }
        if (pending.length > 0) {
          resolve({ done: false, value: pending.shift() as Uint8Array });
          return;
        }
        if (closed) {
          resolve({ done: true, value: undefined });
          return;
        }
        resolveRead = resolve;
        rejectRead = reject;
      });
    },
    cancel,
  };

  function deliver(bytes: Uint8Array) {
    if (resolveRead) {
      const r = resolveRead;
      resolveRead = null;
      rejectRead = null;
      r({ done: false, value: bytes });
    } else {
      pending.push(bytes);
    }
  }

  return {
    reader,
    cancel,
    push(chunk: StreamChunk) {
      deliver(enc.encode(`${JSON.stringify(chunk)}\n`));
    },
    pushRaw(text: string) {
      deliver(enc.encode(text));
    },
    close() {
      closed = true;
      if (resolveRead) {
        const r = resolveRead;
        resolveRead = null;
        rejectRead = null;
        r({ done: true, value: undefined });
      }
    },
    errorNext(e: unknown) {
      if (rejectRead) {
        const rej = rejectRead;
        rejectRead = null;
        resolveRead = null;
        rej(e);
      } else {
        errorPending = e;
      }
    },
  };
}

type MockStream = ReturnType<typeof makeStream>;

function chunkOf(words: WordTiming[], audioOffset = 0): StreamChunk {
  return { audio: btoa('audio'), format: 'audio/mpeg', words, audioOffset };
}

function word(char_start: number, char_end: number, start: number): WordTiming {
  return { word: 'x', start, end: start + 0.2, char_start, char_end };
}

const TEXT = 'The quick brown fox jumped over the lazy dog and then slept.';

let revokeSpy: ReturnType<typeof vi.fn>;
let warnSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  MockAudio.reset();
  revokeSpy = vi.fn();
  vi.stubGlobal('Audio', MockAudio as unknown as typeof Audio);
  vi.stubGlobal(
    'URL',
    Object.assign(Object.create(URL), {
      createObjectURL: vi.fn(() => `blob:mock/${Math.random()}`),
      revokeObjectURL: revokeSpy,
    })
  );
  warnSpy = vi.fn();
  vi.stubGlobal('console', { ...console, warn: warnSpy });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Harness: an engine wired to a fetchSpeak that hands back a fresh controllable
// stream per call, plus recorders for every callback.
function setup(): {
  engine: NarrationEngine;
  fetchMock: ReturnType<typeof vi.fn>;
  streams: MockStream[];
  signals: (AbortSignal | undefined)[];
  phases: NarrationPhase[];
  highlights: number[];
  boundary: ReturnType<typeof vi.fn>;
  narrationEnd: ReturnType<typeof vi.fn>;
} {
  const streams: MockStream[] = [];
  const signals: (AbortSignal | undefined)[] = [];
  const fetchMock = vi.fn((req: SpeakRequest) => {
    signals.push(req.signal);
    const stream = makeStream();
    streams.push(stream);
    return Promise.resolve({
      ok: true,
      status: 200,
      body: { getReader: () => stream.reader },
    } as unknown as Response);
  });
  const phases: NarrationPhase[] = [];
  const highlights: number[] = [];
  const boundary = vi.fn();
  const narrationEnd = vi.fn();
  const engine = createNarrationEngine({
    fetchSpeak: fetchMock,
    onPhaseChange: (p) => phases.push(p),
    onWordHighlight: (i) => highlights.push(i),
    onPageBoundaryReached: boundary,
    onNarrationEnd: narrationEnd,
  });
  return { engine, fetchMock, streams, signals, phases, highlights, boundary, narrationEnd };
}

function waitFor(fn: () => void, timeout = 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      try {
        fn();
        resolve();
      } catch (e) {
        if (Date.now() - start > timeout) {
          reject(e);
          return;
        }
        setTimeout(tick, 5);
      }
    };
    tick();
  });
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('createNarrationEngine — phase machine', () => {
  it('walks idle → loading → playing → paused → playing → idle', async () => {
    const { engine, fetchMock, streams, phases, narrationEnd } = setup();

    await engine.play(TEXT, 0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    streams[0].push(chunkOf([]));
    await waitFor(() => expect(phases).toContain('playing'));

    engine.pause();
    expect(phases.at(-1)).toBe('paused');

    engine.resume();
    expect(phases.at(-1)).toBe('playing');

    // End the chapter: close the stream, then let the playing chunk finish.
    streams[0].close();
    await settle();
    MockAudio.instances[0].fireEnded();
    await waitFor(() => expect(phases.at(-1)).toBe('idle'));

    expect(phases).toEqual(['loading', 'playing', 'paused', 'playing', 'idle']);
    expect(narrationEnd).toHaveBeenCalledTimes(1);
    expect(engine.getPhase()).toBe('idle');
  });

  it('play with a blank slice goes straight to idle and never fetches', async () => {
    const { engine, fetchMock, phases } = setup();
    await engine.play('    \n  ', 0);
    expect(fetchMock).not.toHaveBeenCalled();
    // idle → idle is a no-op transition, so onPhaseChange is silent.
    expect(phases).toEqual([]);
    expect(engine.getPhase()).toBe('idle');
  });

  it('play from an offset past the last non-whitespace char goes idle', async () => {
    const { engine, fetchMock } = setup();
    await engine.play('hello', 5);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(engine.getPhase()).toBe('idle');
  });
});

describe('createNarrationEngine — single stream per play', () => {
  it('issues exactly one fetchSpeak per play and never refetches on a boundary', async () => {
    const { engine, fetchMock, streams } = setup();
    engine.setPageEndOffset(10);

    await engine.play(TEXT, 0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    streams[0].push(chunkOf([word(0, 3, 0), word(12, 15, 0.4)]));
    await waitFor(() => expect(MockAudio.instances.length).toBe(1));

    MockAudio.instances[0].currentTime = 5; // drive highlight past the boundary
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 200));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('forwards the current rate as speed to the wire', async () => {
    const { engine, fetchMock } = setup();
    engine.setRate(1.4);
    await engine.play(TEXT, 0);
    expect(fetchMock.mock.calls[0][0].speed).toBe(1.4);
    expect(fetchMock.mock.calls[0][0].text).toBe(TEXT);
  });

  it('slices from the play offset to the end of the chapter (no untilOffset)', async () => {
    const { engine, fetchMock } = setup();
    await engine.play(TEXT, 4);
    expect(fetchMock.mock.calls[0][0].text).toBe(TEXT.slice(4));
  });
});

describe('createNarrationEngine — boundary crossing', () => {
  it('fires the page-boundary callback once at the crossing without touching audio', async () => {
    const { engine, streams, boundary } = setup();
    engine.setPageEndOffset(10);

    await engine.play(TEXT, 0);
    streams[0].push(chunkOf([word(0, 3, 0), word(12, 15, 0.4)]));
    await waitFor(() => expect(MockAudio.instances.length).toBe(1));

    const audio = MockAudio.instances[0];
    audio.currentTime = 5; // word at char 12 crosses pageEndOffset 10
    await waitFor(() => expect(boundary).toHaveBeenCalledTimes(1));

    await new Promise((r) => setTimeout(r, 200));
    expect(boundary).toHaveBeenCalledTimes(1);
    expect(audio.pause).not.toHaveBeenCalled();
    expect(audio.paused).toBe(false);
  });

  it('re-arms after the route raises pageEndOffset — fires again at the next spread end', async () => {
    const { engine, streams, boundary } = setup();
    engine.setPageEndOffset(10);

    await engine.play(TEXT, 0);
    streams[0].push(chunkOf([word(0, 3, 0), word(12, 15, 0.4), word(30, 34, 0.8)]));
    await waitFor(() => expect(MockAudio.instances.length).toBe(1));

    MockAudio.instances[0].currentTime = 0.5; // crosses 10 (char 12)
    await waitFor(() => expect(boundary).toHaveBeenCalledTimes(1));

    engine.setPageEndOffset(25); // route flipped; next spread ends at 25
    MockAudio.instances[0].currentTime = 1.0; // crosses 25 (char 30)
    await waitFor(() => expect(boundary).toHaveBeenCalledTimes(2));
  });

  it('never fires the boundary when pageEndOffset is null', async () => {
    const { engine, streams, boundary } = setup();
    engine.setPageEndOffset(null);

    await engine.play(TEXT, 0);
    streams[0].push(chunkOf([word(0, 3, 0), word(40, 44, 0.4)]));
    await waitFor(() => expect(MockAudio.instances.length).toBe(1));

    MockAudio.instances[0].currentTime = 5;
    await new Promise((r) => setTimeout(r, 150));
    expect(boundary).not.toHaveBeenCalled();
  });
});

describe('createNarrationEngine — highlights', () => {
  it('emits monotonic highlight indices, offset by the play base', async () => {
    const { engine, streams, highlights } = setup();
    engine.setPageEndOffset(null);

    const longText = `${'x'.repeat(100)}${TEXT}`; // room for a base offset of 100
    await engine.play(longText, 100); // baseOffset 100
    streams[0].push(
      chunkOf([word(0, 3, 0), word(6, 9, 0.2), word(12, 15, 0.4), word(20, 24, 0.6)])
    );
    await waitFor(() => expect(MockAudio.instances.length).toBe(1));

    MockAudio.instances[0].currentTime = 10; // past every timing start
    await waitFor(() => expect(highlights.length).toBe(4));

    expect(highlights).toEqual([100, 106, 112, 120]);
    for (let i = 1; i < highlights.length; i++) {
      expect(highlights[i]).toBeGreaterThanOrEqual(highlights[i - 1]);
    }
  });

  it('skips the highlight for a sentinel word (char_end === char_start)', async () => {
    const { engine, streams, highlights } = setup();
    await engine.play(TEXT, 0);
    // Middle word is a no-anchor sentinel: char_start === char_end.
    streams[0].push(chunkOf([word(0, 3, 0), word(5, 5, 0.2), word(6, 9, 0.4)]));
    await waitFor(() => expect(MockAudio.instances.length).toBe(1));

    MockAudio.instances[0].currentTime = 10;
    await waitFor(() => expect(highlights.length).toBe(2));
    expect(highlights).toEqual([0, 6]);
  });
});

describe('createNarrationEngine — pause/resume', () => {
  it('holds a chunk-gap pause until resume before playing the next chunk', async () => {
    const { engine, streams, phases } = setup();

    await engine.play(TEXT, 0);
    streams[0].push(chunkOf([])); // chunk 1
    await waitFor(() => expect(MockAudio.instances.length).toBe(1));
    await waitFor(() => expect(phases.at(-1)).toBe('playing'));

    // Chunk 1 ends but the stream is still open → chunk gap, audioEl null.
    MockAudio.instances[0].fireEnded();

    engine.pause(); // pause lands in the gap
    expect(phases.at(-1)).toBe('paused');

    streams[0].push(chunkOf([])); // chunk 2 arrives while paused
    await waitFor(() => expect(MockAudio.instances.length).toBe(2));
    expect(MockAudio.instances[1].play).not.toHaveBeenCalled();

    engine.resume(); // releases the held chunk
    await waitFor(() => expect(MockAudio.instances[1].play).toHaveBeenCalled());
    expect(phases.at(-1)).toBe('playing');
  });

  it('resumes the same element when paused mid-chunk', async () => {
    const { engine, streams } = setup();
    await engine.play(TEXT, 0);
    streams[0].push(chunkOf([]));
    await waitFor(() => expect(MockAudio.instances.length).toBe(1));
    await waitFor(() => expect(engine.getPhase()).toBe('playing'));

    engine.pause();
    expect(MockAudio.instances[0].pause).toHaveBeenCalledTimes(1);

    engine.resume();
    // The same element is resumed — a second play() on instance 0, no new Audio.
    expect(MockAudio.instances.length).toBe(1);
    expect(MockAudio.instances[0].play).toHaveBeenCalledTimes(2);
  });

  it('resume that drains an already-finished stream ends the chapter', async () => {
    const { engine, streams, phases, narrationEnd } = setup();
    await engine.play(TEXT, 0);
    streams[0].push(chunkOf([]));
    await waitFor(() => expect(engine.getPhase()).toBe('playing'));

    MockAudio.instances[0].fireEnded(); // into the gap
    engine.pause();
    streams[0].close(); // stream drains while paused
    await settle();

    engine.resume(); // gap resume finds the stream done → end
    await waitFor(() => expect(phases.at(-1)).toBe('idle'));
    expect(narrationEnd).toHaveBeenCalledTimes(1);
  });

  it('pause is a no-op when not playing; resume is a no-op when not paused', async () => {
    const { engine, phases } = setup();
    engine.pause();
    engine.resume();
    expect(phases).toEqual([]);
    expect(engine.getPhase()).toBe('idle');
  });
});

describe('createNarrationEngine — rate', () => {
  it('clamps rate to [0.5, 1.6] and applies it to the live and queued elements', async () => {
    const { engine, streams } = setup();
    await engine.play(TEXT, 0);
    streams[0].push(chunkOf([])); // chunk 1 starts playing
    await waitFor(() => expect(engine.getPhase()).toBe('playing'));
    streams[0].push(chunkOf([])); // chunk 2 waits in the queue
    await waitFor(() => expect(MockAudio.instances.length).toBe(2));

    engine.setRate(5); // clamps to 1.6
    expect(engine.getRate()).toBe(1.6);
    expect(MockAudio.instances[0].playbackRate).toBe(1.6); // live
    expect(MockAudio.instances[1].playbackRate).toBe(1.6); // queued

    engine.setRate(0.1); // clamps to 0.5
    expect(engine.getRate()).toBe(0.5);
    expect(MockAudio.instances[0].playbackRate).toBe(0.5);
  });

  it('setRate is a no-op when the value is unchanged', async () => {
    const { engine, streams } = setup();
    await engine.play(TEXT, 0);
    streams[0].push(chunkOf([]));
    await waitFor(() => expect(engine.getPhase()).toBe('playing'));
    engine.setRate(1.0); // already 1.0
    expect(MockAudio.instances[0].playbackRate).toBe(1.0);
  });

  it('setRate while idle records the rate without touching any element', () => {
    const { engine } = setup();
    engine.setRate(0.75);
    expect(engine.getRate()).toBe(0.75);
    expect(MockAudio.instances.length).toBe(0);
  });

  it('setRate while paused in a chunk gap records the rate (no live element)', async () => {
    const { engine, streams } = setup();
    await engine.play(TEXT, 0);
    streams[0].push(chunkOf([]));
    await waitFor(() => expect(engine.getPhase()).toBe('playing'));
    MockAudio.instances[0].fireEnded(); // gap
    engine.pause();
    engine.setRate(1.2);
    expect(engine.getRate()).toBe(1.2);
  });
});

describe('createNarrationEngine — stop & teardown', () => {
  it('stop() aborts the in-flight fetch and revokes blob URLs', async () => {
    const { engine, streams, signals } = setup();
    await engine.play(TEXT, 0);
    streams[0].push(chunkOf([]));
    await waitFor(() => expect(MockAudio.instances.length).toBe(1));

    engine.stop();
    expect(signals[0]?.aborted).toBe(true);
    expect(revokeSpy).toHaveBeenCalled();
    expect(engine.getPhase()).toBe('idle');
  });

  it('stop() tears down chunks still waiting in the queue', async () => {
    const { engine, streams } = setup();
    await engine.play(TEXT, 0);
    streams[0].push(chunkOf([])); // chunk 1 → plays
    await waitFor(() => expect(engine.getPhase()).toBe('playing'));
    streams[0].push(chunkOf([])); // chunk 2 → sits in the queue
    await waitFor(() => expect(MockAudio.instances.length).toBe(2));

    engine.stop();
    // The queued (never-played) element was paused and its blob URL revoked.
    expect(MockAudio.instances[1].pause).toHaveBeenCalled();
    expect(MockAudio.instances[1].src).toBe('');
    expect(engine.getPhase()).toBe('idle');
  });

  it('stop() before any play is a harmless no-op', () => {
    const { engine, phases } = setup();
    engine.stop();
    expect(phases).toEqual([]);
    expect(engine.getPhase()).toBe('idle');
  });

  it('a second play supersedes the first: the stale stream is cancelled', async () => {
    const { engine, streams, signals } = setup();
    await engine.play(TEXT, 0);
    streams[0].push(chunkOf([]));
    await waitFor(() => expect(MockAudio.instances.length).toBe(1));

    await engine.play(TEXT, 20); // supersede
    expect(signals[0]?.aborted).toBe(true); // old fetch aborted
    // The old stream's pending read resolves after supersession → its ctx !==
    // current branch cancels the reader and bails without ingesting.
    streams[0].push(chunkOf([word(0, 3, 0)]));
    await settle();
    expect(streams[0].cancel).toHaveBeenCalled();
  });
});

describe('createNarrationEngine — stream ingestion edge cases', () => {
  it('ingests a trailing partial line with no newline on stream end', async () => {
    const { engine, streams } = setup();
    await engine.play(TEXT, 0);
    streams[0].pushRaw(JSON.stringify(chunkOf([word(0, 3, 0)]))); // no newline
    await settle();
    streams[0].close();
    await waitFor(() => expect(MockAudio.instances.length).toBe(1));
  });

  it('skips a malformed NDJSON line and keeps going', async () => {
    const { engine, streams } = setup();
    await engine.play(TEXT, 0);
    streams[0].pushRaw('{ not json }\n');
    streams[0].push(chunkOf([word(0, 3, 0)]));
    await waitFor(() => expect(MockAudio.instances.length).toBe(1));
  });

  it('skips a malformed trailing partial on stream end', async () => {
    const { engine, streams, phases } = setup();
    await engine.play(TEXT, 0);
    streams[0].pushRaw('{ not json');
    await settle();
    streams[0].close();
    await waitFor(() => expect(phases.at(-1)).toBe('idle'));
    expect(MockAudio.instances.length).toBe(0);
  });

  it('goes idle when the stream closes before any audio arrives', async () => {
    const { engine, streams, phases } = setup();
    await engine.play(TEXT, 0);
    streams[0].close();
    await waitFor(() => expect(phases.at(-1)).toBe('idle'));
    expect(MockAudio.instances.length).toBe(0);
  });
});

describe('createNarrationEngine — failure paths', () => {
  it('goes idle and warns when fetchSpeak rejects', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new TypeError('offline')));
    const phases: NarrationPhase[] = [];
    const engine = createNarrationEngine({
      fetchSpeak: fetchMock,
      onPhaseChange: (p) => phases.push(p),
    });
    await engine.play(TEXT, 0);
    await waitFor(() => expect(phases.at(-1)).toBe('idle'));
    expect(warnSpy).toHaveBeenCalled();
    expect(phases).toEqual(['loading', 'idle']);
  });

  it('goes idle when the response is not ok', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: false, status: 502, body: null } as unknown as Response)
    );
    const phases: NarrationPhase[] = [];
    const engine = createNarrationEngine({
      fetchSpeak: fetchMock,
      onPhaseChange: (p) => phases.push(p),
    });
    await engine.play(TEXT, 0);
    await waitFor(() => expect(phases.at(-1)).toBe('idle'));
  });

  it('goes idle when the response has no body', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, body: null } as unknown as Response)
    );
    const phases: NarrationPhase[] = [];
    const engine = createNarrationEngine({
      fetchSpeak: fetchMock,
      onPhaseChange: (p) => phases.push(p),
    });
    await engine.play(TEXT, 0);
    await waitFor(() => expect(phases.at(-1)).toBe('idle'));
    expect(engine.getPhase()).toBe('idle');
  });

  it('goes idle and warns when the read stream errors before any chunk', async () => {
    const { engine, streams, phases } = setup();
    await engine.play(TEXT, 0);
    streams[0].errorNext(new Error('stream broke'));
    await waitFor(() => expect(phases.at(-1)).toBe('idle'));
    expect(warnSpy).toHaveBeenCalledWith('TTS stream error', expect.any(Error));
  });

  it('stops and goes idle when a chunk element errors during playback', async () => {
    const { engine, streams, phases } = setup();
    await engine.play(TEXT, 0);
    streams[0].push(chunkOf([]));
    await waitFor(() => expect(engine.getPhase()).toBe('playing'));

    // Simulate the audio element failing mid-playback.
    MockAudio.instances[0].onerror?.();
    expect(phases.at(-1)).toBe('idle');
    expect(engine.getPhase()).toBe('idle');
  });

  it('does not re-ingest when the read errors on a superseded stream', async () => {
    const { engine, streams } = setup();
    await engine.play(TEXT, 0);
    streams[0].push(chunkOf([]));
    await waitFor(() => expect(MockAudio.instances.length).toBe(1));

    await engine.play(TEXT, 5); // supersede — stream 0 now stale
    streams[0].errorNext(new Error('late error on stale ctx'));
    await settle();
    // The stale ctx's catch returns early; no warn for the stale stream.
    expect(warnSpy).not.toHaveBeenCalledWith('TTS stream error', expect.any(Error));
  });
});
