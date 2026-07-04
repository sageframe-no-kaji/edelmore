import {
  addBookmark,
  deleteOwnBookmark,
  getBook,
  getOrCreatePerson,
  getPersonByName,
  listBookmarks,
} from '$lib/db.js';
import { readBookJson } from '$lib/storage.js';
import { type Spot, parsePersonName, parseSpot } from '$lib/validate.js';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** All dog-ears in this book, everyone's — a book can hold someone else's bookmark. */
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!getBook(locals.db, params.id)) error(404, 'No such book');
  return json({
    bookmarks: listBookmarks(locals.db, params.id).map((b) => ({
      person: b.person_name,
      chapterIdx: b.chapter_idx,
      charOffset: b.char_offset,
      createdAt: b.created_at,
    })),
  });
};

/** Shared body validation for POST and DELETE: person name + in-book spot. */
async function validatedRequest(
  locals: App.Locals,
  bookId: string,
  request: Request
): Promise<{ person: string; spot: Spot }> {
  if (!getBook(locals.db, bookId)) error(404, 'No such book');
  const body = (await request.json()) as {
    person?: unknown;
    chapterIdx?: unknown;
    charOffset?: unknown;
  };
  const person = parsePersonName(body.person);
  if (!person) error(400, "'person' must be a name of 1-40 characters");
  const book = await readBookJson(locals.dataDir, bookId);
  const spot = parseSpot(book, body.chapterIdx, body.charOffset);
  if (!spot) error(400, 'chapterIdx/charOffset out of bounds for this book');
  return { person, spot };
}

/** Fold a corner: `{ person, chapterIdx, charOffset }`. Refolding is a no-op. */
export const POST: RequestHandler = async ({ params, request, locals }) => {
  const { person, spot } = await validatedRequest(locals, params.id, request);
  const row = getOrCreatePerson(locals.db, person);
  addBookmark(locals.db, row.id, params.id, spot.chapterIdx, spot.charOffset);
  return json({ ok: true }, { status: 201 });
};

/**
 * Unfold a corner — the one attribution rule that IS enforced: deletion is
 * keyed on the named person's own row, so it can only ever remove that
 * person's dog-ear. Someone else's dog-ear at the same spot is untouchable
 * (and unknown names own nothing).
 */
export const DELETE: RequestHandler = async ({ params, request, locals }) => {
  const { person, spot } = await validatedRequest(locals, params.id, request);
  const row = getPersonByName(locals.db, person);
  const removed = row
    ? deleteOwnBookmark(locals.db, row.id, params.id, spot.chapterIdx, spot.charOffset)
    : 0;
  if (removed === 0) error(404, 'No dog-ear of yours at that spot');
  return json({ ok: true });
};
