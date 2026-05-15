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

  it('returns null prevDate when no earlier entries exist', async () => {
    upsertEntry(db, userId, '2026-05-14', 'Today.');
    const result = (await load(makeEvent('2026-05-14') as any)) as any;
    expect(result.prevDate).toBeNull();
  });

  it('returns null nextDate when no later entries exist', async () => {
    upsertEntry(db, userId, '2026-05-14', 'Today.');
    const result = (await load(makeEvent('2026-05-14') as any)) as any;
    expect(result.nextDate).toBeNull();
  });

  it('returns prevDate as the nearest earlier diary entry', async () => {
    upsertEntry(db, userId, '2026-05-13', 'Yesterday.');
    upsertEntry(db, userId, '2026-05-14', 'Today.');
    const result = (await load(makeEvent('2026-05-14') as any)) as any;
    expect(result.prevDate).toBe('2026-05-13');
  });

  it('returns nextDate as the nearest later diary entry', async () => {
    upsertEntry(db, userId, '2026-05-14', 'Today.');
    upsertEntry(db, userId, '2026-05-15', 'Tomorrow.');
    const result = (await load(makeEvent('2026-05-14') as any)) as any;
    expect(result.nextDate).toBe('2026-05-15');
  });

  it('returns null prevDate and nextDate when current date has no entry', async () => {
    upsertEntry(db, userId, '2026-05-13', 'Nearby.');
    const result = (await load(makeEvent('2026-05-14') as any)) as any;
    expect(result.prevDate).toBeNull();
    expect(result.nextDate).toBeNull();
  });

  it('handles month boundaries for prevDate via entry list', async () => {
    upsertEntry(db, userId, '2026-04-30', 'End of April.');
    upsertEntry(db, userId, '2026-05-01', 'Start of May.');
    const result = (await load(makeEvent('2026-05-01') as any)) as any;
    expect(result.prevDate).toBe('2026-04-30');
  });

  it('returns entryDatePreviews as an empty array when no entries exist', async () => {
    const result = (await load(makeEvent('2026-05-14') as any)) as any;
    expect(Array.isArray(result.entryDatePreviews)).toBe(true);
    expect(result.entryDatePreviews).toHaveLength(0);
  });

  it('returns entryDatePreviews in ascending order (oldest first)', async () => {
    upsertEntry(db, userId, '2026-05-13', 'Yesterday.');
    upsertEntry(db, userId, '2026-05-14', 'Today.');
    const result = (await load(makeEvent('2026-05-14') as any)) as any;
    expect(result.entryDatePreviews).toHaveLength(2);
    expect(result.entryDatePreviews[0]).toMatchObject({
      entry_date: '2026-05-13',
      preview: 'Yesterday.',
    });
    expect(result.entryDatePreviews[1]).toMatchObject({
      entry_date: '2026-05-14',
      preview: 'Today.',
    });
  });
});
