import { SESSION_COOKIE } from '$lib/auth.js';
import { deleteSession } from '$lib/db.js';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// POST, not GET: logout mutates state (deletes the session), so it must not be
// reachable via link prefetch or a crawler following an <a href>.
export const POST: RequestHandler = async ({ cookies, locals }) => {
  const sessionId = cookies.get(SESSION_COOKIE);
  if (sessionId) {
    deleteSession(locals.db, sessionId);
    cookies.delete(SESSION_COOKIE, { path: '/' });
  }
  redirect(302, '/login');
};
