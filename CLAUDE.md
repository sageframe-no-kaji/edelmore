# edelmore (monorepo)

Houses the Edelmore family of reading experiences — sibling SvelteKit apps that share
a book metaphor, narration stack, and cottage-core visual identity.

## Apps

- `apps/diary/` — shipped v1.2. Cottage-core private diary for children. See `apps/diary/CLAUDE.md` for diary-specific rules.
- `apps/reader/` — seed + Kamae docs. Read-along EPUB reader. See `apps/reader/README.md` and `apps/reader/ho-process/`.

`packages/` holds only truly shared code — types and adapters both apps must consume identically. Today: `@edelmore/design` (tokens, fonts), `@edelmore/book` (page-flip primitives), `@edelmore/narration` (Kokoro wire adapter — types + `createSpeakHandler` / `createVoicesHandler`). Don't extract on hypothesis; extract when the second consumer arrives AND the bar is "both apps must consume this exact behavior or one is broken." Presentation components (bird UI, ribbons, pickers) live per-app, not in `packages/`.

## Workspace

npm workspaces. Root scripts delegate to apps via `--workspaces --if-present`:

- `npm run dev` — diary dev server
- `npm run build` / `lint` / `check` / `test` / `test:coverage` — across all apps

Pre-commit hooks (`lefthook.yml`) and lint config (`biome.json`) live at root and apply repo-wide.

## Languages

@~/.claude/modules/languages-web.md

## Verification stack (repo-wide)

- **Lint + format:** Biome for `.ts`/`.js`/`.json` — `npm run lint`
- **Type check:** `svelte-check` for `.svelte` files + TypeScript strict — `npm run check`
- **Tests:** Vitest — `npm run test` (`npm run test:coverage` to enforce the floor)
- **Coverage floor:** 95% lines (configured per-app in each `vite.config.ts`)
- **Pre-commit:** lefthook runs biome, lint, check, and test:coverage on every commit (`lefthook install` to activate)
- **CI:** `.github/workflows/docker.yml` runs the verify stack on every push, then builds and publishes the diary's container image to GHCR

## Deployment

Per-app. See `apps/diary/CLAUDE.md → Deployment` for the diary's build-on-host pattern on jodo.

## Project documents & ho discipline

**For a bird's-eye view of where each chain sits right now, read `HO-STATUS.md` at repo root.** That file is the signpost — shipped / open / filed / next-move — updated when a ho changes state.

Kamae chains are **per-app**. Each app has its own chain in `apps/<app>/ho-process/` (gitignored — private practitioner work):

- `apps/diary/ho-process/` — diary chain (seed, system design, ho outline, per-ho docs). v1.0 shipped; post-v1.0 hos append to the outline.
- `apps/reader/ho-process/` — reader chain (seed, system design, ho outline, per-ho docs, notes).

### Sessions open against ONE ho from ONE chain

Every coding session opens against a single per-ho doc. That ho's frontmatter names its `project`; that names the app being worked on. Files outside that app's tree are off-limits unless the ho explicitly lists them in scope. The ritual at session start:

1. **Name the ho** — which `apps/<app>/ho-process/hos/ho-N-*.md` are you executing?
2. **Read its `In scope` / `Out of scope`** — what am I allowed to touch?
3. **If a request drifts outside scope, stop.** Name the drift. File a new ho in the appropriate chain. Return to the original.

### Extraction hos are the one place where cross-app editing is legitimate

Extraction hos move code from a source app into a shared `packages/` module to unblock a consumer app. They touch the source app by nature. **Their scope is narrow: extract → wire → verify behavior-identical.** They ship with pre-extraction behavior preserved.

**Behavior changes surfaced during an extraction ho are NEW HOS in the affected app's chain, not iterations on the extraction.** If smoke test surfaces "the diary should behave differently," that's a diary ho — file it and hold. The extraction ships behavior-identical; the follow-up ships the change. Trading a slower shipping cadence for chain integrity is the trade the discipline exists to enforce. See `apps/reader/ho-process/hos/ho-03-extract-narration.md` (Reflect section) for the case study on what happens when this rule is not held.
