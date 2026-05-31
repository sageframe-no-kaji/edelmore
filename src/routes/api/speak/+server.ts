import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * POST /api/speak
 *
 * Thin shim that forwards a TTS request to the upstream Kokoro-FastAPI
 * `/dev/captioned_speech` endpoint with stream=true and returns a
 * newline-delimited JSON (NDJSON) stream to the browser. Each line is a
 * `StreamChunk` object with normalised word timings and an audioOffset field
 * so the client can chain Audio elements with correct absolute time tracking.
 *
 * The browser sends:
 *   { text: string; voice: string; speed: number }
 *
 * This endpoint returns an NDJSON stream where each line is:
 *   { audio: string (base64); format: string (MIME); words: WordTiming[]; audioOffset: number }
 *
 * audioOffset is the absolute audio time (seconds) at which this chunk starts
 * in the full synthesised audio, derived from the first word's start_time.
 *
 * On-demand startup: if DOCKER_API_URL and KOKORO_CONTAINER_NAME are set, the
 * shim checks whether the Kokoro container is running before each request.
 *
 * Env vars:
 *   TTS_URL               — full URL to /dev/captioned_speech
 *   TTS_VOICES_URL        — URL to /v1/audio/voices (used for readiness polling)
 *   TTS_API_KEY           — optional bearer token
 *   TTS_UNLOAD_URL        — URL to /dev/unload (fork path: unloads model from VRAM
 *                           without stopping the container; set this when the
 *                           sageframe-no-kaji/Kokoro-FastAPI fork is deployed)
 *   KOKORO_IDLE_MINUTES   — minutes of silence before unload/stop (default 10)
 *   DOCKER_API_URL        — Docker remote API base (legacy; unused when TTS_UNLOAD_URL is set)
 *   KOKORO_CONTAINER_NAME — container to start on demand (legacy; unused when TTS_UNLOAD_URL is set)
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

// ── Normalised types (streamed to the browser) ────────────────────────────────

interface WordTiming {
  word: string;
  start: number;
  end: number;
  char_start: number;
  char_end: number;
}

interface StreamChunk {
  audio: string;
  format: string;
  words: WordTiming[];
  audioOffset: number;
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

/**
 * Map each upstream word to a WordTiming with character offsets into `input`.
 * `startCursor` advances across calls so successive chunks don't re-match
 * earlier words in the same text.
 */
function computeCharOffsets(
  input: string,
  words: UpstreamWord[],
  startCursor = 0
): { timings: WordTiming[]; nextCursor: number } {
  let cursor = startCursor;
  const timings = words.map((w) => {
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
  return { timings, nextCursor: cursor };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Idle shutdown ─────────────────────────────────────────────────────────────

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
  const unloadUrl = env.TTS_UNLOAD_URL;
  if (unloadUrl) {
    // Fork path: call /dev/unload to release GPU VRAM without stopping the container.
    // The model reloads lazily on the next TTS request.
    try {
      await fetch(unloadUrl, { method: 'POST' });
      console.log('Kokoro model unloaded after idle timeout');
    } catch (e) {
      console.error('Failed to unload Kokoro model:', e instanceof Error ? e.message : e);
    }
    return;
  }
  // Legacy path: stop the container via the Docker remote API.
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

async function ensureKokoroRunning(): Promise<void> {
  // Fork path: the model reloads automatically on the next TTS request — no
  // container management needed.
  if (env.TTS_UNLOAD_URL) return;

  // Legacy path: start the container via the Docker remote API if it is stopped.
  const dockerApiUrl = env.DOCKER_API_URL;
  const containerName = env.KOKORO_CONTAINER_NAME;
  if (!dockerApiUrl || !containerName) return;

  try {
    const stateRes = await fetch(`${dockerApiUrl}/containers/${containerName}/json`);
    if (stateRes.ok) {
      const data = (await stateRes.json()) as { State: { Running: boolean } };
      if (data.State.Running) return;
    }
  } catch {
    return;
  }

  console.log('Kokoro container stopped; starting on demand');
  try {
    await fetch(`${dockerApiUrl}/containers/${containerName}/start`, { method: 'POST' });
  } catch (e) {
    console.error('Failed to start Kokoro container:', e instanceof Error ? e.message : e);
    return;
  }

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
    stream: true,
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

  const upstreamStream = upstreamResponse.body;
  if (!upstreamStream) {
    throw error(502, 'TTS returned empty response');
  }

  const inputText = body.text;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstreamStream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let charCursor = 0;
      let hadOutput = false;

      function processLine(line: string): void {
        if (!line) return;
        let raw: unknown;
        try {
          raw = JSON.parse(line);
        } catch {
          return;
        }
        if (
          !raw ||
          typeof raw !== 'object' ||
          typeof (raw as Record<string, unknown>).audio !== 'string' ||
          !Array.isArray((raw as Record<string, unknown>).timestamps)
        ) {
          return;
        }
        const upstream = raw as UpstreamPayload;
        const { timings, nextCursor } = computeCharOffsets(
          inputText,
          upstream.timestamps,
          charCursor
        );
        charCursor = nextCursor;

        const audioOffset = upstream.timestamps.length > 0 ? upstream.timestamps[0].start_time : 0;

        const chunk: StreamChunk = {
          audio: upstream.audio,
          format: formatToMime(upstream.audio_format ?? 'mp3'),
          words: timings,
          audioOffset,
        };
        controller.enqueue(encoder.encode(`${JSON.stringify(chunk)}\n`));
        hadOutput = true;
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newlineIdx = buffer.indexOf('\n');
          while (newlineIdx !== -1) {
            processLine(buffer.slice(0, newlineIdx).trim());
            buffer = buffer.slice(newlineIdx + 1);
            newlineIdx = buffer.indexOf('\n');
          }
        }
        // Flush any remaining partial line (upstream may omit trailing newline).
        processLine(buffer.trim());

        controller.close();
        if (hadOutput) resetIdleTimer();
      } catch (e) {
        console.error('TTS stream error:', e instanceof Error ? e.message : e);
        controller.error(e);
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
    },
  });
};
