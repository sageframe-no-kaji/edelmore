import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

// Household model: hooks.server.ts stamps the constant user marker on every
// request (network locality is the identity). The unauth fixture omits it to
// prove the package gate still fires.
function makeHouseholdEvent() {
  return {
    request: new Request('http://localhost/api/speak/voices'),
    locals: { user: { id: 0 } },
  } as Parameters<ShimModule['GET']>[0];
}

function makeNoUserEvent() {
  return {
    request: new Request('http://localhost/api/speak/voices'),
    locals: {},
  } as Parameters<ShimModule['GET']>[0];
}

const originalFetch = globalThis.fetch;

describe('GET /api/speak/voices (reader shim)', () => {
  beforeEach(async () => {
    await loadShim();
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('still returns 401 when no user marker is present', async () => {
    await expect(GET(makeNoUserEvent())).rejects.toMatchObject({ status: 401 });
  });

  it('returns the upstream voice list for a household request', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ voices: [{ id: 'af_bella', name: 'af_bella' }] }), {
        status: 200,
      })
    );
    const response = await GET(makeHouseholdEvent());
    const body = await response.json();
    expect(body.voices[0].id).toBe('af_bella');
  });

  it('degrades to { voices: [] } when upstream is unreachable', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new TypeError('fetch failed')
    );
    const response = await GET(makeHouseholdEvent());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ voices: [] });
  });
});
