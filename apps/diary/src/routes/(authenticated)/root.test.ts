import { type Database, createDb, createUser, upsertEntry } from '$lib/db.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { load } from './+page.server.js';

function freshDb(): Database {
  return createDb(':memory:');
}

describe('(authenticated) root', () => {
  let db: Database;
  let userId: number;

  beforeEach(() => {
    db = freshDb();
    userId = createUser(db, 'Iona', 'hash');
  });

  function makeEvent() {
    return { locals: { db, user: { id: userId, username: 'Iona', cover_id: 'meadow' } } };
  }

  it('returns entryDatePreviews (empty when no entries)', async () => {
    const result = (await load(makeEvent() as any)) as any;
    expect(result.entryDatePreviews).toEqual([]);
  });

  it('returns entryDatePreviews in ascending order', async () => {
    upsertEntry(db, userId, '2026-05-13', 'Yesterday.');
    upsertEntry(db, userId, '2026-05-14', 'Today.');
    const result = (await load(makeEvent() as any)) as any;
    expect(result.entryDatePreviews).toHaveLength(2);
    expect(result.entryDatePreviews[0].entry_date).toBe('2026-05-13');
  });
});
