import type { NormalizedBook } from '$lib/epub/model.js';
import { type NumericRange, error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only pagination testbed — loads the normalized book straight from the
 * R-AT-03 API. The load runs on server and client alike; pagination itself is
 * client-only (it needs real layout), so the page renders a measuring state
 * under SSR.
 */
export const load: PageLoad = async ({ fetch, params }) => {
  const res = await fetch(`/api/books/${params.id}`);
  // !ok from our own API is always an error status; the cast just tells
  // TypeScript what fetch's wider `number` cannot.
  if (!res.ok) error(res.status as NumericRange<400, 599>, 'No such book');
  const book = (await res.json()) as NormalizedBook;
  return { book };
};
