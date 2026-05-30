import { formatDisplayDate, isValidDate } from '$lib/dates.js';
import { deleteEntry, getEntry } from '$lib/db.js';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!isValidDate(params.date)) throw error(400, 'Invalid date');
  if (!locals.user) throw error(401, 'Unauthorized');
  const entry = getEntry(locals.db, locals.user.id, params.date);
  return json({
    date: params.date,
    content: entry?.content ?? '',
    displayDate: formatDisplayDate(params.date),
  });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!isValidDate(params.date)) throw error(400, 'Invalid date');
  if (!locals.user) throw error(401, 'Unauthorized');
  deleteEntry(locals.db, locals.user.id, params.date);
  return json({ ok: true });
};
