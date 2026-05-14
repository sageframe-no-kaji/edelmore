// SQLite schema — committed for reference; implementation in first building ho
//
// CREATE TABLE users (
//   id         INTEGER PRIMARY KEY,
//   username   TEXT UNIQUE NOT NULL,
//   pin_hash   TEXT NOT NULL,
//   cover_id   TEXT NOT NULL DEFAULT 'meadow',
//   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
// );
//
// CREATE TABLE entries (
//   id         INTEGER PRIMARY KEY,
//   user_id    INTEGER NOT NULL REFERENCES users(id),
//   entry_date DATE NOT NULL,
//   content    TEXT NOT NULL DEFAULT '',
//   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//   UNIQUE(user_id, entry_date)
// );
//
// CREATE TABLE sessions (
//   id         TEXT PRIMARY KEY,
//   user_id    INTEGER NOT NULL REFERENCES users(id),
//   expires_at TIMESTAMP NOT NULL
// );
