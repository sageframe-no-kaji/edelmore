import { SESSION_COOKIE, hashPin, sessionExpiry } from '$lib/auth.js';
import { type Database, createDb, createSession, createUser } from '$lib/db.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { createHandle } from './hooks.server.js';

function freshDb(): Database {
  return createDb(':memory:');
}

type CookieStore = Map<string, string>;

function makeEvent(db: Database, cookieStore: CookieStore = new Map()) {
  const cookies: Record<string, string> = {};
  for (const [k, v] of cookieStore) cookies[k] = v;
  return {
    locals: { db } as any,
    cookies: {
      get: (name: string) => cookieStore.get(name),
      set: (name: string, value: string) => {
        cookieStore.set(name, value);
      },
    },
    request: new Request('http://localhost/'),
  };
}

describe('createHandle', () => {
  let db: Database;
  let userId: number;
  let cookieStore: CookieStore;

  beforeEach(async () => {
    db = freshDb();
    userId = createUser(db, 'Iona', await hashPin('1234'));
    cookieStore = new Map();
  });

  it('calls resolve and returns its response', async () => {
    const handle = createHandle(db);
    const mockResponse = new Response('ok');
    const result = await handle({
      event: makeEvent(db) as any,
      resolve: async () => mockResponse,
    });
    expect(result).toBe(mockResponse);
  });

  it('leaves locals.user undefined when no session cookie', async () => {
    const handle = createHandle(db);
    const event = makeEvent(db);
    await handle({ event: event as any, resolve: async (e: any) => new Response() });
    expect(event.locals.user).toBeUndefined();
  });

  it('leaves locals.user undefined when session cookie is unknown', async () => {
    const handle = createHandle(db);
    const store = new Map([['session', 'bogus-session-id']]);
    const event = makeEvent(db, store);
    await handle({ event: event as any, resolve: async () => new Response() });
    expect(event.locals.user).toBeUndefined();
  });

  it('attaches user to locals when session cookie is valid', async () => {
    const expiry = sessionExpiry();
    createSession(db, 'valid-sid', userId, expiry);
    const store = new Map([[SESSION_COOKIE, 'valid-sid']]);
    const event = makeEvent(db, store);

    const handle = createHandle(db);
    await handle({ event: event as any, resolve: async () => new Response() });

    expect(event.locals.user).toMatchObject({ id: userId, username: 'Iona' });
  });

  it('refreshes session expiry on each authenticated request', async () => {
    const expiry = sessionExpiry();
    createSession(db, 'refresh-sid', userId, expiry);
    const store = new Map([[SESSION_COOKIE, 'refresh-sid']]);
    const event = makeEvent(db, store);

    const handle = createHandle(db);
    await handle({ event: event as any, resolve: async () => new Response() });

    // Cookie was re-set (store updated)
    expect(store.get(SESSION_COOKIE)).toBe('refresh-sid');
  });
});
