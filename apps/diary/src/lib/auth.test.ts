import { describe, expect, it } from 'vitest';
import {
  SESSION_COOKIE,
  SESSION_DURATION_MS,
  SESSION_DURATION_SECONDS,
  createSessionId,
  hashPin,
  sessionExpiry,
  verifyPin,
} from './auth.js';

describe('constants', () => {
  it('SESSION_COOKIE is "session"', () => {
    expect(SESSION_COOKIE).toBe('session');
  });

  it('SESSION_DURATION_MS is 30 days in milliseconds', () => {
    expect(SESSION_DURATION_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('SESSION_DURATION_SECONDS is 30 days in seconds', () => {
    expect(SESSION_DURATION_SECONDS).toBe(30 * 24 * 60 * 60);
  });
});

describe('hashPin / verifyPin', () => {
  it('hashes a PIN and verifies it correctly', async () => {
    const hash = await hashPin('1234');
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(20);
    await expect(verifyPin('1234', hash)).resolves.toBe(true);
  });

  it('returns false for wrong PIN', async () => {
    const hash = await hashPin('1234');
    await expect(verifyPin('9999', hash)).resolves.toBe(false);
  });

  it('returns false for malformed hash', async () => {
    await expect(verifyPin('1234', 'not-a-valid-hash')).resolves.toBe(false);
  });
});

describe('createSessionId', () => {
  it('returns a 64-character hex string', () => {
    const id = createSessionId();
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns different values on each call', () => {
    const ids = new Set(Array.from({ length: 10 }, () => createSessionId()));
    expect(ids.size).toBe(10);
  });
});

describe('sessionExpiry', () => {
  it('returns a SQLite datetime string (YYYY-MM-DD HH:MM:SS)', () => {
    const expiry = sessionExpiry();
    expect(expiry).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('returns a datetime in the future', () => {
    const expiry = sessionExpiry();
    // Parse by replacing space with T for JS Date
    expect(new Date(`${expiry.replace(' ', 'T')}Z`).getTime()).toBeGreaterThan(Date.now());
  });

  it('defaults to approximately 30 days from now', () => {
    const before = Date.now();
    const expiry = sessionExpiry();
    const after = Date.now();
    const expiryMs = new Date(`${expiry.replace(' ', 'T')}Z`).getTime();
    // Allow 1s tolerance for sub-second truncation
    expect(expiryMs).toBeGreaterThanOrEqual(before + SESSION_DURATION_MS - 1000);
    expect(expiryMs).toBeLessThanOrEqual(after + SESSION_DURATION_MS);
  });

  it('accepts a custom duration', () => {
    const oneHour = 60 * 60 * 1000;
    const before = Date.now();
    const expiry = sessionExpiry(oneHour);
    const after = Date.now();
    const expiryMs = new Date(`${expiry.replace(' ', 'T')}Z`).getTime();
    expect(expiryMs).toBeGreaterThanOrEqual(before + oneHour - 1000);
    expect(expiryMs).toBeLessThanOrEqual(after + oneHour);
  });
});
