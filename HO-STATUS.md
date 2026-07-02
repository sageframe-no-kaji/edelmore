# Edelmore ho status

_Where each app's Kamae chain sits right now. A signpost — update when a ho ships, opens, or gets filed. The chain docs themselves live in each app's gitignored `ho-process/` directory._

Last updated: 2026-07-02 (Ho-03 merged to `main` as `5f1bce1`).

---

## Diary chain — `apps/diary/ho-process/`

**Status: v1.0 shipped. Post-v1.0 hos accreting.**

| Ho | Status | Notes |
|---|---|---|
| ho-00 → ho-07 | ✅ shipped v1.0 | See `kamae-4-ho-outline.md`. Bootstrap through homelab deploy. |
| **ho-08 — Narration UX: chapter-continuous audio** | 📋 **filed, not opened** | Whole-entry Kokoro pivot to eliminate the page-turn pause. Opens whenever it's worth Iona's time. |

Extraction hos (Ho-01/02/03) shipped from the reader's chain, not the diary's — see below.

---

## Reader chain — `apps/reader/ho-process/`

**Status: extraction complete; reader-app design pending.**

| Item | Status | Notes |
|---|---|---|
| Kamae 1 (seed) | ✅ done | `seed.md` |
| Kamae 2 (system design) | 🟡 **extraction portion settled; reader-app portion pending** | Seven open decisions — see `notes/kamae-2-followup-prep.md` for prep. |
| Kamae 4 (ho outline) | 🟡 exists; awaits Kamae 2 update | `kamae-4-ho-outline.md` |
| Kamae 5 (per-ho docs) | ⏳ not yet | |
| Ho-01 — extract `@edelmore/design` | ✅ shipped (`078bf23`) | |
| Ho-02 — extract `@edelmore/book` | ✅ shipped (`f29b619`) | |
| Ho-03 — extract `@edelmore/narration` | ✅ shipped (`5f1bce1`) | Scope drift acknowledged in `hos/ho-03-extract-narration.md → Reflect`. Diary Ho-08 filed as the follow-up. |
| Ho-04+ | ⏳ awaits Kamae 2 follow-up + Kamae 4 update | |

---

## Next moves (pick one)

| Move | Skill to invoke | Reads |
|---|---|---|
| **Reader Kamae 2 follow-up** — resolve the 7 open decisions | `ho-kamae-2-system-design-collaborator` | `apps/reader/ho-process/kamae-2-edelmore-reader-system-design.md` + `notes/kamae-2-followup-prep.md` |
| **Reader Kamae 4 update** (after Kamae 2 lands) | `ho-kamae-4-overview-collaborator` | `apps/reader/ho-process/kamae-4-ho-outline.md` |
| **Reader Ho-04 authoring** (after Kamae 4) | `ho-kamae-5-authoring-collaborator` | reader Kamae chain |
| **Diary Ho-08** (whole-entry narration pivot) | `ho-kamae-5-authoring-collaborator` | `apps/diary/ho-process/kamae-4-ho-outline.md` → Post-v1.0 § ho-08 |

---

## Rules (reminder)

- **One session, one ho, one chain.** See root `CLAUDE.md` § "Project documents & ho discipline."
- **Extraction hos hold their scope.** Behavior changes surfaced during an extraction are new hos in the *affected app's* chain — not iterations on the extraction ho. (This is the lesson from Ho-03's scope drift; codified in `CLAUDE.md`.)
- **Diary and reader do not share code except via `packages/`.** Presentation lives per-app. Only wire types + protocol adapters clear the shared-package bar.
- **`ho-process/` is gitignored.** This file is the public-facing signpost; the chain docs themselves are private practitioner work.
