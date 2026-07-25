---
created: 2026-07-03
type: agent-task
status: complete
parent: apps/reader/ho-process/notes/kamae-2-followup-prep.md
project: edelmore-reader
---

**Goal**

A pure server-side TypeScript EPUB parser in the reader: EPUB bytes in → `NormalizedBook` out, with char-offset-stable chapter text, inline emphasis as ranges, and images extracted as plates. Fully unit-tested against programmatically built fixtures. No routes, no DB, no UI — library code only.

**Context**

Decided 2026-07-03: parsing is server-side only; the normalized JSON is what the reader renders and paginates, so **character offsets into `chapter.text` are the system's spine** — positions, dog-ears, word timings, and page splits all key on them. Text must therefore be deterministic: same EPUB in, byte-identical `text` out. Emphasis is expressed as ranges over the text (not markup in it) so offsets stay stable.

**Files**

- Create: `apps/reader/src/lib/epub/model.ts` — the normalized model (contract below)
- Create: `apps/reader/src/lib/epub/parse.ts` — the parser
- Create: `apps/reader/src/lib/epub/parse.test.ts`, `model.test.ts` as useful
- Create: `apps/reader/src/lib/epub/fixtures.ts` (test-only helpers that BUILD minimal EPUBs in memory)
- Modify: `apps/reader/package.json` — add `jszip` and `fast-xml-parser` only

**Required Changes**

1. **Model (`model.ts`) — this is the contract; keep these shapes:**
   - `NormalizedBook { id: string; title: string; author: string | null; language: string | null; coverImage: string | null; chapters: NormalizedChapter[] }` — `id` is a content hash (sha256 of the EPUB bytes, hex).
   - `NormalizedChapter { idx: number; title: string | null; text: string; emphasis: EmphasisRange[]; images: PlateRef[] }`
   - `EmphasisRange { start: number; end: number; kind: 'em' | 'strong' }` — offsets into `text`, end exclusive.
   - `PlateRef { anchor: number; href: string; alt: string | null }` — `anchor` is the char offset in `text` where the image occurred; `href` is the image's path inside the EPUB (extraction to disk is the ingestion task's job; the parser also exposes `getImage(href): Uint8Array` or returns the raw bytes map — pick one, document it).
2. **Parser (`parse.ts`)**: `parseEpub(bytes: Uint8Array): Promise<NormalizedBook>`. Unzip with `jszip`; read `META-INF/container.xml` → OPF → metadata + spine; parse each spine XHTML with `fast-xml-parser`. Text extraction rules: block elements (`p`, `h1–h6`, `li`, `blockquote`, `div` acting as block) produce paragraphs joined with `\n\n`; whitespace collapsed within paragraphs; `<em>/<i>` → `em` ranges, `<strong>/<b>` → `strong` ranges (nesting: overlapping ranges are fine, no need to merge); `<img>` → PlateRef anchored at its position; scripts/styles/nav ignored. Chapter titles from the first heading or the OPF/NCX toc when present. Malformed EPUB (no container, no OPF, empty spine) throws a typed `EpubParseError` with a stage name.
3. **Determinism**: parsing the same bytes twice yields deeply equal output (test this).
4. **Fixtures**: build synthetic EPUBs in-memory with jszip in `fixtures.ts` — minimal valid book (2 chapters, emphasis, an image), title-less chapters, malformed variants. If adding one small real public-domain EPUB as a binary fixture, keep it under 500 KB; do NOT fetch from the network during tests.
5. **Tests** cover: happy path model shape, emphasis offsets land on the right words (assert by slicing `text` with the range), plate anchors, determinism, each `EpubParseError` stage, and offset stability (adding emphasis markup around a word does not shift other chapters' offsets).

**Acceptance**

- [ ] `parseEpub` produces the contract shapes above; emphasis ranges verified by text slicing in tests.
- [ ] Determinism test passes.
- [ ] Malformed inputs throw `EpubParseError` with stage names.
- [ ] No network access in tests; fixtures built in-memory.
- [ ] Repo-root `npm run lint`, `npm run check`, `npm run test:coverage` pass (floor included).

**Verification**

```bash
npm install
npm run lint && npm run check && npm run test:coverage
```

**Do Not**

- Do not add epub.js, epub2, or any DOM-dependent library — `jszip` + `fast-xml-parser` only, so the parser runs in plain Node.
- Do not write anything to disk, add routes, or touch the DB — ingestion (R-AT-03) owns persistence.
- Do not render or sanitize HTML for display — the model IS the display format.

**Stop Condition**

If real-world EPUB structure forces a change to the `NormalizedBook` contract shapes (not just internals), stop and surface the proposed shape change instead of shipping a different contract — positions and bookmarks will be keyed on these offsets for years.

**Commit**

Single commit on branch `feat/r-at-02-epub-parser`. Message: `feat(reader): EPUB parser core — normalized book model with offset-stable text`. No AI-attribution trailers — hard project rule.
