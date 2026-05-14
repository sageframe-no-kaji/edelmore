import { describe, expect, it } from 'vitest';
import { verifyPin } from './auth.js';
import { countUsers, createDb, getUserByUsername } from './db.js';
import type { Database } from './db.js';
import { seedIfEmpty } from './seed.js';

function freshDb(): Database {
  return createDb(':memory:');
}

describe('seedIfEmpty', () => {
  it('inserts the provided users on an empty db', async () => {
    const db = freshDb();
    await seedIfEmpty(db, [{ username: 'Iona', pin: '1111' }]);
    expect(countUsers(db)).toBe(1);
    const user = getUserByUsername(db, 'Iona');
    expect(user).toBeDefined();
    await expect(verifyPin('1111', user!.pin_hash)).resolves.toBe(true);
  });

  it('seeds multiple users', async () => {
    const db = freshDb();
    await seedIfEmpty(db, [
      { username: 'Iona', pin: '1111' },
      { username: 'Isla', pin: '2222' },
    ]);
    expect(countUsers(db)).toBe(2);
  });

  it('is a no-op when users already exist', async () => {
    const db = freshDb();
    await seedIfEmpty(db, [{ username: 'Iona', pin: '1111' }]);
    await seedIfEmpty(db, [{ username: 'NewUser', pin: '9999' }]);
    expect(countUsers(db)).toBe(1);
  });
});
