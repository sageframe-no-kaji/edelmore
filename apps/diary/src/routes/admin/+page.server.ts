import { randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { hashPin } from '$lib/auth.js';
import { createUser, listUsers } from '$lib/db.js';
import { createThrottle } from '$lib/throttle.js';
import { fail } from '@sveltejs/kit';
import type { Cookies } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// The accounts page is gated by ADMIN_PIN (env). It isn't user auth — it's a
// stop-the-fiddling latch for a page that can create accounts and is reachable
// before login. When ADMIN_PIN is unset the page stays open (first-run
// bootstrap on a fresh database); set it in .env to lock.
const ADMIN_COOKIE = 'admin_gate';
const ADMIN_UNLOCK_MINUTES = 60;

// 5 straight failures → 60s lockout, same knob as the login throttle. The
// unlock form has no username, so every attempt counts against one key.
const adminThrottle = createThrottle();
const ADMIN_THROTTLE_KEY = 'admin';

// Successful unlocks mint an opaque random token; the cookie carries the
// token, never the PIN. Token → expiry (ms). In-memory is deliberate — a
// restart invalidating admin sessions is acceptable and expected.
const adminTokens = new Map<string, number>();

function adminAuthorized(cookies: Cookies): boolean {
  if (!env.ADMIN_PIN) return true;
  const now = Date.now();
  for (const [token, expiry] of adminTokens) {
    if (expiry <= now) adminTokens.delete(token);
  }
  const token = cookies.get(ADMIN_COOKIE);
  return token !== undefined && adminTokens.has(token);
}

export const load: PageServerLoad = async ({ locals, cookies }) => {
  if (!adminAuthorized(cookies)) {
    return { authorized: false, users: [] };
  }
  return { authorized: true, users: listUsers(locals.db) };
};

export const actions: Actions = {
  unlock: async ({ request, cookies }) => {
    const data = await request.formData();
    const pin = data.get('admin_pin')?.toString() ?? '';
    if (adminThrottle.isLocked(ADMIN_THROTTLE_KEY)) {
      return fail(429, { error: 'Too many tries — wait a minute, then try again' });
    }
    if (!env.ADMIN_PIN || pin !== env.ADMIN_PIN) {
      adminThrottle.recordFailure(ADMIN_THROTTLE_KEY);
      return fail(400, { error: 'Wrong PIN' });
    }
    adminThrottle.recordSuccess(ADMIN_THROTTLE_KEY);

    const token = randomBytes(32).toString('hex');
    adminTokens.set(token, Date.now() + ADMIN_UNLOCK_MINUTES * 60 * 1000);
    cookies.set(ADMIN_COOKIE, token, {
      path: '/admin',
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: ADMIN_UNLOCK_MINUTES * 60,
    });
    return { unlocked: true };
  },

  create: async ({ request, locals, cookies }) => {
    if (!adminAuthorized(cookies)) {
      return fail(403, { error: 'Locked — enter the admin PIN first' });
    }
    const data = await request.formData();
    const username = data.get('username');
    const pin = data.get('pin');

    if (
      typeof username !== 'string' ||
      username.trim().length === 0 ||
      typeof pin !== 'string' ||
      !/^\d{4}$/.test(pin)
    ) {
      return fail(400, { error: 'Username required and PIN must be 4 digits' });
    }

    try {
      const pinHash = await hashPin(pin);
      createUser(locals.db, username.trim(), pinHash);
    } catch {
      return fail(400, { error: 'Username already taken' });
    }

    return { success: true };
  },
};
