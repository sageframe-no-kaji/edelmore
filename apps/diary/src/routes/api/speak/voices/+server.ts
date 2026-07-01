import { env } from '$env/dynamic/private';
import { createVoicesHandler } from '@edelmore/narration/api/voices';

/**
 * Thin shim: read env vars and hand them to the factory in @edelmore/narration.
 */
export const GET = createVoicesHandler({
  ttsVoicesUrl: env.TTS_VOICES_URL,
  ttsUrl: env.TTS_URL,
  ttsApiKey: env.TTS_API_KEY,
});
