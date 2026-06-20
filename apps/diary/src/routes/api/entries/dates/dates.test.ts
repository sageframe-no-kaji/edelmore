import { type Database, createDb, createUser, upsertEntry } from '$lib/db.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { GET } from './+server.js';

function freshDb(): Database {
  return createDb(':memory:');
}

function makeEvent(db: Database, user: { id: number; username: string; cover_id: string } | null) {
  return {
    locals: { db, user },
  };
}

describe('GET /api/entries/dates', () => {
  let db: Database;
  let userId: number;

  beforeEach(() => {
    db = freshDb();
    userId = createUser(db, 'Iona', 'hash');
  });

  it('returns an empty array when the user has no entries', async () => {
    const user = { id: userId, username: 'Iona', cover_id: 'meadow' };
    const response = await GET(makeEvent(db, user) as any);
    const body = await response.json();
    expect(body).toEqual([]);
  });

  it('returns entries most-recent-first with preview', async () => {
    upsertEntry(db, userId, '2026-05-13', 'Yesterday.');
    upsertEntry(db, userId, '2026-05-14', 'Today.');
    const user = { id: userId, username: 'Iona', cover_id: 'meadow' };
    const response = await GET(makeEvent(db, user) as any);
    const body = await response.json();
    expect(body).toEqual([
      { entry_date: '2026-05-14', preview: 'Today.' },
      { entry_date: '2026-05-13', preview: 'Yesterday.' },
    ]);
  });

  it('returns 401 when user is not authenticated', async () => {
    await expect(GET(makeEvent(db, null) as any)).rejects.toMatchObject({ status: 401 });
  });
});
