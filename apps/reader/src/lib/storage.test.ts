import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NormalizedBook } from './epub/model.js';
import {
  bookDir,
  bookJsonPath,
  imagePath,
  originalPath,
  readBookJson,
  readBookJsonText,
  removeBookDir,
  writeBookArtifacts,
} from './storage.js';

const BOOK: NormalizedBook = {
  id: 'hash-1',
  title: 'The Fixture Book',
  author: 'A. Fixture',
  language: 'en',
  coverImage: 'images/cover.png',
  chapters: [{ idx: 0, title: 'Chapter One', text: 'Hello.', emphasis: [], images: [] }],
};

describe('storage layout', () => {
  it('lays books out under <dataDir>/books/<id>/', () => {
    expect(bookDir('/data', 'abc')).toBe('/data/books/abc');
    expect(originalPath('/data', 'abc')).toBe('/data/books/abc/original.epub');
    expect(bookJsonPath('/data', 'abc')).toBe('/data/books/abc/book.json');
    expect(imagePath('/data', 'abc', 'images/cover.png')).toBe(
      '/data/books/abc/images/images/cover.png'
    );
  });

  it('rejects image hrefs that escape the images directory', () => {
    expect(() => imagePath('/data', 'abc', '../../escape.png')).toThrow(/escapes/);
    expect(() => imagePath('/data', 'abc', '../book.json')).toThrow(/escapes/);
  });
});

describe('writeBookArtifacts / read back', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'reader-storage-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('writes original, book.json, and nested image files', async () => {
    const original = new Uint8Array([1, 2, 3]);
    const images = new Map([['images/deep/cover.png', new Uint8Array([9, 9])]]);
    await writeBookArtifacts(dataDir, BOOK, original, images);

    expect(new Uint8Array(await readFile(originalPath(dataDir, BOOK.id)))).toEqual(original);
    expect(await readBookJson(dataDir, BOOK.id)).toEqual(BOOK);
    expect(
      new Uint8Array(await readFile(imagePath(dataDir, BOOK.id, 'images/deep/cover.png')))
    ).toEqual(new Uint8Array([9, 9]));
  });

  it('readBookJsonText returns the verbatim text of book.json', async () => {
    await writeBookArtifacts(dataDir, BOOK, new Uint8Array([1]), new Map());
    const raw = await readBookJsonText(dataDir, BOOK.id);
    expect(raw).toBe(JSON.stringify(BOOK));
  });

  it('removeBookDir deletes everything and tolerates a missing dir', async () => {
    await writeBookArtifacts(dataDir, BOOK, new Uint8Array([1]), new Map());
    await removeBookDir(dataDir, BOOK.id);
    await expect(stat(bookDir(dataDir, BOOK.id))).rejects.toMatchObject({ code: 'ENOENT' });
    // force: true — removing again is a no-op, not an error.
    await expect(removeBookDir(dataDir, BOOK.id)).resolves.toBeUndefined();
  });
});
