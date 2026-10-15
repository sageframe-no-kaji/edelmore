import {
  type MarkKind,
  addMark,
  deleteOwnMark,
  getBook,
  getOrCreatePerson,
  getPersonByName,
  listMarks,
} from '$lib/db.js';
import { readBookJson } from '$lib/storage.js';
import { type Spot, parseMarkKind, parsePersonName, parseSpot } from '$lib/validate.js';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Every mark in this book, everyone's — dog-ears (persistent) and bookmarks
 * (temporary) both, shared-visible (ex libris).
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!getBook(locals.db, params.id)) error(404, 'No such book');
  return json({
    marks: listMarks(locals.db, params.id).map((m) => ({
      person: m.person_name,
      chapterIdx: m.chapter_idx,
      charOffset: m.char_offset,
      kind: m.kind,
      createdAt: m.created_at,
    })),
  });
};

/**
 * Shared body validation for POST and DELETE: person name + a valid kind + an
 * in-book spot. `kind` is TypeScript-only in db.ts (no SQL CHECK) — this is
 * the gate that turns an unknown kind away with 400 before it ever reaches
 * `addMark`/`deleteOwnMark`.
 */
async function validatedRequest(
  locals: App.Locals,
  bookId: string,
  request: Request
): Promise<{ person: string; spot: Spot; kind: MarkKind }> {
  if (!getBook(locals.db, bookId)) error(404, 'No such book');
  const body = (await request.json()) as {
    person?: unknown;
    chapterIdx?: unknown;
    charOffset?: unknown;
    kind?: unknown;
  };
  const person = parsePersonName(body.person);
  if (!person) error(400, "'person' must be a name of 1-40 characters");
  const kind = parseMarkKind(body.kind);
  if (!kind) error(400, "'kind' must be 'dog-ear' or 'bookmark'");
  const book = await readBookJson(locals.dataDir, bookId);
  const spot = parseSpot(book, body.chapterIdx, body.charOffset);
  if (!spot) error(400, 'chapterIdx/charOffset out of bounds for this book');
  return { person, spot, kind };
}

/**
 * Make a mark: `{ person, chapterIdx, charOffset, kind }`. Marking the same
 * spot+kind again is a no-op (a dog-ear and a bookmark can share a spot —
 * they're independent folds).
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
  const { person, spot, kind } = await validatedRequest(locals, params.id, request);
  const row = getOrCreatePerson(locals.db, person);
  addMark(locals.db, row.id, params.id, spot.chapterIdx, spot.charOffset, kind);
  return json({ ok: true }, { status: 201 });
};

/**
 * Remove one's own mark — the one attribution rule that IS enforced: deletion
 * is keyed on the named person's own row, so it can only ever remove that
 * person's mark. Someone else's mark at the same spot+kind is untouchable
 * (and unknown names own nothing).
 */
export const DELETE: RequestHandler = async ({ params, request, locals }) => {
  const { person, spot, kind } = await validatedRequest(locals, params.id, request);
  const row = getPersonByName(locals.db, person);
  const removed = row
    ? deleteOwnMark(locals.db, row.id, params.id, spot.chapterIdx, spot.charOffset, kind)
    : 0;
  if (removed === 0) error(404, 'No mark of yours at that spot');
  return json({ ok: true });
};
