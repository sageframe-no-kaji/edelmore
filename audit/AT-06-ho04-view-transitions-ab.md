---
created: 2026-07-04
type: agent-task
status: complete
pr: https://github.com/sageframe-no-kaji/edelmore/pull/23
parent: apps/reader/ho-process/hos/ho-04-page-turn-view-transitions.md
project: edelmore-packages
model: opus
---

**Goal**

Execute Phases A and B of reader Ho-04: wire the View Transitions API into `packages/book` — transition names on the pages, `startViewTransition` around `mutate()`, and the swap that skips the clone-rotate when the API exists (default crossfade for now). STOP after Phase B: Phases C–E (the 3D book feel, edge verification, clone-code deletion) are practitioner-in-browser work and are NOT yours.

**Context**

Read the parent ho document first — its Think section is the decision record you execute under. Key constraints: Decision 9 (no `startViewTransition` → plain `await mutate()`, no animation), Decision 10 (nothing app-specific enters the package), Decision 11 (the AT-02 try/finally shape and the throw-path tests in `apps/diary/src/lib/components/BookShell.test.ts` stay green — update assertions to the new invariant if the residue changes, never weaken them), Decision 12 (both consumers must keep working). The clone-rotate code REMAINS in place as the no-VT fallback path until Phase E — do not delete anything.

**Files**

- Modify: `packages/book/Spread.svelte` (Phase A1: `view-transition-name: page-left` / `page-right` on the two `.page` elements)
- Modify: `packages/book/BookShell.svelte` (Phase A2 + B: the `flip()` branch)
- Modify: `apps/diary/src/lib/components/BookShell.test.ts` (cover the new branch: VT present → clone path skipped; VT absent → clone path; mutate-throws still releases everything on both branches; happy-dom has no `startViewTransition`, so stub it on `document` in tests)
- Read-only: the parent ho doc; `apps/reader/src/routes/dev/book/[id]/+page.svelte` (second consumer — do not modify)

**Required Changes**

1. **A1 (commit 1):** the two `view-transition-name` declarations in `Spread.svelte` CSS. Nothing else. Verify stack green.
2. **A2 (commit 2):** inside `flip()`, when `document.startViewTransition` exists, wrap the `mutate()` invocation in it while leaving the clone-rotate fully active (both mechanisms run; the custom rotation stays the visible one). Verify stack green.
3. **B (commit 3):** when `startViewTransition` exists, skip the clone-rotate entirely — no snapshot, no wrapper, no `flip-hidden` — and let the browser's default crossfade animate; await the transition's `finished` promise inside the existing try/finally so `isFlipping` semantics hold. When absent: the current clone-rotate path runs unchanged. `prefers-reduced-motion` early return unchanged. Tests updated per Files.
4. **Coarse visual check (not a commit):** with the dev servers, capture headless-Chrome screenshots of the diary (cover → endpaper → TOC → entry, one forward flip each) and the reader dev route (one forward, one backward flip mid-chapter) at mid-transition and settled. Attach findings to your report — a human verifies properly afterward; your bar is "pages render, no blank frames, no console errors."

**Acceptance**

- [ ] Three commits matching the three phases, each with the full verify stack green (both apps).
- [ ] With VT stubbed present: clone-rotate DOM (wrapper, `flip-hidden`) never appears during a flip (asserted in a test).
- [ ] With VT absent: behavior byte-identical to today (existing tests prove it).
- [ ] Throw-path exception safety holds on both branches (asserted).
- [ ] No public API change; no app code modified beyond the named test file.

**Verification**

```bash
npm install
npm run lint && npm run check && npm run test:coverage
```

**Do Not**

- Do not execute Phase C, D, or E — no rotateY CSS, no tuning, no deletion of clone code, no touching the 500 ms delay. The practitioner owns those.
- Do not add props, events, or exports to BookShell/Spread.
- Do not modify either app's routes/components.

**Stop Condition**

If awaiting the view transition inside the existing try/finally forces a change to when `mutate()` runs relative to the snapshot (i.e., the DOM-state sequencing the diary's content projection depends on), stop and surface — sequencing is practitioner territory.

**Commit**

Three commits on branch `feat/ho-04-view-transitions-ab`, messages: `feat(book): ho-04 A1 — view-transition-names on pages`, `feat(book): ho-04 A2 — startViewTransition wraps mutate behind clone-rotate`, `feat(book): ho-04 B — View Transitions path skips clone-rotate (default crossfade)`. No AI-attribution trailers — hard project rule.
