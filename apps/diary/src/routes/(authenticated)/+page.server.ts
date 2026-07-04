import { listEntryDatesWithPreview } from '$lib/db.js';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  // Layout and page loads run concurrently in SvelteKit — the layout guard
  // does not run first, so guard here before touching the DB.
  if (!locals.user) redirect(303, '/login');
  return {
    entryDatePreviews: listEntryDatesWithPreview(locals.db, locals.user.id, { ascending: true }),
  };
};
