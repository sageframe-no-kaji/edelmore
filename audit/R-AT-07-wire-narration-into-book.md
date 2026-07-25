---
created: 2026-07-17
type: agent-task
status: complete
pr: https://github.com/sageframe-no-kaji/edelmore/pull/29
parent: apps/reader/ho-process/notes/kamae-2-followup-prep.md
project: edelmore-reader
model: opus
---

**Goal**

Marry R-AT-05 and R-AT-06: the whole-chapter narration engine plays inside the real book route (`/`) — play from the current chapter spread, words highlight, pages turn at the crossing, manual flips stop the voice, and reading positions keep saving through narrated flips. Controls remain the plain provisional buttons; the ribbon is practitioner design, later.

**Context**

Both parents are merged to main. `apps/reader/src/routes/dev/book/[id]/+page.svelte` already demonstrates the full wiring pattern (engine + highlight + flip-at-crossing + manual-flip-stops via the `fromNarration` guard) — it is the reference; the book route (`+page.svelte`) has the state machine, pagination cache, and position persistence. This task composes what exists; it should invent nothing new.

**Files**

- Modify: `apps/reader/src/routes/+page.svelte` (+ its route test) — narration wiring for `chapter` spreads only
- Create or Modify: a small shared helper in `$lib` ONLY if the dev route's wiring would otherwise be duplicated near-verbatim (e.g., a `wireNarration(...)` composition helper); judge duplication honestly — two ~40-line wirings may be acceptable per-route
- Read-only: `narration-engine.ts`, `NarrationControls.svelte`, `book-state.ts`, `position.ts`, the dev route

**Required Changes**

1. `NarrationControls` renders only on `chapter` spreads (never closed/title/library). Play narrates from the current spread's left start to chapter end; highlight drives both `PageView`s; `pageEndOffset` tracks the current spread's boundary and updates on every flip (null on the chapter's last spread).
2. Flip-at-crossing goes through the state machine's `flipNext` with the `fromNarration` guard; manual flips (zones, keyboard, library button) stop the engine; entering title/library or switching books stops the engine.
3. Position persistence continues through narrated flips (the debounced saver fires on engine-driven spread changes exactly as on manual ones).
4. Chapter end → engine idle; no cross-chapter auto-advance (same open decision as the dev route; carry the comment).
5. Route tests (mocked engine or fetch): controls only on chapter spreads; play wires highlight + boundary callback; manual flip stops; book-switch stops; position save still fires on narrated flips.

**Acceptance**

- [ ] All change-5 behaviors asserted in tests.
- [ ] Dev route untouched or only refactored via the optional shared helper with its tests still green.
- [ ] Full verify stack green from repo root, floors included; reader build succeeds.

**Do Not**

- No styling, no ribbon, no bird/avatar, no volume control beyond what NarrationControls already has.
- Do not modify `packages/`, the diary, the engine module, or the API shims.

**Commit**

Single commit on branch `feat/r-at-07-wire-narration`. Message: `feat(reader): narration wired into the book route`. No AI-attribution trailers — hard project rule.
