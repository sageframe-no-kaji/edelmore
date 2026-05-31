/**
 * narration.ts — Pure browser-side helpers for the Kokoro TTS narration path.
 *
 * These functions contain no Svelte state or SvelteKit imports and can be
 * tested in a plain Vitest environment.
 */

export interface WordTiming {
  word: string;
  start: number; // seconds into the audio
  end: number; // seconds into the audio
  char_start: number; // offset into the submitted text (inclusive)
  char_end: number; // offset into the submitted text (exclusive)
}

export interface SpeakResponse {
  audio: string; // base64-encoded audio (no data-URL prefix)
  format: string; // MIME type, e.g. "audio/mpeg"
  words: WordTiming[];
}

/**
 * One normalized chunk from the streaming /api/speak NDJSON response.
 * Each line of the response body deserializes to this shape.
 */
export interface StreamChunk {
  audio: string; // base64-encoded audio for this chunk
  format: string; // MIME type, e.g. "audio/mpeg"
  words: WordTiming[]; // timings relative to the full submitted text (char offsets)
  audioOffset: number; // absolute audio time (seconds) at the start of this chunk
}

/**
 * Returns true for Kokoro voice slugs (e.g. `af_bella`, `bm_daniel`).
 * Returns false for Web Speech voiceURIs, which typically contain dots,
 * slashes, spaces, or other characters outside the Kokoro slug pattern.
 *
 * Kokoro slugs follow the pattern: one or more lowercase letters, underscore,
 * one or more lowercase letters — e.g. `af_bella`, `am_echo`, `bm_daniel`.
 */
export function isKokoroVoiceUri(uri: string | null | undefined): boolean {
  if (!uri) return false;
  return /^[a-z]+_[a-z]+$/i.test(uri);
}

/**
 * Decode a base64 audio payload (no data-URL prefix) into a Blob URL that
 * HTMLAudioElement can play. The caller is responsible for calling
 * URL.revokeObjectURL() when the URL is no longer needed.
 */
export function audioBlobUrlFromBase64(base64: string, mimeType: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  return URL.createObjectURL(blob);
}
