import { type Database, createDb, createUser, getUserByUsername } from '$lib/db.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock $env/dynamic/private before importing the handlers. Mutable so tests
// can toggle ADMIN_PIN (unset = page open for first-run bootstrap).
vi.mock('$env/dynamic/private', () => ({
  env: { ADMIN_PIN: '9999' } as Record<string, string | undefined>,
}));

const env = (await import('$env/dynamic/private')).env as Record<string, string | undefined>;
const { actions, load } = await import('./+page.server.js');

function freshDb(): Database {
  return createDb(':memory:');
}

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

function makeCookies(values: Record<string, string> = {}) {
  return {
    get: (name: string) => values[name],
    set: vi.fn(),
  };
}

async function unlock(pin: string, cookies = makeCookies()) {
  const result = await actions.unlock({
    request: { formData: async () => makeFormData({ admin_pin: pin }) },
    cookies,
  } as any);
  return { result, cookies };
}

// Successful unlock mints an opaque token; read it back off the cookie write.
async function unlockToken(): Promise<string> {
  const { cookies } = await unlock('9999');
  return cookies.set.mock.calls[0][1] as string;
}

beforeEach(() => {
  env.ADMIN_PIN = '9999';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('load', () => {
  it('returns locked state without the admin cookie', async () => {
    const db = freshDb();
    createUser(db, 'Iona', 'hash');
    const result = (await load({ locals: { db }, cookies: makeCookies() } as any)) as {
      authorized: boolean;
      users: unknown[];
    };
    expect(result.authorized).toBe(false);
    expect(result.users).toEqual([]);
  });

  it('returns user list when the cookie carries a minted token', async () => {
    const db = freshDb();
    createUser(db, 'Iona', 'hash');
    const token = await unlockToken();
    const result = (await load({
      locals: { db },
      cookies: makeCookies({ admin_gate: token }),
    } as any)) as { authorized: boolean; users: { username: string }[] };
    expect(result.authorized).toBe(true);
    expect(result.users).toHaveLength(1);
    expect(result.users[0].username).toBe('Iona');
  });

  it('stays open when ADMIN_PIN is unset (first-run bootstrap)', async () => {
    env.ADMIN_PIN = undefined;
    const result = (await load({
      locals: { db: freshDb() },
      cookies: makeCookies(),
    } as any)) as { authorized: boolean };
    expect(result.authorized).toBe(true);
  });

  it('rejects a cookie value that was never minted (e.g. the raw PIN)', async () => {
    const result = (await load({
      locals: { db: freshDb() },
      cookies: makeCookies({ admin_gate: '9999' }),
    } as any)) as { authorized: boolean };
    expect(result.authorized).toBe(false);
  });

  it('rejects an expired token', async () => {
    // Mint the token in the past; real time is well past its 60-minute expiry.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2021-01-01T00:00:00Z'));
    const token = await unlockToken();
    vi.useRealTimers();
    const result = (await load({
      locals: { db: freshDb() },
      cookies: makeCookies({ admin_gate: token }),
    } as any)) as { authorized: boolean };
    expect(result.authorized).toBe(false);
  });
});

describe('actions.unlock', () => {
  it('sets an opaque token cookie — never the ADMIN_PIN', async () => {
    const { result, cookies } = await unlock('9999');
    expect(result).toMatchObject({ unlocked: true });
    expect(cookies.set).toHaveBeenCalledWith(
      'admin_gate',
      expect.any(String),
      expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/admin', maxAge: 3600 })
    );
    const token = cookies.set.mock.calls[0][1] as string;
    expect(token).not.toBe(env.ADMIN_PIN);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects a wrong PIN', async () => {
    const { result, cookies } = await unlock('1111');
    expect(result?.status).toBe(400);
    expect(cookies.set).not.toHaveBeenCalled();
  });

  it('rejects unlock attempts when ADMIN_PIN is unset', async () => {
    env.ADMIN_PIN = undefined;
    const { result } = await unlock('');
    expect(result?.status).toBe(400);
  });

  it('throttles repeated failed unlock attempts', async () => {
    // Throttle state is module-level and shared across this file. Run this
    // test in the past so the lockout has already expired in real time for
    // any test that follows.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
    await unlock('9999'); // success clears failures accumulated by earlier tests
    for (let i = 0; i < 5; i++) {
      const { result } = await unlock('1111');
      expect(result?.status).toBe(400);
    }
    // Locked now — even the correct PIN gets the login route's failure shape.
    const { result, cookies } = await unlock('9999');
    expect(result?.status).toBe(429);
    expect(result?.data).toMatchObject({ error: expect.stringContaining('Too many tries') });
    expect(cookies.set).not.toHaveBeenCalled();
  });
});

describe('actions.create', () => {
  let db: Database;
  let cookies: ReturnType<typeof makeCookies>;

  beforeEach(async () => {
    db = freshDb();
    cookies = makeCookies({ admin_gate: await unlockToken() });
  });

  it('returns 403 when locked', async () => {
    const result = await actions.create({
      request: { formData: async () => makeFormData({ username: 'Iona', pin: '1234' }) },
      locals: { db },
      cookies: makeCookies(),
    } as any);
    expect(result?.status).toBe(403);
    expect(getUserByUsername(db, 'Iona')).toBeUndefined();
  });

  it('returns 400 for missing username', async () => {
    const result = await actions.create({
      request: { formData: async () => makeFormData({ pin: '1234' }) },
      locals: { db },
      cookies,
    } as any);
    expect(result?.status).toBe(400);
  });

  it('returns 400 for non-4-digit PIN', async () => {
    const result = await actions.create({
      request: { formData: async () => makeFormData({ username: 'Iona', pin: '12' }) },
      locals: { db },
      cookies,
    } as any);
    expect(result?.status).toBe(400);
  });

  it('returns 400 for non-numeric PIN', async () => {
    const result = await actions.create({
      request: { formData: async () => makeFormData({ username: 'Iona', pin: 'abcd' }) },
      locals: { db },
      cookies,
    } as any);
    expect(result?.status).toBe(400);
  });

  it('creates user and returns success', async () => {
    const result = await actions.create({
      request: { formData: async () => makeFormData({ username: 'Iona', pin: '1234' }) },
      locals: { db },
      cookies,
    } as any);
    expect(result).toMatchObject({ success: true });
    expect(getUserByUsername(db, 'Iona')).toBeDefined();
  });

  it('returns 400 for duplicate username', async () => {
    createUser(db, 'Iona', 'hash');
    const result = await actions.create({
      request: { formData: async () => makeFormData({ username: 'Iona', pin: '1234' }) },
      locals: { db },
      cookies,
    } as any);
    expect(result?.status).toBe(400);
  });

  it('trims whitespace from username', async () => {
    await actions.create({
      request: { formData: async () => makeFormData({ username: '  Rosie  ', pin: '5678' }) },
      locals: { db },
      cookies,
    } as any);
    expect(getUserByUsername(db, 'Rosie')).toBeDefined();
  });

  it('creates users without a gate when ADMIN_PIN is unset', async () => {
    env.ADMIN_PIN = undefined;
    const result = await actions.create({
      request: { formData: async () => makeFormData({ username: 'Isla', pin: '4321' }) },
      locals: { db },
      cookies: makeCookies(),
    } as any);
    expect(result).toMatchObject({ success: true });
  });
});
