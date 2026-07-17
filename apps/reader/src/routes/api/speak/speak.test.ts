import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock $env/dynamic/private so the shim's import resolves in tests. The env
// object lives in vi.hoisted so it survives vi.resetModules() — each block
// mutates env then re-imports the shim, and the SAME reference is returned by
// the mock factory (otherwise mutations would be lost across module resets).
const env = vi.hoisted(
  () =>
    ({
      TTS_URL: 'http://kokoro.test/dev/captioned_speech',
      TTS_VOICES_URL: 'http://kokoro.test/v1/audio/voices',
      TTS_API_KEY: '',
    }) as Record<string, string | undefined>
);

vi.mock('$env/dynamic/private', () => ({ env }));

type ShimModule = typeof import('./+server.js');
let POST: ShimModule['POST'];

async function loadShim(): Promise<void> {
  vi.resetModules();
  POST = (await import('./+server.js')).POST;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
//
// The reader has no sessions — hooks.server.ts stamps every request with the
// constant HOUSEHOLD_USER marker (network locality is the identity). These
// fixtures reproduce that: an "authed" event carries the marker; an "unauth"
// event omits it to prove the package's gate still fires if the marker is ever
// absent.

function makeHouseholdEvent(body: unknown, opts?: { signal?: AbortSignal }) {
  return {
    request: new Request('http://localhost/api/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: opts?.signal ?? null,
    }),
    locals: { user: { id: 0 } },
  } as Parameters<ShimModule['POST']>[0];
}

function makeNoUserEvent(body: unknown) {
  return {
    request: new Request('http://localhost/api/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    locals: {},
  } as Parameters<ShimModule['POST']>[0];
}

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

async function readNdjson(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

const originalFetch = globalThis.fetch;

describe('POST /api/speak (reader shim)', () => {
  beforeEach(async () => {
    await loadShim();
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('the household marker satisfies the package gate and streams normalised chunks', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeUpstreamStreamResponse()
    );

    const response = await POST(
      makeHouseholdEvent({ text: 'Hello world', voice: 'af_bella', speed: 1.0 })
    );
    expect(response.headers.get('Content-Type')).toContain('ndjson');

    const chunks = (await readNdjson(response)) as Array<Record<string, unknown>>;
    expect(chunks).toHaveLength(1);
    const words = chunks[0].words as Array<Record<string, unknown>>;
    expect(words[0]).toMatchObject({ word: 'Hello', char_start: 0, char_end: 5 });
    expect(words[1]).toMatchObject({ word: 'world', char_start: 6, char_end: 11 });
  });

  it('still returns 401 when no user marker is present (package gate intact)', async () => {
    await expect(
      POST(makeNoUserEvent({ text: 'hello', voice: 'af_bella', speed: 1.0 }))
    ).rejects.toMatchObject({ status: 401 });
  });

  it('returns 400 when text is missing', async () => {
    await expect(POST(makeHouseholdEvent({ voice: 'af_bella', speed: 1.0 }))).rejects.toMatchObject(
      { status: 400 }
    );
  });

  it('hits the captioned_speech endpoint with stream + timestamps', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeUpstreamStreamResponse()
    );
    await POST(makeHouseholdEvent({ text: 'Hello world', voice: 'af_bella', speed: 1.0 }));
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain('captioned_speech');
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.stream).toBe(true);
    expect(sentBody.return_timestamps).toBe(true);
  });

  it('returns 502 when upstream responds non-2xx', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response('upstream error', { status: 500 })
    );
    await expect(
      POST(makeHouseholdEvent({ text: 'hello', voice: 'af_bella', speed: 1.0 }))
    ).rejects.toMatchObject({ status: 502 });
  });

  it('returns 503 when TTS_URL is not configured', async () => {
    const saved = env.TTS_URL;
    env.TTS_URL = '';
    await loadShim();
    try {
      await expect(
        POST(makeHouseholdEvent({ text: 'hello', voice: 'af_bella', speed: 1.0 }))
      ).rejects.toMatchObject({ status: 503 });
    } finally {
      env.TTS_URL = saved;
    }
  });
});
