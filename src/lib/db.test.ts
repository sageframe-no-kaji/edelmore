import { beforeEach, describe, expect, it } from 'vitest';
import {
  type Database,
  applySchema,
  countUsers,
  createDb,
  createSession,
  createUser,
  deleteSession,
  getSession,
  getUserById,
  getUserByUsername,
  updateSessionExpiry,
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
