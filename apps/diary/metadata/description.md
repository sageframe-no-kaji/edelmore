# Edelmore Diary — description

A private web diary shaped like a book — it opens to today's page, turns its pages, takes dictation, and reads entries back aloud.

Adaptive tools are usually designed apologetically — accommodation as patch, accessibility as afterthought. Edelmore is built from the opposite direction, on Universal Design for Learning: the design itself accommodates without naming the accommodation. It opens to today's page and turns its pages; voice transcription handles the writing for hands that struggle with a keyboard, and it can read entries back aloud with each word highlighted as it is spoken. It runs on a parent's homelab, behind Tailscale and the home LAN, and nobody reads it but the person who wrote it. The deeper argument is that scale-of-one design is a legitimate target: a tool built for one specific thirteen-year-old, in the shape of a book she imagined, is not a small project but a complete one at the scale it was meant for — what one tool, made for one person, looks like when it counts.

SvelteKit (TypeScript, Svelte 5 runes), SQLite via better-sqlite3, Tailwind v4, StPageFlip, and argon2id, with optional WhisperX transcription and Kokoro TTS read-aloud; deployed with Docker and Caddy.
