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
  it('returns user list when not logged in', async () => {
    const db = freshDb();
    createUser(db, 'Iona', 'hash');
    const result = await load({ locals: { db, user: undefined } } as any);
    expect(result).toMatchObject({ users: [{ username: 'Iona' }] });
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

  it('locks the username out after 5 straight PIN failures', async () => {
    // Unique username — the throttle is module-level state shared by this file.
    createUser(db, 'Lockey', await hashPin('1234'));
    const attempt = (pin: string) =>
      actions.default({
        request: { formData: async () => makeFormData({ username: 'Lockey', pin }) },
        cookies: makeCookies(cookieStore),
        locals: { db },
      } as any);

    for (let i = 0; i < 5; i++) {
      const result = await attempt('0000');
      expect(result?.status).toBe(400);
    }
    // Sixth attempt is throttled — even with the CORRECT pin.
    const locked = await attempt('1234');
    expect(locked?.status).toBe(429);
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
