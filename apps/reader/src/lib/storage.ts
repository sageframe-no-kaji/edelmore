/**
 * On-disk layout for the household library, under a configurable data dir:
 *
 *   <dataDir>/books/<book_id>/original.epub   — the uploaded bytes, retained
 *   <dataDir>/books/<book_id>/book.json       — the NormalizedBook the renderer reads
 *   <dataDir>/books/<book_id>/images/<href>   — extracted plates + cover, keyed by
 *                                               zip-internal href (PlateRef.href)
 *
 * The DB (db.ts) holds metadata and reading state only — this directory is the
 * source of truth for content. `<dataDir>` is gitignored (`data/` in the repo
 * root .gitignore); in production it is a ZFS dataset, diary pattern.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { NormalizedBook } from './epub/model.js';

export function bookDir(dataDir: string, bookId: string): string {
  return join(dataDir, 'books', bookId);
}

export function originalPath(dataDir: string, bookId: string): string {
  return join(bookDir(dataDir, bookId), 'original.epub');
}

export function bookJsonPath(dataDir: string, bookId: string): string {
  return join(bookDir(dataDir, bookId), 'book.json');
}

/**
 * Where an image href lands on disk. The parser normalizes hrefs to
 * zip-internal paths that cannot climb out of the archive, but disk layout is
 * where an escape would do damage — so containment is re-checked here rather
 * than trusted.
 */
export function imagePath(dataDir: string, bookId: string, href: string): string {
  const root = join(bookDir(dataDir, bookId), 'images');
  const path = join(root, href);
  if (!resolve(path).startsWith(resolve(root) + sep)) {
    throw new Error(`image href escapes the book's images directory: ${href}`);
  }
  return path;
}

/**
 * Write all disk artifacts for one book: the original EPUB, the normalized
 * JSON, and the extracted image bytes (keyed by zip-internal href).
 * Ingestion calls this BEFORE inserting any DB row — see ingest.ts.
 */
export async function writeBookArtifacts(
  dataDir: string,
  book: NormalizedBook,
  original: Uint8Array,
  images: Map<string, Uint8Array>
): Promise<void> {
  const dir = bookDir(dataDir, book.id);
  await mkdir(dir, { recursive: true });
  await writeFile(originalPath(dataDir, book.id), original);
  await writeFile(bookJsonPath(dataDir, book.id), JSON.stringify(book));
  for (const [href, data] of images) {
    const path = imagePath(dataDir, book.id, href);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }
}

/** The parsed normalized book — validation reads chapter bounds from this. */
export async function readBookJson(dataDir: string, bookId: string): Promise<NormalizedBook> {
  return JSON.parse(await readFile(bookJsonPath(dataDir, bookId), 'utf8')) as NormalizedBook;
}

/**
 * Verbatim book.json text for the GET /api/books/[id] response — served from
 * disk without a parse/re-stringify round trip. The DB never holds chapter
 * text. (Text rather than bytes: `Response` accepts strings directly, and
 * book.json is UTF-8 by construction.)
 */
export async function readBookJsonText(dataDir: string, bookId: string): Promise<string> {
  return readFile(bookJsonPath(dataDir, bookId), 'utf8');
}

/** Remove a book's directory entirely. Used by ingestion failure cleanup. */
export async function removeBookDir(dataDir: string, bookId: string): Promise<void> {
  await rm(bookDir(dataDir, bookId), { recursive: true, force: true });
}
