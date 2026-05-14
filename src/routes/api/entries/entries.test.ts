import { type Database, createDb, createUser, getEntry } from '$lib/db.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { POST } from './+server.js';

function freshDb(): Database {
  return createDb(':memory:');
}

function makeEvent(db: Database, userId: number, body: unknown) {
  return {
    request: { json: async () => body },
    locals: { db, user: { id: userId, username: 'Iona', cover_id: 'meadow' } },
  };
}

describe('POST /api/entries', () => {
  let db: Database;
  let userId: number;

  beforeEach(() => {
    db = freshDb();
    userId = createUser(db, 'Iona', 'hash');
  });

  it('upserts an entry and returns { ok: true }', async () => {
    const response = await POST(
      makeEvent(db, userId, { date: '2026-05-14', content: 'Hello.' }) as any
    );
    const body = await response.json();
    expect(body).toEqual({ ok: true });
    expect(getEntry(db, userId, '2026-05-14')?.content).toBe('Hello.');
  });

  it('returns 400 for invalid date', async () => {
    await expect(
      POST(makeEvent(db, userId, { date: 'bad-date', content: 'Hello.' }) as any)
    ).rejects.toMatchObject({ status: 400 });
  });

  it('returns 400 when date is missing', async () => {
    await expect(POST(makeEvent(db, userId, { content: 'Hello.' }) as any)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('returns 400 when content is not a string', async () => {
    await expect(
      POST(makeEvent(db, userId, { date: '2026-05-14', content: 42 }) as any)
    ).rejects.toMatchObject({ status: 400 });
  });

  it('updates existing entry on second call', async () => {
    await POST(makeEvent(db, userId, { date: '2026-05-14', content: 'Draft.' }) as any);
    await POST(makeEvent(db, userId, { date: '2026-05-14', content: 'Final.' }) as any);
    expect(getEntry(db, userId, '2026-05-14')?.content).toBe('Final.');
  });
});
