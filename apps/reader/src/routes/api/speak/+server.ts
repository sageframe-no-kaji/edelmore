import { env } from '$env/dynamic/private';
import { createSpeakHandler } from '@edelmore/narration/api/speak';

/**
 * Thin shim: read env vars and hand them to the factory in @edelmore/narration.
 * All TTS logic lives in the package; this file only wires env to config.
 * Mirrors apps/diary/src/routes/api/speak/+server.ts.
 *
 * Auth note (household model): the package handler gates on `locals.user`,
 * which the diary populates from a real per-user session. The reader has no
 * sessions — network locality is the access boundary — so hooks.server.ts sets
 * a constant HOUSEHOLD_USER marker on every request to satisfy that gate. The
 * package's auth contract is unchanged; the workaround lives here in the app.
 * OPEN: the reader's identity mechanic (per-reader profiles vs. one household
 * voice) is a design decision the ribbon ho will settle; until then every
 * request is "the household."
 */
export const POST = createSpeakHandler({
  ttsUrl: env.TTS_URL,
  ttsApiKey: env.TTS_API_KEY,
  ttsUnloadUrl: env.TTS_UNLOAD_URL,
  ttsVoicesUrl: env.TTS_VOICES_URL,
  dockerApiUrl: env.DOCKER_API_URL,
  kokoroContainerName: env.KOKORO_CONTAINER_NAME,
  idleMinutes: env.KOKORO_IDLE_MINUTES ? Number(env.KOKORO_IDLE_MINUTES) : undefined,
});
