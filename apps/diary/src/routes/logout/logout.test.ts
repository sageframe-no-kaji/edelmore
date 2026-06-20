import { SESSION_COOKIE } from '$lib/auth.js';
import { type Database, createDb, createSession, createUser, getSession } from '$lib/db.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { GET } from './+server.js';

function freshDb(): Database {
  return createDb(':memory:');
}

describe('GET /logout', () => {
  let db: Database;

  beforeEach(() => {
    db = freshDb();
  });

  it('redirects to /login even with no session cookie', async () => {
    await expect(
      GET({
        cookies: {
          get: () => undefined,
          delete: () => {},
        },
        locals: { db },
      } as any)
    ).rejects.toMatchObject({ location: '/login', status: 302 });
  });

  it('deletes the session from the db and redirects', async () => {
    const userId = createUser(db, 'Iona', 'hash');
    const expiry = new Date(Date.now() + 60_000)
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d{3}Z$/, '');
    createSession(db, 'testsid', userId, expiry);
    expect(getSession(db, 'testsid')).toBeDefined();

    const deleted: string[] = [];
    await expect(
      GET({
        cookies: {
          get: (name: string) => (name === SESSION_COOKIE ? 'testsid' : undefined),
          delete: (name: string) => {
            deleted.push(name);
          },
        },
        locals: { db },
      } as any)
    ).rejects.toMatchObject({ location: '/login', status: 302 });

    expect(getSession(db, 'testsid')).toBeUndefined();
    expect(deleted).toContain(SESSION_COOKIE);
  });
});
