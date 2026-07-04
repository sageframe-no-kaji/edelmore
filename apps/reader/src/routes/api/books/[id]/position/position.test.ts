import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Database, createDb } from '$lib/db.js';
import { minimalBook } from '$lib/epub/fixtures.js';
import { ingestEpub } from '$lib/ingest.js';
import { readBookJson } from '$lib/storage.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET, PUT } from './+server.js';

describe('/api/books/[id]/position', () => {
  let db: Database;
  let dataDir: string;
  let bookId: string;
  /** Length of chapter 0's text — the offset upper bound. */
  let ch0Length: number;

  beforeEach(async () => {
    db = createDb(':memory:');
    dataDir = await mkdtemp(join(tmpdir(), 'reader-position-'));
    bookId = (await ingestEpub(db, dataDir, await minimalBook(), 'Iona')).id;
    ch0Length = (await readBookJson(dataDir, bookId)).chapters[0].text.length;
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

  it('GET returns 404 for an unknown book', async () => {
    await expect(GET(makeEvent('no-such-hash') as any)).rejects.toMatchObject({ status: 404 });
  });

  it('PUT returns 404 for an unknown book', async () => {
    await expect(
      PUT(makeEvent('no-such-hash', { person: 'Iona', chapterIdx: 0, charOffset: 0 }) as any)
    ).rejects.toMatchObject({ status: 404 });
  });

  it('GET returns an empty list before anyone has read', async () => {
    expect(await (await GET(makeEvent(bookId) as any)).json()).toEqual({ positions: [] });
  });

  it('PUT upserts and GET shows every person’s position', async () => {
    const put = await PUT(
      makeEvent(bookId, { person: 'Iona', chapterIdx: 0, charOffset: 5 }) as any
    );
    expect(await put.json()).toEqual({ ok: true });
    await PUT(makeEvent(bookId, { person: 'Marlowe', chapterIdx: 1, charOffset: 2 }) as any);

    const body = await (await GET(makeEvent(bookId) as any)).json();
    expect(body.positions).toEqual([
      expect.objectContaining({ person: 'Iona', chapterIdx: 0, charOffset: 5 }),
      expect.objectContaining({ person: 'Marlowe', chapterIdx: 1, charOffset: 2 }),
    ]);
  });

  it('PUT for the same person moves the position rather than adding one', async () => {
    await PUT(makeEvent(bookId, { person: 'Iona', chapterIdx: 0, charOffset: 5 }) as any);
    await PUT(makeEvent(bookId, { person: 'Iona', chapterIdx: 1, charOffset: 9 }) as any);
    const body = await (await GET(makeEvent(bookId) as any)).json();
    expect(body.positions).toEqual([
      expect.objectContaining({ person: 'Iona', chapterIdx: 1, charOffset: 9 }),
    ]);
  });

  it('PUT trims the person name (attribution label, not credential)', async () => {
    await PUT(makeEvent(bookId, { person: '  Iona ', chapterIdx: 0, charOffset: 0 }) as any);
    const body = await (await GET(makeEvent(bookId) as any)).json();
    expect(body.positions[0].person).toBe('Iona');
  });

  it('PUT accepts charOffset at the exact end of the chapter text', async () => {
    const res = await PUT(
      makeEvent(bookId, { person: 'Iona', chapterIdx: 0, charOffset: ch0Length }) as any
    );
    expect(await res.json()).toEqual({ ok: true });
  });

  it('PUT rejects an invalid person name with 400', async () => {
    for (const person of [undefined, '', '   ', 'a'.repeat(41), 7]) {
      await expect(
        PUT(makeEvent(bookId, { person, chapterIdx: 0, charOffset: 0 }) as any)
      ).rejects.toMatchObject({ status: 400 });
    }
  });

  it('PUT rejects out-of-bounds or non-integer spots with 400', async () => {
    const bad = [
      { chapterIdx: -1, charOffset: 0 },
      { chapterIdx: 99, charOffset: 0 },
      { chapterIdx: 0.5, charOffset: 0 },
      { chapterIdx: 0, charOffset: -1 },
      { chapterIdx: 0, charOffset: ch0Length + 1 },
      { chapterIdx: 0, charOffset: '3' },
    ];
    for (const spot of bad) {
      await expect(
        PUT(makeEvent(bookId, { person: 'Iona', ...spot }) as any)
      ).rejects.toMatchObject({ status: 400 });
    }
    expect((await (await GET(makeEvent(bookId) as any)).json()).positions).toEqual([]);
  });
});
