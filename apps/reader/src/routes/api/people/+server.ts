import { getOrCreatePerson, getPersonByName, listPeople } from '$lib/db.js';
import { parsePersonName } from '$lib/validate.js';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** The shared household roster, name-sorted. No auth — everyone sees everyone. */
export const GET: RequestHandler = async ({ locals }) => {
  return json({
    people: listPeople(locals.db).map((p) => ({ id: p.id, name: p.name })),
  });
};

/**
 * Add (or return) a person by name: `{ name }`. Idempotent by name
 * (`people.name UNIQUE`, case/whitespace dedup is the DB's job) — 201 when
 * the name is new to the household, 200 when it already existed, mirroring
 * the EPUB-upload idempotent-create idiom.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const body = (await request.json()) as { name?: unknown };
  const name = parsePersonName(body.name);
  if (!name) error(400, "'name' must be a name of 1-40 characters");

  const existed = Boolean(getPersonByName(locals.db, name));
  const person = getOrCreatePerson(locals.db, name);
  return json({ id: person.id, name: person.name }, { status: existed ? 200 : 201 });
};
