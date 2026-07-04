import { getBook, getOrCreatePerson, listPositions, upsertPosition } from '$lib/db.js';
import { readBookJson } from '$lib/storage.js';
import { parsePersonName, parseSpot } from '$lib/validate.js';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Every person's position in this book — shared visibility, attributed. */
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!getBook(locals.db, params.id)) error(404, 'No such book');
  return json({
    positions: listPositions(locals.db, params.id).map((p) => ({
      person: p.person_name,
      chapterIdx: p.chapter_idx,
      charOffset: p.char_offset,
      updatedAt: p.updated_at,
    })),
  });
};

/** Upsert one person's position: `{ person, chapterIdx, charOffset }`. */
export const PUT: RequestHandler = async ({ params, request, locals }) => {
  if (!getBook(locals.db, params.id)) error(404, 'No such book');

  const body = (await request.json()) as {
    person?: unknown;
    chapterIdx?: unknown;
    charOffset?: unknown;
  };
  const person = parsePersonName(body.person);
  if (!person) error(400, "'person' must be a name of 1-40 characters");

  // Bounds come from the normalized book on disk — the DB holds no chapter text.
  const book = await readBookJson(locals.dataDir, params.id);
  const spot = parseSpot(book, body.chapterIdx, body.charOffset);
  if (!spot) error(400, 'chapterIdx/charOffset out of bounds for this book');

  const row = getOrCreatePerson(locals.db, person);
  upsertPosition(locals.db, row.id, params.id, spot.chapterIdx, spot.charOffset);
  return json({ ok: true });
};
