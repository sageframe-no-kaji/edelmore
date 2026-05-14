# Edelmore Diary

*A cottage-core diary for a child — kept on your own machine.*

> Edelmore is a private web diary shaped like a book. It opens to today's page. Pages turn. Voice transcription handles the writing for hands that struggle with the keyboard. It runs on a parent's homelab, behind Tailscale and the home LAN, and nobody reads it but the person who wrote it.

**Status:** Scaffolded. Kamae chain (seed, system design, README) committed. First building hos underway.

## What's Broken

Existing diary tools fail in different directions. Day One stores entries on someone else's server. Apple Notes and Google Docs are utilitarian — fine for a grocery list, wrong for an inner life. Paper journals are beautiful but ungenerous to anyone whose hands don't cooperate with a pen. Prompted apps (Stoic, Reflectly) impose structure on what should be unstructured. None of them look like a book the way a child imagines a book.

Edelmore was built for a 13-year-old who wanted to keep an Anne Frank–style diary on her own terms, in the shape of a thing that already meant something to her.

## What Edelmore Does

Edelmore is a single-user-per-account web app rendered as a book. Each user has their own cover, their own pages, their own quiet space. Opening the book lands on today's page. You write in paragraphs. You can dictate instead — press the mic, talk, press it again, and your words appear at the cursor. Pages turn with an animation. A calendar overlay walks you backward through prior days. A table of contents on the first page lists every entry by date.

The diary is private. Tailscale and the home LAN handle the network gate; a 4-digit PIN keeps siblings out of each other's books. There is no cloud. There is no sharing.

## What Edelmore Is Not

- A journal with prompts, mood tracking, or any kind of AI interlocutor.
- A sharing platform. Edelmore has no concept of sharing an entry with anyone.
- A cloud service. Edelmore runs on your homelab, full stop.
- A tutorial product. Edelmore is meant to be picked up and used without instructions.

## Your First Session

You open your laptop, navigate to `edelmore.local`, and a book is waiting on a wooden surface — your book, your cover, your name in serif type. You tap it. The cover lifts and the book falls open to today's page. The date is in the upper corner. The page is blank.

You start typing. The font is warm, the paper is cream, the words land where you put them. Two seconds after you stop, the page saves itself — silently, no banner, no notification. You write three paragraphs and your hand gets tired. You tap the small quill in the corner. It glows. You speak the next paragraph. You tap the quill again. The words appear under the ones you typed.

When you're done you close the laptop. There is nothing to remember to do. Tomorrow the book opens to a fresh page; yesterday's stays where you left it. You can turn back to it whenever you want.

## How It Differs

Edelmore is closest in spirit to Day One but inverts its choices: local rather than cloud, book-shaped rather than card-shaped, accessible voice-first rather than keyboard-first, free rather than subscription, single-purpose rather than feature-rich. It is closer in form to a children's book than to any diary app on the market.

## Architecture

- **Frontend + backend.** A single SvelteKit application. Server endpoints handle auth, autosave, and transcription routing.
- **Storage.** SQLite, one file. Three tables: `users`, `entries` (one per user per day), `sessions`.
- **Page-turn animation.** StPageFlip, wrapped in a Svelte action.
- **Transcription.** A separate Whisper service on the homelab network, called over HTTP. Audio captured via the browser's MediaRecorder, posted as webm/opus, returned as text.
- **Network.** Caddy reverse-proxy on the homelab. Tailscale MagicDNS extends the same hostname to phones and tablets outside the house. LAN-only devices (such as a Chromebook without Tailscale) work when at home.
- **Persistence.** ZFS dataset under the homelab's Sageframe convention. Sanoid snapshots; Syncoid to a backup pool.

## Tech Stack

- SvelteKit (TypeScript)
- SQLite via `better-sqlite3`
- Tailwind CSS
- StPageFlip
- argon2id for PIN hashing
- `faster-whisper` (separate service) for transcription
- Docker + Caddy for deployment

## Current State

| | |
|---|---|
| **Now** | Scaffolded. Kamae chain committed. First building hos underway. |
| **Next** | Editor, autosave, per-user PIN auth, SQLite schema. |
| **Later** | Book skin, page-turn navigation, voice transcription, cover library, homelab deploy. |

## Requirements

- Docker and Docker Compose on the host
- A reachable Whisper service on the network (e.g., `faster-whisper-server`)
- DNS resolution for the chosen hostname (dnsmasq or equivalent), plus Tailscale MagicDNS for remote devices
- ZFS dataset for persistent storage (optional, recommended for snapshots)

## Installation

```bash
git clone <repo> edelmore-diary
cd edelmore-diary
cp .env.example .env
# edit .env: DATABASE_URL, WHISPER_URL, SESSION_SECRET
docker compose up -d
```

User accounts are seeded via a one-time SQL script. See operational notes (forthcoming) for adding and resetting users.

## Development

```bash
npm install
cp .env.example .env
npm run dev
```

Schema migrations run automatically against `data/edelmore.db` on server start.

## License

MIT.

---

*Edelmore is part of [atmarcus.net](https://atmarcus.net). Built for Iona.*
