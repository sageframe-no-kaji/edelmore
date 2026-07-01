import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock $env/dynamic/private; the env object lives in vi.hoisted so it
// survives vi.resetModules() (used to rebuild the factory closure when env
// changes between tests).
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
let GET: ShimModule['GET'];

async function loadShim(): Promise<void> {
  vi.resetModules();
  GET = (await import('./+server.js')).GET;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeAuthedEvent() {
  return {
    request: new Request('http://localhost/api/speak/voices'),
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
  } as Parameters<ShimModule['GET']>[0];
}

function makeUnauthEvent() {
  return {
    request: new Request('http://localhost/api/speak/voices'),
    locals: {},
  } as Parameters<ShimModule['GET']>[0];
}

const originalFetch = globalThis.fetch;

describe('GET /api/speak/voices', () => {
  beforeEach(async () => {
    await loadShim();
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns 401 for unauthenticated requests', async () => {
    await expect(GET(makeUnauthEvent())).rejects.toMatchObject({ status: 401 });
  });

  it('returns the upstream voice list when available', async () => {
    const upstreamPayload = {
      voices: [
        { id: 'af_bella', name: 'af_bella' },
        { id: 'am_echo', name: 'am_echo' },
      ],
    };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify(upstreamPayload), { status: 200 })
    );

    const response = await GET(makeAuthedEvent());
    const body = await response.json();
    expect(body.voices).toHaveLength(2);
    expect(body.voices[0].id).toBe('af_bella');
  });

  it('returns { voices: [] } (not an error) when upstream is unreachable', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new TypeError('fetch failed')
    );

    const response = await GET(makeAuthedEvent());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ voices: [] });
  });

  it('returns { voices: [] } (not an error) when upstream returns non-2xx', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response('error', { status: 503 })
    );

    const response = await GET(makeAuthedEvent());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ voices: [] });
  });

  it('derives the voices URL from TTS_URL when TTS_VOICES_URL is unset', async () => {
    const saved = env.TTS_VOICES_URL;
    env.TTS_VOICES_URL = undefined;
    await loadShim();
    (globalThis.fetch as ReturnType<typeof vi.fn>) = vi.fn();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ voices: [{ id: 'af_bella', name: 'af_bella' }] }), {
        status: 200,
      })
    );
    try {
      await GET(makeAuthedEvent());
      const calledUrl = String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(calledUrl).toBe('http://kokoro.test/v1/audio/voices');
    } finally {
      env.TTS_VOICES_URL = saved;
    }
  });

  it('returns { voices: [] } without calling upstream when no TTS URL is configured', async () => {
    const savedVoices = env.TTS_VOICES_URL;
    const savedTts = env.TTS_URL;
    env.TTS_VOICES_URL = undefined;
    env.TTS_URL = undefined;
    await loadShim();
    globalThis.fetch = vi.fn();
    try {
      const response = await GET(makeAuthedEvent());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ voices: [] });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      env.TTS_VOICES_URL = savedVoices;
      env.TTS_URL = savedTts;
    }
  });

  it('sends a bearer token when TTS_API_KEY is set', async () => {
    const saved = env.TTS_API_KEY;
    env.TTS_API_KEY = 'secret-token';
    await loadShim();
    globalThis.fetch = vi.fn();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ voices: [] }), { status: 200 })
    );
    try {
      await GET(makeAuthedEvent());
      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect((callArgs[1].headers as Record<string, string>).Authorization).toBe(
        'Bearer secret-token'
      );
    } finally {
      env.TTS_API_KEY = saved;
    }
  });
});
