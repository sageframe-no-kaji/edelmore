# Product

## Register

brand

## Users

Children aged 8–16, particularly those with dyslexia, ataxia, attention differences, or any condition that makes handwriting or typing difficult. Their parents set it up; the child uses it alone. The primary user is writing in a quiet moment — bedroom, evening, unhurried. They are not navigating software; they are sitting down with a book.

Secondarily: parents who want a private, beautiful space for their child that looks like something desirable rather than a medical accommodation.

## Product Purpose

Edelmore is a private cottage-core diary for children — book-shaped, voice-first, kept on a parent's homelab. It exists because every other diary tool is either cloud-stored (violating privacy), utilitarian (wrong shape for a child's inner life), or prompts/structures the writing (imposing where none is wanted). Voice transcription handles writing for hands that don't cooperate; read-aloud narration reads entries back. Pages turn. Nobody reads it but the person who wrote it.

Success: a child uses it daily not because it's an "accessibility tool" but because it's the most beautiful place they have to write.

## Brand Personality

Quiet · private · cottage-core.

The ATM brand system (DM Serif Display, IBM Plex Sans, IBM Plex Mono; warm ground palette; terracotta accent) is the foundation. Edelmore pushes that system further toward nature, handmade texture, and literary intimacy — without adding tech noise. The result should feel like finding a beautiful book on a shelf, not launching an app.

Voice: unhurried, slightly literary, never instructional. The interface doesn't speak to the user; it waits for them.

## Anti-references

All of the following. Any of them would be a failure:

- **Speechify / Voice Dream Reader** — functional accessibility tools that feel clinical, cold, and software-shaped. The opposite of what Edelmore should be.
- **Day One / Notion / Apple Notes** — clean-minimal productivity aesthetic. "App" feeling. Cards, grids, timestamps, infinite scroll. Not a book.
- **Canva / Seesaw / kids' educational apps** — primary colors, loud CTAs, rounded shapes, confetti. Wrong warmth entirely.
- **Medical / therapy / SEN tools** — anything that signals "this is for someone with a disability." Edelmore should look like something any child would want, not a specialized accommodation.
- **"Tech" aesthetic in any form** — no glassmorphism, no gradients, no dark-mode-by-default, no SaaS chrome, no metric dashboards, no data-density. Zero tech feeling.

## Design Principles

1. **The book is real.** Every interaction should feel like touching a physical object, not operating software. Page turns, cover textures, the weight of pages — the metaphor is structural, not decorative.
2. **Accessibility through beauty.** The warmth and craft are what make it accessible. A child uses it because it's beautiful, not because they have to. Clinical is the opposite of the goal.
3. **Privacy as intimacy.** No cloud, no sharing, no notifications, no analytics. The private feeling is structural — it shows in every design decision, not just the marketing copy.
4. **Cottage-core edge.** The ATM brand system is the base. Push it toward: botanical illustrations, stitching and lace, warm candlelit light, aged paper, handwritten letterforms. Pull it away from: startup warmth, editorial minimalism, "heritage" brand polish.
5. **The interface waits.** No prompts, no suggested content, no "you haven't written in 3 days." Edelmore is a quiet place. It never addresses the user except when they address it first.

## Accessibility & Inclusion

WCAG AA minimum, AA+ where practical. The product exists specifically for children with motor and reading differences — this is load-bearing, not aspirational.

- **Voice-first**: mic-to-cursor transcription is a primary interaction path, not a feature
- **Read-aloud**: per-word highlighting narration via Kokoro TTS is a primary path, not a bonus
- **Reduced motion**: full `@media (prefers-reduced-motion: reduce)` support required; page-turn animations degrade to instant/crossfade
- **Font size**: user-configurable within the diary; landing page body text minimum 16px effective
- **Color contrast**: WCAG AA 4.5:1 for body, 3:1 for large text — no muted-gray body text on cream that fails contrast
- **Keyboard navigation**: full keyboard support for all diary interactions
