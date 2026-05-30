import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * POST /api/speak
 *
 * Thin shim that forwards a TTS request to the upstream Kokoro-FastAPI
 * `/dev/captioned_speech` endpoint and returns normalised JSON.
 *
 * The browser sends:
 *   { text: string; voice: string; speed: number }
 *
 * This endpoint returns:
 *   { audio: string (base64); format: string (MIME); words: WordTiming[] }
 *
 * Where WordTiming is:
 *   { word: string; start: number; end: number; char_start: number; char_end: number }
 *
 * On-demand startup: if DOCKER_API_URL and KOKORO_CONTAINER_NAME are set, the
 * shim checks whether the Kokoro container is running before each request. If
 * it is stopped, the shim starts it and polls TTS_VOICES_URL until the model
 * responds (cold start ~15-30 s on an RTX 3050). The bird button stays in
 * 'loading' state throughout — no special browser-side handling needed.
 *
 * Env vars:
 *   TTS_URL               — full URL to /dev/captioned_speech
 *   TTS_VOICES_URL        — URL to /v1/audio/voices (used for readiness polling)
 *   TTS_API_KEY           — optional bearer token
 *   DOCKER_API_URL        — Docker remote API base, e.g. http://192.168.1.22:2376
 *   KOKORO_CONTAINER_NAME — container to start on demand, e.g. svc-kokoro
 *
 * Logging: failure modes only. Diary text, audio bytes, and word timings are
 * never logged.
 */

// ── Upstream types (raw from Kokoro-FastAPI) ─────────────────────────────────

interface UpstreamWord {
  word: string;
  start_time: number;
  end_time: number;
}

interface UpstreamPayload {
  audio: string; // base64-encoded audio
  audio_format: string; // file extension: "mp3", "wav", etc.
  timestamps: UpstreamWord[];
}

// ── Normalised types (returned to the browser) ───────────────────────────────

interface WordTiming {
  word: string;
  start: number;
  end: number;
  char_start: number;
  char_end: number;
}

interface SpeakResponse {
  audio: string; // base64
  format: string; // MIME type
  words: WordTiming[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatToMime(fmt: string): string {
  switch (fmt.toLowerCase()) {
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'opus':
      return 'audio/opus';
    case 'flac':
      return 'audio/flac';
    case 'pcm':
      return 'audio/L16; rate=24000';
    default:
      return 'audio/mpeg';
  }
}

function computeCharOffsets(input: string, words: UpstreamWord[]): WordTiming[] {
  let cursor = 0;
  return words.map((w) => {
    const idx = input.indexOf(w.word, cursor);
    if (idx === -1) {
      return {
        word: w.word,
        start: w.start_time,
        end: w.end_time,
        char_start: cursor,
        char_end: cursor,
      };
    }
    const charEnd = idx + w.word.length;
    cursor = charEnd;
    return {
      word: w.word,
      start: w.start_time,
      end: w.end_time,
      char_start: idx,
      char_end: charEnd,
    };
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Idle shutdown ─────────────────────────────────────────────────────────────
//
// After each successful narration the idle timer is reset. When it fires,
// the Kokoro container is stopped via the Docker remote API so it releases
// GPU memory. KOKORO_IDLE_MINUTES defaults to 10.

let idleTimer: ReturnType<typeof setTimeout> | null = null;

function idleMs(): number {
  const minutes = Number(env.KOKORO_IDLE_MINUTES ?? '10');
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 10) * 60_000;
}

function resetIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    void stopKokoro();
  }, idleMs());
}

async function stopKokoro(): Promise<void> {
  const dockerApiUrl = env.DOCKER_API_URL;
  const containerName = env.KOKORO_CONTAINER_NAME;
  if (!dockerApiUrl || !containerName) return;
  try {
    await fetch(`${dockerApiUrl}/containers/${containerName}/stop`, { method: 'POST' });
    console.log('Kokoro stopped after idle timeout');
  } catch (e) {
    console.error('Failed to stop Kokoro container:', e instanceof Error ? e.message : e);
  }
}

// ── On-demand startup ─────────────────────────────────────────────────────────

/**
 * If DOCKER_API_URL and KOKORO_CONTAINER_NAME are configured, ensure the
 * Kokoro container is running before we attempt a TTS request. On a cold
 * start the model takes ~15-30 s to load; we poll the voices endpoint until
 * it responds, then return. Times out silently after 60 s — the TTS request
 * will then fail naturally and the browser falls back to Web Speech.
 */
async function ensureKokoroRunning(): Promise<void> {
  const dockerApiUrl = env.DOCKER_API_URL;
  const containerName = env.KOKORO_CONTAINER_NAME;
  if (!dockerApiUrl || !containerName) return;

  // Check running state via Docker remote API.
  try {
    const stateRes = await fetch(`${dockerApiUrl}/containers/${containerName}/json`);
    if (stateRes.ok) {
      const data = (await stateRes.json()) as { State: { Running: boolean } };
      if (data.State.Running) return; // already up — idle timer ticks from last narration
    }
  } catch {
    return; // Docker API unreachable — let TTS fail naturally
  }

  // Container is stopped — start it.
  console.log('Kokoro container stopped; starting on demand');
  try {
    await fetch(`${dockerApiUrl}/containers/${containerName}/start`, { method: 'POST' });
  } catch (e) {
    console.error('Failed to start Kokoro container:', e instanceof Error ? e.message : e);
    return;
  }

  // Poll the voices endpoint until Kokoro's model is loaded and responding.
  const voicesUrl =
    env.TTS_VOICES_URL ?? env.TTS_URL?.replace('/dev/captioned_speech', '/v1/audio/voices');
  if (!voicesUrl) return;

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    await sleep(2000);
    try {
      const res = await fetch(voicesUrl, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        console.log('Kokoro ready');
        return;
      }
    } catch {
      // still loading
    }
  }
  console.error('Kokoro did not become ready within 60 s');
}

// ── Request handler ───────────────────────────────────────────────────────────

interface SpeakRequest {
  text: string;
  voice: string;
  speed: number;
}

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const ttsUrl = env.TTS_URL;
  if (!ttsUrl) throw error(503, 'TTS not configured');

  const body = (await request.json()) as SpeakRequest;
  if (!body?.text || typeof body.text !== 'string') throw error(400, 'Missing text');
  if (!body.voice || typeof body.voice !== 'string') throw error(400, 'Missing voice');

  // Start Kokoro on demand if it is stopped (no-op when already running or
  // when DOCKER_API_URL is not configured).
  await ensureKokoroRunning();

  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const apiKey = env.TTS_API_KEY;
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const upstreamBody = {
    model: 'kokoro',
    voice: body.voice,
    input: body.text,
    response_format: 'mp3',
    // Speed handled client-side via HTMLAudioElement.playbackRate — always
    // generate at 1.0 so rate changes don't require a re-fetch.
    speed: 1.0,
    stream: false,
    return_timestamps: true,
  };

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(ttsUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(upstreamBody),
    });
  } catch (e) {
    console.error('TTS upstream unreachable:', e instanceof Error ? e.message : e);
    throw error(503, 'TTS service unreachable');
  }

  if (!upstreamResponse.ok) {
    console.error('TTS upstream error:', upstreamResponse.status, upstreamResponse.statusText);
    throw error(502, 'TTS failed');
  }

  let raw: unknown;
  try {
    raw = await upstreamResponse.json();
  } catch (e) {
    console.error('TTS upstream returned non-JSON:', e instanceof Error ? e.message : e);
    throw error(502, 'TTS returned unexpected response');
  }

  if (
    !raw ||
    typeof raw !== 'object' ||
    typeof (raw as Record<string, unknown>).audio !== 'string' ||
    !Array.isArray((raw as Record<string, unknown>).timestamps)
  ) {
    console.error('TTS upstream payload missing required fields');
    throw error(502, 'TTS returned unexpected response');
  }

  const upstream = raw as UpstreamPayload;

  const responsePayload: SpeakResponse = {
    audio: upstream.audio,
    format: formatToMime(upstream.audio_format ?? 'mp3'),
    words: computeCharOffsets(body.text, upstream.timestamps),
  };

  // Narration delivered — reset the idle shutdown clock.
  resetIdleTimer();

  return new Response(JSON.stringify(responsePayload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
