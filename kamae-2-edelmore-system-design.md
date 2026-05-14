# Edelmore Diary — System Design

*Kamae 2, light pass. Built from the [seed](./edelmore-diary-seed.md).*

---

## Hosting & Network

Docker container on the homelab (host = `chumon` or `jodo`, whichever has capacity — confirm via Sageframe cartographer). Caddy reverse-proxies to a Sageframe-convention hostname. dnsmasq registers on the home LAN. Tailscale MagicDNS extends the same hostname over Tailscale for phone and iPad. Iona's Chromebook resolves via dnsmasq when home.

No public exposure → internal-CA TLS via Caddy is sufficient → no app-level E2E encryption needed.

## Stack

- **Frontend + backend:** SvelteKit (single framework, single language; teachable later).
- **DB:** SQLite via `better-sqlite3`. One file on a ZFS dataset.
- **Page flip:** StPageFlip (vanilla-compatible; wraps cleanly in a Svelte action).
- **Styling:** Tailwind + custom cottage-core tokens. Serif from Google Fonts (EB Garamond or Cormorant Garamond — pick after a quick visual A/B). Paper texture as background. Warm cream palette.
- **Transcription:** Separate Whisper Docker service (likely already running). HTTP API.
- **Audio capture:** MediaRecorder API → webm/opus → POST to backend.

## Data Model

```sql
CREATE TABLE users (
  id         INTEGER PRIMARY KEY,
  username   TEXT UNIQUE NOT NULL,
  pin_hash   TEXT NOT NULL,
  cover_id   TEXT NOT NULL DEFAULT 'meadow',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE entries (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  entry_date DATE NOT NULL,
  content    TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, entry_date)
);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  expires_at TIMESTAMP NOT NULL
);
```

That's the whole DB. One entry per user per day, identified by `(user_id, entry_date)`. Autosave is an UPSERT against that unique constraint. Sessions are server-issued opaque IDs in a secure cookie.

## Auth

Per-user PIN, 4 digits. Username chosen from a picker (no typing — Isla is 7). PIN hashed via argon2id. Session cookie, 30-day expiry, refreshed on each visit. No password recovery flow — Dad resets PINs at the SQLite level if needed. Tailscale + LAN is the *network* gate. PIN is the *sibling* gate. That's the whole auth story.

## Core Interaction (end-to-end)

1. Iona opens `edelmore.local` (Chromebook on LAN) or the Tailscale hostname (iPad / phone).
2. Login: tap her name in a picker, type her 4-digit PIN.
3. Diary opens to today's page. If today doesn't exist yet, it's created blank on first keystroke.
4. Cursor lands in the writing area. She types — or taps the mic.
5. Mic = press once to start recording. Visual indicator (a glowing quill or candle). Press again to stop. Audio POSTs to `/api/transcribe`. SvelteKit server endpoint forwards to local Whisper service. Returned text inserted at the cursor position.
6. After 1.5s idle, content POSTs to `/api/entries` → UPSERT into SQLite.
7. Page turn (arrows or swipe) animates via StPageFlip → loads the previous or next day's entry. Empty days appear as blank pages.
8. Tap the date at the top of the page → calendar overlay → tap a date → that page.
9. First page of the book = TOC: chronological list of dated entries.
10. Cover (page zero) is customizable from a preset library — chosen in a settings panel.

## Transcription Decision

**Toggle-to-record / toggle-to-stop, not streaming.** Streaming Whisper isn't native; the workarounds add complexity and reduce quality. The toggle loop is: speak a thought, tap stop, see text appear, edit if needed, continue. Matches how a paragraph-length diary entry is actually composed.

**Engine: `faster-whisper` (CTranslate2 reimplementation) with `large-v3` if GPU allows.** Fallback to `medium` on weaker hardware, or `whisper.cpp` with a quantized large on CPU-only. For dysarthric speech, large is meaningfully better — pay the latency unless it becomes unusable.

**API contract:**
```
POST /api/transcribe
  multipart/form-data: audio (webm/opus)
  →  200 { "text": "..." }
```

## Cover Library

Preset only for v1. StPageFlip's repo has one cover and it's not cottage-core. Two paths:

- **Path A (recommended for v1):** Procedural renderer. Pick a base color palette + paper texture + ornamental SVG frame + book title in chosen serif. Fast to ship, infinitely variable, can grow into an "edit your cover" feature later.
- **Path B (v2 polish):** Commission 6-10 illustrated cottage-core covers (Etsy / Fiverr / generate-and-refine). Static SVG/PNG assets, prettier, less flexible.

Ship Path A. Add Path B when the rest of the diary feels right.

## Deployment (Sageframe Conventions)

Use `sageframe-docker-deploy` skill when ready to deploy. Approximate parameters:

- **Host:** `chumon` or `jodo` (whichever has capacity)
- **ZFS dataset:** `tank/dockers/edelmore` (confirm path against your convention)
- **Container path:** `/srv/dockers/edelmore/`
- **Snapshot policy:** `production` (frequent + hourly + daily + monthly)
- **Backup:** Syncoid to backup pool
- **Caddy:** `edelmore.<your-tld> → :3000`
- **dnsmasq:** add to home LAN DNS

Compose sketch:

```yaml
services:
  edelmore:
    build: .
    restart: unless-stopped
    volumes:
      - ./data:/data
    environment:
      - DATABASE_URL=/data/edelmore.db
      - WHISPER_URL=http://whisper.<your-tld>:9000
      - SESSION_SECRET=<from sageframe secrets>
    ports:
      - "3000:3000"
```

Whisper is a separate service — likely already deployed on the homelab. If not, it gets its own `sageframe-docker-deploy` pass first.

## Build Order

1. **Skeleton.** SvelteKit project, SQLite schema, user table seeded with Iona + Isla, PIN auth working.
2. **Editor.** Per-day entries, autosave, basic textarea (no book skin yet).
3. **Book skin.** Tailwind cottage-core tokens, paper texture, serif font, StPageFlip wrapping the editor.
4. **Navigation.** Calendar overlay on date tap, TOC as page one, latest-day default.
5. **Transcription.** Mic button, MediaRecorder, `/api/transcribe`, Whisper service connection.
6. **Cover library.** Procedural renderer + settings panel.
7. **Polish pass.** Animation timing, font hinting, mobile responsive review.
8. **Sageframe deploy.** Docker, ZFS, Caddy, dnsmasq, Sanoid.
9. **Iona + Isla onboard.** Watch them use it. Fix what's friction.

Each step is small enough to become its own `ho-NN` in the Kamae 4 overview, or you can sprint through them. Build-first-dissect-after suggests sprint.

## Open Decisions Deferred to Specific Hos

- **GPU / Whisper model size** → resolved in ho-05 (Transcription).
- **Calendar overlay UX details** (month picker, year nav) → resolved in ho-04 (Navigation).
- **Cottage-core serif choice** (EB Garamond vs. Cormorant) → resolved in ho-03 (Book skin), with a quick visual A/B.
- **Final cover renderer parameters** (palette options, ornamental frames) → ho-06 (Cover library).
