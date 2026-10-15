import {
  adoptBook,
  getBook,
  getOrCreatePerson,
  getPersonByName,
  listOwners,
  releaseOwnership,
} from '$lib/db.js';
import { removeBookDir } from '$lib/storage.js';
import { parsePersonName } from '$lib/validate.js';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Every owner of this book — original (ex-libris) first, then adopters. */
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!getBook(locals.db, params.id)) error(404, 'No such book');
  return json({
    // OwnerRow.original is a raw SQLite 0/1 (better-sqlite3 doesn't know
    // about booleans) — coerced to a real boolean at this wire boundary.
    owners: listOwners(locals.db, params.id).map((o) => ({
      person: o.person_name,
      original: Boolean(o.original),
    })),
  });
};

/**
 * Claim a book: `{ person }`. The one endpoint that creates an owner row —
 * `adoptBook` also drops a persistent dog-ear at the book's start (the
 * keeper's fold). Already an owner is a no-op.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
  if (!getBook(locals.db, params.id)) error(404, 'No such book');
  const body = (await request.json()) as { person?: unknown };
  const person = parsePersonName(body.person);
  if (!person) error(400, "'person' must be a name of 1-40 characters");

  const row = getOrCreatePerson(locals.db, person);
  adoptBook(locals.db, row.id, params.id);
  return json({ ok: true }, { status: 201 });
};

/**
 * Release the requester's own claim: `{ person }`. Own-only, generalized from
 * marks (ho-12 Decision 5) — releasing a book you don't own 404s rather than
 * silently succeeding, same discipline as an own-only mark deletion. When the
 * last owner releases, `releaseOwnership` cascades the DB rows and reports
 * `bookDeleted`; this endpoint is the layer allowed to compose DB and
 * storage (db.ts stays filesystem-free by design), so it also removes the
 * on-disk `books/<id>/` directory — the book id is a content hash, and a
 * stale directory would shadow a future re-upload of the same EPUB.
 */
export const DELETE: RequestHandler = async ({ params, request, locals }) => {
  if (!getBook(locals.db, params.id)) error(404, 'No such book');
  const body = (await request.json()) as { person?: unknown };
  const person = parsePersonName(body.person);
  if (!person) error(400, "'person' must be a name of 1-40 characters");

  const row = getPersonByName(locals.db, person);
  if (!row) error(404, 'You do not own this book');
  const isOwner = listOwners(locals.db, params.id).some((o) => o.person_id === row.id);
  if (!isOwner) error(404, 'You do not own this book');

  const { bookDeleted } = releaseOwnership(locals.db, row.id, params.id);
  if (bookDeleted) await removeBookDir(locals.dataDir, params.id);
  return json({ ok: true, bookDeleted });
};
