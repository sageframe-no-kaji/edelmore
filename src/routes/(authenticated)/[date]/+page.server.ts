import { formatDisplayDate, isValidDate, todayIso } from '$lib/dates.js';
import { getEntry, listEntryDates, listEntryDatesWithPreview } from '$lib/db.js';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!isValidDate(params.date)) redirect(302, `/${todayIso()}`);

  // biome-ignore lint/style/noNonNullAssertion: layout guard guarantees user is present
  const userId = locals.user!.id;
  const entry = getEntry(locals.db, userId, params.date);

  // prevDate/nextDate are adjacent diary entries, not calendar days.
  // listEntryDates returns DESC (most recent first). idx === -1 means no entry for this date.
  const dates = listEntryDates(locals.db, userId);
  const idx = dates.indexOf(params.date);
  const prevDate = idx === -1 ? null : idx < dates.length - 1 ? dates[idx + 1] : null;
  const nextDate = idx === -1 ? null : idx > 0 ? dates[idx - 1] : null;

  const entryDatePreviews = listEntryDatesWithPreview(locals.db, userId, { ascending: true });

  return {
    date: params.date,
    displayDate: formatDisplayDate(params.date),
    content: entry?.content ?? '',
    prevDate,
    nextDate,
    entryDatePreviews,
  };
};
