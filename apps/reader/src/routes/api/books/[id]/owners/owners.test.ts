import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Database, createDb, getBook } from '$lib/db.js';
import { minimalBook } from '$lib/epub/fixtures.js';
import { ingestEpub } from '$lib/ingest.js';
import { bookDir } from '$lib/storage.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as marksGet } from '../marks/+server.js';
import { DELETE, GET, POST } from './+server.js';

describe('/api/books/[id]/owners', () => {
  let db: Database;
  let dataDir: string;
  let bookId: string;

  beforeEach(async () => {
    db = createDb(':memory:');
    dataDir = await mkdtemp(join(tmpdir(), 'reader-owners-'));
    bookId = (await ingestEpub(db, dataDir, await minimalBook(), 'Iona')).id;
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  function makeEvent(id: string, body?: unknown) {
    return {
      params: { id },
      locals: { db, dataDir },
      request: { json: async () => body },
    };
  }

  async function owners(): Promise<unknown[]> {
    return (await (await GET(makeEvent(bookId) as any)).json()).owners;
  }

  it('GET/POST/DELETE return 404 for an unknown book', async () => {
    const body = { person: 'Marlowe' };
    await expect(GET(makeEvent('nope') as any)).rejects.toMatchObject({ status: 404 });
    await expect(POST(makeEvent('nope', body) as any)).rejects.toMatchObject({ status: 404 });
    await expect(DELETE(makeEvent('nope', body) as any)).rejects.toMatchObject({ status: 404 });
  });

  it('GET shows the original (uploader) as owner, `original` coerced to a real boolean', async () => {
    expect(await owners()).toEqual([{ person: 'Iona', original: true }]);
  });

  it('POST adopts: a second owner joins, non-original, and both coexist', async () => {
    const res = await POST(makeEvent(bookId, { person: 'Marlowe' }) as any);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });

    expect(await owners()).toEqual([
      { person: 'Iona', original: true },
      { person: 'Marlowe', original: false },
    ]);
  });

  it('adopting drops a persistent dog-ear at the book’s start, observable via GET /marks', async () => {
    await POST(makeEvent(bookId, { person: 'Marlowe' }) as any);
    const marks = await (await marksGet(makeEvent(bookId) as any)).json();
    expect(marks.marks).toEqual([
      expect.objectContaining({
        person: 'Marlowe',
        chapterIdx: 0,
        charOffset: 0,
        kind: 'dog-ear',
      }),
    ]);
  });

  it('adopting a book already owned is a no-op (idempotent claim)', async () => {
    await POST(makeEvent(bookId, { person: 'Marlowe' }) as any);
    await POST(makeEvent(bookId, { person: 'Marlowe' }) as any);
    expect(await owners()).toHaveLength(2);
  });

  it('POST validates the person name with 400', async () => {
    await expect(POST(makeEvent(bookId, { person: '' }) as any)).rejects.toMatchObject({
      status: 400,
    });
    await expect(POST(makeEvent(bookId, { person: 'a'.repeat(41) }) as any)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('DELETE releases the requester’s own claim without touching the other owner’s', async () => {
    await POST(makeEvent(bookId, { person: 'Marlowe' }) as any);
    const res = await DELETE(makeEvent(bookId, { person: 'Marlowe' }) as any);
    expect(await res.json()).toEqual({ ok: true, bookDeleted: false });
    expect(await owners()).toEqual([{ person: 'Iona', original: true }]);
  });

  it('the last release deletes the book (bookDeleted: true) and its GET 404s afterward', async () => {
    const res = await DELETE(makeEvent(bookId, { person: 'Iona' }) as any);
    expect(await res.json()).toEqual({ ok: true, bookDeleted: true });
    expect(getBook(db, bookId)).toBeUndefined();
    await expect(GET(makeEvent(bookId) as any)).rejects.toMatchObject({ status: 404 });
  });

  it('the last release also removes the on-disk books/<id>/ directory', async () => {
    await stat(bookDir(dataDir, bookId)); // exists beforehand
    await DELETE(makeEvent(bookId, { person: 'Iona' }) as any);
    await expect(stat(bookDir(dataDir, bookId))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('a non-last release leaves the on-disk directory alone', async () => {
    await POST(makeEvent(bookId, { person: 'Marlowe' }) as any);
    await DELETE(makeEvent(bookId, { person: 'Marlowe' }) as any);
    await stat(bookDir(dataDir, bookId)); // still present — does not throw
  });

  it('releasing a book you don’t own 404s and changes nothing (name never seen)', async () => {
    await expect(DELETE(makeEvent(bookId, { person: 'Stranger' }) as any)).rejects.toMatchObject({
      status: 404,
    });
    expect(await owners()).toEqual([{ person: 'Iona', original: true }]);
  });

  it('releasing a book you don’t own 404s even when the person is known elsewhere', async () => {
    // A known name (attributed on some position/mark somewhere), but never an
    // owner of THIS book — the "you don't own this" 404 must still hold, not
    // just the "never heard of you" case above.
    await POST(makeEvent(bookId, { person: 'Marlowe' }) as any); // owns bookId
    await DELETE(makeEvent(bookId, { person: 'Marlowe' }) as any); // releases it — still a known person
    await expect(DELETE(makeEvent(bookId, { person: 'Marlowe' }) as any)).rejects.toMatchObject({
      status: 404,
    });
    expect(await owners()).toEqual([{ person: 'Iona', original: true }]);
  });

  it('DELETE validates the person name with 400', async () => {
    await expect(DELETE(makeEvent(bookId, { person: '' }) as any)).rejects.toMatchObject({
      status: 400,
    });
  });
});
