import { formatDisplayDate, isValidDate, todayIso } from '$lib/dates.js';
import { getEntry, listEntryDates, listEntryDatesWithPreview } from '$lib/db.js';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const todayStr = todayIso();
  if (!isValidDate(params.date) || params.date > todayStr) redirect(302, `/${todayStr}`);

  // biome-ignore lint/style/noNonNullAssertion: layout guard guarantees user is present
  const userId = locals.user!.id;
  const entry = getEntry(locals.db, userId, params.date);

  // prevDate/nextDate are adjacent diary entries, not calendar days.
  // listEntryDates returns DESC (most recent first). idx === -1 means no entry for this date.
  const dates = listEntryDates(locals.db, userId);
  const idx = dates.indexOf(params.date);

  // For a date with no entry (idx === -1), find the nearest real entries before/after.
  const prevDate =
    idx === -1
      ? (dates.find((d) => d < params.date) ?? null)
      : idx < dates.length - 1
        ? dates[idx + 1]
        : null;
  // nextDate: the newer adjacent entry, or today if this is the most recent entry and today is later.
  const nextDate =
    idx === -1 ? null : idx > 0 ? dates[idx - 1] : params.date < todayStr ? todayStr : null;

  const entryDatePreviews = listEntryDatesWithPreview(locals.db, userId, { ascending: true });
  // Always include today so the blank page is accessible even before the first keystroke.
  if (!entryDatePreviews.find((e) => e.entry_date === todayStr)) {
    entryDatePreviews.push({ entry_date: todayStr, preview: '' });
  }

  return {
    date: params.date,
    displayDate: formatDisplayDate(params.date),
    content: entry?.content ?? '',
    prevDate,
    nextDate,
    entryDatePreviews,
  };
};
