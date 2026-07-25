---
created: 2026-07-17
type: agent-task
status: complete
pr: https://github.com/sageframe-no-kaji/edelmore/pull/28
parent: apps/reader/ho-process/notes/kamae-2-followup-prep.md
project: edelmore-reader
model: opus
---

**Goal**

The reader's voice: a reader-local whole-chapter narration engine (the diary ho-13 shape — one Kokoro stream per chapter, page flip when the highlight crosses the spread boundary), plus the `/api/speak` + `/api/speak/voices` shims, wired into the DEV route (`/dev/book/[id]`) with minimal unstyled controls so it is audible end-to-end. The real ribbon (play/pause/forward/volume/library, per the physical-book principle) is practitioner-designed later — your controls are plain buttons.

**Context**

The diary's post-ho-13 `apps/diary/src/lib/components/BirdNarrator.svelte` is the reference implementation of the engine shape: single `StreamCtx`, chunk queue with `pumpQueue()` chokepoint, `userPaused` flag, boundary poll firing `onPageBoundaryReached` at the crossing, phases idle/loading/playing/paused. Copy-and-adapt per-app (the sharing rule): the reader's engine is HEADLESS — a TypeScript module, not a bird component — because the reader's UI (ribbon) is different and comes later. `@edelmore/narration` provides the wire: `createSpeakHandler`/`createVoicesHandler` factories and the `StreamChunk` types. Kokoro is reachable at the same env the diary uses (`TTS_URL` etc. — mirror the diary's `.env.example` entries into the reader's).

**Files**

- Create: `apps/reader/src/routes/api/speak/+server.ts` and `api/speak/voices/+server.ts` — thin env shims calling the package factories (mirror the diary's; note the reader has no `locals.user` — the handler factory requires it, so provide a `locals`-compatible truthy user via the reader's hooks (household model: network is the gate); document this in the shim)
- Modify: `apps/reader/src/hooks.server.ts` and `app.d.ts` as needed for the above
- Create: `apps/reader/src/lib/narration-engine.ts` (+ exhaustive test) — the headless engine: `createNarrationEngine({ fetchSpeak, onWordHighlight, onPageBoundaryReached, onPhaseChange })` with `play(text, fromOffset)`, `pause`, `resume`, `stop`, `setRate` (0.5–1.6, playbackRate-based); NDJSON chunk ingestion; single stream per play; monotonic highlight emission; chunk-gap pause; abort on stop
- Create: `apps/reader/src/lib/components/NarrationControls.svelte` (+ test) — plain buttons: play/pause, stop, rate down/reset/up; visibly provisional (unstyled)
- Modify: `apps/reader/src/routes/dev/book/[id]/+page.svelte` — wire the engine: play narrates the CURRENT chapter from the current spread's start to chapter end; `onWordHighlight` drives PageView's `currentCharIndex`; `onPageBoundaryReached` flips forward via the existing flip path (guard a bird-initiated flag so the manual-flip-stops-narration rule can coexist: manual flips stop the engine)
- Modify: `apps/reader/.env.example` — TTS entries mirrored from the diary's
- Read-only: diary BirdNarrator (engine reference), diary api/speak shims, `packages/narration/*`

**Required Changes**

1. Engine tests mirror the diary's ho-13 suite: phase transitions; one fetch per play; crossing fires callback exactly once per boundary without pausing audio (stubbed Audio); monotonic highlights; chunk-gap pause holds until resume; stop aborts fetch and revokes blob URLs; rate clamps and applies to queued elements.
2. Chapter-end behavior: engine ends (idle) at chapter end; the dev route offers a trivial "continue to next chapter" only via pressing play again on the new chapter — auto-advance across chapters is a design decision left open (note it in a comment).
3. The speak shims must pass the package factory's auth check under the household model — do it via hooks-provided locals, with a comment referencing the open identity mechanic; do NOT modify the package.
4. Whole-chapter is the model: no untilOffset in the play path; `pageEndOffset` equivalent comes from the route's current spread splits and updates on flip.

**Acceptance**

- [ ] Engine test suite green with the behaviors in change 1; engine module at 100% lines.
- [ ] Dev route: play → words highlight in PageView, page flips at the crossing via `BookShell.flip`, manual flip stops narration (route-level tests with mocked engine or fetch).
- [ ] Speak shims proxy through the package factories; no package modifications (`git diff packages/` empty).
- [ ] Full verify stack green from repo root, floors included; reader build succeeds.

**Do Not**

- Do not build the ribbon, bird/avatar, voice picker UI, or any styling beyond functional buttons.
- Do not touch `apps/reader/src/routes/+page.svelte` (R-AT-05 owns it, running in parallel) or `book-state.ts` — your route surface is the dev route only.
- Do not modify `packages/` or the diary.

**Stop Condition**

If the headless-engine extraction reveals the diary's engine shape doesn't survive without its component wrapper (Svelte-reactivity dependencies that don't port to a plain module), stop and surface — that finding feeds the future shared-engine extraction decision.

**Commit**

Single commit on branch `feat/r-at-06-reader-narration`. Message: `feat(reader): whole-chapter narration engine, speak shims, dev-route wiring`. No AI-attribution trailers — hard project rule.
