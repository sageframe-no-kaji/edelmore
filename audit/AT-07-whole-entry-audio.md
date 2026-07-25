---
created: 2026-07-04
type: agent-task
status: complete
pr: https://github.com/sageframe-no-kaji/edelmore/pull/24
parent: apps/diary/ho-process/hos/ho-13-whole-entry-narration.md
project: edelmore-diary
model: opus
---

**Goal**

Execute diary ho-13: replace `BirdNarrator`'s per-spread synthesis + chain/preload model with one continuous stream per entry. Page turns become a consumer of the highlight timeline; the chain plumbing is deleted; the pause race and the mid-entry editor flash become unrepresentable. Merge is gated on a practitioner listening pass — your bar is the full verify stack plus new component tests.

**Context**

Read the parent ho document first — Decisions 1–6 are your spec. The audit trace behind it is `audit/2026-07-03-monorepo-audit.md` §3.2/§5. Files of record: `apps/diary/src/lib/components/BirdNarrator.svelte` (the engine), `apps/diary/src/routes/(authenticated)/+layout.svelte` (the consumer glue: `birdStartOffset`/`birdUntilOffset`/`handlePageBoundary`/`birdInitiatedFlip`). The `@edelmore/narration` wire adapter is out of scope and already hardened (cancellation exists server-side — your `stop()` path should abort the client fetch, which it already does via `fetchAbort`).

**Files**

- Modify: `apps/diary/src/lib/components/BirdNarrator.svelte`
- Modify: `apps/diary/src/routes/(authenticated)/+layout.svelte` (consumer glue only — the narration-related handlers and props; nothing else in this 2,000-line file)
- Create: `apps/diary/src/lib/components/BirdNarrator.test.ts` (the engine has no test file today)
- Read-only: `apps/diary/src/lib/components/ReaderView.svelte`, `apps/diary/src/lib/content.ts` (splitPoints semantics)

**Required Changes**

1. **One stream per entry** (ho Decision 1): bird click fetches from the current spread's start offset to entry end. `untilOffset` disappears from the play path; the layout stops passing it (keep `startOffset`). Chunks queue and play sequentially exactly as today within a single `StreamCtx`.
2. **Flip at the crossing** (Decision 2): the boundary poll fires `onPageBoundaryReached` when the highlighted word's absolute index crosses `pageEndOffset` (no `BOUNDARY_LOOKAHEAD_CHARS`, no arming). The layout's handler flips (existing `birdInitiatedFlip` mechanics) and does nothing else — no preload call. `pageEndOffset` continues to update per spread from the layout.
3. **Phase model** (Decision 3): `loading` only before the first chunk plays; `playing`/`paused` thereafter. The `birdPlaying` derivation in the layout is untouched — the flash fix falls out of the phase model.
4. **Pause race** (Decision 4): a `userPaused` flag; `pause()` sets it (even when `audioEl === null` between chunks), chunk-advance refuses to start playback while it's set, `resume()` clears it and starts the pending chunk if one is queued.
5. **Deletions** (Decision 5): `preloadNext`, `preload` ctx, `chainArmed`, `chainPending`, `chainGapTimer`, `prewarmChunk`, `tryChainNow`, `cutCurrentAudio`, `swapCurrentToPreload`, `CHAIN_GAP_MS`, `BOUNDARY_LOOKAHEAD_CHARS`, `seekTo` (unused export), and the layout's `handlePageBoundary` preload lines. Update the layout's stale narration comments in the same pass (the block claims BirdNarrator lives in `@edelmore/narration`; it is diary-local).
6. **Tests** (`BirdNarrator.test.ts`, happy-dom, mocked `fetch` NDJSON + stubbed `Audio`): phase transitions (idle → loading → playing → paused → playing → idle); single fetch per play (no second request when the highlight crosses a boundary); `onPageBoundaryReached` fires exactly once per crossing with audio uninterrupted (the stubbed Audio never receives `pause()` from the crossing path); highlight indices emitted across a simulated boundary are monotonic; pause during a chunk gap prevents the next chunk's `play()` until resume; `stop()` aborts the in-flight fetch and revokes blob URLs.

**Acceptance**

- [ ] One `/api/speak` request per bird click, asserted in a test.
- [ ] Boundary crossing fires the callback without pausing/cutting audio, asserted.
- [ ] Chunk-gap pause holds until resume, asserted.
- [ ] Every Decision-5 symbol is gone: `grep -nE "preloadNext|chainArmed|chainPending|prewarmChunk|tryChainNow|cutCurrentAudio|CHAIN_GAP_MS|BOUNDARY_LOOKAHEAD|seekTo" apps/diary/src` is empty.
- [ ] Full verify stack green, coverage floor included.

**Verification**

```bash
npm install
npm run lint && npm run check && npm run test:coverage
grep -rnE "preloadNext|chainArmed|chainPending|prewarmChunk|tryChainNow|cutCurrentAudio|CHAIN_GAP_MS|BOUNDARY_LOOKAHEAD|seekTo" apps/diary/src || echo "gone — OK"
```

**Do Not**

- Do not touch `packages/narration` or the `/api/speak` shims.
- Do not change the bird's UI, phases' visual states, rate controls, or the `BirdPhase` type.
- Do not add auto-advance to the next entry — `handleNarrationEnd` stays a no-op.
- Do not restore any Web Speech path.
- Do not edit anything in `+layout.svelte` beyond the narration glue and the stale narration comments.

**Stop Condition**

If the flip-at-crossing turns out to need BirdNarrator to know about the flip animation's timing (i.e., the clean "consumer flips on callback" separation doesn't survive contact), stop and surface — coupling the engine to the flip is an architectural change the practitioner decides.

**Commit**

Single commit on branch `feat/ho-13-whole-entry-audio`. Message: `feat(diary): whole-entry narration — one stream per entry, flip at highlight crossing (ho-13)`. No AI-attribution trailers — hard project rule.
