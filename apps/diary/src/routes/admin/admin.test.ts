import { type Database, createDb, createUser, getUserByUsername } from '$lib/db.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

beforeEach(() => {
  env.ADMIN_PIN = '9999';
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

  it('returns user list when the admin cookie matches', async () => {
    const db = freshDb();
    createUser(db, 'Iona', 'hash');
    const result = (await load({
      locals: { db },
      cookies: makeCookies({ admin_gate: '9999' }),
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

  it('rejects a stale cookie from a previous PIN', async () => {
    const result = (await load({
      locals: { db: freshDb() },
      cookies: makeCookies({ admin_gate: '0000' }),
    } as any)) as { authorized: boolean };
    expect(result.authorized).toBe(false);
  });
});

describe('actions.unlock', () => {
  it('sets the gate cookie for the correct PIN', async () => {
    const cookies = makeCookies();
    const result = await actions.unlock({
      request: { formData: async () => makeFormData({ admin_pin: '9999' }) },
      cookies,
    } as any);
    expect(result).toMatchObject({ unlocked: true });
    expect(cookies.set).toHaveBeenCalledWith(
      'admin_gate',
      '9999',
      expect.objectContaining({ httpOnly: true, path: '/admin' })
    );
  });

  it('rejects a wrong PIN', async () => {
    const cookies = makeCookies();
    const result = await actions.unlock({
      request: { formData: async () => makeFormData({ admin_pin: '1111' }) },
      cookies,
    } as any);
    expect(result?.status).toBe(400);
    expect(cookies.set).not.toHaveBeenCalled();
  });

  it('rejects unlock attempts when ADMIN_PIN is unset', async () => {
    env.ADMIN_PIN = undefined;
    const result = await actions.unlock({
      request: { formData: async () => makeFormData({ admin_pin: '' }) },
      cookies: makeCookies(),
    } as any);
    expect(result?.status).toBe(400);
  });
});

describe('actions.create', () => {
  let db: Database;
  let cookies: ReturnType<typeof makeCookies>;

  beforeEach(() => {
    db = freshDb();
    cookies = makeCookies({ admin_gate: '9999' });
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
