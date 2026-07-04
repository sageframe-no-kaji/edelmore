import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Database, createDb } from '$lib/db.js';
import { minimalBook } from '$lib/epub/fixtures.js';
import { parseEpub } from '$lib/epub/parse.js';
import { ingestEpub } from '$lib/ingest.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET } from './+server.js';

describe('GET /api/books/[id]', () => {
  let db: Database;
  let dataDir: string;

  beforeEach(async () => {
    db = createDb(':memory:');
    dataDir = await mkdtemp(join(tmpdir(), 'reader-book-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  function makeEvent(id: string) {
    return { params: { id }, locals: { db, dataDir } };
  }

  it('returns 404 for a book that is not on the shelf', async () => {
    await expect(GET(makeEvent('no-such-hash') as any)).rejects.toMatchObject({ status: 404 });
  });

  it('serves the normalized book.json from disk', async () => {
    const bytes = await minimalBook();
    const { id } = await ingestEpub(db, dataDir, bytes, 'Iona');

    const res = await GET(makeEvent(id) as any);
    expect(res.headers.get('content-type')).toBe('application/json');
    // The response body IS the parse result — the round-trip the renderer relies on.
    expect(await res.json()).toEqual(await parseEpub(bytes));
  });
});
