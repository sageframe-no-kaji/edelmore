import { error, type RequestHandler } from '@sveltejs/kit';

/**
 * Configuration for createVoicesHandler.
 *
 * Env reference:
 *   ttsVoicesUrl  — full URL to the upstream /v1/audio/voices endpoint.
 *                   If unset, derived from ttsUrl (replacing /dev/captioned_speech).
 *                   If neither is set, the handler returns { voices: [] }.
 *   ttsUrl        — full URL to /dev/captioned_speech (fallback to derive ttsVoicesUrl)
 *   ttsApiKey     — optional bearer token
 */
export interface VoicesHandlerConfig {
  ttsVoicesUrl?: string;
  ttsUrl?: string;
  ttsApiKey?: string;
}

/**
 * Build a SvelteKit GET handler for the /api/speak/voices route.
 *
 * Proxies the Kokoro-FastAPI voice catalog and falls back to { voices: [] }
 * (not an error) when the TTS service is unreachable or not configured — the
 * settings voice picker shows browser voices regardless.
 */
export function createVoicesHandler(config: VoicesHandlerConfig): RequestHandler {
  const handler: RequestHandler = async ({ locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const voicesUrl =
      config.ttsVoicesUrl ??
      (config.ttsUrl
        ? config.ttsUrl.replace('/dev/captioned_speech', '/v1/audio/voices')
        : undefined);

    if (!voicesUrl) {
      return new Response(JSON.stringify({ voices: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const headers: HeadersInit = {};
    if (config.ttsApiKey) headers.Authorization = `Bearer ${config.ttsApiKey}`;

    try {
      const upstreamResponse = await fetch(voicesUrl, { headers });
      if (!upstreamResponse.ok) {
        // Upstream error — return empty list so the UI degrades gracefully.
        return new Response(JSON.stringify({ voices: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const payload = await upstreamResponse.json();
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      // Service unreachable — return empty list. The picker shows browser voices.
      return new Response(JSON.stringify({ voices: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };

  return handler;
}
