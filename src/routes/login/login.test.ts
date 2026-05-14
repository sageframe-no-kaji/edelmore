import { hashPin } from '$lib/auth.js';
import { type Database, createDb, createUser, getSession } from '$lib/db.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { actions, load } from './+page.server.js';

function freshDb(): Database {
  return createDb(':memory:');
}

type CookieStore = Map<string, string>;

function makeCookies(store: CookieStore = new Map()) {
  return {
    get: (name: string) => store.get(name),
    set: (name: string, value: string) => {
      store.set(name, value);
    },
    delete: (name: string) => {
      store.delete(name);
    },
  };
}

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

describe('load', () => {
  it('returns nothing when user is not logged in', async () => {
    const result = await load({ locals: { db: freshDb(), user: undefined } } as any);
    expect(result).toBeUndefined();
  });

  it('redirects to / when user is already logged in', async () => {
    const db = freshDb();
    const userId = createUser(db, 'Iona', 'hash');
    await expect(
      load({ locals: { db, user: { id: userId, username: 'Iona', cover_id: 'meadow' } } } as any)
    ).rejects.toMatchObject({ location: '/', status: 302 });
  });
});

describe('actions.default', () => {
  let db: Database;
  let cookieStore: CookieStore;

  beforeEach(async () => {
    db = freshDb();
    const hash = await hashPin('1234');
    createUser(db, 'Iona', hash);
    cookieStore = new Map();
  });

  it('returns 400 for missing username', async () => {
    const result = await actions.default({
      request: { formData: async () => makeFormData({ pin: '1234' }) },
      cookies: makeCookies(cookieStore),
      locals: { db },
    } as any);
    expect(result?.status).toBe(400);
  });

  it('returns 400 for wrong PIN length', async () => {
    const result = await actions.default({
      request: { formData: async () => makeFormData({ username: 'Iona', pin: '12' }) },
      cookies: makeCookies(cookieStore),
      locals: { db },
    } as any);
    expect(result?.status).toBe(400);
  });

  it('returns 400 for unknown username', async () => {
    const result = await actions.default({
      request: { formData: async () => makeFormData({ username: 'Ghost', pin: '1234' }) },
      cookies: makeCookies(cookieStore),
      locals: { db },
    } as any);
    expect(result?.status).toBe(400);
  });

  it('returns 400 for wrong PIN', async () => {
    const result = await actions.default({
      request: { formData: async () => makeFormData({ username: 'Iona', pin: '9999' }) },
      cookies: makeCookies(cookieStore),
      locals: { db },
    } as any);
    expect(result?.status).toBe(400);
  });

  it('redirects to / and sets session cookie on valid credentials', async () => {
    await expect(
      actions.default({
        request: { formData: async () => makeFormData({ username: 'Iona', pin: '1234' }) },
        cookies: makeCookies(cookieStore),
        locals: { db },
      } as any)
    ).rejects.toMatchObject({ location: '/', status: 302 });
    expect(cookieStore.get('session')).toBeDefined();
  });

  it('creates a valid session in the db on success', async () => {
    await expect(
      actions.default({
        request: { formData: async () => makeFormData({ username: 'Iona', pin: '1234' }) },
        cookies: makeCookies(cookieStore),
        locals: { db },
      } as any)
    ).rejects.toMatchObject({ status: 302 });
    const sessionId = cookieStore.get('session')!;
    const session = getSession(db, sessionId);
    expect(session).toBeDefined();
    expect(session?.user_id).toBe(1);
  });
});
