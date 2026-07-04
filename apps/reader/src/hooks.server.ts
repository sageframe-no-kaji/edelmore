import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createDb } from '$lib/db.js';
import type { Handle } from '@sveltejs/kit';
import type { Database } from 'better-sqlite3';

// No auth, no sessions — the reader is a library in a house, and network
// locality is the access boundary. The handle only wires per-request state:
// the database and the on-disk data directory.
//
// Extracted so tests can call it with an in-memory database and a temp dir.
export function createHandle(db: Database, dataDir: string): Handle {
  return async ({ event, resolve }) => {
    event.locals.db = db;
    event.locals.dataDir = dataDir;
    return resolve(event);
  };
}

// Production singleton — only path not exercised by unit tests.
let _db: Database | null = null;

/* v8 ignore next 9 — singleton init runs once at server startup, not in unit tests */
function getDb(dataDir: string): Database {
  if (!_db) {
    // The SQLite file lives beside books/ inside the data dir (one dataset in prod).
    mkdirSync(dataDir, { recursive: true });
    _db = createDb(join(dataDir, 'reader.db'));
  }
  return _db;
}

/* v8 ignore next 4 — thin delegation to createHandle; tested via createHandle directly */
export const handle: Handle = async ({ event, resolve }) => {
  const dataDir = process.env.READER_DATA_DIR ?? 'data';
  return createHandle(getDb(dataDir), dataDir)({ event, resolve });
};
