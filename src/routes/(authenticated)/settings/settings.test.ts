import { COVERS } from '$lib/covers.js';
import { type Database, createDb, createUser, getUserById } from '$lib/db.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { actions, load } from './+page.server.js';

function freshDb(): Database {
  return createDb(':memory:');
}

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

describe('load', () => {
  let db: Database;
  let userId: number;

  beforeEach(() => {
    db = freshDb();
    userId = createUser(db, 'Iona', 'hash');
  });

  it('returns coverId, username, and all covers', async () => {
    const result = (await load({
      locals: { db, user: { id: userId, username: 'Iona', cover_id: 'meadow' } },
    } as any)) as { coverId: string; username: string; covers: typeof COVERS };

    expect(result.coverId).toBe('meadow');
    expect(result.username).toBe('Iona');
    expect(result.covers).toHaveLength(10);
  });

  it('reflects a non-default cover_id', async () => {
    const result = (await load({
      locals: { db, user: { id: userId, username: 'Iona', cover_id: 'sage' } },
    } as any)) as { coverId: string };

    expect(result.coverId).toBe('sage');
  });
});

describe('actions.select', () => {
  let db: Database;
  let userId: number;

  beforeEach(() => {
    db = freshDb();
    userId = createUser(db, 'Iona', 'hash');
  });

  it('returns 400 for an unknown cover_id', async () => {
    const result = await actions.select({
      request: { formData: async () => makeFormData({ cover_id: 'nonexistent' }) },
      locals: { db, user: { id: userId, username: 'Iona', cover_id: 'meadow' } },
    } as any);
    expect(result?.status).toBe(400);
  });

  it('returns 400 for empty cover_id', async () => {
    const result = await actions.select({
      request: { formData: async () => makeFormData({ cover_id: '' }) },
      locals: { db, user: { id: userId, username: 'Iona', cover_id: 'meadow' } },
    } as any);
    expect(result?.status).toBe(400);
  });

  it('updates cover_id and redirects for a valid cover', async () => {
    let threw: unknown;
    try {
      await actions.select({
        request: { formData: async () => makeFormData({ cover_id: 'sage' }) },
        locals: { db, user: { id: userId, username: 'Iona', cover_id: 'meadow' } },
      } as any);
    } catch (e) {
      threw = e;
    }
    // SvelteKit redirect throws a Response-like object
    expect((threw as { status?: number })?.status).toBe(302);
    expect(getUserById(db, userId)?.cover_id).toBe('sage');
  });

  it('accepts any valid cover id', async () => {
    for (const cover of COVERS) {
      let threw: unknown;
      try {
        await actions.select({
          request: { formData: async () => makeFormData({ cover_id: cover.id }) },
          locals: { db, user: { id: userId, username: 'Iona', cover_id: 'meadow' } },
        } as any);
      } catch (e) {
        threw = e;
      }
      expect((threw as { status?: number })?.status).toBe(302);
    }
  });
});
