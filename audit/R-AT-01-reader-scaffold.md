---
created: 2026-07-03
type: agent-task
status: complete
parent: apps/reader/ho-process/notes/kamae-2-followup-prep.md
project: edelmore-reader
---

**Goal**

Turn `apps/reader` from an empty `package.json` into a running SvelteKit app with the repo's full verification stack, consuming the three shared packages, rendering a closed `BookShell` cover placeholder at `/`. This is the substrate every subsequent reader task builds on.

**Context**

The reader is the diary's sibling in the monorepo. Mirror the diary's configuration wherever a choice exists (`apps/diary` is the reference implementation) — same tool versions, same script names, same strictness. Per the repo's sharing rules: presentation components stay in the reader; only `@edelmore/design`, `@edelmore/book`, `@edelmore/narration` are imported from `packages/`. The reader has NO auth in this task — network locality is the access boundary for now.

**Files**

- Modify: `apps/reader/package.json` (scripts: `dev`, `build`, `preview`, `check`, `check:watch`, `lint`, `format`, `test`, `test:coverage`, `test:watch`; deps mirroring the diary's SvelteKit/Svelte/Tailwind/vitest versions plus `@edelmore/book`, `@edelmore/design`, `@edelmore/narration`, `better-sqlite3`)
- Create: `apps/reader/svelte.config.js` (adapter-node), `apps/reader/vite.config.ts` (Tailwind v4 via `@tailwindcss/vite`; vitest configured like the diary's including the coverage floor — 95% lines, matching the repo standard), `apps/reader/tsconfig.json`
- Create: `apps/reader/src/app.html`, `src/app.css` (`@import "@edelmore/design"` + the `@source` directive for `packages/book`, mirroring the diary's `app.css`), `src/app.d.ts`
- Create: `apps/reader/src/routes/+layout.svelte`, `src/routes/+page.svelte` (renders `BookShell` in closed/cover state with a placeholder cover — plain colored page with the word "Edelmore" is enough; no design work)
- Create: `apps/reader/static/edge.png` (copy from `apps/diary/static/edge.png` — `BookShell` expects it per-app)
- Create: at least one meaningful test (e.g. the page renders a BookShell) so `test:coverage` runs and passes the floor
- Read-only: `apps/diary/package.json`, `apps/diary/vite.config.ts`, `apps/diary/svelte.config.js`, `apps/diary/tsconfig.json`, `apps/diary/src/app.css` (mirror these)

**Required Changes**

1. Scaffold per the file list. Use the diary's dependency versions verbatim (read them; do not bump anything).
2. Root `npm run dev` must keep pointing at the diary (root package.json is unchanged); the reader's dev server runs via `npm run dev --workspace apps/reader`.
3. `npm run lint|check|test:coverage` at the REPO ROOT must now include and pass the reader workspace (`--workspaces --if-present` picks it up automatically once the scripts exist).
4. Keep the placeholder page minimal — cover art, transforms, and all book UI are later, practitioner-supervised work. No settings, no db, no routes beyond `/`.

**Acceptance**

- [ ] `npm run build --workspace apps/reader` succeeds.
- [ ] Repo-root `npm run lint`, `npm run check`, `npm run test:coverage` all pass including the reader workspace.
- [ ] `/` renders a closed BookShell without console errors in `npm run dev --workspace apps/reader` (verify via the build + a component test; no browser automation required).
- [ ] No new dependencies beyond those named above; versions match the diary's.

**Verification**

```bash
npm install
npm run lint && npm run check && npm run test:coverage
npm run build --workspace apps/reader
```

**Do Not**

- Do not add auth, a database, or any route beyond `/` — later tasks own those.
- Do not modify the diary, the packages, or root config other than what `npm install` writes to the lockfile.
- Do not design the cover — placeholder only.

**Commit**

Single commit on branch `feat/r-at-01-reader-scaffold`. Message: `feat(reader): scaffold SvelteKit app with verify stack and BookShell shell`. No AI-attribution trailers (no Co-Authored-By, no Generated-with) — hard project rule.
