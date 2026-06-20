import {
  SESSION_COOKIE,
  SESSION_DURATION_SECONDS,
  createSessionId,
  sessionExpiry,
  verifyPin,
} from '$lib/auth.js';
import { createSession, getUserByUsername, listUsers } from '$lib/db.js';
import { createThrottle } from '$lib/throttle.js';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// 5 straight PIN failures per username → 60s lockout. Without this a
// 4-digit PIN is brute-forceable in minutes, and PIN is the sibling gate.
const loginThrottle = createThrottle();

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) redirect(302, '/');
  return { users: listUsers(locals.db) };
};

export const actions: Actions = {
  default: async ({ request, cookies, locals }) => {
    const data = await request.formData();
    const username = data.get('username');
    const pin = data.get('pin');

    if (typeof username !== 'string' || typeof pin !== 'string' || pin.length !== 4) {
      return fail(400, { error: 'Invalid credentials' });
    }

    if (loginThrottle.isLocked(username)) {
      return fail(429, { error: 'Too many tries — wait a minute, then try again' });
    }

    const user = getUserByUsername(locals.db, username);
    if (!user || !(await verifyPin(pin, user.pin_hash))) {
      loginThrottle.recordFailure(username);
      return fail(400, { error: 'Invalid credentials' });
    }
    loginThrottle.recordSuccess(username);

    const sessionId = createSessionId();
    const expiry = sessionExpiry();
    createSession(locals.db, sessionId, user.id, expiry);

    cookies.set(SESSION_COOKIE, sessionId, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_DURATION_SECONDS,
    });

    redirect(302, '/');
  },
};
