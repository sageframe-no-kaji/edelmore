import { listEntryDatesWithPreview } from '$lib/db.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  // biome-ignore lint/style/noNonNullAssertion: layout guard guarantees user is present
  const userId = locals.user!.id;
  return {
    entryDatePreviews: listEntryDatesWithPreview(locals.db, userId, { ascending: true }),
  };
};
