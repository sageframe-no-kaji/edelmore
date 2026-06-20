import { listEntryDatesWithPreview } from '$lib/db.js';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) error(401, 'Unauthorized');
  // biome-ignore lint/style/noNonNullAssertion: guarded above
  return json(listEntryDatesWithPreview(locals.db, locals.user!.id));
};
