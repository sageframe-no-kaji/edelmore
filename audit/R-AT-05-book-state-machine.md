---
created: 2026-07-17
type: agent-task
status: complete
pr: https://github.com/sageframe-no-kaji/edelmore/pull/27
parent: apps/reader/ho-process/notes/kamae-2-followup-prep.md
project: edelmore-reader
model: opus
---

**Goal**

The magic book's spine: replace the reader's placeholder `/` route with the real book — a diary-style spread-state machine (closed cover → title page → library page → chapter spreads) in one `BookShell`, with automatic reading-position persistence (the bookmark that holds your place) and book switching from the library page. **Structural substrate with placeholder visuals** — cover art, the transform animation, the ribbon, and dog-ear rendering are practitioner-designed later; your pages are plain legible parchment.

**Context**

Decided 2026-07-03 (see parent note §2026-07-03, decisions C/D and E): ONE magic book; the library is a spread INSIDE it (diegetic "Other books in this series…" page, first spread after the title page); choosing a book swaps cover/title/content (a plain instant swap here — the magical transform is a later practitioner ho); positions are per-person, shared-visibility, and the book holds your place when closed. The diary's `(authenticated)/+layout.svelte` is the reference for the SpreadState idiom (read its state machine; do NOT copy its editing machinery). The dev route `/dev/book/[id]` is the pagination reference — factor its measurement/caching into a shared `$lib` module rather than duplicating; leave the dev route working.

**Files**

- Create: `apps/reader/src/lib/book-state.ts` (+ test) — the pure state machine: `SpreadState = closed | title | library | chapter(idx, spread)`; transitions (openBook, flipNext/flipPrev across title→library→chapters and chapter boundaries, toLibrary, close); derived canFlip/progress (char-based, like the dev route)
- Create: `apps/reader/src/lib/use-pagination.ts` or equivalent (+ test where pure) — the measure-once-cache-splits logic factored from the dev route; dev route refactored to consume it
- Create: `apps/reader/src/lib/position.ts` (+ test) — debounced position PUT (person, book, chapter, charOffset) on spread change and on close/pagehide; restore-on-open (open the book at the person's stored position, else title page)
- Create: `apps/reader/src/lib/components/PersonPicker.svelte` (+ test) — minimal name entry/selection persisted in `localStorage` (`reader.person`); PROVISIONAL — one comment noting the identity mechanic is an open Kamae decision; no auth
- Modify: `apps/reader/src/routes/+page.svelte` (+ route test) — the book: closed cover (plain leather-colored page with the book's title text; art comes later) → title page (title/author text) → library page (list of all books from `GET /api/books`, each a plain clickable line; selecting swaps the active book and jumps to its title page) → chapter spreads (PageView, flip zones with the diary's overhang pattern — wide zones extending outside the book, per the parent note's 2026-07-04 accessibility item)
- Modify: `apps/reader/src/routes/dev/book/[id]/+page.svelte` — consume the factored pagination module (behavior unchanged)
- Read-only: diary layout (state-machine idiom), R-AT-03 API routes, R-AT-04 components

**Required Changes**

1. State machine pure and exhaustively tested (transition table, boundary flips, library jump, close-from-anywhere).
2. Positions: restore on load (per person + active book); save debounced ~1s after spread settle and immediately on `pagehide`/close-to-cover; never save for title/library spreads.
3. Book switching: library page lists all books; selection loads the chosen book's normalized JSON, paginates (cached per book), lands on ITS title page; position restore applies when entering its chapters.
4. Flips go through `BookShell.flip` with correct direction; keyboard arrows; the flip zones use the wide-overhang pattern (`overhangRem`), not narrow in-page strips.
5. All visuals placeholder: system-ish serif on parchment, no images, no design flourishes. The practitioner styles every page later.

**Acceptance**

- [ ] State machine 100% line coverage; transition table asserted.
- [ ] Position save/restore round-trip covered in route/component tests (mocked fetch); pagehide save asserted.
- [ ] Library selection swaps books and restores that book's position (tested).
- [ ] Dev route still passes its tests using the factored module.
- [ ] Full verify stack green from repo root, floors included; `npm run build --workspace apps/reader` succeeds.

**Do Not**

- No cover art, no transform animation, no ribbon, no dog-ear UI, no narration — other tasks/hos own those.
- No auth or people administration — the localStorage picker stub only.
- Do not modify `packages/` or the diary.

**Stop Condition**

If the one-BookShell/many-books model forces a change to `BookShell`'s public API, stop and surface — the package boundary is practitioner territory.

**Commit**

Single commit on branch `feat/r-at-05-book-state-machine`. Message: `feat(reader): book spread-state machine, position persistence, library switching`. No AI-attribution trailers — hard project rule.
