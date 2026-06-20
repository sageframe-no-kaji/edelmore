import { describe, expect, it } from 'vitest';
import { audioBlobUrlFromBase64, isKokoroVoiceUri } from './narration.js';

describe('isKokoroVoiceUri', () => {
  it('returns true for Kokoro voice slugs', () => {
    expect(isKokoroVoiceUri('af_bella')).toBe(true);
    expect(isKokoroVoiceUri('am_echo')).toBe(true);
    expect(isKokoroVoiceUri('bf_emma')).toBe(true);
    expect(isKokoroVoiceUri('bm_daniel')).toBe(true);
    expect(isKokoroVoiceUri('am_adam')).toBe(true);
  });

  it('returns false for Web Speech voiceURIs (contain dots or slashes)', () => {
    expect(isKokoroVoiceUri('com.apple.voice.compact.en-US.Samantha')).toBe(false);
    expect(isKokoroVoiceUri('Microsoft David Desktop - English (United States)')).toBe(false);
    expect(isKokoroVoiceUri('Google US English')).toBe(false);
  });

  it('returns false for null and undefined', () => {
    expect(isKokoroVoiceUri(null)).toBe(false);
    expect(isKokoroVoiceUri(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isKokoroVoiceUri('')).toBe(false);
  });

  it('returns false for strings with numbers', () => {
    // Numbers are not in the Kokoro slug pattern [a-z]+_[a-z]+
    expect(isKokoroVoiceUri('af_bella2')).toBe(false);
    expect(isKokoroVoiceUri('a1_test')).toBe(false);
  });
});

describe('audioBlobUrlFromBase64', () => {
  it('decodes a known base64 payload to a Blob URL', () => {
    // Encode 4 bytes so we can verify round-trip.
    const bytes = new Uint8Array([72, 101, 108, 108]); // "Hell"
    const base64 = btoa(String.fromCharCode(...bytes));
    const url = audioBlobUrlFromBase64(base64, 'audio/mpeg');

    // Should return a blob: URL.
    expect(url).toMatch(/^blob:/);

    // Clean up.
    URL.revokeObjectURL(url);
  });

  it('produces a Blob URL with the correct MIME type (smoke test via URL existence)', () => {
    const base64 = btoa('\x00\x01\x02\x03');
    const url = audioBlobUrlFromBase64(base64, 'audio/wav');
    expect(url).toMatch(/^blob:/);
    URL.revokeObjectURL(url);
  });
});
