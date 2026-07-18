import type { StreamChunk, WordTiming } from '@edelmore/narration';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BirdNarrator, { type BirdPhase } from './BirdNarrator.svelte';

// ── Test doubles ────────────────────────────────────────────────────────────
//
// The engine touches three browser surfaces we stub: HTMLAudioElement (one per
// chunk), fetch (the single NDJSON /api/speak stream), and URL blob helpers.
// The stubs are controllable so a test can drive playback tick by tick.

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

  // Simulate this chunk's audio reaching its end.
  fireEnded() {
    this.paused = true;
    this.onended?.();
  }
}

// A controllable NDJSON stream: `push` delivers one chunk line, `close` ends
// the body. Reads pending before data arrives resolve when data is pushed, so
// the test never has to race the engine's read loop.
function makeStream() {
  const enc = new TextEncoder();
  const pending: Uint8Array[] = [];
  let resolveRead: ((r: ReadableStreamReadResult<Uint8Array>) => void) | null = null;
  let closed = false;
  const cancel = vi.fn();

  const reader = {
    read(): Promise<ReadableStreamReadResult<Uint8Array>> {
      return new Promise((resolve) => {
        if (pending.length > 0) {
          resolve({ done: false, value: pending.shift() as Uint8Array });
          return;
        }
        if (closed) {
          resolve({ done: true, value: undefined });
          return;
        }
        resolveRead = resolve;
      });
    },
    cancel,
  };

  return {
    reader,
    cancel,
    push(chunk: StreamChunk) {
      const line = enc.encode(`${JSON.stringify(chunk)}\n`);
      if (resolveRead) {
        const r = resolveRead;
        resolveRead = null;
        r({ done: false, value: line });
      } else {
        pending.push(line);
      }
    },
    close() {
      closed = true;
      if (resolveRead) {
        const r = resolveRead;
        resolveRead = null;
        r({ done: true, value: undefined });
      }
    },
  };
}

function chunkOf(words: WordTiming[], audioOffset = 0): StreamChunk {
  return { audio: btoa('audio'), format: 'audio/mpeg', words, audioOffset };
}

function word(char_start: number, char_end: number, start: number): WordTiming {
  return { word: 'x', start, end: start + 0.2, char_start, char_end };
}

let fetchMock: ReturnType<typeof vi.fn>;
let lastSignal: AbortSignal | null;
let revokeSpy: ReturnType<typeof vi.fn>;
// The stream created by the most recent fetch call.
let activeStream: ReturnType<typeof makeStream>;

beforeEach(() => {
  MockAudio.reset();
  lastSignal = null;

  revokeSpy = vi.fn();
  vi.stubGlobal('Audio', MockAudio as unknown as typeof Audio);
  vi.stubGlobal(
    'URL',
    Object.assign(Object.create(URL), {
      createObjectURL: vi.fn(() => `blob:mock/${Math.random()}`),
      revokeObjectURL: revokeSpy,
    })
  );

  fetchMock = vi.fn((_url: string, opts: RequestInit) => {
    lastSignal = opts.signal ?? null;
    const stream = makeStream();
    activeStream = stream;
    return Promise.resolve({
      ok: true,
      status: 200,
      body: { getReader: () => stream.reader },
    } as unknown as Response);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  // Unmount first (onDestroy → stop()) while the URL stub is still installed.
  cleanup();
  vi.unstubAllGlobals();
});

function mountBird(props: Partial<Record<string, unknown>> = {}) {
  const phases: BirdPhase[] = [];
  const highlights: number[] = [];
  const boundary = vi.fn();
  const narrationEnd = vi.fn();
  const result = render(BirdNarrator, {
    props: {
      text: 'The quick brown fox jumped over the lazy dog and then slept.',
      voiceURI: 'bf_emma',
      startOffset: 0,
      pageEndOffset: null,
      onPhaseChange: (p: BirdPhase) => phases.push(p),
      onWordHighlight: (i: number) => highlights.push(i),
      onPageBoundaryReached: boundary,
      onNarrationEnd: narrationEnd,
      ...props,
    },
  });
  const bird = result.container.querySelector('.spell-bird') as HTMLElement;
  return { ...result, bird, phases, highlights, boundary, narrationEnd };
}

describe('BirdNarrator engine', () => {
  it('walks idle → loading → playing → paused → playing → idle', async () => {
    const { bird, phases, narrationEnd } = mountBird();

    await fireEvent.click(bird); // idle → play
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    activeStream.push(chunkOf([]));
    await waitFor(() => expect(phases).toContain('playing'));

    await fireEvent.click(bird); // playing → pause
    await waitFor(() => expect(phases.at(-1)).toBe('paused'));

    await fireEvent.click(bird); // paused → resume
    await waitFor(() => expect(phases.at(-1)).toBe('playing'));

    // End the entry: close the stream, then let the playing chunk finish.
    activeStream.close();
    MockAudio.instances[0].fireEnded();
    await waitFor(() => expect(phases.at(-1)).toBe('idle'));

    expect(phases).toEqual(['loading', 'playing', 'paused', 'playing', 'idle']);
    expect(narrationEnd).toHaveBeenCalledTimes(1);
  });

  it("shows 'the voice is resting' when the TTS fetch fails before any audio", async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('unreachable')));
    const { bird } = mountBird();
    await fireEvent.click(bird);
    await waitFor(() => {
      expect(bird.classList.contains('is-resting')).toBe(true);
    });
    // A fresh click (new loading attempt) clears the resting state.
    await fireEvent.click(bird);
    await waitFor(() => {
      expect(bird.classList.contains('is-resting')).toBe(false);
    });
  });

  it('issues exactly one /api/speak request per bird click', async () => {
    const { bird } = mountBird({ pageEndOffset: 10 });

    await fireEvent.click(bird);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    activeStream.push(chunkOf([word(0, 3, 0), word(12, 15, 0.4)]));
    await waitFor(() => expect(MockAudio.instances.length).toBe(1));

    // Drive the highlight past the page boundary; the engine must NOT refetch.
    MockAudio.instances[0].currentTime = 5;
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // Give several poll ticks a chance to (wrongly) fire a second request.
    await new Promise((r) => setTimeout(r, 200));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fires the page-boundary callback once at the crossing without touching audio', async () => {
    const { bird, boundary } = mountBird({ pageEndOffset: 10 });

    await fireEvent.click(bird);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    activeStream.push(chunkOf([word(0, 3, 0), word(12, 15, 0.4)]));
    await waitFor(() => expect(MockAudio.instances.length).toBe(1));

    const audio = MockAudio.instances[0];
    audio.currentTime = 5; // word at char 12 crosses pageEndOffset 10
    await waitFor(() => expect(boundary).toHaveBeenCalledTimes(1));

    // Several more ticks: still exactly once, and the crossing never paused
    // or cut the audio stream.
    await new Promise((r) => setTimeout(r, 200));
    expect(boundary).toHaveBeenCalledTimes(1);
    expect(audio.pause).not.toHaveBeenCalled();
    expect(audio.paused).toBe(false);
  });

  it('emits monotonic highlight indices across a simulated boundary', async () => {
    const { bird, highlights } = mountBird({ pageEndOffset: 10 });

    await fireEvent.click(bird);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    activeStream.push(
      chunkOf([word(0, 3, 0), word(6, 9, 0.2), word(12, 15, 0.4), word(20, 24, 0.6)])
    );
    await waitFor(() => expect(MockAudio.instances.length).toBe(1));

    MockAudio.instances[0].currentTime = 10; // past every timing's start
    await waitFor(() => expect(highlights.length).toBe(4));

    expect(highlights).toEqual([0, 6, 12, 20]);
    for (let i = 1; i < highlights.length; i++) {
      expect(highlights[i]).toBeGreaterThanOrEqual(highlights[i - 1]);
    }
  });

  it('holds a chunk-gap pause until resume before playing the next chunk', async () => {
    const { bird, phases } = mountBird();

    await fireEvent.click(bird);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    activeStream.push(chunkOf([])); // chunk 1
    await waitFor(() => expect(MockAudio.instances.length).toBe(1));
    await waitFor(() => expect(phases.at(-1)).toBe('playing'));

    // Chunk 1 ends but the stream is still open → we sit in a chunk gap with
    // audioEl null and phase still 'playing'.
    MockAudio.instances[0].fireEnded();

    // Pause lands in the gap.
    await fireEvent.click(bird);
    await waitFor(() => expect(phases.at(-1)).toBe('paused'));

    // Chunk 2 arrives while paused — it must NOT auto-play.
    activeStream.push(chunkOf([]));
    await waitFor(() => expect(MockAudio.instances.length).toBe(2));
    expect(MockAudio.instances[1].play).not.toHaveBeenCalled();

    // Resume releases the held chunk.
    await fireEvent.click(bird);
    await waitFor(() => expect(MockAudio.instances[1].play).toHaveBeenCalled());
    expect(phases.at(-1)).toBe('playing');
  });

  it('stop() aborts the in-flight fetch and revokes blob URLs', async () => {
    const { bird, container } = mountBird();

    await fireEvent.click(bird);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    activeStream.push(chunkOf([]));
    await waitFor(() => expect(MockAudio.instances.length).toBe(1));

    const nest = container.querySelector('.spell-nest') as HTMLElement;
    await fireEvent.click(nest); // stop

    expect(lastSignal?.aborted).toBe(true);
    expect(revokeSpy).toHaveBeenCalled();
  });
});
