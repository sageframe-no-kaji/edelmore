import { formatDisplayDate, isValidDate, todayIso } from '$lib/dates.js';
import { getEntry } from '$lib/db.js';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!isValidDate(params.date)) redirect(302, `/${todayIso()}`);

  // biome-ignore lint/style/noNonNullAssertion: layout guard guarantees user is present
  const entry = getEntry(locals.db, locals.user!.id, params.date);
  return {
    date: params.date,
    displayDate: formatDisplayDate(params.date),
    content: entry?.content ?? '',
  };
};
