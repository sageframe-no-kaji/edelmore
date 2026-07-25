---
created: 2026-07-03
type: agent-task
status: complete
parent: apps/reader/ho-process/notes/kamae-2-followup-prep.md
project: edelmore-reader
---

**Goal**

The reader's household-library persistence layer: SQLite schema (books, people, reading positions, dog-ears — all shared-visibility, attributed), disk storage for originals + normalized JSON + extracted images, an ingestion path (upload → parse → store), and the read endpoints the book UI will consume.

**Context**

Decided 2026-07-03, and it shapes everything here: **this is a library in a house, not accounts.** No login. Every person in the household sees all books, all reading positions, all dog-ears — attributed to whoever made them (a book can hold someone else's bookmark; that's a feature). Identity is a lightweight `people` row used for attribution (ex libris: who added the book). Curation rights and the identity-selection mechanic are still open Kamae questions — build the data model, do NOT build any permission system. Network locality (Tailscale/LAN) is the access boundary, same as the diary.

Storage decision: normalized JSON + original EPUB retained, under `apps/reader/data/` (gitignored; ZFS dataset in prod, diary pattern).

**Files**

- Create: `apps/reader/src/lib/db.ts` (+ `db.test.ts`) — schema + named query functions, `better-sqlite3`, WAL, mirroring the diary's `db.ts` idiom (including the duplicate-column-only migration swallow the diary now uses)
- Create: `apps/reader/src/lib/storage.ts` (+ test) — disk layout under a configurable data dir: `books/<book_id>/original.epub`, `books/<book_id>/book.json`, `books/<book_id>/images/<...>`
- Create: `apps/reader/src/lib/ingest.ts` (+ test) — `ingestEpub(db, dataDir, bytes, addedBy)` → parse (R-AT-02's `parseEpub`), write disk artifacts (including extracting image bytes for each `PlateRef.href`), insert rows; idempotent by content hash (re-uploading the same book is a no-op returning the existing id)
- Create: `apps/reader/src/routes/api/books/+server.ts` — `GET` (library list: id, title, author, cover, addedBy, per-person positions summary) and `POST` (multipart EPUB upload → ingest)
- Create: `apps/reader/src/routes/api/books/[id]/+server.ts` — `GET` returns the normalized book JSON (streamed from disk, not the DB)
- Create: `apps/reader/src/routes/api/books/[id]/position/+server.ts` — `GET` all persons' positions for the book; `PUT { person, chapterIdx, charOffset }` upserts
- Create: `apps/reader/src/routes/api/books/[id]/bookmarks/+server.ts` — `GET` all dog-ears; `POST { person, chapterIdx, charOffset }`; `DELETE { person, chapterIdx, charOffset }` (a person can only remove their own dog-ear — the one attribution rule that IS enforced)
- Create: matching `*.test.ts` for each route, following the diary's route-test idioms
- Modify: `apps/reader/.gitignore` or app config as needed for `data/`
- Read-only: `apps/diary/src/lib/db.ts`, diary route tests (idiom reference)

**Required Changes**

1. **Schema** (keep names): `people(id, name UNIQUE, created_at)`; `books(id TEXT PK /* content hash */, title, author, language, cover_image, added_by → people, created_at)`; `reading_positions(person_id, book_id, chapter_idx, char_offset, updated_at, PK(person_id, book_id))`; `bookmarks(id, person_id, book_id, chapter_idx, char_offset, created_at, UNIQUE(person_id, book_id, chapter_idx, char_offset))`. Chapters live in `book.json`, not the DB — the DB holds metadata and reading state only.
2. **People bootstrap**: `getOrCreatePerson(db, name)` — the API accepts a person *name* and creates the row on first sight. No auth check. (The identity mechanic is an open design question; this keeps the wire simple until it's decided.)
3. Position/bookmark endpoints validate: book exists, chapterIdx within the book's chapter count (read from book.json), charOffset within that chapter's text length, person name non-empty ≤ 40 chars.
4. Ingestion is transactional where it touches the DB; a failed disk write leaves no DB row (write disk first, insert after, or clean up on failure — document the choice).

**Acceptance**

- [ ] Schema + queries tested (including idempotent re-ingest by hash, shared visibility of positions/bookmarks across persons, own-dog-ear-only deletion).
- [ ] Upload → ingest → list → fetch-normalized round-trip covered by route tests using an in-memory/temp data dir.
- [ ] Position and bookmark endpoints validated per change 3, tested.
- [ ] No auth/permission system anywhere; no session code.
- [ ] Repo-root `npm run lint`, `npm run check`, `npm run test:coverage` pass (floor included).

**Verification**

```bash
npm install
npm run lint && npm run check && npm run test:coverage
```

**Do Not**

- Do not build login, sessions, or roles — attribution only. The single enforced rule is own-dog-ear deletion.
- Do not put chapter text in SQLite — book.json on disk is the source the renderer reads.
- Do not add shelf/series curation tables yet — the library list is flat in v1; shelves are a Kamae question.
- Do not modify the parser (R-AT-02) — if ingestion needs something the parser doesn't expose, stop and surface.

**Commit**

Single commit on branch `feat/r-at-03-library-ingestion`. Message: `feat(reader): household library — schema, storage, EPUB ingestion, book/position/bookmark APIs`. No AI-attribution trailers — hard project rule.
