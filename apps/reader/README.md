# Edelmore Reader

*A read-along ebook reader that feels like a real book — on your own machine.*

> Upload an EPUB. Open it like a book. A small songbird in the margin reads it aloud in a warm voice while each word glows softly as it's spoken. Pages turn at the right moment. The book remembers where you left off. Built for the kids who hear stories better than they read them, and for anyone who wants reading to feel like the thing it used to be.

**Status:** In development. Shared packages extracted and shipped (reader Ho-01–03): `@edelmore/design`, `@edelmore/book`, `@edelmore/narration`. EPUB scaffold, parser, household library ingestion, and pagination testbed shipped 2026-07-03/04. Reader app design in progress.

## What's Broken

Read-along ebook readers exist. OpenReader, Chapter, Voice Dream Reader, Speechify, Calibre, Kindle's built-in TTS, Microsoft Edge's read-aloud. The technical problem — parsing EPUB, generating speech, highlighting words as they're spoken — is solved many times over. What none of them solve is the *experience*. Every one of them feels like reading software. Utilitarian panels, generic typography, route-style page changes, no spatial sense of where you are in the book. Functional, all of them. Warm, none of them.

For a kid with ataxia, dyslexia, attention differences, or just a preference for being read to, the difference between "software that reads at you" and "a book that's also reading itself to you" is the difference between using a tool and inhabiting an experience. The diary project has already built the second thing. The reader is the same warmth applied to published content.

## What Edelmore Reader Will Be

A self-hosted web app. You upload an EPUB or pick from a built-in library of public-domain children's books. The book opens to where you left off — to the cover if it's the first time. You see a real book: cream paper, warm serif type, illustrations where they belong, a small page-edge stack on the right showing how much you have ahead of you. You tap the songbird in the margin. The audio starts. The word being spoken glows soft green. When the audio reaches the end of the page, the page turns, and the audio continues uninterrupted into the next page. When the chapter ends, the page turns to the next chapter and waits for you to start it. When you close the book, it remembers where you stopped.

That is the entire feature set of v1. No annotations, no highlights, no bookmarks beyond "last position," no AI Q&A, no dictionary lookup, no dialog detection with multiple voices. Just a book that reads itself to you.

## What It Won't Be

- A reading platform. No store, no marketplace, no DRM-protected content.
- A note-taking or study tool. Existing readers do this; Edelmore is for *reading*.
- A cloud service. Books and reading positions live on your machine.
- A general-purpose document viewer. EPUB only in v1. PDF, MOBI, and AZW3 are explicitly deferred or out of scope.
- A productivity tool. The intent is the opposite — slow attention, sustained engagement, the feeling of a story being told.

## Your First Session

The shelf is on the front cover's inside flap. Six children's books sit there: *Alice in Wonderland*, *The Wind in the Willows*, *The Secret Garden*, *The Wonderful Wizard of Oz*, *A Little Princess*, *Just So Stories*. Standard Ebooks editions, public domain, illustrated by Tenniel and Shepard and Denslow and Sambourne. You pick *Wind in the Willows*. The book closes, lifts, and opens to chapter one — Mole spring-cleaning his hole.

The right margin has a small songbird. You tap it. The bird's flame lights. "The Mole had been working very hard all the morning," the bird says, and the first word glows. Each word lights as the bird reads it. You read along, or you don't. When the audio reaches the bottom of the right page, the page turns; the bird keeps reading without stopping; the next page's first word glows; the cycle continues.

You stop reading after twenty minutes. You close the laptop. The next afternoon you open Edelmore back to the same browser tab, and *Wind in the Willows* is open to the same spread, the same paragraph. You tap the bird again and it picks up where you stopped.

## How It Differs

Edelmore Reader sits in a narrow niche: read-along ebook readers that center on the *reading experience* rather than the *accessibility function*. OpenReader and Chapter are the closest open-source neighbors and they're meaningful reference points for the technical work — they prove the EPUB-plus-Kokoro pipeline is feasible. But their UI is utilitarian. Voice Dream Reader and Speechify are the commercial accessibility leaders, both excellent, both clinical. Kindle has read-aloud but it feels bolted on. None of them is a book in the way a child imagines a book.

Edelmore Reader's differentiator isn't the technology — it's that the book metaphor *is* the product. The page turn, the typography, the soft green word-glow, the warmth — the audio narration is one ingredient inside a larger reading experience, not the feature.

## Planned Architecture

The codebase will reuse most of the diary's infrastructure. Once the diary's book-metaphor and narration primitives are extracted into shared workspace packages, the reader becomes a thin layer that swaps out the content model (diary entries → book chapters) and the pagination strategy (textarea-overflow → CSS Multi-column Layout).

**Reused from `apps/diary` (via `packages/*`):**
- The book metaphor — cover, spreads, page-edge stacks, gutter seam, custom clone-rotate flip (`packages/book`); View Transitions rewrite in progress as reader Ho-04.
- The narration stack — `@edelmore/narration` wire adapter (Kokoro handler factories + stream types); narration UI (bird, ribbon, voice picker, rate slider) is per-app.
- Word-by-word highlighting — per-app `ReaderView` component, the soft green aura, the boundary-driven page-turn.
- Cottage-core visual identity — Tailwind design tokens, paper texture, EB Garamond serif.
- Sageframe-conventional Docker deployment.

**New for the reader:**
- EPUB parsing (server-side) — extracts text, structure, cover image, embedded illustrations into a normalized internal format.
- CSS Multi-column Layout pagination — replaces the diary's textarea-overflow mechanism, since reader content is known up front and never changes during a session.
- Library / shelf UI — replaces the diary's date-based table of contents.
- Reading position persistence per user per book.
- Illustration handling — full-page plates get their own pages; inline illustrations flow naturally; alt text reads aloud when audio reaches an image (genuine accessibility win for well-formed EPUBs).

## Tech Stack

- **SvelteKit (TypeScript)** — same framework as the diary, single language across frontend and backend.
- **SQLite** via `better-sqlite3` — books, chapters, reading positions, users. Same persistence pattern as the diary.
- **Kokoro TTS** via a self-hosted [Kokoro-FastAPI](https://github.com/remsky/kokoro-fastapi) instance — warm voices, runs on a small CPU box, no cloud TTS bill, no diary text leaving the home network.
- **EPUB parsing** via `epub2` or similar Node library — extract text, manifest, spine, resources. Inspired by [OpenReader WebUI](https://github.com/richardr1126/OpenReader-WebUI)'s approach.
- **CSS Multi-column Layout** for pagination — the browser flows chapter text into column-shaped pages; reading position becomes a character offset that maps to a column via DOM geometry.
- **Custom clone-rotate flip** for page-turn animation via `packages/book` — the same mechanism used in the diary. A View Transitions rewrite is in progress as reader Ho-04.
- **Tailwind v4** + cottage-core design tokens — cream palette, EB Garamond serif, paper texture, edelweiss-green word-glow.
- **Docker** via the [Sageframe](https://sageframe.net) deployment pattern.

## Roadmap

This is a state-based roadmap, not a date-based one.

1. **Done.** Seed, package extractions (Ho-01–03), EPUB scaffold, parser, library ingestion, and pagination testbed shipped.
2. **Done.** Diary shipped v1.2; narration validated by real users.
3. **Done.** Shared primitives extracted into `packages/` — `@edelmore/book`, `@edelmore/narration`, `@edelmore/design`.
4. **In progress.** EPUB parsing and EPUB pipeline shipped; full app design (identity mechanic, Kamae 2 follow-up) pending.
5. **Subsequent hos.** CSS Multi-column pagination. Reading position persistence. Illustration handling. Built-in public-domain library. Deploy.
6. **v1.0.** Six public-domain children's books, full read-along, position sync, illustration support.
7. **Beyond v1.** AI-generated descriptions for illustrations lacking alt text. Audio caching. Per-chapter voice selection. Possibly XTTS-based voice cloning for parents to record their own narrator voice. All deferred and intentional.

## Documents

- `docs/seed.md` — the original Kamae-1-style seed deliberation (preserved verbatim).
- Diary system design lives at `apps/diary/ho-process/kamae-2-edelmore-system-design.md` (gitignored — private practitioner work).

## Why "Edelmore"

The name was chosen by Iona, the diary's first user. It's a mix between Edelweiss and Evermore. It carries forward unchanged. The reader sits in the same family of objects under the same name.

## License

MIT.

---

*Edelmore Reader is part of [atmarcus.net](https://atmarcus.net). Built for a kid who wanted to read along to her own books, and for the world that benefits when accessibility tools look like things people want to use.*
