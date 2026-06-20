# edelmore (monorepo)

Houses the Edelmore family of reading experiences — sibling SvelteKit apps that share
a book metaphor, narration stack, and cottage-core visual identity.

## Apps

- `apps/diary/` — shipped v1.2. Cottage-core private diary for children. See `apps/diary/CLAUDE.md` for diary-specific rules.
- `apps/reader/` — seed. Read-along EPUB reader. See `apps/reader/README.md`.

`packages/` is reserved for shared code; it stays empty until the reader actually consumes diary primitives. Don't extract on hypothesis; extract when the second consumer arrives.

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

## Project documents

Kamae chains are per-app. Each app keeps its own `ho-process/` directory (gitignored — private practitioner work):

- `apps/diary/ho-process/` — diary's chain (seed, system design, ho outline, per-ho docs)
- `apps/reader/ho-process/` — reader's chain (when it exists; the original seed is preserved in `apps/reader/docs/seed.md`)
