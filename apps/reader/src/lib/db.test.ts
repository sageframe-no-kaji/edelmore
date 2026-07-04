import { beforeEach, describe, expect, it } from 'vitest';
import {
  type Database,
  addBookmark,
  applyColumnMigrations,
  applySchema,
  createDb,
  deleteOwnBookmark,
  getBook,
  getOrCreatePerson,
  getPersonByName,
  insertBook,
  listBookmarks,
  listBooks,
  listPositions,
  upsertPosition,
} from './db.js';

function freshDb(): Database {
  return createDb(':memory:');
}

function shelve(db: Database, id: string, title: string, personName = 'Iona'): void {
  const person = getOrCreatePerson(db, personName);
  insertBook(db, {
    id,
    title,
    author: 'A. Fixture',
    language: 'en',
    cover_image: 'images/cover.png',
    added_by: person.id,
  });
}

describe('createDb', () => {
  it('applies the pragmas and schema', () => {
    const db = freshDb();
    // ':memory:' ignores WAL and reports 'memory'; the pragma call itself must not throw.
    expect(db.pragma('journal_mode', { simple: true })).toBe('memory');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
        name: string;
      }[]
    ).map((t) => t.name);
    expect(tables).toEqual(
      expect.arrayContaining(['people', 'books', 'reading_positions', 'bookmarks'])
    );
  });

  it('applySchema is idempotent', () => {
    const db = freshDb();
    expect(() => applySchema(db)).not.toThrow();
  });

  it('enforces foreign keys on books.added_by', () => {
    const db = freshDb();
    expect(() =>
      insertBook(db, {
        id: 'x',
        title: 'Orphan',
        author: null,
        language: null,
        cover_image: null,
        added_by: 999,
      })
    ).toThrow(/FOREIGN KEY/);
  });
});

describe('applyColumnMigrations', () => {
  it('swallows only "duplicate column name" errors', () => {
    const db = freshDb();
    expect(() =>
      applyColumnMigrations(db, ["ALTER TABLE people ADD COLUMN name TEXT DEFAULT ''"])
    ).not.toThrow();
  });

  it('propagates any other failure', () => {
    const db = freshDb();
    expect(() => applyColumnMigrations(db, ['ALTER TABLE ghosts ADD COLUMN x TEXT'])).toThrow(
      /no such table/
    );
  });

  it('applies a genuinely new column', () => {
    const db = freshDb();
    applyColumnMigrations(db, ['ALTER TABLE people ADD COLUMN hat TEXT']);
    expect(() => db.prepare('SELECT hat FROM people').all()).not.toThrow();
  });
});

describe('people', () => {
  let db: Database;

  beforeEach(() => {
    db = freshDb();
  });

  it('getOrCreatePerson creates on first sight and reuses after', () => {
    const first = getOrCreatePerson(db, 'Iona');
    const second = getOrCreatePerson(db, 'Iona');
    expect(first.id).toBe(second.id);
    expect(second.name).toBe('Iona');
  });

  it('getPersonByName returns undefined for unknown names', () => {
    expect(getPersonByName(db, 'Nobody')).toBeUndefined();
    getOrCreatePerson(db, 'Iona');
    expect(getPersonByName(db, 'Iona')?.name).toBe('Iona');
  });
});

describe('books', () => {
  let db: Database;

  beforeEach(() => {
    db = freshDb();
  });

  it('insertBook + getBook round-trips metadata', () => {
    shelve(db, 'hash-1', 'The Fixture Book');
    const book = getBook(db, 'hash-1');
    expect(book).toMatchObject({
      id: 'hash-1',
      title: 'The Fixture Book',
      author: 'A. Fixture',
      language: 'en',
      cover_image: 'images/cover.png',
    });
  });

  it('getBook returns undefined for unknown ids', () => {
    expect(getBook(db, 'nope')).toBeUndefined();
  });

  it('listBooks joins the ex-libris name and sorts by title', () => {
    shelve(db, 'hash-b', 'zebra tales', 'Iona');
    shelve(db, 'hash-a', 'Apple Days', 'Marlowe');
    const books = listBooks(db);
    expect(books.map((b) => b.title)).toEqual(['Apple Days', 'zebra tales']);
    expect(books.map((b) => b.added_by_name)).toEqual(['Marlowe', 'Iona']);
  });

  it('rejects a duplicate book id (content hash is the primary key)', () => {
    shelve(db, 'hash-1', 'Once');
    expect(() => shelve(db, 'hash-1', 'Twice')).toThrow(/UNIQUE|PRIMARY/);
  });
});

describe('reading positions', () => {
  let db: Database;
  let iona: number;
  let marlowe: number;

  beforeEach(() => {
    db = freshDb();
    shelve(db, 'hash-1', 'The Fixture Book');
    iona = getOrCreatePerson(db, 'Iona').id;
    marlowe = getOrCreatePerson(db, 'Marlowe').id;
  });

  it('upserts one row per (person, book) and updates in place', () => {
    upsertPosition(db, iona, 'hash-1', 0, 10);
    upsertPosition(db, iona, 'hash-1', 2, 5);
    const positions = listPositions(db, 'hash-1');
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({ chapter_idx: 2, char_offset: 5, person_name: 'Iona' });
  });

  it('positions are shared-visible across persons, attributed', () => {
    upsertPosition(db, iona, 'hash-1', 0, 10);
    upsertPosition(db, marlowe, 'hash-1', 1, 3);
    const positions = listPositions(db, 'hash-1');
    expect(positions.map((p) => p.person_name)).toEqual(['Iona', 'Marlowe']);
  });

  it('scopes positions to the book', () => {
    shelve(db, 'hash-2', 'Another Book');
    upsertPosition(db, iona, 'hash-2', 0, 1);
    expect(listPositions(db, 'hash-1')).toHaveLength(0);
  });
});

describe('bookmarks (dog-ears)', () => {
  let db: Database;
  let iona: number;
  let marlowe: number;

  beforeEach(() => {
    db = freshDb();
    shelve(db, 'hash-1', 'The Fixture Book');
    iona = getOrCreatePerson(db, 'Iona').id;
    marlowe = getOrCreatePerson(db, 'Marlowe').id;
  });

  it('adds and lists dog-ears from everyone, in reading order', () => {
    addBookmark(db, marlowe, 'hash-1', 1, 4);
    addBookmark(db, iona, 'hash-1', 0, 9);
    const marks = listBookmarks(db, 'hash-1');
    expect(marks.map((b) => [b.person_name, b.chapter_idx, b.char_offset])).toEqual([
      ['Iona', 0, 9],
      ['Marlowe', 1, 4],
    ]);
  });

  it('refolding the same corner is a no-op', () => {
    addBookmark(db, iona, 'hash-1', 0, 9);
    addBookmark(db, iona, 'hash-1', 0, 9);
    expect(listBookmarks(db, 'hash-1')).toHaveLength(1);
  });

  it('two persons can dog-ear the same spot', () => {
    addBookmark(db, iona, 'hash-1', 0, 9);
    addBookmark(db, marlowe, 'hash-1', 0, 9);
    expect(listBookmarks(db, 'hash-1')).toHaveLength(2);
  });

  it('deleteOwnBookmark removes only the requester’s dog-ear', () => {
    addBookmark(db, iona, 'hash-1', 0, 9);
    addBookmark(db, marlowe, 'hash-1', 0, 9);
    expect(deleteOwnBookmark(db, iona, 'hash-1', 0, 9)).toBe(1);
    const remaining = listBookmarks(db, 'hash-1');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].person_name).toBe('Marlowe');
  });

  it('deleteOwnBookmark returns 0 when the dog-ear belongs to someone else', () => {
    addBookmark(db, marlowe, 'hash-1', 0, 9);
    expect(deleteOwnBookmark(db, iona, 'hash-1', 0, 9)).toBe(0);
    expect(listBookmarks(db, 'hash-1')).toHaveLength(1);
  });

  it('deleteOwnBookmark returns 0 for a spot with no dog-ear', () => {
    expect(deleteOwnBookmark(db, iona, 'hash-1', 5, 5)).toBe(0);
  });
});
