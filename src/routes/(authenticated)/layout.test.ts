import { createDb } from '$lib/db.js';
import { describe, expect, it } from 'vitest';
import { load } from './+layout.server.js';

describe('(authenticated) layout load', () => {
  it('redirects to /login when no user in locals', async () => {
    const db = createDb(':memory:');
    await expect(load({ locals: { db, user: undefined } } as any)).rejects.toMatchObject({
      location: '/login',
      status: 302,
    });
  });

  it('returns the user when authenticated', async () => {
    const db = createDb(':memory:');
    const user = { id: 1, username: 'Iona', cover_id: 'meadow' };
    const result = await load({ locals: { db, user } } as any);
    expect(result).toEqual({ user });
  });
});
