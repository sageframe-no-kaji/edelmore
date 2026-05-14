# edelmore-diary

A cottage-core private diary for children — SvelteKit full-stack app, SQLite, Docker homelab deploy.

## Languages

@~/.claude/modules/languages-web.md

## Stack

- SvelteKit 2 (TypeScript, Svelte 5 runes)
- SQLite via `better-sqlite3`
- Tailwind v4 (via `@tailwindcss/vite` — no `tailwind.config.js` needed)
- StPageFlip (page-turn animation, wrapped in a Svelte action)
- argon2id via `argon2` npm package (PIN hashing)
- `faster-whisper` (separate homelab service) for voice transcription

## Verification stack

- **Lint + format:** Biome for `.ts`/`.js`/`.json` — `npm run lint`
- **Type check:** `svelte-check` for `.svelte` files + TypeScript strict — `npm run check`
  - Note: Biome does not yet support `.svelte` files; `svelte-check` covers them
- **Tests:** Vitest — `npm run test`
- **Coverage floor:** 80% lines (`@vitest/coverage-v8`)
- **Pre-commit:** lefthook runs all three checks on every commit (`lefthook install` to activate)

## Project-specific rules

- Auth: 4-digit PIN per user, hashed via argon2id. Server-issued session cookie, 30-day expiry, refreshed on each visit. No password recovery — reset PINs at the SQLite level.
- Network gate is Tailscale + LAN. PIN is the sibling gate. No public exposure.
- Database: `data/edelmore.db` (one file, three tables). Schema reference in `src/lib/db.ts`.
- Autosave: UPSERT against `(user_id, entry_date)` unique constraint, triggered 1.5s after last keystroke.
- Transcription API contract: `POST /api/transcribe` — multipart audio → `{ "text": "..." }`
- `data/` is gitignored. `data/edelmore.db` lives there in development and in the Docker volume mount.
- Secrets in `.env` only (gitignored). `.env.example` is the committed template.
- Private prompts in `prompts/` (gitignored).

## Project documents

Kamae chain lives at the project root:
- `kamae-1-edelmore-diary-seed.md` — Kamae 1+2, braided (seed + system design)
- `kamae-2-edelmore-system-design.md` — Kamae 2 standalone

Future hos: `ho-process/hos/`

## Deployment

Docker → homelab via `sageframe-docker-deploy` when ready. See `kamae-2-edelmore-system-design.md`
for the deployment sketch. Whisper is a separate homelab service.

## References

- System design: `kamae-2-edelmore-system-design.md`
- StPageFlip: https://github.com/Nodlik/StPageFlip
- SvelteKit docs: https://kit.svelte.dev
- faster-whisper: separate homelab service (already running)
