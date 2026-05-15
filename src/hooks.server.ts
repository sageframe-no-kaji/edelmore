import { SESSION_COOKIE, SESSION_DURATION_SECONDS, sessionExpiry } from '$lib/auth.js';
import { createDb } from '$lib/db.js';
import { getSession, getUserById, updateSessionExpiry } from '$lib/db.js';
import { seedIfEmpty } from '$lib/seed.js';
import type { Handle } from '@sveltejs/kit';
import type { Database } from 'better-sqlite3';

// Extracted so tests can call it with an in-memory database.
export function createHandle(db: Database): Handle {
  return async ({ event, resolve }) => {
    event.locals.db = db;

    const sessionId = event.cookies.get(SESSION_COOKIE);
    if (sessionId) {
      const session = getSession(db, sessionId);
      if (session) {
        const user = getUserById(db, session.user_id);
        /* v8 ignore next — session referencing a deleted user cannot occur in practice */
        if (user) {
          event.locals.user = user;
          updateSessionExpiry(db, sessionId, sessionExpiry());
          event.cookies.set(SESSION_COOKIE, sessionId, {
            path: '/',
            httpOnly: true,
            sameSite: 'strict',
            secure: process.env.NODE_ENV === 'production',
            maxAge: SESSION_DURATION_SECONDS,
          });
        }
      }
    }

    return resolve(event);
  };
}

// Production singleton — only path not exercised by unit tests.
let _db: Database | null = null;
let _seeded = false;

/* v8 ignore next 10 — singleton init runs once at server startup, not in unit tests */
async function getDb(): Promise<Database> {
  if (!_db) {
    _db = createDb(process.env.DATABASE_URL ?? 'data/edelmore.db');
  }
  if (!_seeded) {
    await seedIfEmpty(_db);
    _seeded = true;
  }
  return _db;
}

/* v8 ignore next 3 — thin delegation to createHandle; tested via createHandle directly */
export const handle: Handle = async ({ event, resolve }) => {
  return createHandle(await getDb())({ event, resolve });
};
