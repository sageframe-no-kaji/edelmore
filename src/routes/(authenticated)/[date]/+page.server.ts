import { formatDisplayDate, getNextDate, getPrevDate, isValidDate, todayIso } from '$lib/dates.js';
import { getEntry } from '$lib/db.js';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!isValidDate(params.date)) redirect(302, `/${todayIso()}`);

  // biome-ignore lint/style/noNonNullAssertion: layout guard guarantees user is present
  const userId = locals.user!.id;
  const entry = getEntry(locals.db, userId, params.date);

  const prevDate = getPrevDate(params.date);
  const nextDate = getNextDate(params.date);
  const prevEntry = getEntry(locals.db, userId, prevDate);

  return {
    date: params.date,
    displayDate: formatDisplayDate(params.date),
    content: entry?.content ?? '',
    prevDate,
    nextDate,
    prevContent: prevEntry?.content ?? '',
    prevDisplayDate: formatDisplayDate(prevDate),
  };
};
