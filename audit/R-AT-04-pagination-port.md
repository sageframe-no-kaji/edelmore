---
created: 2026-07-03
type: agent-task
status: complete
parent: apps/reader/ho-process/notes/kamae-2-followup-prep.md
project: edelmore-reader
---

**Goal**

The reader's pagination substrate: the diary's measurement-based `splitPoints` idiom adapted to read-only chapter text, a reader-local tokenizer/word-span renderer (ReaderView idiom, emphasis-aware), and a bare dev route that pages a stored book through `BookShell`/`Spread` with working flips. Deliberately unstyled — this is the mechanical substrate the practitioner will build the book UI on, not the book UI.

**Context**

Decided 2026-07-03: the reader uses the diary's pagination method, NOT CSS multi-column — character offsets are the spine (positions, dog-ears, and word timings all key on them). The diary's `overflow.ts` / `tokenize.ts` / `ReaderView.svelte` are the reference idiom but are **copied and adapted per-app, not imported** — the diary paginates editable textarea content, the reader paginates read-only spans; the behaviors will diverge (emphasis rendering, plates). Extraction to `packages/` only happens later if they prove identical (repo sharing rule).

**Files**

- Create: `apps/reader/src/lib/pagination.ts` (+ test) — split-point computation for a chapter: `computeSplitPoints(text, fits: (slice: string) => boolean): number[]` — pure logic port of the diary's `findSplitIndex`/`snapToWordBreak` binary-search idiom (read `apps/diary/src/lib/overflow.ts` first); plus `spreadForOffset`/`sideForOffset` equivalents (see diary `content.ts`)
- Create: `apps/reader/src/lib/tokenize.ts` (+ test) — word/whitespace tokenizer emitting emphasis-aware tokens: each token carries `charStart/charEnd` and any `EmphasisRange` kinds overlapping it
- Create: `apps/reader/src/lib/components/PageView.svelte` (+ test) — read-only page renderer: takes `text`, `sliceStart`, `emphasis`, renders word spans (em/strong styled via plain `em`/`strong` semantics), reserves a `currentCharIndex` prop for future narration highlight (renders it, no audio wiring)
- Create: `apps/reader/src/lib/components/ChapterMeasurer.svelte` or equivalent mechanism (+ test where feasible) — the DOM-measurement half: hidden measuring element matching PageView's metrics, drives `computeSplitPoints` (read the diary layout's `measureEl` effect at `apps/diary/src/routes/(authenticated)/+layout.svelte:835-877` for the idiom; the reader's version measures a hidden div, not a textarea)
- Create: `apps/reader/src/routes/dev/book/[id]/+page.svelte` + `+page.ts` — dev-only route: loads a book via the R-AT-03 APIs, paginates chapter text, renders spreads in `BookShell`/`Spread` with prev/next flips across chapter boundaries. Plain parchment pages, no cover art, no ribbon, no transform — a mechanics testbed.
- Read-only: `apps/diary/src/lib/overflow.ts`, `apps/diary/src/lib/content.ts`, `apps/diary/src/lib/tokenize.ts`, `apps/diary/src/lib/components/ReaderView.svelte`, `apps/diary/src/routes/(authenticated)/+layout.svelte` (idiom reference only — do not modify the diary)

**Required Changes**

1. Pure logic (`pagination.ts`, `tokenize.ts`) gets exhaustive unit tests — split points land on word breaks, offsets round-trip (`spreadForOffset(computeSplitPoints(...), offset)` consistent), emphasis attaches to the right tokens (assert by slicing text).
2. `PageView` must render emphasis WITHOUT shifting character-driven layout (the diary's ReaderView padding/negative-margin note is the cautionary reference — keep layout-affecting styling off word spans).
3. Plates (`PlateRef`) may be SKIPPED in rendering for this task (log a TODO comment referencing the illustration decision) — but the pagination must not break on chapters that contain them.
4. The dev route flips with `BookShell.flip()` (the shared primitive) including chapter→chapter continuation; keyboard arrows optional.
5. Component tests as far as happy-dom allows (the diary's `BookShell.test.ts` and `Spread.test.ts` show what's feasible); the visual result is verified by the practitioner later — say so in your report rather than over-claiming.

**Acceptance**

- [ ] `pagination.ts` and `tokenize.ts` at 100% line coverage with offset-invariant tests.
- [ ] `PageView` renders emphasis-styled word spans; `currentCharIndex` highlight renders when set.
- [ ] Dev route builds and its load path is covered by a test; flipping logic wired through `BookShell.flip`.
- [ ] Diary untouched; nothing added to `packages/`.
- [ ] Repo-root `npm run lint`, `npm run check`, `npm run test:coverage` pass (floor included).

**Verification**

```bash
npm install
npm run lint && npm run check && npm run test:coverage
npm run build --workspace apps/reader
```

**Do Not**

- Do not import diary code across app boundaries or extract anything to `packages/` — copy-and-adapt is the decided pattern here.
- Do not build cover art, the library page, the ribbon, the transform, narration, or any styling beyond legible parchment — practitioner-supervised territory.
- Do not implement plate rendering — TODO only.

**Stop Condition**

If measurement-based pagination proves unable to hit the <100 ms page-flip budget on realistic chapter sizes (test with a ~5,000-word chapter fixture), stop and report numbers instead of optimizing speculatively — the caching strategy is a design decision.

**Commit**

Single commit on branch `feat/r-at-04-pagination-port`. Message: `feat(reader): measurement pagination, emphasis-aware tokenizer, dev book route`. No AI-attribution trailers — hard project rule.
