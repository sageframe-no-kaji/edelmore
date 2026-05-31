import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock $env/dynamic/private before importing the handler. The object is mutable
// so individual tests can toggle config (e.g. unset TTS_URL, configure Docker).
vi.mock('$env/dynamic/private', () => ({
  env: {
    TTS_URL: 'http://kokoro.test/dev/captioned_speech',
    TTS_VOICES_URL: 'http://kokoro.test/v1/audio/voices',
    TTS_API_KEY: '',
  } as Record<string, string | undefined>,
}));

const env = (await import('$env/dynamic/private')).env as Record<string, string | undefined>;
const { POST } = await import('./+server.js');

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeAuthedEvent(body: unknown) {
  return {
    request: new Request('http://localhost/api/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    locals: {
      user: {
        id: 1,
        username: 'Iona',
        cover_id: 'meadow',
        font_size: 3.4,
        journal_font: 'eb-garamond',
        diary_title: 'Diary',
      },
    },
  } as Parameters<typeof POST>[0];
}

function makeUnauthEvent(body: unknown) {
  return {
    request: new Request('http://localhost/api/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    locals: {},
  } as Parameters<typeof POST>[0];
}

/** One upstream chunk in Kokoro's NDJSON streaming format. */
function makeKokoroChunk(
  overrides?: Partial<{ audio: string; audio_format: string; timestamps: unknown[] }>
) {
  return {
    audio: btoa('fake-mp3-bytes'),
    audio_format: 'mp3',
    timestamps: [
      { word: 'Hello', start_time: 0.0, end_time: 0.3 },
      { word: 'world', start_time: 0.3, end_time: 0.6 },
    ],
    ...overrides,
  };
}

/** Build a mock upstream Response containing one or more NDJSON lines. */
function makeUpstreamStreamResponse(
  chunks: object[] = [makeKokoroChunk()],
  status = 200
): Response {
  const ndjson = `${chunks.map((c) => JSON.stringify(c)).join('\n')}\n`;
  return new Response(ndjson, {
    status,
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}

/** Read all NDJSON lines from a streaming Response. */
async function readNdjson(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

const originalFetch = globalThis.fetch;

describe('POST /api/speak', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns 401 for unauthenticated requests', async () => {
    await expect(
      POST(makeUnauthEvent({ text: 'hello', voice: 'af_bella', speed: 1.0 }))
    ).rejects.toMatchObject({ status: 401 });
  });

  it('returns 400 when text is missing', async () => {
    await expect(POST(makeAuthedEvent({ voice: 'af_bella', speed: 1.0 }))).rejects.toMatchObject({
      status: 400,
    });
  });

  it('returns 400 when voice is missing', async () => {
    await expect(POST(makeAuthedEvent({ text: 'hello', speed: 1.0 }))).rejects.toMatchObject({
      status: 400,
    });
  });

  it('returns NDJSON stream with normalised chunk on success', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeUpstreamStreamResponse()
    );

    const response = await POST(
      makeAuthedEvent({ text: 'Hello world', voice: 'af_bella', speed: 1.0 })
    );
    expect(response.headers.get('Content-Type')).toContain('ndjson');

    const chunks = await readNdjson(response);
    expect(chunks).toHaveLength(1);

    const chunk = chunks[0] as Record<string, unknown>;
    expect(typeof chunk.audio).toBe('string');
    expect(chunk.format).toBe('audio/mpeg');
    expect(chunk.audioOffset).toBe(0.0);
    expect(Array.isArray(chunk.words)).toBe(true);

    const words = chunk.words as Array<Record<string, unknown>>;
    expect(words).toHaveLength(2);
    expect(words[0]).toMatchObject({
      word: 'Hello',
      start: 0.0,
      end: 0.3,
      char_start: 0,
      char_end: 5,
    });
    expect(words[1]).toMatchObject({
      word: 'world',
      start: 0.3,
      end: 0.6,
      char_start: 6,
      char_end: 11,
    });
  });

  it('returns 502 when upstream responds with non-2xx', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response('upstream error', { status: 500 })
    );

    await expect(
      POST(makeAuthedEvent({ text: 'hello', voice: 'af_bella', speed: 1.0 }))
    ).rejects.toMatchObject({ status: 502 });
  });

  it('returns 503 when upstream is unreachable', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new TypeError('fetch failed')
    );

    await expect(
      POST(makeAuthedEvent({ text: 'hello', voice: 'af_bella', speed: 1.0 }))
    ).rejects.toMatchObject({ status: 503 });
  });

  it('returns 200 with empty stream when upstream returns non-JSON body', async () => {
    // With streaming, unparse-able upstream lines are silently skipped.
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response('not json\n', { status: 200 })
    );

    const response = await POST(makeAuthedEvent({ text: 'hello', voice: 'af_bella', speed: 1.0 }));
    expect(response.status).toBe(200);
    const chunks = await readNdjson(response);
    expect(chunks).toHaveLength(0);
  });

  it('hits the captioned_speech endpoint, not /v1/audio/speech', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeUpstreamStreamResponse()
    );

    await POST(makeAuthedEvent({ text: 'Hello world', voice: 'af_bella', speed: 1.0 }));
    const calledUrl = String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(calledUrl).toContain('captioned_speech');
  });

  it('maps audio_format mp3 to audio/mpeg MIME type', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeUpstreamStreamResponse([makeKokoroChunk({ audio_format: 'mp3' })])
    );

    const response = await POST(makeAuthedEvent({ text: 'hello', voice: 'af_bella', speed: 1.0 }));
    const [chunk] = (await readNdjson(response)) as Array<Record<string, unknown>>;
    expect(chunk.format).toBe('audio/mpeg');
  });

  it('maps audio_format wav to audio/wav MIME type', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeUpstreamStreamResponse([makeKokoroChunk({ audio_format: 'wav' })])
    );

    const response = await POST(makeAuthedEvent({ text: 'hello', voice: 'af_bella', speed: 1.0 }));
    const [chunk] = (await readNdjson(response)) as Array<Record<string, unknown>>;
    expect(chunk.format).toBe('audio/wav');
  });

  it('sends stream=true and return_timestamps=true to upstream', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeUpstreamStreamResponse()
    );

    await POST(makeAuthedEvent({ text: 'hello', voice: 'af_bella', speed: 1.0 }));
    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const sentBody = JSON.parse(callArgs[1].body as string);
    expect(sentBody.stream).toBe(true);
    expect(sentBody.return_timestamps).toBe(true);
  });

  it('returns 503 when TTS_URL is not configured', async () => {
    const saved = env.TTS_URL;
    env.TTS_URL = '';
    try {
      await expect(
        POST(makeAuthedEvent({ text: 'hello', voice: 'af_bella', speed: 1.0 }))
      ).rejects.toMatchObject({ status: 503 });
    } finally {
      env.TTS_URL = saved;
    }
  });

  it('skips upstream chunks that are missing required fields', async () => {
    // Chunk with no timestamps array — should be skipped silently.
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(`${JSON.stringify({ audio: 'x' })}\n`, { status: 200 })
    );

    const response = await POST(makeAuthedEvent({ text: 'hello', voice: 'af_bella', speed: 1.0 }));
    expect(response.status).toBe(200);
    const chunks = await readNdjson(response);
    expect(chunks).toHaveLength(0);
  });

  it.each([
    ['opus', 'audio/opus'],
    ['flac', 'audio/flac'],
    ['pcm', 'audio/L16; rate=24000'],
    ['ogg', 'audio/mpeg'], // unknown → default
  ])('maps audio_format %s to %s', async (fmt, mime) => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeUpstreamStreamResponse([makeKokoroChunk({ audio_format: fmt })])
    );

    const response = await POST(makeAuthedEvent({ text: 'hello', voice: 'af_bella', speed: 1.0 }));
    const [chunk] = (await readNdjson(response)) as Array<Record<string, unknown>>;
    expect(chunk.format).toBe(mime);
  });

  it('emits cursor-based offsets for a word not present in the source text', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeUpstreamStreamResponse([
        {
          audio: btoa('x'),
          audio_format: 'mp3',
          timestamps: [{ word: 'zzz', start_time: 0, end_time: 0.1 }],
        },
      ])
    );

    const response = await POST(
      makeAuthedEvent({ text: 'Hello world', voice: 'af_bella', speed: 1 })
    );
    const [chunk] = (await readNdjson(response)) as Array<{
      words: Array<Record<string, unknown>>;
    }>;
    // 'zzz' is not in 'Hello world' so char offsets collapse to the cursor (0).
    expect(chunk.words[0]).toMatchObject({ word: 'zzz', char_start: 0, char_end: 0 });
  });

  it('correctly computes char offsets across multiple upstream chunks', async () => {
    // Two upstream chunks: first has "Hello", second has "world".
    // The char cursor must advance between chunks so "world" is found after "Hello ".
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeUpstreamStreamResponse([
        {
          audio: btoa('c1'),
          audio_format: 'mp3',
          timestamps: [{ word: 'Hello', start_time: 0.0, end_time: 0.3 }],
        },
        {
          audio: btoa('c2'),
          audio_format: 'mp3',
          timestamps: [{ word: 'world', start_time: 0.3, end_time: 0.6 }],
        },
      ])
    );

    const response = await POST(
      makeAuthedEvent({ text: 'Hello world', voice: 'af_bella', speed: 1 })
    );
    const chunks = (await readNdjson(response)) as Array<{
      words: Array<Record<string, unknown>>;
      audioOffset: number;
    }>;
    expect(chunks).toHaveLength(2);

    expect(chunks[0].words[0]).toMatchObject({ word: 'Hello', char_start: 0, char_end: 5 });
    expect(chunks[0].audioOffset).toBe(0.0);

    expect(chunks[1].words[0]).toMatchObject({ word: 'world', char_start: 6, char_end: 11 });
    expect(chunks[1].audioOffset).toBe(0.3);
  });

  it('sets audioOffset to first word start_time', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeUpstreamStreamResponse([
        makeKokoroChunk({
          timestamps: [
            { word: 'Hello', start_time: 1.5, end_time: 1.8 },
            { word: 'world', start_time: 1.8, end_time: 2.1 },
          ],
        }),
      ])
    );

    const response = await POST(
      makeAuthedEvent({ text: 'Hello world', voice: 'af_bella', speed: 1.0 })
    );
    const [chunk] = (await readNdjson(response)) as Array<{ audioOffset: number }>;
    expect(chunk.audioOffset).toBe(1.5);
  });
});

// ── On-demand Kokoro lifecycle (DOCKER_API_URL configured) ─────────────────────

describe('POST /api/speak — on-demand Kokoro', () => {
  const dockerUrl = 'http://docker.test:2376';
  const containerName = 'svc-kokoro';

  beforeEach(() => {
    globalThis.fetch = vi.fn();
    env.DOCKER_API_URL = dockerUrl;
    env.KOKORO_CONTAINER_NAME = containerName;
    env.KOKORO_IDLE_MINUTES = '5';
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    env.DOCKER_API_URL = undefined;
    env.KOKORO_CONTAINER_NAME = undefined;
    env.KOKORO_IDLE_MINUTES = undefined;
  });

  it('skips startup when the container is already running', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ State: { Running: true } }), { status: 200 })
      )
      .mockResolvedValueOnce(makeUpstreamStreamResponse());

    await POST(makeAuthedEvent({ text: 'Hello world', voice: 'af_bella', speed: 1 }));

    expect(String(fetchMock.mock.calls[0][0])).toContain(`/containers/${containerName}/json`);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/start'))).toBe(false);
  });

  it('starts a stopped container and polls voices until ready', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ State: { Running: false } }), { status: 200 })
      ) // state
      .mockResolvedValueOnce(new Response(null, { status: 204 })) // start
      .mockResolvedValueOnce(new Response('[]', { status: 200 })) // voices readiness poll
      .mockResolvedValueOnce(makeUpstreamStreamResponse()); // TTS

    const p = POST(makeAuthedEvent({ text: 'Hello world', voice: 'af_bella', speed: 1 }));
    await vi.advanceTimersByTimeAsync(2000);
    const response = await p;
    const chunks = await readNdjson(response);

    expect(chunks).toHaveLength(1);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/start'))).toBe(true);
  });

  it('continues when the Docker API is unreachable on the state probe', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockRejectedValueOnce(new TypeError('docker down'))
      .mockResolvedValueOnce(makeUpstreamStreamResponse());

    const response = await POST(
      makeAuthedEvent({ text: 'Hello world', voice: 'af_bella', speed: 1 })
    );
    expect(response.status).toBe(200);
  });

  it('continues when starting the container fails', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ State: { Running: false } }), { status: 200 })
      ) // state
      .mockRejectedValueOnce(new TypeError('start failed')) // start throws → return
      .mockResolvedValueOnce(makeUpstreamStreamResponse()); // TTS

    const response = await POST(
      makeAuthedEvent({ text: 'Hello world', voice: 'af_bella', speed: 1 })
    );
    expect(response.status).toBe(200);
  });

  it('stops the container after the idle timeout elapses', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ State: { Running: true } }), { status: 200 })
      ) // state
      .mockResolvedValueOnce(makeUpstreamStreamResponse()) // TTS — resets idle timer
      .mockResolvedValueOnce(new Response(null, { status: 204 })); // stop

    const response = await POST(
      makeAuthedEvent({ text: 'Hello world', voice: 'af_bella', speed: 1 })
    );
    // Consume the stream so the idle timer fires.
    await response.text();
    await vi.advanceTimersByTimeAsync(5 * 60_000);

    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/stop'))).toBe(true);
  });
});
