import { getBook } from '$lib/db.js';
import { readBookJsonText } from '$lib/storage.js';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * The normalized book the renderer reads — served straight from book.json on
 * disk. The DB is consulted only to 404 unknown ids; it never holds chapter
 * text.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!getBook(locals.db, params.id)) error(404, 'No such book');
  const raw = await readBookJsonText(locals.dataDir, params.id);
  return new Response(raw, {
    headers: { 'content-type': 'application/json' },
  });
};
