import { isValidDate } from '$lib/dates.js';
import { upsertEntry } from '$lib/db.js';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
  const body = await request.json();
  const { date, content } = body as { date: unknown; content: unknown };

  if (typeof date !== 'string' || !isValidDate(date)) {
    error(400, 'Invalid date');
  }
  if (typeof content !== 'string') {
    error(400, 'Content must be a string');
  }

  // biome-ignore lint/style/noNonNullAssertion: layout guard guarantees user is present
  upsertEntry(locals.db, locals.user!.id, date, content);
  return json({ ok: true });
};
