import BetterSqlite3 from 'better-sqlite3';
import type { Database } from 'better-sqlite3';

export type { Database };

export type User = {
  id: number;
  username: string;
  pin_hash: string;
  cover_id: string;
  font_size: number;
  journal_font: string;
  diary_title: string;
  voice_uri: string | null;
  created_at: string;
};

export type Session = {
  id: string;
  user_id: number;
  expires_at: string;
};

export type Entry = {
  id: number;
  user_id: number;
  entry_date: string;
  content: string;
  updated_at: string;
};

export function createDb(path: string): Database {
  const db = new BetterSqlite3(path);
  applySchema(db);
  return db;
}

export function applySchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY,
      username    TEXT UNIQUE NOT NULL,
      pin_hash    TEXT NOT NULL,
      cover_id    TEXT NOT NULL DEFAULT 'meadow',
      font_size   REAL NOT NULL DEFAULT 3.4,
      journal_font TEXT NOT NULL DEFAULT 'eb-garamond',
      diary_title TEXT NOT NULL DEFAULT 'D I A R Y',
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS entries (
      id         INTEGER PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      entry_date DATE NOT NULL,
      content    TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, entry_date)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id         TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      expires_at TIMESTAMP NOT NULL
    );
  `);

  // Idempotent migrations for columns added after initial release.
  for (const sql of [
    'ALTER TABLE users ADD COLUMN font_size REAL NOT NULL DEFAULT 3.4',
    "ALTER TABLE users ADD COLUMN journal_font TEXT NOT NULL DEFAULT 'eb-garamond'",
    `ALTER TABLE users ADD COLUMN diary_title TEXT NOT NULL DEFAULT 'D I A R Y'`,
    'ALTER TABLE users ADD COLUMN voice_uri TEXT',
  ]) {
    try {
      db.exec(sql);
    } catch {
      /* column already exists */
    }
  }
}

export function getUserByUsername(db: Database, username: string): User | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;
}

export function getUserById(
  db: Database,
  id: number
):
  | {
      id: number;
      username: string;
      cover_id: string;
      font_size: number;
      journal_font: string;
      diary_title: string;
      voice_uri: string | null;
    }
  | undefined {
  return db
    .prepare(
      'SELECT id, username, cover_id, font_size, journal_font, diary_title, voice_uri FROM users WHERE id = ?'
    )
    .get(id) as
    | {
        id: number;
        username: string;
        cover_id: string;
        font_size: number;
        journal_font: string;
        diary_title: string;
        voice_uri: string | null;
      }
    | undefined;
}

export function createUser(db: Database, username: string, pinHash: string): number {
  const result = db
    .prepare('INSERT INTO users (username, pin_hash) VALUES (?, ?)')
    .run(username, pinHash);
  return result.lastInsertRowid as number;
}

export function countUsers(db: Database): number {
  return (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
}

export function listUsers(db: Database): { id: number; username: string }[] {
  return db.prepare('SELECT id, username FROM users ORDER BY username ASC').all() as {
    id: number;
    username: string;
  }[];
}

export function getSession(db: Database, id: string): Session | undefined {
  return db
    .prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')")
    .get(id) as Session | undefined;
}

export function createSession(db: Database, id: string, userId: number, expiresAt: string): void {
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(
    id,
    userId,
    expiresAt
  );
}

export function updateSessionExpiry(db: Database, id: string, expiresAt: string): void {
  db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(expiresAt, id);
}

export function deleteSession(db: Database, id: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

export function getEntry(db: Database, userId: number, entryDate: string): Entry | undefined {
  return db
    .prepare('SELECT * FROM entries WHERE user_id = ? AND entry_date = ?')
    .get(userId, entryDate) as Entry | undefined;
}

export function upsertEntry(
  db: Database,
  userId: number,
  entryDate: string,
  content: string
): void {
  db.prepare(
    `INSERT INTO entries (user_id, entry_date, content, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, entry_date)
     DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`
  ).run(userId, entryDate, content);
}

export function listEntryDates(db: Database, userId: number): string[] {
  return (
    db
      .prepare('SELECT entry_date FROM entries WHERE user_id = ? ORDER BY entry_date DESC')
      .all(userId) as { entry_date: string }[]
  ).map((r) => r.entry_date);
}

export type EntryDatePreview = {
  entry_date: string;
  preview: string;
};

export function makeEntryPreview(content: string): string {
  const firstLine = content.split('\n')[0].trimStart();
  if (firstLine.length <= 20) return firstLine;
  return `${firstLine.slice(0, 20)}…`;
}

export function updateUserCoverId(db: Database, userId: number, coverId: string): void {
  db.prepare('UPDATE users SET cover_id = ? WHERE id = ?').run(coverId, userId);
}

export function updateUsername(db: Database, userId: number, username: string): void {
  db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, userId);
}

export function updatePinHash(db: Database, userId: number, hash: string): void {
  db.prepare('UPDATE users SET pin_hash = ? WHERE id = ?').run(hash, userId);
}

export function updateFontSize(db: Database, userId: number, size: number): void {
  db.prepare('UPDATE users SET font_size = ? WHERE id = ?').run(size, userId);
}

export function updateJournalFont(db: Database, userId: number, font: string): void {
  db.prepare('UPDATE users SET journal_font = ? WHERE id = ?').run(font, userId);
}

export function updateDiaryTitle(db: Database, userId: number, title: string): void {
  db.prepare('UPDATE users SET diary_title = ? WHERE id = ?').run(title, userId);
}

export function updateVoiceUri(db: Database, userId: number, voiceUri: string | null): void {
  db.prepare('UPDATE users SET voice_uri = ? WHERE id = ?').run(voiceUri, userId);
}

export function listEntryDatesWithPreview(
  db: Database,
  userId: number,
  options: { ascending?: boolean } = {}
): EntryDatePreview[] {
  const order = options.ascending ? 'ASC' : 'DESC';
  const rows = db
    .prepare(
      `SELECT entry_date, content FROM entries WHERE user_id = ? ORDER BY entry_date ${order}`
    )
    .all(userId) as { entry_date: string; content: string }[];
  return rows.map((r) => ({
    entry_date: r.entry_date,
    preview: makeEntryPreview(r.content),
  }));
}
