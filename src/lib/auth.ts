import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';

export const SESSION_COOKIE = 'session';
export const SESSION_DURATION_SECONDS = 30 * 24 * 60 * 60;
export const SESSION_DURATION_MS = SESSION_DURATION_SECONDS * 1000;

export async function hashPin(pin: string): Promise<string> {
  return argon2.hash(pin, { type: argon2.argon2id });
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, pin);
  } catch {
    return false;
  }
}

export function createSessionId(): string {
  return randomBytes(32).toString('hex');
}

// Returns SQLite-compatible datetime string ("YYYY-MM-DD HH:MM:SS") for
// lexicographic comparison with datetime('now') in session queries.
export function sessionExpiry(fromNow: number = SESSION_DURATION_MS): string {
  return new Date(Date.now() + fromNow)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, '');
}
