/**
 * Upload → parse → store: turns EPUB bytes into a shelved household book.
 *
 * Idempotent by content hash: the book id IS the sha256 of the bytes, so
 * re-uploading the same book is a no-op that returns the existing id.
 *
 * Failure ordering (spec change 4): disk is written FIRST, the DB row is
 * inserted after, and any failure removes the partial book directory. A
 * failed disk write therefore never leaves a DB row, and a failed insert
 * never leaves orphaned files — the DB row is the commit point.
 */

import { type Database, getBook, getOrCreatePerson, insertBook } from './db.js';
import type { NormalizedBook } from './epub/model.js';
import { extractImages, parseEpub } from './epub/parse.js';
import { removeBookDir, writeBookArtifacts } from './storage.js';

export interface IngestResult {
  /** The book id (content hash) — existing or newly created. */
  id: string;
  /** False when the book was already on the shelf (idempotent re-upload). */
  created: boolean;
}

/**
 * Ingest one EPUB into the library. `addedBy` is the ex-libris attribution —
 * a person name, created in `people` on first sight (no auth; the identity
 * mechanic is an open Kamae question).
 *
 * Throws `EpubParseError` (from parse.ts) on malformed input; the upload
 * route maps that to a 400.
 */
export async function ingestEpub(
  db: Database,
  dataDir: string,
  bytes: Uint8Array,
  addedBy: string
): Promise<IngestResult> {
  const book = await parseEpub(bytes);
  if (getBook(db, book.id)) {
    return { id: book.id, created: false };
  }

  try {
    await writeBookArtifacts(dataDir, book, bytes, await referencedImages(book, bytes));
    // Transactional where it touches the DB: attribution row + book row
    // commit together or not at all (insertBook opens its own nested
    // transaction for the book + original-owner rows; better-sqlite3 nests
    // that as a savepoint inside this one).
    db.transaction(() => {
      const person = getOrCreatePerson(db, addedBy);
      insertBook(
        db,
        {
          id: book.id,
          title: book.title,
          author: book.author,
          language: book.language,
          cover_image: book.coverImage,
        },
        person.id
      );
    })();
  } catch (err) {
    // If a concurrent upload of the same bytes won the insert race, its disk
    // artifacts are identical to ours — leave them and report the existing id.
    if (getBook(db, book.id)) {
      return { id: book.id, created: false };
    }
    await removeBookDir(dataDir, book.id);
    throw err;
  }

  return { id: book.id, created: true };
}

/**
 * The image bytes the book actually references: the cover plus every
 * `PlateRef.href` anchored in a chapter. Hrefs the archive doesn't contain
 * (broken EPUBs reference missing files surprisingly often) are skipped —
 * the book stays readable without its plates.
 */
async function referencedImages(
  book: NormalizedBook,
  bytes: Uint8Array
): Promise<Map<string, Uint8Array>> {
  const available = await extractImages(bytes);
  const wanted = new Map<string, Uint8Array>();
  const keep = (href: string): void => {
    const data = available.get(href);
    if (data) wanted.set(href, data);
  };
  if (book.coverImage) keep(book.coverImage);
  for (const chapter of book.chapters) {
    for (const plate of chapter.images) keep(plate.href);
  }
  return wanted;
}
