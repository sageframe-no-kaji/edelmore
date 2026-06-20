import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * POST /api/transcribe
 *
 * Thin shim that forwards an audio blob to the upstream Whisper service.
 * The browser sends a multipart upload with field `audio`; this endpoint
 * renames it to `audio_file` (the WhisperX `/asr` field name — see
 * ho-process/notes/whisper-service-contract.md) and forwards.
 *
 * The contract back to the client is `{ text }`. Audio is never persisted
 * server-side and never logged.
 *
 * Env vars:
 *   TRANSCRIPTION_URL      — full URL to the upstream /asr endpoint
 *   TRANSCRIPTION_API_KEY  — optional; sent as Authorization: Bearer if set
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const upstream = env.TRANSCRIPTION_URL;
  if (!upstream) throw error(503, 'Transcription not configured');

  const apiKey = env.TRANSCRIPTION_API_KEY;

  const formData = await request.formData();
  const audio = formData.get('audio');
  if (!(audio instanceof File)) throw error(400, 'Missing audio field');

  // Per the upstream's contract (WhisperX /asr):
  // - field name: audio_file
  // - output_format=text returns { "text": "..." } despite the name
  // - language=en skips auto-detect for English-only use
  const upstreamForm = new FormData();
  upstreamForm.append('audio_file', audio, audio.name || 'audio.webm');

  const upstreamUrl = new URL(upstream);
  upstreamUrl.searchParams.set('task', 'transcribe');
  upstreamUrl.searchParams.set('language', 'en');
  upstreamUrl.searchParams.set('output_format', 'text');

  const headers: HeadersInit = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers,
      body: upstreamForm,
    });
  } catch (e) {
    console.error('Transcription upstream unreachable:', e instanceof Error ? e.message : e);
    throw error(503, 'Transcription service unreachable');
  }

  if (!upstreamResponse.ok) {
    console.error('Transcription upstream error:', upstreamResponse.status);
    throw error(502, 'Transcription failed');
  }

  // Response shape (per ho-process/notes/whisper-service-contract.md):
  //   output_format=text returns { "text": " The quick brown fox..." }
  //   leading space included, needs trim.
  let payload: unknown;
  try {
    payload = await upstreamResponse.json();
  } catch (e) {
    console.error('Transcription upstream returned non-JSON:', e instanceof Error ? e.message : e);
    throw error(502, 'Transcription returned unexpected response');
  }

  const raw =
    payload && typeof payload === 'object' && 'text' in payload
      ? (payload as { text: unknown }).text
      : null;
  const text = typeof raw === 'string' ? raw.trim() : '';

  return new Response(JSON.stringify({ text }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
