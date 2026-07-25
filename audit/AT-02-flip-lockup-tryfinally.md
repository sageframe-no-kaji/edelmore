---
created: 2026-07-03
type: agent-task
status: complete
pr: https://github.com/sageframe-no-kaji/edelmore/pull/13
parent: audit/2026-07-03-monorepo-audit.md
project: edelmore-packages
---

**Goal**

Make `flip()` in `packages/book/BookShell.svelte` exception-safe: a `mutate()` (or tween) failure must never leave `isFlipping` latched true or leave flip clones / `flip-hidden` classes in the DOM. Success-path behavior is byte-for-byte identical.

**Problem**

`flip()` (`packages/book/BookShell.svelte:99-226`) sets `isFlipping = true`, then awaits `mutate()` — which in the diary can be `navigateTo()` (fetch + `goto`) and can reject. There is no try/finally, so a single rejection permanently locks the book (every subsequent flip returns at the `isFlipping` guard) and can strand the cloned faces, the opposite overlay, and the `flip-hidden` classes on the live pages.

**Files**

- Modify: `packages/book/BookShell.svelte`
- Create or Modify: a test covering the throw path — extend `apps/diary/src/lib/components/Spread.test.ts` or create `apps/diary/src/lib/components/BookShell.test.ts`, whichever fits the existing test layout (the diary's vitest config is the only test runner in the workspace today).

**Required Changes**

1. **Wrap the flip body in try/finally.** Everything after the early-return guards. The `finally` must, unconditionally: unsubscribe the `flipAngle` subscription if created, remove `wrapper` and `oppositeOverlay` if attached, remove `flip-hidden` from both live pages if added, and reset `isFlipping = false`. The existing happy-path cleanup lines collapse into this single cleanup rather than being duplicated.

2. **Early-return paths stay early returns.** The `!bookShellEl`, reduced-motion, and `!oldFront` branches that run `await mutate()` and return before `isFlipping = true` must not acquire the try/finally obligations — but note the current code sets `isFlipping = true` BEFORE the 500 ms forward delay and before the `!oldFront` check happens (the snapshot is taken after the delay). Trace the actual ordering in the file and make sure every path that sets `isFlipping = true` releases it on every exit, including a `mutate()` that throws inside those early paths if the flag was already claimed.

3. **A rejected `mutate()` propagates.** The caller (`diaryFlip`) may want to know; do not swallow the error — clean up in `finally`, let the rejection surface.

4. **Test the throw path.** Mount `BookShell` (jsdom), call `flip('forward', () => { throw new Error('boom') })`, catch the rejection, then assert a second `flip()` still invokes its `mutate` (i.e., `isFlipping` was released) and that no `.flip-hidden` class remains in the container. If jsdom's lack of rAF/animation makes the full tween path untestable, testing the pre-tween throw (mutate rejects) is sufficient — that is the real-world failure (network error in `navigateTo`).

**Acceptance**

- [ ] `flip()` releases `isFlipping` and removes clones/`flip-hidden` on a rejected `mutate()` (asserted in a test).
- [ ] A second flip after a failed flip executes normally (asserted in the same test).
- [ ] No behavior change on the success path: no edits outside the try/finally restructuring; the 500 ms delay, snapshot order, midpoint swap, and cleanup semantics are untouched.
- [ ] Full verify stack green: lint, check, test with coverage ≥ the configured floor.

**Verification**

```bash
npm run lint
npm run check
npm run test:coverage
git diff --stat   # should touch only BookShell.svelte and the test file
```

**Do Not**

- Do not remove or change the 500 ms forward delay, the tween duration, or any visual mechanics — the page-turn rewrite is a separate, practitioner-supervised ho. This task is exception-safety only.
- Do not refactor `flip()` beyond what try/finally requires.

**Stop Condition**

If making the throw-path test pass requires changing the success-path DOM sequencing (e.g., moving where clones are appended), stop and surface — that ordering was tuned by eye and only the practitioner can re-verify it visually.

**Commit**

Single commit on branch `fix/at-02-flip-lockup`. Message format:

```
fix(book): flip() releases isFlipping and cleans up clones on mutate failure

A rejected mutate() (e.g. failed navigation) previously left isFlipping
latched true, permanently locking page turns until reload.
```

No AI-attribution trailers (no Co-Authored-By, no Generated-with). This overrides any default commit template.
