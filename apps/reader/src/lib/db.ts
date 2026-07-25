/**
 * The household library's persistence layer — a library in a house, not accounts.
 *
 * No login, no permission system. Every book is owned by whoever claimed it:
 * `book_owners` is a many-to-many join between `books` and `people` — the
 * uploader lands as `original = 1` (see `insertBook`), and anyone else who
 * later claims the book (`adoptBook`) joins as `original = 0`. Reading a book
 * (`reading_positions`) is orthogonal to owning it — browsing the shelf never
 * writes an owner row; only an explicit adoption does.
 *
 * Marks (`place_marks`) come in two kinds: `dog-ear` is a persistent fold (a
 * spot you keep — `adoptBook` drops one automatically at the book's start),
 * `bookmark` is a temporary slip at your current location. Both are
 * shared-visible, attributed to whoever made them via `people` (ex libris).
 *
 * The one enforced rule generalizes across both nouns: a person can only
 * remove what is theirs — their own mark (`deleteOwnMark`), their own
 * ownership claim (`releaseOwnership`). When the last owner releases a book,
 * it leaves the shelf and its rows (positions, marks) cascade with it.
 *
 * The DB holds metadata and reading state only. Chapter text lives in
 * `book.json` on disk (see storage.ts) — never in SQLite. This module also
 * stays filesystem-free: `releaseOwnership` cascades DB rows only and reports
 * whether the book was deleted; removing the book's on-disk directory is the
 * release endpoint's job, one layer up, where DB and storage compose.
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
  created_at: string;
};

export type BookListRow = Book & {
  /** The ex-libris attribution — the uploader, joined from `book_owners` (original = 1) + `people`. */
  original_owner_name: string;
};

export type PositionRow = {
  person_id: number;
  person_name: string;
  chapter_idx: number;
  char_offset: number;
  updated_at: string;
};

/** A row in `book_owners`, joined to the owner's name. `original` is 1 for the uploader, 0 otherwise. */
export type OwnerRow = {
  person_id: number;
  person_name: string;
  original: number;
};

/** `dog-ear` is a persistent fold; `bookmark` is a temporary slip. */
export type MarkKind = 'dog-ear' | 'bookmark';

export type MarkRow = {
  id: number;
  person_id: number;
  person_name: string;
  chapter_idx: number;
  char_offset: number;
  kind: MarkKind;
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
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS book_owners (
      book_id    TEXT NOT NULL REFERENCES books(id),
      person_id  INTEGER NOT NULL REFERENCES people(id),
      original   INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (book_id, person_id)
    );

    CREATE TABLE IF NOT EXISTS reading_positions (
      person_id   INTEGER NOT NULL REFERENCES people(id),
      book_id     TEXT NOT NULL REFERENCES books(id),
      chapter_idx INTEGER NOT NULL,
      char_offset INTEGER NOT NULL,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (person_id, book_id)
    );
  `);

  migratePlaceMarks(db);
  migrateBookOwnership(db);

  applyColumnMigrations(db, MIGRATIONS);

  // A person can hold a dog-ear AND a bookmark at the same spot — the two
  // kinds are independent folds. Named + IF NOT EXISTS so it's safe to
  // re-run on both a fresh `place_marks` (created above) and a rebuilt one
  // (migratePlaceMarks, on a legacy DB).
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_place_marks_unique
      ON place_marks(person_id, book_id, chapter_idx, char_offset, kind);
  `);
}

const PLACE_MARKS_TABLE = `
  CREATE TABLE place_marks (
    id          INTEGER PRIMARY KEY,
    person_id   INTEGER NOT NULL REFERENCES people(id),
    book_id     TEXT NOT NULL REFERENCES books(id),
    chapter_idx INTEGER NOT NULL,
    char_offset INTEGER NOT NULL,
    kind        TEXT NOT NULL DEFAULT 'dog-ear',
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

/**
 * `bookmarks` → `place_marks`, with a `kind`. A straight `ALTER TABLE …
 * RENAME` would carry over the old table's 4-column
 * `UNIQUE(person_id, book_id, chapter_idx, char_offset)` — SQLite can't
 * widen an existing constraint via ALTER, and the target shape needs `kind`
 * folded into that uniqueness (a dog-ear and a bookmark can share a spot).
 * So a legacy DB gets a rebuild instead of a rename: create `place_marks` in
 * its target shape, copy every row over as a `dog-ear` (all pre-migration
 * rows were dog-ears — the only kind that existed), drop `bookmarks`. A
 * fresh install just creates the table directly; `bookmarks` never exists to
 * find. Idempotent either way — a second call sees `place_marks` already
 * present and does nothing.
 */
function migratePlaceMarks(db: Database): void {
  const tables = existingTables(db);
  if (tables.has('place_marks')) return;

  if (tables.has('bookmarks')) {
    db.exec(PLACE_MARKS_TABLE);
    db.exec(`
      INSERT INTO place_marks (id, person_id, book_id, chapter_idx, char_offset, kind, created_at)
      SELECT id, person_id, book_id, chapter_idx, char_offset, 'dog-ear', created_at FROM bookmarks
    `);
    db.exec('DROP TABLE bookmarks');
  } else {
    db.exec(PLACE_MARKS_TABLE);
  }
}

/**
 * `books.added_by` → `book_owners`. Guarded on the column's presence
 * (`pragma table_info`) so a second call is a no-op: once the column is
 * dropped, the guard is false and nothing runs. The backfill is additionally
 * `ON CONFLICT DO NOTHING` against `book_owners`' primary key, in case a
 * prior run backfilled but crashed before the `DROP COLUMN` landed.
 */
function migrateBookOwnership(db: Database): void {
  if (!hasColumn(db, 'books', 'added_by')) return;
  db.exec(`
    INSERT INTO book_owners (book_id, person_id, original)
    SELECT id, added_by, 1 FROM books WHERE added_by IS NOT NULL
    ON CONFLICT(book_id, person_id) DO NOTHING
  `);
  db.exec('ALTER TABLE books DROP COLUMN added_by');
}

function existingTables(db: Database): Set<string> {
  return new Set(
    (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
        name: string;
      }[]
    ).map((t) => t.name)
  );
}

function hasColumn(db: Database, table: string, column: string): boolean {
  return (db.pragma(`table_info(${table})`) as { name: string }[]).some((c) => c.name === column);
}

// Idempotent migrations for columns added after initial release. Empty
// today; post-release ALTERs append here (diary pattern).
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

/** The shared household roster, name-sorted. */
export function listPeople(db: Database): Person[] {
  return db.prepare('SELECT * FROM people ORDER BY name COLLATE NOCASE ASC').all() as Person[];
}

// ---------------------------------------------------------------------------
// Books — metadata only; chapter text lives in book.json on disk.
// ---------------------------------------------------------------------------

export function getBook(db: Database, id: string): Book | undefined {
  return db.prepare('SELECT * FROM books WHERE id = ?').get(id) as Book | undefined;
}

/**
 * Shelves a book and records `ownerId` as its original owner (`original = 1`
 * in `book_owners`) — the uploader's ex-libris claim. Book row + owner row
 * commit together or not at all.
 */
export function insertBook(
  db: Database,
  book: {
    id: string;
    title: string;
    author: string | null;
    language: string | null;
    cover_image: string | null;
  },
  ownerId: number
): void {
  db.transaction(() => {
    db.prepare(
      `INSERT INTO books (id, title, author, language, cover_image)
       VALUES (?, ?, ?, ?, ?)`
    ).run(book.id, book.title, book.author, book.language, book.cover_image);
    db.prepare('INSERT INTO book_owners (book_id, person_id, original) VALUES (?, ?, 1)').run(
      book.id,
      ownerId
    );
  })();
}

export function listBooks(db: Database): BookListRow[] {
  return db
    .prepare(
      `SELECT books.*, people.name AS original_owner_name
       FROM books
       JOIN book_owners ON book_owners.book_id = books.id AND book_owners.original = 1
       JOIN people ON people.id = book_owners.person_id
       ORDER BY books.title COLLATE NOCASE ASC, books.id ASC`
    )
    .all() as BookListRow[];
}

// ---------------------------------------------------------------------------
// Ownership — book_owners is the sole record; adoption is the keeper-act.
// ---------------------------------------------------------------------------

/** Every owner of a book, original first, then name. */
export function listOwners(db: Database, bookId: string): OwnerRow[] {
  return db
    .prepare(
      `SELECT book_owners.person_id, people.name AS person_name, book_owners.original
       FROM book_owners JOIN people ON people.id = book_owners.person_id
       WHERE book_owners.book_id = ?
       ORDER BY book_owners.original DESC, people.name COLLATE NOCASE ASC`
    )
    .all(bookId) as OwnerRow[];
}

/**
 * Claims a book: a non-original `book_owners` row (already an owner = no-op)
 * plus a persistent dog-ear at the book's start (0, 0) — the keeper's fold
 * (also idempotent). Never touches `reading_positions` — reading and owning
 * stay orthogonal.
 */
export function adoptBook(db: Database, personId: number, bookId: string): void {
  db.transaction(() => {
    db.prepare(
      `INSERT INTO book_owners (book_id, person_id, original)
       VALUES (?, ?, 0)
       ON CONFLICT(book_id, person_id) DO NOTHING`
    ).run(bookId, personId);
    addMark(db, personId, bookId, 0, 0, 'dog-ear');
  })();
}

/**
 * Releases the requester's own ownership claim. When no owners remain, the
 * book leaves the shelf: its `reading_positions`, `place_marks`, and `books`
 * row cascade in the same transaction. Filesystem-free by design — the
 * on-disk `books/<id>/` directory is the release endpoint's job, one layer
 * up (a stale directory would otherwise shadow a re-upload of the same
 * content hash).
 */
export function releaseOwnership(
  db: Database,
  personId: number,
  bookId: string
): { bookDeleted: boolean } {
  return db.transaction(() => {
    db.prepare('DELETE FROM book_owners WHERE book_id = ? AND person_id = ?').run(bookId, personId);
    const { count } = db
      .prepare('SELECT COUNT(*) AS count FROM book_owners WHERE book_id = ?')
      .get(bookId) as { count: number };
    if (count > 0) return { bookDeleted: false };

    db.prepare('DELETE FROM reading_positions WHERE book_id = ?').run(bookId);
    db.prepare('DELETE FROM place_marks WHERE book_id = ?').run(bookId);
    db.prepare('DELETE FROM books WHERE id = ?').run(bookId);
    return { bookDeleted: true };
  })();
}

// ---------------------------------------------------------------------------
// Reading positions — one per (person, book), visible to the whole household.
// Reading is browsing: this never writes book_owners.
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
// Marks (place_marks) — dog-ears (persistent) and bookmarks (temporary),
// shared-visible; deletion is own-mark-only.
// ---------------------------------------------------------------------------

export function addMark(
  db: Database,
  personId: number,
  bookId: string,
  chapterIdx: number,
  charOffset: number,
  kind: MarkKind
): void {
  // Folding a corner (or dropping a slip) that's already there is a no-op,
  // not an error.
  db.prepare(
    `INSERT INTO place_marks (person_id, book_id, chapter_idx, char_offset, kind)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(person_id, book_id, chapter_idx, char_offset, kind) DO NOTHING`
  ).run(personId, bookId, chapterIdx, charOffset, kind);
}

export function listMarks(db: Database, bookId: string): MarkRow[] {
  return db
    .prepare(
      `SELECT m.id, m.person_id, people.name AS person_name, m.chapter_idx, m.char_offset,
              m.kind, m.created_at
       FROM place_marks m JOIN people ON people.id = m.person_id
       WHERE m.book_id = ?
       ORDER BY m.chapter_idx ASC, m.char_offset ASC, people.name COLLATE NOCASE ASC`
    )
    .all(bookId) as MarkRow[];
}

/**
 * The one attribution rule that IS enforced, generalized across marks and
 * ownership alike: deletion is keyed on the requester's own person id, so it
 * can only ever remove that person's mark. Returns the number of rows
 * removed (0 when the mark at that spot/kind belongs to someone else, or
 * doesn't exist).
 */
export function deleteOwnMark(
  db: Database,
  personId: number,
  bookId: string,
  chapterIdx: number,
  charOffset: number,
  kind: MarkKind
): number {
  return db
    .prepare(
      `DELETE FROM place_marks
       WHERE person_id = ? AND book_id = ? AND chapter_idx = ? AND char_offset = ? AND kind = ?`
    )
    .run(personId, bookId, chapterIdx, charOffset, kind).changes;
}
