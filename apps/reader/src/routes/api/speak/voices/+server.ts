import { env } from '$env/dynamic/private';
import { createVoicesHandler } from '@edelmore/narration/api/voices';

/**
 * Thin shim: read env vars and hand them to the factory in @edelmore/narration.
 * Mirrors apps/diary/src/routes/api/speak/voices/+server.ts. See the sibling
 * ../+server.ts for the household-auth note (network is the identity gate).
 */
export const GET = createVoicesHandler({
  ttsVoicesUrl: env.TTS_VOICES_URL,
  ttsUrl: env.TTS_URL,
  ttsApiKey: env.TTS_API_KEY,
});
