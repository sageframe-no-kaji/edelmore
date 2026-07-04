import { listBooks, listPositions } from '$lib/db.js';
import { EpubParseError } from '$lib/epub/parse.js';
import { ingestEpub } from '$lib/ingest.js';
import { parsePersonName } from '$lib/validate.js';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** The whole household shelf: every book, with every person's position on it. */
export const GET: RequestHandler = async ({ locals }) => {
  const books = listBooks(locals.db).map((book) => ({
    id: book.id,
    title: book.title,
    author: book.author,
    cover: book.cover_image,
    addedBy: book.added_by_name,
    positions: listPositions(locals.db, book.id).map((p) => ({
      person: p.person_name,
      chapterIdx: p.chapter_idx,
      charOffset: p.char_offset,
      updatedAt: p.updated_at,
    })),
  }));
  return json({ books });
};

/** Multipart EPUB upload: fields `file` (the EPUB) and `addedBy` (ex-libris name). */
export const POST: RequestHandler = async ({ request, locals }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    error(400, 'Expected multipart form data');
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    error(400, "Upload the EPUB as a 'file' field");
  }
  const addedBy = parsePersonName(form.get('addedBy'));
  if (!addedBy) {
    error(400, "'addedBy' must be a name of 1-40 characters");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const result = await ingestEpub(locals.db, locals.dataDir, bytes, addedBy);
    return json(result, { status: result.created ? 201 : 200 });
  } catch (err) {
    if (err instanceof EpubParseError) {
      error(400, `Not a readable EPUB: ${err.message}`);
    }
    throw err;
  }
};
