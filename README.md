# Edelmore

*A family of cottage-core reading experiences — kept on your own machine.*

This is the monorepo for the Edelmore project. It houses two sibling SvelteKit apps
that share a book metaphor, a narration stack (Kokoro TTS, word-by-word highlighting),
and a cottage-core visual identity. Each app deploys independently.

## Apps

- **[`apps/diary/`](apps/diary/)** — shipped at v1.2. A private diary for children rendered as a book. Voice transcription via Whisper, read-aloud narration via Kokoro TTS, homelab-only. See `apps/diary/README.md` for the full story.
- **[`apps/reader/`](apps/reader/)** — seed only, no code yet. A read-along EPUB reader that feels like a real book. See `apps/reader/README.md` for the vision and `apps/reader/docs/seed.md` for the original Kamae-1 seed.

Shared primitives will live under `packages/` (e.g., `@edelmore/book`, `@edelmore/narration`, `@edelmore/design`) when the reader actually consumes them. The packages directory is intentionally empty until then — package boundaries are drawn by real second-consumer pressure, not by hypothesis.

## Layout

```
edelmore/
├── apps/
│   ├── diary/          # SvelteKit + SQLite, shipped v1.2
│   └── reader/         # seed + docs, no code yet
├── packages/           # empty until extraction is justified
├── .github/workflows/  # repo-wide CI (verify stack + diary image publish)
├── biome.json          # repo-wide lint/format
├── lefthook.yml        # repo-wide pre-commit
├── CLAUDE.md           # repo-wide working notes
├── ho-process/         # private practitioner work (gitignored)
└── package.json        # npm workspace root
```

## Working in the workspace

The repo uses **npm workspaces**. Root-level scripts delegate to apps via `--workspaces --if-present`, so a script that doesn't apply to a given app is silently skipped.

```bash
# Install everything (hoists into root node_modules)
npm install

# Run the diary in dev mode
npm run dev

# Repo-wide verification
npm run lint
npm run check
npm run test          # full suite
npm run test:coverage # enforces the 95%-line floor

# Build all buildable apps
npm run build
```

To run a script in a specific app: `npm run <script> -w apps/diary`.

## Pre-commit verification

`lefthook` runs Biome, the full lint pass, `svelte-check`, and the coverage-enforced
test suite on every commit. Install the hooks once after cloning:

```bash
npx lefthook install
```

## Deployment

Each app deploys independently. The diary's pattern (build-on-host from git on the
homelab jodo node, image-published-as-byproduct via GHCR) is documented in
`apps/diary/CLAUDE.md → Deployment`. The reader's deployment will follow the same
Sageframe pattern when there's code to deploy.

## License

MIT.

---

*Edelmore is part of [atmarcus.net](https://atmarcus.net). The diary was built first for Iona, who wanted an Anne Frank–style journal on her own terms. The reader exists because once you have a book that reads itself to you, you stop wanting anything else.*
