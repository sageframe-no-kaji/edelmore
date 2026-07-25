---
created: 2026-07-03
type: agent-task
status: complete
pr: https://github.com/sageframe-no-kaji/edelmore/pull/15
parent: audit/2026-07-03-monorepo-audit.md
project: edelmore-diary
---

**Goal**

Fix the diary's UI-component bug batch from the 2026-07-03 audit: TocPage's visible-count ratchet, MicQuill's lifecycle/error-visibility/click-latch trio, VoicePicker's fetch-after-unmount and blob leak, CalendarModal's double-close and missing focus management, the settings size-stepper reconcile, PIN-input accessibility, and ReaderView's self-triggering effect. All are behavior-preserving repairs — no visual redesign.

**Files**

- Modify: `apps/diary/src/lib/components/TocPage.svelte`, `TocPage.test.ts`
- Modify: `apps/diary/src/lib/components/MicQuill.svelte`, `MicQuill.test.ts`
- Modify: `apps/diary/src/lib/components/VoicePicker.svelte`
- Modify: `apps/diary/src/lib/components/CalendarModal.svelte`, `CalendarModal.test.ts`
- Modify: `apps/diary/src/lib/components/ReaderView.svelte`
- Modify: `apps/diary/src/routes/settings/+page.svelte`, `settings/settings.test.ts`
- Modify: `apps/diary/src/routes/login/+page.svelte`, `login/login.test.ts`
- Modify: `apps/diary/src/routes/admin/+page.svelte`

**Required Changes**

1. **TocPage ratchet** (`TocPage.svelte:31-40`). `visibleCount` can shrink but never grow (measurement only sees already-rendered items) and never resets when `entries` grows. Adopt the CoverPage measure pattern: on resize or entries change, reset `visibleCount` to `orderedEntries.length`, `await tick()`, measure, clamp. Test: shrink then grow the measured container (mock heights) and assert the count recovers; grow `entries` and assert new items appear.

2. **MicQuill lifecycle** (`MicQuill.svelte:12-18,66-70`). Recording state is module-scoped with no unmount cleanup: navigating away mid-recording leaves the mic hot, keeps the 250 ms interval running to the 90 s cap, and fires `activeInsert` into a destroyed component. Add instance cleanup: if this instance owns the active recording, cancel it (stop tracks, clear timer, reset shared state) on unmount; otherwise leave the shared state alone (the module-level store deliberately mirrors one recording across instances — preserve that design).

3. **MicQuill error visibility** (`MicQuill.svelte:31-38,221-227`). Error strings exist only in `aria-label` + a color change. Render the message in a positioned `role="status"` (`aria-live="polite"`) element while `phase === 'error'`, styled consistently with the existing ribbon tooltips. Also: keep a handle to the error-reset `setTimeout` and clear it before scheduling a new one (a second error within 2.5 s is currently dismissed early by the first error's timer).

4. **MicQuill click latch** (`MicQuill.svelte:179-201`). `suppressClick` latches when a hold-cancel ends off-button and swallows the next genuine tap. Clear it in `onpointerleave`/`onpointercancel` (or replace the boolean with a short expiry timestamp).

5. **VoicePicker** (`VoicePicker.svelte:56-82,117-120`). The mount fetch has no abort/cleanup — it writes state (and calls `onChange`) after unmount. Return an abort cleanup from the effect. In `previewVoice`: revoke the blob URL on error paths too (`audio.onerror`, `play()` rejection), and stop/revoke any prior preview before starting a new one.

6. **CalendarModal** (`CalendarModal.svelte:21-33,50-66`). (a) Escape currently calls `onClose()` twice (window + div handler) — keep one code path. (b) Add focus management: focus the dialog on mount, restore focus to the previously focused element on close. (c) Clamp month navigation to `[minYear, maxYear]` so the year `<select>` never renders an empty selection.

7. **Settings size stepper reconcile** (`settings/+page.svelte:27,84-94`). `currentSize` is mutated optimistically before the action round-trips and never reconciles on failure. Update it only on action success (in the `use:enhance` callback) or re-derive from `data.font_size` after invalidation — pick whichever fits the existing enhance flow; the invariant is: after a failed save, the stepper shows the persisted value.

8. **PIN input accessibility.** `login/+page.svelte:50-60` and `admin/+page.svelte:19-26`: give the password inputs an accessible name (`aria-label="4-digit PIN"` or a visually-hidden label). Login's user-select buttons (`login/+page.svelte:28-39`): add `aria-pressed`.

9. **ReaderView self-read effect** (`ReaderView.svelte:21-36`). The `$effect` both reads and writes `currentSpanIndex`. Track the previous index in a plain (non-`$state`) local so the effect no longer depends on the state it assigns; keep the scroll side-effect behavior identical.

**Acceptance**

- [ ] TocPage recovers visible items after container growth and reflects added entries (asserted in tests).
- [ ] Unmounting the recording MicQuill instance stops the recorder/timer and cannot invoke the destroyed `oninsert` (asserted in a test with mocked MediaRecorder).
- [ ] MicQuill errors are visible in the DOM inside a `role="status"` element while in error phase (asserted in a test).
- [ ] VoicePicker's effect returns an abort cleanup; no state writes after unmount (asserted or verified by code review note in the final report if jsdom can't express it).
- [ ] CalendarModal: one `onClose()` per Escape; dialog receives focus on open (asserted in tests).
- [ ] Settings stepper shows the persisted size after a failed save (asserted in a test).
- [ ] PIN inputs have accessible names (asserted via testing-library `getByLabelText` or role queries).
- [ ] Full verify stack green: lint, check, test with coverage ≥ the configured floor.

**Verification**

```bash
npm run lint
npm run check
npm run test:coverage
```

**Do Not**

- Do not restyle anything — same classes, same layout; new DOM only where a change requires it (error status element, logout untouched — that's AT-04).
- Do not convert MicQuill's module-level store to per-instance state — the singleton mirroring across ribbon/page/mobile instances is deliberate.
- Do not touch `BirdNarrator.svelte` or the `(authenticated)/+layout.svelte` — narration behavior and flip orchestration are separate, practitioner-supervised work.

**Stop Condition**

If any fix requires changing component public props (used by `+layout.svelte`), stop and surface — the layout is out of scope and prop-contract changes ripple into it.

**Commit**

Single commit on branch `fix/at-05-ui-component-bugs`. Message format:

```
fix(diary): UI component bug batch from 2026-07-03 audit

TocPage visible-count ratchet; MicQuill unmount cleanup, visible error
status, click latch; VoicePicker abortable fetch and preview blob
hygiene; CalendarModal single close, focus management, year clamp;
settings stepper reconcile; PIN input a11y; ReaderView effect no longer
reads its own write.
```

No AI-attribution trailers (no Co-Authored-By, no Generated-with). This overrides any default commit template.
