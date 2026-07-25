---
created: 2026-07-04
type: agent-task
status: complete
pr: https://github.com/sageframe-no-kaji/edelmore/pull/25
parent: audit/2026-07-03-monorepo-audit.md
project: edelmore
model: sonnet
---

**Goal**

Realign the repo's committed public docs with reality per the 2026-07-03 audit §2 ("the confusion inventory"). Docs-only task: no code, no gitignored `ho-process/` files.

**Context**

The audit found the code mostly agrees with itself while the docs describe three different page-turn mechanisms and a pre-extraction sharing model. Current truth to write: three shipped packages (`@edelmore/design` = CSS tokens/fonts-via-CDN, `@edelmore/book` = shell + spread + flip, `@edelmore/narration` = wire adapter only — types + handler factories); presentation components (bird, ribbon, pickers, ReaderView) are per-app; the reader app EXISTS (scaffold, EPUB parser, household library, pagination testbed, shipped 2026-07-03/04); the page-turn mechanism is the custom clone-rotate flip in `packages/book/BookShell.svelte`, **with a View Transitions rewrite in progress as reader Ho-04** — state it exactly that way, do not claim View Transitions is done.

**Files**

- Modify: `README.md` (root) — "packages directory is intentionally empty" and the layout diagram are false; reader is no longer "seed only, no code yet". Describe the actual monorepo: two apps (diary shipped, reader in development), three packages.
- Modify: `apps/diary/README.md` — page-turn section says StPageFlip (rejected during ho-03; never shipped); installation instructions predate the monorepo (`git clone …/edelmore-diary` → repo is `edelmore`, app at `apps/diary/`). Fix both; leave everything else.
- Modify: `apps/diary/CLAUDE.md` — "Custom CSS 3D page-turn primitive in `(authenticated)/+layout.svelte`" → lives in `packages/book/BookShell.svelte` (extracted in reader Ho-02).
- Modify: `apps/reader/README.md` — "View Transitions API… same as the diary" → clone-rotate today, VT rewrite in progress (Ho-04); the shared-component list still names `BirdNarrator`/`VoicePicker`/`ReaderView`/`tokenize` as `@edelmore/narration` contents → wire adapter only, narration UI is per-app; status line says "seed only" → describe what shipped; the relative link to the diary's system design points at repo root → `apps/diary/ho-process/…` (note it's gitignored practitioner material).
- Modify: `apps/reader/docs/seed.md` — same two corrections where they appear (View Transitions phrasing, narration package contents). Add one header line: "Committed copy of the seed; the working copy lives in `apps/reader/ho-process/seed.md` (gitignored)." Change nothing else — the seed is a historical document.
- Modify: `HO-STATUS.md` — rule line "Only wire types + protocol adapters clear the shared-package bar" contradicts root `CLAUDE.md` (book/design are shared presentation substrate); replace with the root CLAUDE.md bar: extract when the second consumer arrives AND both apps must consume the exact behavior.
- Modify: `CLAUDE.md` (root) — `@edelmore/design` described as "(tokens, fonts)": fonts are a Google Fonts CDN `@import`, no local files. Adjust the parenthetical to "(tokens, CDN fonts)". Also the packages sentence still says narration is "Kokoro wire adapter — types + createSpeakHandler/createVoicesHandler" — that part is correct; verify against `packages/*/package.json` descriptions and keep them consistent.

**Required Changes**

Covered file-by-file above. Universal rules: present tense; describe what IS, not the history of how it got wrong; where a rewrite is in progress say so with the ho reference (reader Ho-04); do not invent roadmap content; keep each file's existing voice and structure — these are corrections, not rewrites.

**Acceptance**

- [ ] No committed doc claims packages/ is empty, the reader has no code, StPageFlip, or a shipped View Transitions mechanism.
- [ ] No committed doc claims `@edelmore/narration` contains UI components.
- [ ] `grep -rn "StPageFlip" README.md apps/*/README.md apps/*/CLAUDE.md CLAUDE.md` returns only historical/rejected mentions (or nothing).
- [ ] Verify stack green (docs shouldn't affect it; run it anyway — lefthook will at commit).

**Verification**

```bash
npm run lint && npm run check && npm run test:coverage
grep -rn "intentionally empty\|StPageFlip\|seed only" README.md apps/diary/README.md apps/reader/README.md || echo "clean"
```

**Do Not**

- Do not touch anything under any `ho-process/` directory — private practitioner chain docs, not yours.
- Do not edit code or code comments (a separate task owns the stale layout comments).
- Do not restructure or expand any README — corrections only.

**Commit**

Single commit on branch `docs/b1-doc-realignment`. Message: `docs: realign READMEs and CLAUDE.md with post-extraction reality (audit B1)`. No AI-attribution trailers — hard project rule.
