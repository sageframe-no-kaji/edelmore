/**
 * The household library's persistence layer — a library in a house, not accounts.
 *
 * No login, no permission system. Every person in the household sees all books,
 * all reading positions, all dog-ears, attributed to whoever made them via the
 * `people` table (ex libris). The single enforced rule lives in
 * `deleteOwnBookmark`: deletion is keyed on the requester's own person row, so
 * a person can only remove their own dog-ears.
 *
 * The DB holds metadata and reading state only. Chapter text lives in
 * `book.json` on disk (see storage.ts) — never in SQLite.
 */

import BetterSqlite3 from 'better-sqlite3';
import type { Database } from 'better-sqlite3';

export type { Database };

export type Person = {
  id: number;
  name: string;
  created_at: string;
};

export type Book = {
  /** Content hash: sha256 of the EPUB bytes, hex-encoded (the parser's `NormalizedBook.id`). */
  id: string;
  title: string;
  author: string | null;
  language: string | null;
  /** Zip-internal href of the cover image (mirrors disk layout under `images/`), or null. */
  cover_image: string | null;
  added_by: number;
  created_at: string;
};

export type BookListRow = Book & {
  /** The ex-libris attribution, joined from `people`. */
  added_by_name: string;
};

export type PositionRow = {
  person_id: number;
  person_name: string;
  chapter_idx: number;
  char_offset: number;
  updated_at: string;
};

export type BookmarkRow = {
  id: number;
  person_id: number;
  person_name: string;
  chapter_idx: number;
  char_offset: number;
  created_at: string;
};

export function createDb(path: string): Database {
  const db = new BetterSqlite3(path);
  // Durability + correctness, in that order:
  // - WAL survives abrupt container kills far better than the default
  //   rollback journal (':memory:' ignores it and reports 'memory').
  // - synchronous=NORMAL is the recommended level under WAL.
  // - foreign_keys is OFF by default in SQLite — without this the
  //   REFERENCES people(id) constraints are never enforced.
  // - busy_timeout waits instead of throwing SQLITE_BUSY immediately
  //   if a second connection ever appears.
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  applySchema(db);
  return db;
}

export function applySchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS people (
      id         INTEGER PRIMARY KEY,
      name       TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS books (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      author      TEXT,
      language    TEXT,
      cover_image TEXT,
      added_by    INTEGER NOT NULL REFERENCES people(id),
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reading_positions (
      person_id   INTEGER NOT NULL REFERENCES people(id),
      book_id     TEXT NOT NULL REFERENCES books(id),
      chapter_idx INTEGER NOT NULL,
      char_offset INTEGER NOT NULL,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (person_id, book_id)
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id          INTEGER PRIMARY KEY,
      person_id   INTEGER NOT NULL REFERENCES people(id),
      book_id     TEXT NOT NULL REFERENCES books(id),
      chapter_idx INTEGER NOT NULL,
      char_offset INTEGER NOT NULL,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(person_id, book_id, chapter_idx, char_offset)
    );
  `);

  applyColumnMigrations(db, MIGRATIONS);
}

// Idempotent migrations for columns added after initial release. Empty today;
// post-release ALTERs append here (diary pattern).
const MIGRATIONS: string[] = [];

export function applyColumnMigrations(db: Database, statements: string[]): void {
  for (const sql of statements) {
    try {
      db.exec(sql);
    } catch (err) {
      // SQLite reports an already-applied ALTER as "duplicate column name" —
      // the only failure the idempotent re-run may swallow. Anything else
      // (I/O error, corrupt schema, …) must propagate.
      if (!(err instanceof Error) || !err.message.includes('duplicate column name')) {
        throw err;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// People — attribution rows, created on first sight of a name. No credentials.
// ---------------------------------------------------------------------------

export function getOrCreatePerson(db: Database, name: string): Person {
  db.prepare('INSERT INTO people (name) VALUES (?) ON CONFLICT(name) DO NOTHING').run(name);
  return db.prepare('SELECT * FROM people WHERE name = ?').get(name) as Person;
}

export function getPersonByName(db: Database, name: string): Person | undefined {
  return db.prepare('SELECT * FROM people WHERE name = ?').get(name) as Person | undefined;
}

// ---------------------------------------------------------------------------
// Books — metadata only; chapter text lives in book.json on disk.
// ---------------------------------------------------------------------------

export function getBook(db: Database, id: string): Book | undefined {
  return db.prepare('SELECT * FROM books WHERE id = ?').get(id) as Book | undefined;
}

export function insertBook(
  db: Database,
  book: {
    id: string;
    title: string;
    author: string | null;
    language: string | null;
    cover_image: string | null;
    added_by: number;
  }
): void {
  db.prepare(
    `INSERT INTO books (id, title, author, language, cover_image, added_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(book.id, book.title, book.author, book.language, book.cover_image, book.added_by);
}

export function listBooks(db: Database): BookListRow[] {
  return db
    .prepare(
      `SELECT books.*, people.name AS added_by_name
       FROM books JOIN people ON people.id = books.added_by
       ORDER BY books.title COLLATE NOCASE ASC, books.id ASC`
    )
    .all() as BookListRow[];
}

// ---------------------------------------------------------------------------
// Reading positions — one per (person, book), visible to the whole household.
// ---------------------------------------------------------------------------

export function upsertPosition(
  db: Database,
  personId: number,
  bookId: string,
  chapterIdx: number,
  charOffset: number
): void {
  db.prepare(
    `INSERT INTO reading_positions (person_id, book_id, chapter_idx, char_offset, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(person_id, book_id)
     DO UPDATE SET chapter_idx = excluded.chapter_idx,
                   char_offset = excluded.char_offset,
                   updated_at = excluded.updated_at`
  ).run(personId, bookId, chapterIdx, charOffset);
}

export function listPositions(db: Database, bookId: string): PositionRow[] {
  return db
    .prepare(
      `SELECT p.person_id, people.name AS person_name, p.chapter_idx, p.char_offset, p.updated_at
       FROM reading_positions p JOIN people ON people.id = p.person_id
       WHERE p.book_id = ?
       ORDER BY people.name COLLATE NOCASE ASC`
    )
    .all(bookId) as PositionRow[];
}

// ---------------------------------------------------------------------------
// Bookmarks (dog-ears) — shared visibility; deletion is own-dog-ear-only.
// ---------------------------------------------------------------------------

export function addBookmark(
  db: Database,
  personId: number,
  bookId: string,
  chapterIdx: number,
  charOffset: number
): void {
  // Folding a corner that's already folded is a no-op, not an error.
  db.prepare(
    `INSERT INTO bookmarks (person_id, book_id, chapter_idx, char_offset)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(person_id, book_id, chapter_idx, char_offset) DO NOTHING`
  ).run(personId, bookId, chapterIdx, charOffset);
}

export function listBookmarks(db: Database, bookId: string): BookmarkRow[] {
  return db
    .prepare(
      `SELECT b.id, b.person_id, people.name AS person_name, b.chapter_idx, b.char_offset,
              b.created_at
       FROM bookmarks b JOIN people ON people.id = b.person_id
       WHERE b.book_id = ?
       ORDER BY b.chapter_idx ASC, b.char_offset ASC, people.name COLLATE NOCASE ASC`
    )
    .all(bookId) as BookmarkRow[];
}

/**
 * The one attribution rule that IS enforced: deletion is keyed on the
 * requester's own person id, so it can only ever remove that person's
 * dog-ear. Returns the number of rows removed (0 when the dog-ear at that
 * spot belongs to someone else, or doesn't exist).
 */
export function deleteOwnBookmark(
  db: Database,
  personId: number,
  bookId: string,
  chapterIdx: number,
  charOffset: number
): number {
  return db
    .prepare(
      `DELETE FROM bookmarks
       WHERE person_id = ? AND book_id = ? AND chapter_idx = ? AND char_offset = ?`
    )
    .run(personId, bookId, chapterIdx, charOffset).changes;
}
