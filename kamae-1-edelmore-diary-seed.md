# Edelmore Diary — Seed + System Design

*Kamae 1 + 2, light pass. Built braided because the project is small enough that the architectural decisions are inseparable from the framing.*

---

## SEED

### Friction
Iona (13) wants a private diary in the spirit of Anne Frank — paragraphs a day, freeform, no prompts, no AI interlocutor. Existing options fail in different ways: Day One stores on Automattic's servers, Apple Notes and Google Docs are utilitarian and ugly, paper journals lack accessibility for her ataxia. She also wants a specific aesthetic — cottage core / prairie core, a real book with pages that turn — that nothing on the market provides.

### Landscape
- **Day One** — subscription cloud diary, clinical-modern visual design, no book aesthetic, cloud-stored on a third-party server.
- **Penzu** — web-based diary, exists, but visually dated and not customizable to the right aesthetic.
- **Apple Notes / Google Docs / Notion** — utilitarian. No book metaphor. No diary semantics.
- **Stoic / Reflectly / Day One Prompts** — AI-prompted journals. Iona explicitly doesn't want this.
- **Paper journal** — best aesthetic, no accessibility, no search, no transcription.

Each component of this project exists somewhere (book-flip UIs are demoed in StPageFlip's repo; diary apps are a saturated category; Whisper integration is everywhere). What doesn't exist is the assembly: cottage-core book skeuomorph + homelab-hosted private + dysarthric-friendly transcription + sibling-separated multi-user. The custom build is justified by combination, not invention.

### Vision
A private, beautiful, book-like web diary for Iona. Opens to today's page. Pages turn. Cottage-core aesthetic — Edwardian serif, warm paper, hand-drawn ornamental elements. Voice transcription handles the motor gap so writing isn't gated by her hands. Lives on Dad's homelab. Nobody but Iona reads what's in it.

### Audience
- **Iona, 13, primary.** Ataxia (motor control affects typing). Wants book-aesthetic, privacy, voice option.
- **Isla, 7, secondary.** Her own separate diary with her own cover. Needs to be usable by a 7-year-old without help.
- **Architecturally:** designed for any user; no Iona-specific code paths.

### Identity
**Edelmore Diary.** Iona's chosen name. Keep it.

### Project Nature
Personal / family project. Open-source-friendly under the atmarcus.net pattern — the engine is shareable, nobody's actual diary content is. Doubles as a learning vehicle for Tyro: SQL and full-stack assembly from scratch. Build-first-dissect-after.

### Architecture Direction
SvelteKit SPA → SQLite → Docker → homelab, behind Tailscale + LAN. Page-flip via StPageFlip. Transcription via local Whisper as a sidecar service. (Decisions committed in System Design below.)

### Constraints
- **Iona's Chromebook has no Tailscale.** Personal device, but Tailscale isn't installed. Local network access only. Diary works on Chromebook only when home.
- **Phone and iPad** have Tailscale → work from anywhere.
- **Whisper** running locally on homelab. Model size depends on GPU. Open question.
- **Sageframe deploy pattern** is the deployment standard (Docker + ZFS + Caddy + dnsmasq + Sanoid).
- **Two real users at start**; designed for more.
- **Must look and feel like a book**, not a textarea in a Bootstrap layout.

### Scope
**In v1:** Write, autosave, page turns, calendar/TOC, latest-day default, per-user PIN, cover customization (from preset library), voice transcription via Whisper, responsive across phone / Chromebook / iPad.

**Not in v1:** Sharing, AI prompts, mood tracking, photos, drawings, embedded media, PDF export, full-text search.

**Out forever:** Cloud hosting of diary content. Anyone reading entries but the author. AI interlocutors (Iona's explicit ask).

### Success Criteria
- Iona writes in it consistently for the first month after deploy.
- Voice transcription accuracy is high enough that she chooses to use it.
- Isla can use her own diary independently, without help, at 7.
- It looks and feels like a real book to both of them.

### Where Tyro Is Starting From
- **Sageframe deploy pattern:** fluent.
- **Docker + Compose:** fluent.
- **Local Whisper:** running.
- **SvelteKit:** prior Astro work gives some scaffolding; SvelteKit is the next stretch.
- **SQL:** genuinely new territory. Explicit learning goal.
- **StPageFlip / book-UI animation:** new territory.

### What Tyro Wants to Learn
SQL and the data layer end-to-end. The whole stack legibly. Build first, then dissect what was built.

### Open Questions
- **What GPU is on the homelab?** Determines Whisper model size and latency.
- **How many cover designs?** Procedural for v1 vs. commissioned illustrations later.
- **Chromebook-leaves-the-house frequency.** If common, revisit Tailscale-on-Chromebook or add a public proxy with strict auth.
- **Calendar overlay UX details.** Month picker only, or year navigation too?
- **Should the TOC show entry previews** (first line) or just dates?

---

## SYSTEM DESIGN

### Hosting & Network
Docker container on the homelab (host = `chumon` or `jodo`, whichever has capacity — confirm via Sageframe cartographer). Caddy reverse-proxies to a Sageframe-convention hostname (e.g., `edelmore.local` or whatever your TLD convention is). dnsmasq registers on the home LAN. Tailscale MagicDNS extends the same hostname over Tailscale for phone and iPad. Iona's Chromebook resolves via dnsmasq when home.

No public exposure → internal-CA TLS via Caddy is sufficient → no app-level E2E encryption needed.

### Stack
- **Frontend + backend:** SvelteKit (single framework, single language; teachable later).
- **DB:** SQLite via `better-sqlite3`. One file on a ZFS dataset.
- **Page flip:** StPageFlip (vanilla-compatible; wraps cleanly in a Svelte action).
- **Styling:** Tailwind + custom cottage-core tokens. Serif from Google Fonts (EB Garamond or Cormorant Garamond — pick after a quick visual A/B). Paper texture as background. Warm cream palette.
- **Transcription:** Separate Whisper Docker service (likely already running). HTTP API.
- **Audio capture:** MediaRecorder API → webm/opus → POST to backend.

### Data Model

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

### Auth
Per-user PIN, 4 digits. Username chosen from a picker (no typing — Isla is 7). PIN hashed via argon2id. Session cookie, 30-day expiry, refreshed on each visit. No password recovery flow — Dad resets PINs at the SQLite level if needed. Tailscale + LAN is the *network* gate. PIN is the *sibling* gate. That's the whole auth story.

### Core Interaction (end-to-end)

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

### Transcription Decision
**Toggle-to-record / toggle-to-stop, not streaming.** Streaming Whisper isn't native; the workarounds add complexity and reduce quality. The toggle loop is: speak a thought, tap stop, see text appear, edit if needed, continue. Matches how a paragraph-length diary entry is actually composed.

**Engine: `faster-whisper` (CTranslate2 reimplementation) with `large-v3` if GPU allows.** Fallback to `medium` on weaker hardware, or `whisper.cpp` with a quantized large on CPU-only. For dysarthric speech, large is meaningfully better — pay the latency unless it becomes unusable.

**API contract:**
```
POST /api/transcribe
  multipart/form-data: audio (webm/opus)
  →  200 { "text": "..." }
```

### Cover Library
Preset only for v1. StPageFlip's repo has one cover and it's not cottage-core. Two paths:

- **Path A (recommended for v1):** Procedural renderer. Pick a base color palette + paper texture + ornamental SVG frame + book title in chosen serif. Fast to ship, infinitely variable, can grow into an "edit your cover" feature later.
- **Path B (v2 polish):** Commission 6-10 illustrated cottage-core covers (Etsy / Fiverr / generate-and-refine). Static SVG/PNG assets, prettier, less flexible.

Ship Path A. Add Path B when the rest of the diary feels right.

### Deployment (Sageframe Conventions)
Use `sageframe-docker-deploy` skill when you're ready to deploy. Approximate parameters:

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

### Build Order

1. **Skeleton.** SvelteKit project, SQLite schema, user table seeded with Iona + Isla, PIN auth working.
2. **Editor.** Per-day entries, autosave, basic textarea (no book skin yet).
3. **Book skin.** Tailwind cottage-core tokens, paper texture, serif font, StPageFlip wrapping the editor.
4. **Navigation.** Calendar overlay on date tap, TOC as page one, latest-day default.
5. **Transcription.** Mic button, MediaRecorder, `/api/transcribe`, Whisper service connection.
6. **Cover library.** Procedural renderer + settings panel.
7. **Polish pass.** Animation timing, font hinting, mobile responsive review.
8. **Sageframe deploy.** Docker, ZFS, Caddy, dnsmasq, Sanoid.
9. **Iona + Isla onboard.** Watch them use it. Fix what's friction.

Each step is small enough to become its own `ho-NN` if you run the formal Kamae 4-5 chain, or you can blow through them as a focused sprint. Given your "build first then dissect" stance, sprint is probably right.

---

*Ready to scaffold the repo when you are. Next step: `ho-setup-project-environment-collaborator` to lay down the Ho System project structure.*
