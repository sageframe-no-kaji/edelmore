import { type Database, createDb, createUser, upsertEntry } from '$lib/db.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { load } from './+page.server.js';

function freshDb(): Database {
  return createDb(':memory:');
}

describe('[date] load', () => {
  let db: Database;
  let userId: number;

  beforeEach(() => {
    db = freshDb();
    userId = createUser(db, 'Iona', 'hash');
  });

  function makeEvent(date: string) {
    return {
      params: { date },
      locals: { db, user: { id: userId, username: 'Iona', cover_id: 'meadow' } },
    };
  }

  it('returns content and displayDate for a valid date with no entry', async () => {
    const result = (await load(makeEvent('2026-05-14') as any)) as any;
    expect(result).toMatchObject({ date: '2026-05-14', content: '' });
    expect(result.displayDate).toContain('2026');
  });

  it('returns existing entry content', async () => {
    upsertEntry(db, userId, '2026-05-14', 'Hello diary.');
    const result = (await load(makeEvent('2026-05-14') as any)) as any;
    expect(result.content).toBe('Hello diary.');
  });

  it('allows future dates', async () => {
    const result = await load(makeEvent('2099-12-31') as any);
    expect(result?.date).toBe('2099-12-31');
  });

  it('redirects to today for an invalid date string', async () => {
    await expect(load(makeEvent('not-a-date') as any)).rejects.toMatchObject({ status: 302 });
  });

  it('redirects to today for an impossible date', async () => {
    await expect(load(makeEvent('2026-02-30') as any)).rejects.toMatchObject({ status: 302 });
  });

  it('returns prevDate as the calendar day before the requested date', async () => {
    const result = (await load(makeEvent('2026-05-14') as any)) as any;
    expect(result.prevDate).toBe('2026-05-13');
  });

  it('returns nextDate as the calendar day after the requested date', async () => {
    const result = (await load(makeEvent('2026-05-14') as any)) as any;
    expect(result.nextDate).toBe('2026-05-15');
  });

  it('returns prevContent from an existing previous entry', async () => {
    upsertEntry(db, userId, '2026-05-13', 'Yesterday.');
    const result = (await load(makeEvent('2026-05-14') as any)) as any;
    expect(result.prevContent).toBe('Yesterday.');
  });

  it('returns empty string for prevContent when no previous entry exists', async () => {
    const result = (await load(makeEvent('2026-05-14') as any)) as any;
    expect(result.prevContent).toBe('');
  });

  it('returns prevDisplayDate as a human-readable string', async () => {
    const result = (await load(makeEvent('2026-05-14') as any)) as any;
    expect(result.prevDisplayDate).toContain('2026');
    expect(result.prevDisplayDate).toContain('May');
    expect(result.prevDisplayDate).toContain('13');
  });

  it('handles month boundaries for prevDate', async () => {
    const result = (await load(makeEvent('2026-05-01') as any)) as any;
    expect(result.prevDate).toBe('2026-04-30');
  });
});
