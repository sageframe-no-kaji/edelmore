import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock $env/dynamic/private before importing the handler.
vi.mock('$env/dynamic/private', () => ({
  env: {
    TRANSCRIPTION_URL: 'http://whisper.test/asr',
    TRANSCRIPTION_API_KEY: '',
  } as Record<string, string | undefined>,
}));

const env = (await import('$env/dynamic/private')).env as Record<string, string | undefined>;
const { POST } = await import('./+server.js');

function makeAudioFile(name = 'rec.webm'): File {
  const blob = new Blob([new Uint8Array([0, 1, 2, 3])], { type: 'audio/webm' });
  return new File([blob], name, { type: 'audio/webm' });
}

function makeRequest(field = 'audio', fileName = 'rec.webm'): Request {
  const fd = new FormData();
  fd.append(field, makeAudioFile(fileName));
  return new Request('http://localhost/api/transcribe', {
    method: 'POST',
    body: fd,
  });
}

function makeEvent(opts: { authed: boolean; field?: string; fileName?: string }) {
  return {
    request: makeRequest(opts.field, opts.fileName),
    locals: opts.authed
      ? {
          user: {
            id: 1,
            username: 'Iona',
            cover_id: 'meadow',
            font_size: 3.4,
            journal_font: 'eb-garamond',
            diary_title: 'Diary',
          },
        }
      : {},
  } as Parameters<typeof POST>[0];
}

const originalFetch = globalThis.fetch;

describe('POST /api/transcribe', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects unauthenticated requests with 401', async () => {
    await expect(POST(makeEvent({ authed: false }))).rejects.toMatchObject({
      status: 401,
    });
  });

  it('rejects missing audio field with 400', async () => {
    await expect(POST(makeEvent({ authed: true, field: 'wrong' }))).rejects.toMatchObject({
      status: 400,
    });
  });

  it('forwards audio to upstream and returns trimmed text', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ text: '  Hello world.  ' }), { status: 200 })
    );

    const response = await POST(makeEvent({ authed: true }));
    const body = await response.json();

    expect(body).toEqual({ text: 'Hello world.' });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(String(calledUrl)).toContain('task=transcribe');
    expect(String(calledUrl)).toContain('language=en');
    expect(String(calledUrl)).toContain('output_format=text');
  });

  it('renames the multipart field from audio to audio_file', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ text: 'ok' }), { status: 200 })
    );

    await POST(makeEvent({ authed: true }));
    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const upstreamBody = callArgs[1].body as FormData;
    expect(upstreamBody.get('audio')).toBeNull();
    expect(upstreamBody.get('audio_file')).toBeInstanceOf(File);
  });

  it('returns 503 when upstream is unreachable', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new TypeError('fetch failed')
    );

    await expect(POST(makeEvent({ authed: true }))).rejects.toMatchObject({
      status: 503,
    });
  });

  it('returns 502 when upstream responds with non-2xx', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response('upstream error', { status: 500 })
    );

    await expect(POST(makeEvent({ authed: true }))).rejects.toMatchObject({
      status: 502,
    });
  });

  it('returns 502 when upstream returns non-JSON', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response('not json', { status: 200 })
    );

    await expect(POST(makeEvent({ authed: true }))).rejects.toMatchObject({
      status: 502,
    });
  });

  it('returns empty text when upstream JSON lacks a text field', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ unrelated: 'field' }), { status: 200 })
    );

    const response = await POST(makeEvent({ authed: true }));
    const body = await response.json();
    expect(body).toEqual({ text: '' });
  });

  it('returns 503 when TRANSCRIPTION_URL is not configured', async () => {
    const saved = env.TRANSCRIPTION_URL;
    env.TRANSCRIPTION_URL = '';
    try {
      await expect(POST(makeEvent({ authed: true }))).rejects.toMatchObject({ status: 503 });
    } finally {
      env.TRANSCRIPTION_URL = saved;
    }
  });

  it('sends a bearer token when TRANSCRIPTION_API_KEY is set', async () => {
    const saved = env.TRANSCRIPTION_API_KEY;
    env.TRANSCRIPTION_API_KEY = 'whisper-secret';
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ text: 'ok' }), { status: 200 })
    );
    try {
      await POST(makeEvent({ authed: true }));
      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect((callArgs[1].headers as Record<string, string>).Authorization).toBe(
        'Bearer whisper-secret'
      );
    } finally {
      env.TRANSCRIPTION_API_KEY = saved;
    }
  });

  it('falls back to audio.webm when the uploaded file has no name', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ text: 'ok' }), { status: 200 })
    );

    // Pass the FormData directly (a nameless File survives intact); routing it
    // through a real multipart Request would re-parse it as a string field.
    const fd = new FormData();
    fd.append('audio', makeAudioFile(''));
    const event = {
      request: { formData: async () => fd },
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
    } as unknown as Parameters<typeof POST>[0];

    await POST(event);
    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const upstreamBody = callArgs[1].body as FormData;
    const forwarded = upstreamBody.get('audio_file') as File;
    expect(forwarded.name).toBe('audio.webm');
  });
});
