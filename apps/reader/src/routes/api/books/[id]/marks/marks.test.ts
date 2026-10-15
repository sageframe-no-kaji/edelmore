import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Database, createDb } from '$lib/db.js';
import { minimalBook } from '$lib/epub/fixtures.js';
import { ingestEpub } from '$lib/ingest.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DELETE, GET, POST } from './+server.js';

describe('/api/books/[id]/marks', () => {
  let db: Database;
  let dataDir: string;
  let bookId: string;

  beforeEach(async () => {
    db = createDb(':memory:');
    dataDir = await mkdtemp(join(tmpdir(), 'reader-marks-'));
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

  async function marks(): Promise<unknown[]> {
    return (await (await GET(makeEvent(bookId) as any)).json()).marks;
  }

  it('GET/POST/DELETE return 404 for an unknown book', async () => {
    const body = { person: 'Iona', chapterIdx: 0, charOffset: 3, kind: 'dog-ear' };
    await expect(GET(makeEvent('nope') as any)).rejects.toMatchObject({ status: 404 });
    await expect(POST(makeEvent('nope', body) as any)).rejects.toMatchObject({ status: 404 });
    await expect(DELETE(makeEvent('nope', body) as any)).rejects.toMatchObject({ status: 404 });
  });

  it('POST folds a corner and GET shows everyone’s marks, with kind', async () => {
    const res = await POST(
      makeEvent(bookId, { person: 'Iona', chapterIdx: 0, charOffset: 3, kind: 'dog-ear' }) as any
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    await POST(
      makeEvent(bookId, {
        person: 'Marlowe',
        chapterIdx: 1,
        charOffset: 6,
        kind: 'bookmark',
      }) as any
    );

    expect(await marks()).toEqual([
      expect.objectContaining({ person: 'Iona', chapterIdx: 0, charOffset: 3, kind: 'dog-ear' }),
      expect.objectContaining({
        person: 'Marlowe',
        chapterIdx: 1,
        charOffset: 6,
        kind: 'bookmark',
      }),
    ]);
  });

  it('a dog-ear and a bookmark can share the same spot — independent folds', async () => {
    const spot = { person: 'Iona', chapterIdx: 0, charOffset: 3 };
    await POST(makeEvent(bookId, { ...spot, kind: 'dog-ear' }) as any);
    await POST(makeEvent(bookId, { ...spot, kind: 'bookmark' }) as any);
    expect(await marks()).toHaveLength(2);
  });

  it('re-marking the same spot+kind is a no-op', async () => {
    const body = { person: 'Iona', chapterIdx: 0, charOffset: 3, kind: 'dog-ear' };
    await POST(makeEvent(bookId, body) as any);
    await POST(makeEvent(bookId, body) as any);
    expect(await marks()).toHaveLength(1);
  });

  it('POST rejects an unknown kind with 400 before it reaches the db', async () => {
    await expect(
      POST(
        makeEvent(bookId, {
          person: 'Iona',
          chapterIdx: 0,
          charOffset: 3,
          kind: 'highlight',
        }) as any
      )
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      POST(makeEvent(bookId, { person: 'Iona', chapterIdx: 0, charOffset: 3 }) as any)
    ).rejects.toMatchObject({ status: 400 });
    expect(await marks()).toEqual([]);
  });

  it('POST validates person and spot with 400', async () => {
    await expect(
      POST(makeEvent(bookId, { person: '', chapterIdx: 0, charOffset: 3, kind: 'dog-ear' }) as any)
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      POST(
        makeEvent(bookId, {
          person: 'Iona',
          chapterIdx: 99,
          charOffset: 0,
          kind: 'dog-ear',
        }) as any
      )
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      POST(
        makeEvent(bookId, {
          person: 'Iona',
          chapterIdx: 0,
          charOffset: 1e9,
          kind: 'dog-ear',
        }) as any
      )
    ).rejects.toMatchObject({ status: 400 });
  });

  it('DELETE removes one’s own mark of the given kind', async () => {
    const body = { person: 'Iona', chapterIdx: 0, charOffset: 3, kind: 'dog-ear' };
    await POST(makeEvent(bookId, body) as any);
    const res = await DELETE(makeEvent(bookId, body) as any);
    expect(await res.json()).toEqual({ ok: true });
    expect(await marks()).toEqual([]);
  });

  it('DELETE cannot touch someone else’s mark at the same spot+kind', async () => {
    await POST(
      makeEvent(bookId, {
        person: 'Iona',
        chapterIdx: 0,
        charOffset: 3,
        kind: 'dog-ear',
      }) as any
    );
    await expect(
      DELETE(
        makeEvent(bookId, {
          person: 'Marlowe',
          chapterIdx: 0,
          charOffset: 3,
          kind: 'dog-ear',
        }) as any
      )
    ).rejects.toMatchObject({ status: 404 });
    expect(await marks()).toHaveLength(1);
  });

  it('DELETE only removes the matching kind, not the other kind at the same spot', async () => {
    const spot = { person: 'Iona', chapterIdx: 0, charOffset: 3 };
    await POST(makeEvent(bookId, { ...spot, kind: 'dog-ear' }) as any);
    await POST(makeEvent(bookId, { ...spot, kind: 'bookmark' }) as any);
    await DELETE(makeEvent(bookId, { ...spot, kind: 'dog-ear' }) as any);
    expect(await marks()).toEqual([expect.objectContaining({ kind: 'bookmark' })]);
  });

  it('DELETE by a name the library has never seen finds nothing (and creates no row)', async () => {
    await POST(
      makeEvent(bookId, {
        person: 'Iona',
        chapterIdx: 0,
        charOffset: 3,
        kind: 'dog-ear',
      }) as any
    );
    await expect(
      DELETE(
        makeEvent(bookId, {
          person: 'Stranger',
          chapterIdx: 0,
          charOffset: 3,
          kind: 'dog-ear',
        }) as any
      )
    ).rejects.toMatchObject({ status: 404 });
  });

  it('DELETE rejects an unknown kind with 400', async () => {
    await POST(
      makeEvent(bookId, {
        person: 'Iona',
        chapterIdx: 0,
        charOffset: 3,
        kind: 'dog-ear',
      }) as any
    );
    await expect(
      DELETE(
        makeEvent(bookId, {
          person: 'Iona',
          chapterIdx: 0,
          charOffset: 3,
          kind: 'sticky-note',
        }) as any
      )
    ).rejects.toMatchObject({ status: 400 });
  });

  it('DELETE validates person and spot with 400', async () => {
    await expect(
      DELETE(
        makeEvent(bookId, {
          person: 'a'.repeat(41),
          chapterIdx: 0,
          charOffset: 3,
          kind: 'dog-ear',
        }) as any
      )
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      DELETE(
        makeEvent(bookId, {
          person: 'Iona',
          chapterIdx: -1,
          charOffset: 3,
          kind: 'dog-ear',
        }) as any
      )
    ).rejects.toMatchObject({ status: 400 });
  });
});
