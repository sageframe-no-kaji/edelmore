# Edelmore Diary

*A cottage-core diary for a child — kept on your own machine.*

> Edelmore is a private web diary shaped like a book. It opens to today's page. Pages turn. Voice transcription handles the writing for hands that struggle with the keyboard, and it can read entries back aloud. It runs on a parent's homelab, behind Tailscale and the home LAN, and nobody reads it but the person who wrote it.

**Status:** Built. Auth, autosave, the cottage-core book skin, page-turn navigation, calendar/TOC, customizable covers, voice transcription, and read-aloud narration are all in place. Packaged for homelab deploy.

## What's Broken

Existing diary tools fail in different directions. Day One stores entries on someone else's server. Apple Notes and Google Docs are utilitarian — fine for a grocery list, wrong for an inner life. Paper journals are beautiful but ungenerous to anyone whose hands don't cooperate with a pen. Prompted apps (Stoic, Reflectly) impose structure on what should be unstructured. None of them look like a book the way a child imagines a book.

Edelmore was built for a 13-year-old who wanted to keep an Anne Frank–style diary on her own terms, in the shape of a thing that already meant something to her.

## What Edelmore Does

Edelmore is a single-user-per-account web app rendered as a book. Each user has their own cover, their own pages, their own quiet space. Opening the book lands on today's page. You write in paragraphs. You can dictate instead — press the mic, talk, press it again, and your words appear at the cursor. You can also have a page read back to you aloud, with the words highlighted as they're spoken. Pages turn with an animation. A calendar overlay walks you backward through prior days. A table of contents on the first page lists every entry by date.

The diary is private. Tailscale and the home LAN handle the network gate; a 4-digit PIN keeps siblings out of each other's books. There is no cloud. There is no sharing.

Voice is the accessibility commitment behind the build, and both halves of it — transcription (Whisper) and read-aloud narration (Kokoro TTS) — are **optional external services**. They are not bundled in the Docker image. Point the diary at them if you run them on your network; leave them unconfigured and everything else works unchanged — read-aloud simply falls back to the browser's built-in voices, and the mic button goes quiet.

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

- **Frontend + backend.** A single SvelteKit application (`adapter-node`). Server endpoints handle auth, autosave, transcription routing, and narration routing.
- **Storage.** SQLite, one file. Three tables: `users`, `entries` (one per user per day), `sessions`.
- **Page-turn animation.** StPageFlip, wrapped in a Svelte action.
- **Transcription (optional).** A separate Whisper service on the network, called over HTTP via `/api/transcribe`. Audio captured via the browser's MediaRecorder, posted as webm/opus, returned as text. Not bundled in the image.
- **Read-aloud (optional).** A separate Kokoro TTS service, called via `/api/speak`, returning audio plus per-word timings for highlight-as-spoken playback. The shim can start the GPU container on demand (Docker remote API) and stop it after an idle timeout. Not bundled in the image.
- **Network.** Caddy reverse-proxy on the homelab. Tailscale MagicDNS extends the same hostname to phones and tablets outside the house. LAN-only devices (such as a Chromebook without Tailscale) work when at home.
- **Persistence.** ZFS dataset under the homelab's Sageframe convention. Sanoid snapshots; Syncoid to a backup pool.

## Tech Stack

- SvelteKit (TypeScript, Svelte 5 runes), `adapter-node`
- SQLite via `better-sqlite3`
- Tailwind CSS v4
- StPageFlip
- argon2id for PIN hashing
- WhisperX (separate, optional service) for transcription
- Kokoro TTS (separate, optional service) for read-aloud narration
- Docker + Caddy for deployment

## Current State

| | |
|---|---|
| **Built** | PIN auth, autosave, cottage-core book skin, page-turn navigation, calendar + TOC, customizable covers, voice transcription, read-aloud narration. |
| **Packaging** | Multi-stage production Docker image; homelab deploy via the Sageframe pattern. |
| **Optional** | Whisper transcription and Kokoro read-aloud — external services, not bundled in the image. |

## Requirements

- Docker and Docker Compose on the host
- DNS resolution for the chosen hostname (dnsmasq or equivalent), plus Tailscale MagicDNS for remote devices
- ZFS dataset for persistent storage (optional, recommended for snapshots)
- *Optional:* a reachable WhisperX service for transcription, and/or a Kokoro TTS service for read-aloud. The diary runs without either.

## Installation

```bash
git clone <repo> edelmore-diary
cd edelmore-diary
cp .env.example .env
# edit .env: DATABASE_URL is required. TRANSCRIPTION_URL (Whisper) and
# TTS_URL (Kokoro) are optional — leave them blank to run without voice.
docker compose up -d
```

There are no seed PINs. On first run against an empty database, visit `/admin` to create users and set their 4-digit PINs. PINs are changed afterward from each user's `/settings` page.

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
