---
created: 2026-07-03
type: agent-task
status: complete
pr: https://github.com/sageframe-no-kaji/edelmore/pull/14
parent: audit/2026-07-03-monorepo-audit.md
project: edelmore-packages
---

**Goal**

Harden the shared narration wire adapter (`@edelmore/narration`): the Kokoro idle timer can no longer fire mid-request, client disconnects cancel upstream generation, `audioOffset` stays monotonic when a chunk has no timestamps, and the dead pre-streaming surface is removed. Both apps will consume this handler; these are wire-level fixes, not behavior changes to the diary's narration UX.

**Problem**

From the 2026-07-03 audit, all in `packages/narration/api/speak.ts` unless noted:

1. Lines 165-170, 374 — `resetIdleTimer()` is only called after a successful stream; an already-armed timer is never cleared when a new request arrives, so it can fire mid-generation and stop the container / unload the model under an active request.
2. Lines 311-380 — the `ReadableStream` has no `cancel()` handler and the upstream fetch has no abort wiring: when the browser drops the response (stop, navigation), the pump keeps reading and Kokoro keeps generating the full text.
3. Lines 344-345 — `audioOffset` falls back to `0` when a chunk's `timestamps` array is empty, snapping the client's absolute audio clock back to zero mid-stream.
4. Dead surface: `SpeakResponse` in `narration.ts:16-20` (pre-streaming shape, consumed nowhere), the ignored `speed` field on `SpeakRequest` (server pins upstream speed to 1.0 by design), and the `isKokoroVoiceUri` doc/regex mismatch (`narration.ts:41-44` — doc says lowercase, regex has `/i`).

**Files**

- Modify: `packages/narration/api/speak.ts`
- Modify: `packages/narration/narration.ts`
- Modify: `packages/narration/index.ts`
- Modify: `apps/diary/src/routes/api/speak/speak.test.ts`
- Modify: `apps/diary/src/lib/narration.test.ts`
- Read-only: `apps/diary/src/lib/components/BirdNarrator.svelte` (confirm the client still sends `speed` in its request body — removing the field from the *server-side interface* must not break the client, which is free to send extra fields)

**Required Changes**

1. **Idle timer discipline.** At handler entry (immediately after the auth check), clear any armed idle timer. Re-arm it when the response stream finishes — success OR error — so an aborted/failed stream still eventually unloads Kokoro. The `hadOutput` gate goes away; document with one comment line why the timer is cleared at entry.

2. **Cancellation plumbing.** Give the `ReadableStream` a `cancel()` handler that cancels the upstream reader. Create an `AbortController` for the upstream fetch and abort it from `cancel()` as well; additionally, if the platform provides `request.signal` on the SvelteKit `RequestEvent`, chain it so a dropped client request aborts upstream. Re-arm the idle timer on cancellation too.

3. **Monotonic `audioOffset`.** Track the last emitted offset across chunks. When a chunk arrives with an empty `timestamps` array, emit it with the carried-forward offset instead of `0`. Update the `StreamChunk.audioOffset` doc comment in `narration.ts` to state the carry-forward rule.

4. **Dead-surface removal.** Delete `SpeakResponse` from `narration.ts` and its re-export in `index.ts`. Delete `speed` from the server-side `SpeakRequest` interface in `speak.ts` (the handler never reads it; clients may still send it — JSON parsing ignores extras). Make `isKokoroVoiceUri` consistent: drop the `/i` flag so the regex matches the documented lowercase-only contract (Kokoro slugs are lowercase; the picker only ever stored lowercase slugs).

5. **Tests** (in the diary's suite, which is where package coverage currently lives):
   - A new request clears a previously armed idle timer (fake timers: arm via a completed request, advance close to expiry, fire a second request, advance past original expiry, assert no stop/unload call).
   - Cancelling the returned response stream cancels/aborts the upstream (assert via a mocked upstream whose reader records `cancel`, or an AbortSignal listener).
   - A mid-stream chunk with `timestamps: []` carries forward the previous chunk's offset (extend the existing NDJSON fixtures).
   - `isKokoroVoiceUri('AF_BELLA')` is false.

**Acceptance**

- [ ] Idle timer cleared at request entry, re-armed on stream completion, error, and cancel (asserted with fake timers).
- [ ] Client-side stream cancellation aborts/cancels the upstream fetch/reader (asserted in a test).
- [ ] Empty-timestamps chunks carry forward the previous `audioOffset` (asserted in a test).
- [ ] `SpeakResponse` and `SpeakRequest.speed` are gone; `grep -rn "SpeakResponse" apps packages` finds nothing outside git history.
- [ ] `isKokoroVoiceUri` regex matches its doc (lowercase-only) and the diary's VoicePicker/BirdNarrator behavior is unchanged for lowercase slugs.
- [ ] Full verify stack green: lint, check, test with coverage ≥ the configured floor.

**Verification**

```bash
npm run lint
npm run check
npm run test:coverage
grep -rn "SpeakResponse" apps packages --include='*.ts' --include='*.svelte' || echo "gone — OK"
```

**Do Not**

- Do not change the NDJSON chunk shape (`audio`, `format`, `words`, `audioOffset`) — `BirdNarrator` consumes it and is out of scope.
- Do not touch `BirdNarrator.svelte` or any diary component; this task is server-adapter-only plus its tests.
- Do not refactor the legacy Docker start/stop path beyond the idle-timer change (its duplication with `voices.ts` is a known nit, deliberately left).

**Stop Condition**

If SvelteKit's `RequestEvent` in the installed version does not expose a usable `request.signal` for detecting client disconnect, implement the `cancel()`-handler path only and surface the limitation in your final report rather than reaching for a polyfill or framework patch.

**Commit**

Single commit on branch `fix/at-03-narration-adapter`. Message format:

```
fix(narration): idle-timer safety, upstream cancellation, monotonic audioOffset

Clear the Kokoro idle timer at request entry so it cannot fire mid-
generation; cancel upstream generation when the client drops the stream;
carry audioOffset forward across timestamp-less chunks. Remove the dead
pre-streaming SpeakResponse type and the ignored speed field.
```

No AI-attribution trailers (no Co-Authored-By, no Generated-with). This overrides any default commit template.
