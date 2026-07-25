import BetterSqlite3 from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type Database,
  type Person,
  addMark,
  adoptBook,
  applyColumnMigrations,
  applySchema,
  createDb,
  deleteOwnMark,
  getBook,
  getOrCreatePerson,
  getPersonByName,
  insertBook,
  listBooks,
  listMarks,
  listOwners,
  listPeople,
  listPositions,
  releaseOwnership,
  upsertPosition,
} from './db.js';

function freshDb(): Database {
  return createDb(':memory:');
}

/**
 * A DB built by hand in the pre-Ho-12 shape (`books.added_by`, a `bookmarks`
 * table) — a bare better-sqlite3 connection, not one that's been through the
 * current `applySchema`. Exercises the upgrade path against a family box that
 * already holds books.
 */
function legacyDb(): Database {
  const db = new BetterSqlite3(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE people (
      id         INTEGER PRIMARY KEY,
      name       TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE books (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      author      TEXT,
      language    TEXT,
      cover_image TEXT,
      added_by    INTEGER NOT NULL REFERENCES people(id),
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE reading_positions (
      person_id   INTEGER NOT NULL REFERENCES people(id),
      book_id     TEXT NOT NULL REFERENCES books(id),
      chapter_idx INTEGER NOT NULL,
      char_offset INTEGER NOT NULL,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (person_id, book_id)
    );

    CREATE TABLE bookmarks (
      id          INTEGER PRIMARY KEY,
      person_id   INTEGER NOT NULL REFERENCES people(id),
      book_id     TEXT NOT NULL REFERENCES books(id),
      chapter_idx INTEGER NOT NULL,
      char_offset INTEGER NOT NULL,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(person_id, book_id, chapter_idx, char_offset)
    );
  `);
  return db as unknown as Database;
}

/** Seeds one legacy-shaped book (with an added_by owner and one bookmark) directly via SQL. */
function seedLegacyBook(db: Database, bookId: string, personId: number, title: string): void {
  db.prepare('INSERT INTO books (id, title, added_by) VALUES (?, ?, ?)').run(
    bookId,
    title,
    personId
  );
  db.prepare(
    'INSERT INTO bookmarks (person_id, book_id, chapter_idx, char_offset) VALUES (?, ?, 0, 5)'
  ).run(personId, bookId);
}

function shelve(db: Database, id: string, title: string, personName = 'Iona'): Person {
  const person = getOrCreatePerson(db, personName);
  insertBook(
    db,
    {
      id,
      title,
      author: 'A. Fixture',
      language: 'en',
      cover_image: 'images/cover.png',
    },
    person.id
  );
  return person;
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
      expect.arrayContaining(['people', 'books', 'book_owners', 'reading_positions', 'place_marks'])
    );
    expect(tables).not.toContain('bookmarks');
  });

  it('creates place_marks with a kind column and books without added_by', () => {
    const db = freshDb();
    const bookCols = (db.pragma('table_info(books)') as { name: string }[]).map((c) => c.name);
    expect(bookCols).not.toContain('added_by');
    const markCols = (db.pragma('table_info(place_marks)') as { name: string }[]).map(
      (c) => c.name
    );
    expect(markCols).toContain('kind');
  });

  it('applySchema is idempotent', () => {
    const db = freshDb();
    expect(() => applySchema(db)).not.toThrow();
    expect(() => applySchema(db)).not.toThrow();
  });

  it('enforces foreign keys on the original owner', () => {
    const db = freshDb();
    expect(() =>
      insertBook(
        db,
        {
          id: 'x',
          title: 'Orphan',
          author: null,
          language: null,
          cover_image: null,
        },
        999
      )
    ).toThrow(/FOREIGN KEY/);
  });
});

describe('legacy migration (added_by + bookmarks -> book_owners + place_marks)', () => {
  it('backfills an original owner, renames bookmarks to place_marks with kind, and drops added_by', () => {
    const db = legacyDb();
    db.prepare('INSERT INTO people (id, name) VALUES (1, ?)').run('Iona');
    seedLegacyBook(db, 'hash-1', 1, 'Old Book');

    applySchema(db);

    const bookCols = (db.pragma('table_info(books)') as { name: string }[]).map((c) => c.name);
    expect(bookCols).not.toContain('added_by');

    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
        name: string;
      }[]
    ).map((t) => t.name);
    expect(tables).not.toContain('bookmarks');
    expect(tables).toContain('place_marks');

    expect(listOwners(db, 'hash-1')).toEqual([{ person_id: 1, person_name: 'Iona', original: 1 }]);
    expect(listMarks(db, 'hash-1')).toEqual([
      expect.objectContaining({
        person_id: 1,
        person_name: 'Iona',
        chapter_idx: 0,
        char_offset: 5,
        kind: 'dog-ear',
      }),
    ]);
  });

  it('is idempotent: a second applySchema on the upgraded DB changes nothing', () => {
    const db = legacyDb();
    db.prepare('INSERT INTO people (id, name) VALUES (1, ?)').run('Iona');
    seedLegacyBook(db, 'hash-1', 1, 'Old Book');

    applySchema(db);
    expect(() => applySchema(db)).not.toThrow();
    expect(listOwners(db, 'hash-1')).toHaveLength(1);
    expect(listMarks(db, 'hash-1')).toHaveLength(1);
  });

  it('upgrades a DB with no books cleanly (empty legacy DB)', () => {
    const db = legacyDb();
    expect(() => applySchema(db)).not.toThrow();
    expect(listPeople(db)).toEqual([]);
  });

  it('widens mark uniqueness so a dog-ear and a bookmark can share a spot after migration', () => {
    const db = legacyDb();
    db.prepare('INSERT INTO people (id, name) VALUES (1, ?)').run('Iona');
    seedLegacyBook(db, 'hash-1', 1, 'Old Book');
    applySchema(db);

    // The migrated row already holds the dog-ear at (0, 5); a bookmark at the
    // same spot must not collide with the pre-migration 4-column uniqueness.
    addMark(db, 1, 'hash-1', 0, 5, 'bookmark');
    expect(
      listMarks(db, 'hash-1')
        .map((m) => m.kind)
        .sort()
    ).toEqual(['bookmark', 'dog-ear']);
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

  it('listPeople returns the shared roster, name-sorted', () => {
    getOrCreatePerson(db, 'Marlowe');
    getOrCreatePerson(db, 'Iona');
    expect(listPeople(db).map((p) => p.name)).toEqual(['Iona', 'Marlowe']);
  });

  it('listPeople is empty when no one has been seen', () => {
    expect(listPeople(db)).toEqual([]);
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

  it('insertBook records the uploader as the original owner', () => {
    const iona = shelve(db, 'hash-1', 'The Fixture Book', 'Iona');
    expect(listOwners(db, 'hash-1')).toEqual([
      { person_id: iona.id, person_name: 'Iona', original: 1 },
    ]);
  });

  it('listBooks joins the original-owner (ex-libris) name and sorts by title', () => {
    shelve(db, 'hash-b', 'zebra tales', 'Iona');
    shelve(db, 'hash-a', 'Apple Days', 'Marlowe');
    const books = listBooks(db);
    expect(books.map((b) => b.title)).toEqual(['Apple Days', 'zebra tales']);
    expect(books.map((b) => b.original_owner_name)).toEqual(['Marlowe', 'Iona']);
  });

  it('rejects a duplicate book id (content hash is the primary key)', () => {
    shelve(db, 'hash-1', 'Once');
    expect(() => shelve(db, 'hash-1', 'Twice')).toThrow(/UNIQUE|PRIMARY/);
  });
});

describe('ownership', () => {
  let db: Database;
  let iona: number;
  let marlowe: number;
  const bookId = 'hash-1';

  beforeEach(() => {
    db = freshDb();
    iona = shelve(db, bookId, 'The Fixture Book', 'Iona').id;
    marlowe = getOrCreatePerson(db, 'Marlowe').id;
  });

  it('listOwners lists original-first, then name', () => {
    adoptBook(db, marlowe, bookId);
    expect(listOwners(db, bookId)).toEqual([
      { person_id: iona, person_name: 'Iona', original: 1 },
      { person_id: marlowe, person_name: 'Marlowe', original: 0 },
    ]);
  });

  it('adoptBook adds a non-original owner and a persistent dog-ear at (0, 0)', () => {
    adoptBook(db, marlowe, bookId);
    const marks = listMarks(db, bookId);
    expect(marks).toEqual([
      expect.objectContaining({
        person_id: marlowe,
        person_name: 'Marlowe',
        chapter_idx: 0,
        char_offset: 0,
        kind: 'dog-ear',
      }),
    ]);
  });

  it("adoption leaves the original owner's own mark untouched", () => {
    addMark(db, iona, bookId, 2, 40, 'bookmark');
    adoptBook(db, marlowe, bookId);
    const ionaMarks = listMarks(db, bookId).filter((m) => m.person_id === iona);
    expect(ionaMarks).toEqual([
      expect.objectContaining({
        person_id: iona,
        chapter_idx: 2,
        char_offset: 40,
        kind: 'bookmark',
      }),
    ]);
  });

  it('adoption never writes a reading_positions row', () => {
    adoptBook(db, marlowe, bookId);
    expect(listPositions(db, bookId)).toHaveLength(0);
  });

  it('re-adopting is a no-op on both the owner row and the dog-ear', () => {
    adoptBook(db, marlowe, bookId);
    adoptBook(db, marlowe, bookId);
    expect(listOwners(db, bookId)).toHaveLength(2);
    expect(listMarks(db, bookId)).toHaveLength(1);
  });
});

describe('reading/owning orthogonality', () => {
  it('reading a book (upsertPosition) never creates a book_owners row', () => {
    const db = freshDb();
    const iona = shelve(db, 'hash-1', 'The Fixture Book', 'Iona');
    const marlowe = getOrCreatePerson(db, 'Marlowe');

    upsertPosition(db, marlowe.id, 'hash-1', 0, 10);
    upsertPosition(db, marlowe.id, 'hash-1', 2, 5);

    expect(listPositions(db, 'hash-1')).toHaveLength(1);
    expect(listOwners(db, 'hash-1')).toEqual([
      { person_id: iona.id, person_name: 'Iona', original: 1 },
    ]);
  });
});

describe('releaseOwnership', () => {
  let db: Database;
  let iona: number;
  let marlowe: number;
  const bookId = 'hash-1';

  beforeEach(() => {
    db = freshDb();
    iona = shelve(db, bookId, 'The Fixture Book', 'Iona').id;
    marlowe = getOrCreatePerson(db, 'Marlowe').id;
    adoptBook(db, marlowe, bookId);
  });

  it('a non-last release removes only that owner and keeps the book', () => {
    const result = releaseOwnership(db, marlowe, bookId);
    expect(result).toEqual({ bookDeleted: false });
    expect(listOwners(db, bookId)).toEqual([{ person_id: iona, person_name: 'Iona', original: 1 }]);
    expect(getBook(db, bookId)).toBeDefined();
    // Marlowe's dog-ear from adoption is gone with their claim; Iona's book stands.
    expect(listMarks(db, bookId).some((m) => m.person_id === marlowe)).toBe(true);
  });

  it('the last release deletes the book and cascades positions and marks', () => {
    upsertPosition(db, iona, bookId, 1, 5);
    releaseOwnership(db, marlowe, bookId);

    const result = releaseOwnership(db, iona, bookId);

    expect(result).toEqual({ bookDeleted: true });
    expect(getBook(db, bookId)).toBeUndefined();
    expect(listOwners(db, bookId)).toHaveLength(0);
    expect(listPositions(db, bookId)).toHaveLength(0);
    expect(listMarks(db, bookId)).toHaveLength(0);
  });

  it('releasing a claim nobody has is a harmless no-op', () => {
    const stranger = getOrCreatePerson(db, 'Stranger').id;
    const result = releaseOwnership(db, stranger, bookId);
    expect(result).toEqual({ bookDeleted: false });
    expect(listOwners(db, bookId)).toHaveLength(2);
  });
});

describe('marks (dog-ears and bookmarks)', () => {
  let db: Database;
  let iona: number;
  let marlowe: number;
  const bookId = 'hash-1';

  beforeEach(() => {
    db = freshDb();
    iona = shelve(db, bookId, 'The Fixture Book', 'Iona').id;
    marlowe = getOrCreatePerson(db, 'Marlowe').id;
  });

  it('adds and lists marks from everyone, in reading order, with kind', () => {
    addMark(db, marlowe, bookId, 1, 4, 'bookmark');
    addMark(db, iona, bookId, 0, 9, 'dog-ear');
    const marks = listMarks(db, bookId);
    expect(marks.map((m) => [m.person_name, m.chapter_idx, m.char_offset, m.kind])).toEqual([
      ['Iona', 0, 9, 'dog-ear'],
      ['Marlowe', 1, 4, 'bookmark'],
    ]);
  });

  it('refolding the same corner (same kind) is a no-op', () => {
    addMark(db, iona, bookId, 0, 9, 'dog-ear');
    addMark(db, iona, bookId, 0, 9, 'dog-ear');
    expect(listMarks(db, bookId)).toHaveLength(1);
  });

  it('two persons can mark the same spot', () => {
    addMark(db, iona, bookId, 0, 9, 'dog-ear');
    addMark(db, marlowe, bookId, 0, 9, 'dog-ear');
    expect(listMarks(db, bookId)).toHaveLength(2);
  });

  it('a dog-ear and a bookmark can coexist at the same spot for the same person', () => {
    addMark(db, iona, bookId, 0, 9, 'dog-ear');
    addMark(db, iona, bookId, 0, 9, 'bookmark');
    expect(
      listMarks(db, bookId)
        .map((m) => m.kind)
        .sort()
    ).toEqual(['bookmark', 'dog-ear']);
  });

  it('deleteOwnMark removes only the requester’s mark of that kind', () => {
    addMark(db, iona, bookId, 0, 9, 'dog-ear');
    addMark(db, marlowe, bookId, 0, 9, 'dog-ear');
    expect(deleteOwnMark(db, iona, bookId, 0, 9, 'dog-ear')).toBe(1);
    const remaining = listMarks(db, bookId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].person_name).toBe('Marlowe');
  });

  it('deleteOwnMark leaves the other kind at the same spot untouched', () => {
    addMark(db, iona, bookId, 0, 9, 'dog-ear');
    addMark(db, iona, bookId, 0, 9, 'bookmark');
    expect(deleteOwnMark(db, iona, bookId, 0, 9, 'dog-ear')).toBe(1);
    expect(listMarks(db, bookId)).toEqual([expect.objectContaining({ kind: 'bookmark' })]);
  });

  it('deleteOwnMark returns 0 when the mark belongs to someone else', () => {
    addMark(db, marlowe, bookId, 0, 9, 'dog-ear');
    expect(deleteOwnMark(db, iona, bookId, 0, 9, 'dog-ear')).toBe(0);
    expect(listMarks(db, bookId)).toHaveLength(1);
  });

  it('deleteOwnMark returns 0 for a spot with no mark', () => {
    expect(deleteOwnMark(db, iona, bookId, 5, 5, 'dog-ear')).toBe(0);
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
