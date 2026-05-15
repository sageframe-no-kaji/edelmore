import { beforeEach, describe, expect, it } from 'vitest';
import {
  type Database,
  applySchema,
  countUsers,
  createDb,
  createSession,
  createUser,
  deleteSession,
  getEntry,
  getSession,
  getUserById,
  getUserByUsername,
  listEntryDates,
  listEntryDatesWithPreview,
  listUsers,
  makeEntryPreview,
  updateSessionExpiry,
  updateUserCoverId,
  upsertEntry,
} from './db.js';

function freshDb(): Database {
  return createDb(':memory:');
}

describe('createDb / applySchema', () => {
  it('creates a db with the three required tables', () => {
    const db = freshDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    expect(tables.map((t) => t.name)).toEqual(['entries', 'sessions', 'users']);
  });

  it('is idempotent — calling applySchema twice does not throw', () => {
    const db = freshDb();
    expect(() => applySchema(db)).not.toThrow();
  });
});

describe('user operations', () => {
  let db: Database;
  beforeEach(() => {
    db = freshDb();
  });

  it('countUsers returns 0 on empty db', () => {
    expect(countUsers(db)).toBe(0);
  });

  it('createUser inserts a row and returns the new id', () => {
    const id = createUser(db, 'Iona', 'hash1');
    expect(id).toBe(1);
    expect(countUsers(db)).toBe(1);
  });

  it('getUserByUsername returns the user', () => {
    createUser(db, 'Iona', 'hash1');
    const user = getUserByUsername(db, 'Iona');
    expect(user).toMatchObject({ username: 'Iona', pin_hash: 'hash1', cover_id: 'meadow' });
  });

  it('getUserByUsername returns undefined for unknown username', () => {
    expect(getUserByUsername(db, 'Ghost')).toBeUndefined();
  });

  it('getUserById returns the user without pin_hash', () => {
    const id = createUser(db, 'Isla', 'hash2');
    const user = getUserById(db, id);
    expect(user).toMatchObject({ id, username: 'Isla', cover_id: 'meadow' });
    expect(user).not.toHaveProperty('pin_hash');
  });

  it('getUserById returns undefined for unknown id', () => {
    expect(getUserById(db, 999)).toBeUndefined();
  });

  it('createUser enforces UNIQUE username', () => {
    createUser(db, 'Iona', 'hash1');
    expect(() => createUser(db, 'Iona', 'hash2')).toThrow();
  });

  it('listUsers returns all users sorted by username', () => {
    createUser(db, 'Isla', 'hash2');
    createUser(db, 'Iona', 'hash1');
    const users = listUsers(db);
    expect(users.map((u) => u.username)).toEqual(['Iona', 'Isla']);
    expect(users[0]).toHaveProperty('id');
    expect(users[0]).not.toHaveProperty('pin_hash');
  });

  it('listUsers returns empty array when no users exist', () => {
    expect(listUsers(db)).toEqual([]);
  });

  it('updateUserCoverId updates the cover_id for the given user', () => {
    const id = createUser(db, 'Iona', 'hash1');
    updateUserCoverId(db, id, 'sage');
    const user = getUserById(db, id);
    expect(user?.cover_id).toBe('sage');
  });

  it('updateUserCoverId does not affect other users', () => {
    const id1 = createUser(db, 'Iona', 'hash1');
    const id2 = createUser(db, 'Isla', 'hash2');
    updateUserCoverId(db, id1, 'dusty-rose');
    expect(getUserById(db, id2)?.cover_id).toBe('meadow');
  });
});

describe('session operations', () => {
  let db: Database;
  let userId: number;

  beforeEach(() => {
    db = freshDb();
    userId = createUser(db, 'Iona', 'hash1');
  });

  function toSqlite(ms: number): string {
    return new Date(ms)
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d{3}Z$/, '');
  }

  function futureExpiry(): string {
    return toSqlite(Date.now() + 60_000);
  }

  function pastExpiry(): string {
    return toSqlite(Date.now() - 60_000);
  }

  it('createSession then getSession returns the session', () => {
    createSession(db, 'sid1', userId, futureExpiry());
    const s = getSession(db, 'sid1');
    expect(s).toMatchObject({ id: 'sid1', user_id: userId });
  });

  it('getSession returns undefined for unknown id', () => {
    expect(getSession(db, 'missing')).toBeUndefined();
  });

  it('getSession returns undefined for expired session', () => {
    createSession(db, 'sid2', userId, pastExpiry());
    expect(getSession(db, 'sid2')).toBeUndefined();
  });

  it('updateSessionExpiry makes an expired session live again', () => {
    createSession(db, 'sid3', userId, pastExpiry());
    expect(getSession(db, 'sid3')).toBeUndefined();
    updateSessionExpiry(db, 'sid3', futureExpiry());
    expect(getSession(db, 'sid3')).toBeDefined();
  });

  it('deleteSession removes the row', () => {
    createSession(db, 'sid4', userId, futureExpiry());
    deleteSession(db, 'sid4');
    expect(getSession(db, 'sid4')).toBeUndefined();
  });

  it('deleteSession on non-existent id is a no-op', () => {
    expect(() => deleteSession(db, 'nope')).not.toThrow();
  });
});

describe('entry operations', () => {
  let db: Database;
  let userId: number;

  beforeEach(() => {
    db = createDb(':memory:');
    userId = createUser(db, 'Iona', 'hash1');
  });

  it('getEntry returns undefined before any write', () => {
    expect(getEntry(db, userId, '2026-05-14')).toBeUndefined();
  });

  it('upsertEntry creates an entry and getEntry retrieves it', () => {
    upsertEntry(db, userId, '2026-05-14', 'Hello diary.');
    const entry = getEntry(db, userId, '2026-05-14');
    expect(entry).toMatchObject({
      user_id: userId,
      entry_date: '2026-05-14',
      content: 'Hello diary.',
    });
  });

  it('upsertEntry updates existing content', () => {
    upsertEntry(db, userId, '2026-05-14', 'Draft.');
    upsertEntry(db, userId, '2026-05-14', 'Final.');
    expect(getEntry(db, userId, '2026-05-14')?.content).toBe('Final.');
  });

  it('entries are per-user — different users do not share entries', () => {
    const userId2 = createUser(db, 'Isla', 'hash2');
    upsertEntry(db, userId, '2026-05-14', 'Iona entry.');
    expect(getEntry(db, userId2, '2026-05-14')).toBeUndefined();
  });

  it('listEntryDates returns empty array when no entries', () => {
    expect(listEntryDates(db, userId)).toEqual([]);
  });

  it('listEntryDates returns dates most-recent-first', () => {
    upsertEntry(db, userId, '2026-05-10', 'a');
    upsertEntry(db, userId, '2026-05-14', 'b');
    upsertEntry(db, userId, '2026-05-01', 'c');
    expect(listEntryDates(db, userId)).toEqual(['2026-05-14', '2026-05-10', '2026-05-01']);
  });
});

describe('makeEntryPreview', () => {
  it('returns the first line unchanged when it is 20 chars or fewer', () => {
    expect(makeEntryPreview('Short line.')).toBe('Short line.');
  });

  it('truncates and appends ellipsis when first line exceeds 20 chars', () => {
    const result = makeEntryPreview('This is a longer line than twenty chars.');
    expect(result).toBe('This is a longer lin…');
    expect(result.length).toBe(21); // 20 chars + 1 ellipsis char (…)
  });

  it('uses only the first line when content has multiple lines', () => {
    expect(makeEntryPreview('First line.\nSecond line.')).toBe('First line.');
  });

  it('trims leading whitespace from the first line', () => {
    expect(makeEntryPreview('  Indented line.')).toBe('Indented line.');
  });

  it('returns empty string for empty content', () => {
    expect(makeEntryPreview('')).toBe('');
  });
});

describe('listEntryDatesWithPreview', () => {
  let db: Database;
  let userId: number;

  beforeEach(() => {
    db = createDb(':memory:');
    userId = createUser(db, 'Iona', 'hash1');
  });

  it('returns empty array when no entries exist', () => {
    expect(listEntryDatesWithPreview(db, userId)).toEqual([]);
  });

  it('returns entries most-recent-first with preview', () => {
    upsertEntry(db, userId, '2026-05-10', 'Older entry.');
    upsertEntry(db, userId, '2026-05-14', 'Newer entry.');
    const result = listEntryDatesWithPreview(db, userId);
    expect(result).toEqual([
      { entry_date: '2026-05-14', preview: 'Newer entry.' },
      { entry_date: '2026-05-10', preview: 'Older entry.' },
    ]);
  });

  it('truncates long first lines in previews', () => {
    upsertEntry(
      db,
      userId,
      '2026-05-14',
      'This is a very long first line that exceeds twenty characters.'
    );
    const [{ preview }] = listEntryDatesWithPreview(db, userId);
    expect(preview).toBe('This is a very long …');
  });

  it('isolates entries by user', () => {
    const userId2 = createUser(db, 'Isla', 'hash2');
    upsertEntry(db, userId, '2026-05-14', 'Iona entry.');
    upsertEntry(db, userId2, '2026-05-14', 'Isla entry.');
    const ionaResult = listEntryDatesWithPreview(db, userId);
    expect(ionaResult).toHaveLength(1);
    expect(ionaResult[0].preview).toBe('Iona entry.');
  });

  it('default order is DESC (most recent first)', () => {
    upsertEntry(db, userId, '2026-05-10', 'Older.');
    upsertEntry(db, userId, '2026-05-14', 'Newer.');
    const result = listEntryDatesWithPreview(db, userId);
    expect(result[0].entry_date).toBe('2026-05-14');
    expect(result[1].entry_date).toBe('2026-05-10');
  });

  it('ascending:true returns oldest first', () => {
    upsertEntry(db, userId, '2026-05-10', 'Older.');
    upsertEntry(db, userId, '2026-05-14', 'Newer.');
    const result = listEntryDatesWithPreview(db, userId, { ascending: true });
    expect(result[0].entry_date).toBe('2026-05-10');
    expect(result[1].entry_date).toBe('2026-05-14');
  });
});
