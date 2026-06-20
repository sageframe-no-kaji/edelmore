import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/speak/voices
 *
 * Proxy for the Kokoro-FastAPI voice catalog. Returns the same shape the
 * upstream returns:
 *   { voices: Array<{ id: string; name: string }> }
 *
 * Falls back to { voices: [] } (not an error) when the TTS service is
 * unreachable or not configured — the settings voice picker shows browser
 * voices regardless.
 *
 * Env vars:
 *   TTS_VOICES_URL  — full URL to the upstream /v1/audio/voices endpoint
 *                     If unset, derived from TTS_URL (replace trailing path
 *                     with /v1/audio/voices). If neither is set, returns empty.
 *   TTS_API_KEY     — optional; sent as Authorization: Bearer if set
 */
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  // Derive voices URL: prefer explicit TTS_VOICES_URL; fall back to replacing
  // the captioned_speech path with the voices path.
  const voicesUrl =
    env.TTS_VOICES_URL ??
    (env.TTS_URL ? env.TTS_URL.replace('/dev/captioned_speech', '/v1/audio/voices') : undefined);

  if (!voicesUrl) {
    // TTS not configured — return empty list so the picker shows browser voices.
    return new Response(JSON.stringify({ voices: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = env.TTS_API_KEY;
  const headers: HeadersInit = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const upstreamResponse = await fetch(voicesUrl, { headers });
    if (!upstreamResponse.ok) {
      // Upstream error — return empty list, not a proxy error, so the UI
      // degrades gracefully.
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
