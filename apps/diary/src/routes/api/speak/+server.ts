import { env } from '$env/dynamic/private';
import { createSpeakHandler } from '@edelmore/narration/api/speak';

/**
 * Thin shim: read env vars and hand them to the factory in @edelmore/narration.
 * All TTS logic lives in the package; this file only wires env to config.
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
