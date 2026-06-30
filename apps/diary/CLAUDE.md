# edelmore-diary

A cottage-core private diary for children — SvelteKit full-stack app, SQLite, Docker homelab deploy.

Lives at `apps/diary/` inside the Edelmore monorepo. Repo-wide rules (workspace,
languages, verification stack overview) are in the root `CLAUDE.md`; this file
covers diary-specific concerns only.

## Stack

- SvelteKit 2 (TypeScript, Svelte 5 runes)
- SQLite via `better-sqlite3`
- Tailwind v4 (via `@tailwindcss/vite` — no `tailwind.config.js` needed)
- Custom CSS 3D page-turn primitive in `(authenticated)/+layout.svelte` (StPageFlip was rejected during ho-03 — see system design)
- argon2id via `argon2` npm package (PIN hashing)
- `faster-whisper` (separate homelab service) for voice transcription

## Diary-specific verification notes

- Biome does not yet support `.svelte` files; `svelte-check` covers them via `npm run check`
- Coverage floor (95% lines) is enforced in `apps/diary/vite.config.ts`

## Project-specific rules

- Auth: 4-digit PIN per user, hashed via argon2id. Server-issued session cookie, 30-day expiry, refreshed on each visit. No password recovery — reset PINs at the SQLite level.
- Network gate is Tailscale + LAN. PIN is the sibling gate. No public exposure.
- `/admin` (account creation) is gated by the `ADMIN_PIN` env var; unset = open, for first-run bootstrap only.
- Database: `apps/diary/data/edelmore.db` (one file, three tables). Schema reference in `src/lib/db.ts`.
- Autosave: UPSERT against `(user_id, entry_date)` unique constraint, triggered 1.5s after last keystroke.
- Transcription API contract: `POST /api/transcribe` — multipart audio → `{ "text": "..." }`
- `apps/diary/data/` is gitignored. `apps/diary/data/edelmore.db` lives there in development and in the Docker volume mount.
- Secrets in `apps/diary/.env` only (gitignored). `apps/diary/.env.example` is the committed template.

## Deployment

Two production environments:

| Env | Host | Container | URL | Image source |
|---|---|---|---|---|
| **household prod** | tenzo | `svc-edelmore-diary` (`8025:3000`) | `diary.sageframe.net` (Caddy) | build-on-host from `./code` (a monorepo clone) |
| **public demo** | miseba | `svc-edelmore-demo` (`8181:3000`) | `edelmore.sageframe.net` (cloudflared) | `ghcr.io/sageframe-no-kaji/edelmore-diary:latest`, image built by `.github/workflows/docker.yml` on every push to `main` |

Voice services (WhisperX transcription, Kokoro TTS) are separate homelab services
on **shingan** — optional; the diary degrades gracefully without them. The demo
has `DEMO_MODE=true` in its `.env` so unauthenticated visitors land on `/welcome`;
prod leaves it unset and sends them straight to `/login`.

### Prod deploy (tenzo)

Build-on-host from a deploy-key clone of this monorepo at
`/opt/services/tenzo-edelmore-diary/code`. The deploy key
(`~/.ssh/edelmore_deploy`) is registered on the GitHub repo under
**tenzo-edelmore-deploy**, and tenzo's `~/.ssh/config` maps a dedicated alias —
`github.com-edelmore` → that key — so the repo's remote is
`git@github.com-edelmore:sageframe-no-kaji/edelmore.git` and pulls don't depend
on agent forwarding. Compose points at the diary's Dockerfile via the workspace
root as build context:

```yaml
build:
  context: ./code
  dockerfile: apps/diary/Dockerfile
```

A deploy is:

```
ssh tenzo 'cd /opt/services/tenzo-edelmore-diary && git -C code pull && docker compose up -d --build'
```

Native amd64 build, no image transfer. The SQLite DB lives on the `./data` bind-mount
(`/opt/services/tenzo-edelmore-diary/data`) and is never touched by a rebuild. Push
to `main` first so the host pulls verified code (CI gates lint/check/tests on `main`,
and also publishes the GHCR image that the demo consumes).

The host compose is tracked in the `sageframe-config` repo
(`tenzo/opt/services/tenzo-edelmore-diary/docker-compose.yml`); sync it after any
host-side change via the `sageframe-config-sync` skill.

### Demo deploy (miseba)

The demo runs the GHCR image, so deploying is just: wait for CI to publish a new
`:latest`, then pull and recreate on miseba:

```
ssh miseba 'cd /opt/services/miseba-edelmore-demo && docker compose pull && docker compose up -d'
```

Demo `.env` lives only on miseba (`/opt/services/miseba-edelmore-demo/.env`) —
contains `SESSION_SECRET`, `ADMIN_PIN`, `TAYLOR_PIN`, and `DEMO_MODE=true`. The
host compose is tracked in `sageframe-config` at
`miseba/opt/services/miseba-edelmore-demo/docker-compose.yml`. The demo resets
nightly via a host cron running `reset.sh`.

## References

- System design: `ho-process/kamae-2-edelmore-system-design.md`
- StPageFlip: https://github.com/Nodlik/StPageFlip
- SvelteKit docs: https://kit.svelte.dev
- faster-whisper: separate homelab service (already running)
