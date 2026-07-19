# Edelmore ho status

_Where each app's Kamae chain sits right now. A signpost — update when a ho ships, opens, or gets filed. The chain docs themselves live in each app's gitignored `ho-process/` directory._

Last updated: 2026-07-18 (reader **Kamae 2 settled** — all seven deferred decisions resolved + identity/curation mechanic, recorded in `kamae-2-…-system-design.md` Part II; ready for Kamae 4 re-flow. Also caught up: reader Ho-04 Phase E merged #31 — clone-rotate retired, `flip()` is View Transitions only; provisional dignity + mechanics #30; "the voice is resting" TTS-failure state in both apps #32).

---

## Diary chain — `apps/diary/ho-process/`

**Status: v1.0 shipped. Post-v1.0 hos accreting.**

| Ho | Status | Notes |
|---|---|---|
| ho-00 → ho-07 | ✅ shipped v1.0 | See `kamae-4-ho-outline.md`. Bootstrap through homelab deploy. |
| **ho-13 — whole-entry narration** (renumbers the filed "ho-08" outline entry) | 🟢 **open — mechanical work merged (#24); gated on practitioner listening pass** | One stream per entry; flip at highlight crossing; chain/preload plumbing deleted. |
| ho-11 — page-turn rewrite (View Transitions) | ↪️ superseded | Never executed; flip moved to `packages/book`. Re-filed as **reader Ho-04** (2026-07-04). |

Extraction hos (Ho-01/02/03) shipped from the reader's chain, not the diary's — see below.

---

## Reader chain — `apps/reader/ho-process/`

**Status: extraction complete; reader-app design pending.**

| Item | Status | Notes |
|---|---|---|
| Kamae 1 (seed) | ✅ done | `seed.md` |
| Kamae 2 (system design) | ✅ **settled (2026-07-18)** | Reader-app architecture resolved in Part II — seven decisions + identity/curation mechanic (adoptable many-to-many ownership, dog-ear/bookmark kinds, roster identity). Provisional→target deltas named for Kamae 4. |
| Kamae 4 (ho outline) | ✅ **re-flowed (2026-07-19)** | 17 hos / 6 phases. Shipped work numbered Ho-05–11; forward deltas sequenced Ho-12 (household migration) → Ho-13–16 (the magic) → Ho-17 (deploy). |
| Kamae 5 (per-ho docs) | 🟢 **next — author Ho-12** | Household target migration (`book_owners` many-to-many · `place_marks.kind` · roster). `ho-kamae-5-authoring-collaborator`. |
| Ho-01 — extract `@edelmore/design` | ✅ shipped (`078bf23`) | |
| Ho-02 — extract `@edelmore/book` | ✅ shipped (`f29b619`) | |
| Ho-03 — extract `@edelmore/narration` | ✅ shipped (`5f1bce1`) | Scope drift acknowledged in `hos/ho-03-extract-narration.md → Reflect`. Diary Ho-08 filed as the follow-up. |
| **Ho-04 — page-turn rewrite (View Transitions in `@edelmore/book`)** | 🟢 **open — Phases A–E merged (#23, #26, #31), practitioner-verified; clone-rotate retired, `flip()` is View Transitions only** | Supersedes diary ho-11. Any remaining edge-check / verdict items are the tail. `hos/ho-04-page-turn-view-transitions.md` |
| EPUB piping (scaffold, parser, library/ingestion, pagination + dev route) | ✅ shipped (#18–#21, 2026-07-03/04) | Built from `audit/R-AT-01…04` specs ahead of the Kamae 4 re-flow, per decisions in `notes/kamae-2-followup-prep.md` §2026-07-03. Kamae 4 assigns its numbers when it updates. |
| Book route + narration (state machine, positions, library switching, whole-chapter engine, read-along wiring) | ✅ shipped (#27–#29, 2026-07-17) | `audit/R-AT-05…07`. Placeholder visuals throughout — cover art, transform, ribbon, dog-ears are the practitioner design hos. Listening pass pending. |
| Ho-05+ | ⏳ awaits Kamae 2 follow-up (identity mechanic, decision 7) + Kamae 4 re-flow | |

---

## Next moves (pick one)

| Move | Skill to invoke | Reads |
|---|---|---|
| **Reader Ho-12 authoring** — household target migration (first forward ho) | `ho-kamae-5-authoring-collaborator` | `apps/reader/ho-process/kamae-4-ho-outline.md` (Ho-12) + Kamae 2 Part II R4 |
| **Diary ho-13 listening pass** (gates the merged whole-entry narration) | none — practitioner + browser | `apps/diary/ho-process/hos/ho-13-whole-entry-narration.md` |

---

## Rules (reminder)

- **One session, one ho, one chain.** See root `CLAUDE.md` § "Project documents & ho discipline."
- **Extraction hos hold their scope.** Behavior changes surfaced during an extraction are new hos in the *affected app's* chain — not iterations on the extraction ho. (This is the lesson from Ho-03's scope drift; codified in `CLAUDE.md`.)
- **Diary and reader do not share code except via `packages/`.** Presentation lives per-app. Extract when the second consumer arrives AND both apps must consume the exact behavior — that is the bar for `packages/`.
- **`ho-process/` is gitignored.** This file is the public-facing signpost; the chain docs themselves are private practitioner work.
