import { type Database, createDb, createUser, getEntry, upsertEntry } from '$lib/db.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { DELETE, GET } from './+server.js';

function freshDb(): Database {
  return createDb(':memory:');
}

describe('GET /api/entries/[date]', () => {
  let db: Database;
  let userId: number;

  beforeEach(() => {
    db = freshDb();
    userId = createUser(db, 'Iona', 'hash');
  });

  function makeEvent(
    date: string,
    user: { id: number; username: string } | null = { id: userId, username: 'Iona' }
  ) {
    return {
      params: { date },
      locals: { db, user },
    };
  }

  it('returns content and displayDate for an existing entry', async () => {
    upsertEntry(db, userId, '2026-05-15', 'Hello diary.');
    const res = await GET(makeEvent('2026-05-15') as any);
    const body = await res.json();
    expect(body).toMatchObject({
      date: '2026-05-15',
      content: 'Hello diary.',
    });
    expect(body.displayDate).toContain('2026');
  });

  it('returns empty content for a date with no entry', async () => {
    const res = await GET(makeEvent('2026-05-15') as any);
    const body = await res.json();
    expect(body).toMatchObject({ date: '2026-05-15', content: '' });
  });

  it('returns 400 for an invalid date format', async () => {
    await expect(GET(makeEvent('not-a-date') as any)).rejects.toMatchObject({ status: 400 });
  });

  it('returns 401 when user is not authenticated', async () => {
    await expect(GET(makeEvent('2026-05-15', null) as any)).rejects.toMatchObject({ status: 401 });
  });

  it('deletes an existing entry and returns ok', async () => {
    upsertEntry(db, userId, '2026-05-15', 'Goodbye diary.');
    const res = await DELETE(makeEvent('2026-05-15') as any);
    expect(await res.json()).toEqual({ ok: true });
    expect(getEntry(db, userId, '2026-05-15')).toBeUndefined();
  });

  it('DELETE on a non-existent entry is a no-op that returns ok', async () => {
    const res = await DELETE(makeEvent('2026-05-15') as any);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('DELETE returns 400 for an invalid date format', async () => {
    await expect(DELETE(makeEvent('nope') as any)).rejects.toMatchObject({ status: 400 });
  });

  it('DELETE returns 401 when user is not authenticated', async () => {
    await expect(DELETE(makeEvent('2026-05-15', null) as any)).rejects.toMatchObject({
      status: 401,
    });
  });
});
