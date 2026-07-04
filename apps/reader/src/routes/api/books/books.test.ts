import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Database, createDb, getBook, getOrCreatePerson, upsertPosition } from '$lib/db.js';
import { minimalBook, notAZip } from '$lib/epub/fixtures.js';
import { ingestEpub } from '$lib/ingest.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET, POST } from './+server.js';

function makeUpload(bytes: Uint8Array | null, addedBy?: unknown): FormData {
  const form = new FormData();
  if (bytes) {
    // .slice() re-types the view as Uint8Array<ArrayBuffer>, which BlobPart requires.
    form.set('file', new File([bytes.slice()], 'book.epub', { type: 'application/epub+zip' }));
  }
  if (addedBy !== undefined) form.set('addedBy', String(addedBy));
  return form;
}

describe('/api/books', () => {
  let db: Database;
  let dataDir: string;

  beforeEach(async () => {
    db = createDb(':memory:');
    dataDir = await mkdtemp(join(tmpdir(), 'reader-books-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  function makeEvent(form?: FormData) {
    return {
      locals: { db, dataDir },
      request: {
        formData: async () => {
          if (!form) throw new Error('not multipart');
          return form;
        },
      },
    };
  }

  describe('POST (upload)', () => {
    it('ingests an EPUB and returns 201 with the content-hash id', async () => {
      const res = await POST(makeEvent(makeUpload(await minimalBook(), 'Iona')) as any);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.created).toBe(true);
      expect(getBook(db, body.id)?.title).toBe('The Fixture Book');
    });

    it('re-uploading the same book returns 200 with the existing id', async () => {
      const bytes = await minimalBook();
      const first = await (await POST(makeEvent(makeUpload(bytes, 'Iona')) as any)).json();
      const res = await POST(makeEvent(makeUpload(bytes, 'Marlowe')) as any);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: first.id, created: false });
    });

    it('returns 400 when the body is not multipart form data', async () => {
      await expect(POST(makeEvent(undefined) as any)).rejects.toMatchObject({ status: 400 });
    });

    it("returns 400 when 'file' is missing or not a file", async () => {
      await expect(POST(makeEvent(makeUpload(null, 'Iona')) as any)).rejects.toMatchObject({
        status: 400,
      });
      const form = makeUpload(null, 'Iona');
      form.set('file', 'just a string');
      await expect(POST(makeEvent(form) as any)).rejects.toMatchObject({ status: 400 });
    });

    it("returns 400 for a missing, empty, or over-long 'addedBy'", async () => {
      const bytes = await minimalBook();
      await expect(POST(makeEvent(makeUpload(bytes)) as any)).rejects.toMatchObject({
        status: 400,
      });
      await expect(POST(makeEvent(makeUpload(bytes, '  ')) as any)).rejects.toMatchObject({
        status: 400,
      });
      await expect(POST(makeEvent(makeUpload(bytes, 'a'.repeat(41))) as any)).rejects.toMatchObject(
        { status: 400 }
      );
    });

    it('maps EpubParseError to a 400 with the failing stage', async () => {
      await expect(POST(makeEvent(makeUpload(notAZip(), 'Iona')) as any)).rejects.toMatchObject({
        status: 400,
        body: { message: expect.stringContaining('Not a readable EPUB') },
      });
    });

    it('lets non-parse failures propagate as server errors', async () => {
      // A data dir that cannot be created (its parent path is this test file's
      // temp dir plus a file-shaped segment) fails at the disk-write stage.
      const event = {
        locals: { db, dataDir: join(dataDir, 'nope\0bad') },
        request: { formData: async () => makeUpload(await minimalBook(), 'Iona') },
      };
      let caught: unknown;
      try {
        await POST(event as any);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as { status?: number }).status).toBeUndefined();
    });
  });

  describe('GET (library list)', () => {
    it('returns an empty shelf for an empty library', async () => {
      const res = await GET(makeEvent() as any);
      expect(await res.json()).toEqual({ books: [] });
    });

    it('lists books with attribution and every person’s position', async () => {
      const { id } = await ingestEpub(db, dataDir, await minimalBook(), 'Iona');
      upsertPosition(db, getOrCreatePerson(db, 'Iona').id, id, 0, 12);
      upsertPosition(db, getOrCreatePerson(db, 'Marlowe').id, id, 1, 3);

      const body = await (await GET(makeEvent() as any)).json();
      expect(body.books).toHaveLength(1);
      expect(body.books[0]).toMatchObject({
        id,
        title: 'The Fixture Book',
        author: 'A. Fixture',
        cover: 'OEBPS/images/cover.png',
        addedBy: 'Iona',
      });
      expect(body.books[0].positions).toEqual([
        expect.objectContaining({ person: 'Iona', chapterIdx: 0, charOffset: 12 }),
        expect.objectContaining({ person: 'Marlowe', chapterIdx: 1, charOffset: 3 }),
      ]);
    });
  });
});
