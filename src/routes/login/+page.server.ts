import {
  SESSION_COOKIE,
  SESSION_DURATION_SECONDS,
  createSessionId,
  sessionExpiry,
  verifyPin,
} from '$lib/auth.js';
import { createSession, getUserByUsername } from '$lib/db.js';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) redirect(302, '/');
};

export const actions: Actions = {
  default: async ({ request, cookies, locals }) => {
    const data = await request.formData();
    const username = data.get('username');
    const pin = data.get('pin');

    if (typeof username !== 'string' || typeof pin !== 'string' || pin.length !== 4) {
      return fail(400, { error: 'Invalid credentials' });
    }

    const user = getUserByUsername(locals.db, username);
    if (!user || !(await verifyPin(pin, user.pin_hash))) {
      return fail(400, { error: 'Invalid credentials' });
    }

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
