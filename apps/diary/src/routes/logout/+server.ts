import { SESSION_COOKIE } from '$lib/auth.js';
import { deleteSession } from '$lib/db.js';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies, locals }) => {
  const sessionId = cookies.get(SESSION_COOKIE);
  if (sessionId) {
    deleteSession(locals.db, sessionId);
    cookies.delete(SESSION_COOKIE, { path: '/' });
  }
  redirect(302, '/login');
};
