import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type Database,
  createDb,
  getBook,
  getOrCreatePerson,
  getPersonByName,
  insertBook,
  listBooks,
  listOwners,
} from './db.js';
import { buildEpub, minimalBook, notAZip, pngBytes } from './epub/fixtures.js';
import { EpubParseError, parseEpub } from './epub/parse.js';
import { ingestEpub } from './ingest.js';
import * as storage from './storage.js';
import { bookDir, bookJsonPath, imagePath, originalPath, readBookJson } from './storage.js';

// The concurrent-upload race (book row appears between the existence check and
// the insert) can't be produced with a synchronous in-process DB, so that one
// test substitutes writeBookArtifacts. Everything else uses the real module.
vi.mock('./storage.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./storage.js')>();
  return { ...actual, writeBookArtifacts: vi.fn(actual.writeBookArtifacts) };
});

describe('ingestEpub', () => {
  let db: Database;
  let dataDir: string;

  beforeEach(async () => {
    db = createDb(':memory:');
    dataDir = await mkdtemp(join(tmpdir(), 'reader-ingest-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('parses, stores disk artifacts, and inserts the attributed row', async () => {
    const bytes = await minimalBook();
    const result = await ingestEpub(db, dataDir, bytes, 'Iona');
    expect(result.created).toBe(true);

    const book = getBook(db, result.id);
    expect(book).toMatchObject({
      title: 'The Fixture Book',
      author: 'A. Fixture',
      language: 'en',
      cover_image: 'OEBPS/images/cover.png',
    });
    const owners = listOwners(db, result.id);
    expect(owners).toEqual([
      { person_id: getPersonByName(db, 'Iona')?.id, person_name: 'Iona', original: 1 },
    ]);

    // Disk artifacts: original bytes retained, book.json matches the parse,
    // cover + plate extracted under images/.
    expect(new Uint8Array(await readFile(originalPath(dataDir, result.id)))).toEqual(bytes);
    const normalized = await readBookJson(dataDir, result.id);
    expect(normalized).toEqual(await parseEpub(bytes));
    expect(
      new Uint8Array(await readFile(imagePath(dataDir, result.id, 'OEBPS/images/cover.png')))
    ).toEqual(pngBytes(1));
    expect(
      new Uint8Array(await readFile(imagePath(dataDir, result.id, 'OEBPS/images/plate1.png')))
    ).toEqual(pngBytes(2));
  });

  it('is idempotent by content hash: re-upload returns the existing id', async () => {
    const bytes = await minimalBook();
    const first = await ingestEpub(db, dataDir, bytes, 'Iona');
    const second = await ingestEpub(db, dataDir, bytes, 'Marlowe');
    expect(second).toEqual({ id: first.id, created: false });
    expect(listBooks(db)).toHaveLength(1);
    // The no-op re-upload creates no attribution row either.
    expect(getPersonByName(db, 'Marlowe')).toBeUndefined();
  });

  it('skips plate hrefs the archive does not contain', async () => {
    const bytes = await buildEpub({
      title: 'Ghost Plates',
      chapters: [{ href: 'c1.xhtml', body: '<p>Look <img src="images/ghost.png"/> away.</p>' }],
    });
    const result = await ingestEpub(db, dataDir, bytes, 'Iona');
    expect(result.created).toBe(true);
    expect(getBook(db, result.id)?.cover_image).toBeNull();
    await expect(
      stat(imagePath(dataDir, result.id, 'OEBPS/images/ghost.png'))
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('propagates EpubParseError for malformed uploads, touching nothing', async () => {
    await expect(ingestEpub(db, dataDir, notAZip(), 'Iona')).rejects.toBeInstanceOf(EpubParseError);
    expect(listBooks(db)).toHaveLength(0);
  });

  it('a failed disk write leaves no DB row', async () => {
    const bytes = await minimalBook();
    // Make the data dir unusable: a plain file where the directory tree must go.
    const blocked = join(dataDir, 'blocked');
    await writeFile(blocked, 'not a directory');
    await expect(ingestEpub(db, blocked, bytes, 'Iona')).rejects.toThrow();
    expect(listBooks(db)).toHaveLength(0);
  });

  it('a failed DB insert removes the partial book directory', async () => {
    const bytes = await minimalBook();
    db.exec(
      "CREATE TRIGGER block_books BEFORE INSERT ON books BEGIN SELECT RAISE(ABORT, 'blocked'); END"
    );
    await expect(ingestEpub(db, dataDir, bytes, 'Iona')).rejects.toThrow(/blocked/);
    expect(listBooks(db)).toHaveLength(0);
    const { id } = await parseEpub(bytes);
    await expect(stat(bookDir(dataDir, id))).rejects.toMatchObject({ code: 'ENOENT' });
    // The transaction rolled the attribution row back with the book row.
    expect(getPersonByName(db, 'Iona')).toBeUndefined();
  });

  it('yields to a concurrent upload that wins the insert race', async () => {
    const bytes = await minimalBook();
    const parsed = await parseEpub(bytes);
    vi.mocked(storage.writeBookArtifacts).mockImplementationOnce(async () => {
      // Simulate the racing upload completing while our disk write is in flight.
      const person = getOrCreatePerson(db, 'Marlowe');
      insertBook(
        db,
        {
          id: parsed.id,
          title: parsed.title,
          author: parsed.author,
          language: parsed.language,
          cover_image: parsed.coverImage,
        },
        person.id
      );
      throw new Error('simulated interleaving');
    });

    const result = await ingestEpub(db, dataDir, bytes, 'Iona');
    expect(result).toEqual({ id: parsed.id, created: false });
    // The winner's row (and its disk artifacts) are left untouched.
    expect(listOwners(db, parsed.id)).toEqual([
      {
        person_id: getPersonByName(db, 'Marlowe')?.id,
        person_name: 'Marlowe',
        original: 1,
      },
    ]);
    await expect(stat(bookJsonPath(dataDir, parsed.id))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
