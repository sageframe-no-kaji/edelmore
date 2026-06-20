# Edelmore Reader — Seed

*Kamae 1, fast pass. Sibling app to Edelmore Diary inside the Edelmore monorepo; awaits per-package extraction of diary primitives and bird-narrator premise validation before code starts.*

*Updated 2026-06-19 to reflect the workspace conversion — the diary now lives at `apps/diary/` and this seed at `apps/reader/docs/seed.md`. The original Kamae-1 thinking is preserved; only the dependency framing has moved from "cross-repo refactor" to "in-workspace package extraction."*

---

## Friction

Read-along ebook tools exist (OpenReader WebUI, Chapter, Voice Dream Reader, Speechify, Calibre's viewer, Kindle's TTS, Microsoft Edge's read-aloud, @Voice on Android) and most of them solve the technical problem competently — EPUB parsing, TTS, word-by-word highlighting are mature commodity capabilities. What none of them solve is the *experience*: every one of them feels like reading software, not reading a book. Utilitarian panels, generic typography, route-style page changes, no spatial sense of where you are in the volume.

For Iona — and any kid with dysarthric speech, dyslexia, attention differences, or just a preference for being read to — the difference between "software that reads at you" and "a warm book that's also reading itself to you" is the difference between using a tool and inhabiting an experience. The diary has already built the second thing. The reader is "lift the diary's book-feeling into reading published content."

## Landscape

**Closest existing tools.** OpenReader WebUI is the nearest neighbor — self-hosted, Kokoro-FastAPI integration, EPUB + PDF, IndexedDB for offline, word-level read-along. Open source. Same technical pipeline `apps/diary` ships. Their UI is a standard reader pane. **The technical capability is solved knowledge; the experience is what's scarce.** Chapter occupies similar ground.

**Commercial accessibility readers.** Voice Dream Reader (mobile-only, paid, gold standard for dyslexia), Speechify (subscription, multi-platform, AI voices). Both treat the experience as functional — get the words spoken, highlight them as they go, get out of the way. Neither has anything like a book metaphor.

**Mainstream readers with TTS.** Kindle, Apple Books, Edge, Calibre. TTS feels like an accessibility feature bolted on, not the primary mode of reading. Voice quality varies. None pairs visual book-ness with sustained audio.

**What's absent.** A read-along reader that feels like a real book. Cottage-core (or any) consistent aesthetic. Page turns that read as paper. A reading experience designed for the audio-and-visual-together case rather than the audio-as-fallback case. That gap is the project.

## Vision

Edelmore Reader. Upload an EPUB (or paste plain text, or pick from a built-in library of public-domain children's books). Open it to where you left off. Pages turn like the diary's pages. Click the bird. It reads to you in Kokoro's warm voice. The current word glows soft green. When a page ends, the page turns and the audio continues uninterrupted. The book remembers where you stopped.

A book that reads itself to a child, with the spatial and aesthetic warmth of a real book.

## Audience

- **Iona, 13, ataxia, primary again.** Same accessibility commitment as the diary, applied to consuming text instead of producing it. If the diary's bird helps her write, the reader's bird helps her read.
- **Isla, 7, still secondary.** Younger reader; the read-along is meaningful for emerging-reader support, not just accessibility.
- **Tyro.** Audiobook listener. The reader doubles as a personal audiobook player for content Tyro owns in EPUB form.
- **Architecturally:** built for these three; usable by anyone. Public-domain children's books make the demo case obvious.

## Identity

**Edelmore Reader.** Sibling to Edelmore Diary. Shares the visual world, the book metaphor, the bird, the soft green aura. Different content model (uploaded books, not diary entries), different navigation (chapters, not dates), but visibly the same family of objects.

## Project Nature

Personal/family project, open-source-friendly under the atmarcus.net pattern. Doubles as the strongest possible demo of the Edelmore visual/aural language. Accessibility-tool-shaped but not commercialized — same disposition as the diary.

## Architecture Direction

SvelteKit, SQLite, Docker, Sageframe-deployed. Same stack as the diary. Same Kokoro TTS service. Same `/api/speak` shim. Same ReaderView for word highlighting. Same View Transitions page turn. Same cottage-core visual identity.

**Crucial difference from the diary:** content is read-only, known up front, and never changes during a reading session. Pagination becomes geometric inspection of CSS Multi-column Layout flow rather than overflow-detected textareas. The diary's textarea-overflow pagination mechanism doesn't apply and isn't needed.

**Crucial dependency:** the workspace structural move is done — `apps/diary` and `apps/reader` are sibling apps in the Edelmore monorepo, with `packages/` sitting empty and ready to receive shared code. What remains is the per-package **extraction** of the diary's book primitive, narration stack, and design tokens out of `apps/diary/src/lib/` and into `packages/`. Without that extraction, the reader is either copy-paste duplication (bad) or directly importing from `apps/diary/src/lib/` (a sibling-app cross-dependency, also bad). The extraction itself is non-trivial — likely a multi-ho effort inside `apps/diary` — but the workspace makes it a mechanical lift rather than a cross-repo refactor.

## Constraints

- **Sageframe deploy pattern** is the deployment standard, same as the diary.
- **Same Kokoro service** the diary uses (Shingan for family, Kanyo for demo). No new TTS infrastructure.
- **Same user model and auth** approach. PIN-per-user fine; siblings may want separate reading positions; that's a per-user reading-position table.
- **Real-world EPUBs are messy.** Malformed XHTML, weird encodings, embedded fonts, images, footnotes. The MVP can accept well-formed EPUB 3 and decline to support EPUB 2, PDF, or MOBI in v1.
- **Pagination must adapt to viewport and font size.** Diary spreads were a fixed shape; the reader's spread will be too, but font-size changes and orientation changes require re-pagination. CSS columns handles this for free.
- **Reading position is sacred.** "Where was I" must survive reload, device switch, font-size change. The position is a character offset into the chapter, not a page index, because page indices change with reflow.

## Scope

**In v1:**
- Upload an EPUB; library shelf view; pick a book.
- Open to last reading position.
- Page-turn animation (lifted from diary).
- Click bird → audio playback with word highlighting (lifted from diary's narration module).
- Page turns at the right moment as audio crosses page boundaries.
- Audio continues uninterrupted through page turns.
- Pause/resume, rate slider, voice picker (lifted).
- Reading position persists per user per book.
- Built-in library of 4-6 public-domain children's books (Alice, Wind in the Willows, Secret Garden, The Wonderful Wizard of Oz, A Little Princess, Just So Stories) — pre-shipped, no upload required, instant demo content.
- Cottage-core visual identity (lifted).

**Not in v1:**
- PDF. Different parsing problem, different layout problem, defer to v2.
- MOBI/AZW3. Defer indefinitely; convert to EPUB upstream.
- Annotations, highlights, notes. Future ho.
- Bookmarks beyond "last position." Future ho.
- Search within a book. Future ho.
- Dictionary lookup, Wikipedia, AI Q&A (@Voice has these). Out of scope; mission-creep.
- Multiple voices per character / dialog detection. @Voice does this; cool; deferred.
- Caching generated audio. Diary deferred this; reader probably wants it because the same chapter audio gets generated many times. Worth an early ho once the basic flow is shipped.

**Out forever:**
- Cloud-hosted user libraries. Same homelab privacy posture as the diary.
- DRM-protected content. Adobe DRM is hostile; refuse to engage.
- A marketplace, store, or any kind of commerce. Edelmore Reader is not a store.

## Success Criteria

- Iona uses Edelmore Reader to read at least one book end-to-end within a month of shipping.
- Page-turn-at-boundary feels coherent across long chapters — no rough transitions, no audio gaps at page seams.
- Public-domain demo books load and read without intervention.
- Reading position is reliable across reloads and devices.
- The reader visually feels like a sibling of the diary, not a different application.

## Where Tyro Is Starting From

- **The diary codebase** as `apps/diary` inside the Edelmore workspace, with shared primitives still in `apps/diary/src/lib/` awaiting extraction into `packages/`.
- **EPUB parsing**: new territory. Libraries exist (`epub2` for Node, `epub.js` for browser, `ebooklib` for Python). OpenReader's open-source code is reference material.
- **CSS Multi-column Layout**: well-documented, widely supported, not previously used in the diary. Quick learning curve.
- **Everything else** — Svelte, SQLite, Docker, Sageframe, Kokoro, narration, page-turn, design tokens — already fluent.

## What Tyro Wants to Learn

- How to consume an open format (EPUB) without writing a parser from scratch. The diary defined its own data shape; the reader consumes someone else's.
- CSS Multi-column Layout as a primary pagination strategy.
- Whether the extraction of the diary's shared primitives into `packages/` is worth its own cost — the reader is the test.

## Dependencies (load-bearing)

The reader **cannot responsibly start writing code until two gates clear**:

1. **Per-package extraction.** The diary's book primitive, narration stack, and design tokens live tangled inside `apps/diary/src/lib/` and `apps/diary/src/routes/(authenticated)/+layout.svelte`. They need to be lifted into the workspace's `packages/`:

   - **`@edelmore/book`** — Cover, ExLibris, Spread, page-turn animation (View Transitions), stacks, seam, gutter shadow. The book metaphor as a component library. No diary-specific code.
   - **`@edelmore/narration`** — `BirdNarrator` finally as a real component (currently inline in `+layout.svelte`), `ReaderView`, tokenize/findWordIndex, the `/api/speak` shim, voice picker. No diary-specific code.
   - **`@edelmore/design`** — Cottage-core Tailwind tokens, color palette, EB Garamond / Cedarville Cursive setup, paper texture. No diary-specific code.

   These exist today as working code; extraction is real work — likely a multi-ho effort inside `apps/diary` — but the workspace makes it mechanical: import paths shift from `$lib/...` to `@edelmore/...`, the packages get hoisted at the workspace root, no cross-repo synchronization. Worth doing for the diary's own clarity even if the reader never happens; required if it does.

2. **Premise validation.** Does Iona actually use the diary's bird-narrator? If she does, the reader's premise is validated and extraction becomes worthwhile. If she doesn't, this seed gets archived and the diary keeps its primitives tangled.

The earlier pragmatic sequencing question — refactor before or after diary v1.0 — has resolved itself by happening naturally: diary tagged v1.2 first, the workspace structural move landed the same day, and per-package extraction remains unscheduled. Deferring the extraction was the right call; the diary's pre-v1.0 deploy/demo work wasn't slowed by speculative cleanup.

## Open Questions

- **Server-side vs browser-side EPUB parsing.** Server-side is more consistent; browser-side keeps uploaded books off the server's disk (privacy-nicer, matches `apps/diary`'s posture). Worth resolving early.
- ~~**The "@edelmore/*" module names.** Just placeholders. May or may not be packaged as separate npm packages vs. just internal directories sharing across a monorepo. Decision deferred to the refactor.~~ **Resolved 2026-06-19:** internal npm-workspace packages under `packages/`. Not published to a registry; consumed by sibling apps via workspace symlinks. Names (`@edelmore/book`, `@edelmore/narration`, `@edelmore/design`) carried forward as canonical.
- **Reading position granularity.** Character offset per chapter? Or word index? Or EPUB CFI (the spec-defined canonical fragment identifier)? CFI is the right answer if the reader ever wants to interoperate with other readers; character offset is simpler if it doesn't.
- **Whether Iona will actually use it.** The whole project's value rests on her wanting to be read to. The diary will tell us — if the bird is loved, the reader follows naturally; if the bird is ignored, this seed gets archived.
- **Audio caching.** Generating Kokoro audio for the same chapter every time it's opened is wasteful. Cache key: `(book_id, chapter_id, voice, speed)`. Cache to disk on the homelab. Likely a v1.1 feature; flag now.
- **Public-domain library curation.** Which books? Are some of them too long for a 7-year-old (Wind in the Willows is a lot)? Maybe a v0.5 set targeting Isla's level and a v1.0 set targeting Iona's.

## Notes for Future Self

- OpenReader WebUI and Chapter are direct technical references. Read their EPUB-parsing and Kokoro integration code before writing anything. Save yourself the rediscovery.
- The differentiation is *not technical*. It's *experiential*. If the implementation ever drifts away from the book metaphor — into "just another web reader with TTS" — the project has lost its reason to exist.
- This seed pre-empts itself. Don't open ho-01 here until both gates have cleared: (1) the diary's shared primitives have been extracted into `packages/`, and (2) Iona's use of the diary's bird has validated the read-along premise. The diary shipped v1.2 and the workspace conversion landed on 2026-06-19; neither gate has cleared yet.
