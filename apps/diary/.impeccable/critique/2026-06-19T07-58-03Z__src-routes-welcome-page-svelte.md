---
target: src/routes/welcome/+page.svelte
total_score: 20
p0_count: 1
p1_count: 2
timestamp: 2026-06-19T07-58-03Z
slug: src-routes-welcome-page-svelte
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | No timing context on "resets nightly"; child landing post-reset has no recovery signal |
| 2 | Match System / Real World | 3 | "Tailscale-ready" / "Docker" in chip row is sysadmin language on a children's product page |
| 3 | User Control and Freedom | 2 | No depth path for parent who wants to evaluate before handing to child |
| 4 | Consistency and Standards | 3 | Tokens applied faithfully; emoji glyphs are the only internal inconsistency |
| 5 | Error Prevention | 1 | No guidance for what a child should do if the demo is mid-reset or PIN fails |
| 6 | Recognition Rather Than Recall | 3 | Demo credentials visible twice — once is intentional repetition, twice signals the builder wasn't sure |
| 7 | Flexibility and Efficiency | 2 | Sticky nav is efficient; no fast path back in for returning parent |
| 8 | Aesthetic and Minimalist Design | 2 | Six sections, chip row, Reader teaser, two demo boxes — longer than the job requires |
| 9 | Error Recovery | 1 | No error states. Footer "resets nightly" is the only signal and it's .68rem decorative mono |
| 10 | Help and Documentation | 1 | No FAQ, no parent-as-installer depth path |
| **Total** | | **20/40** | **Acceptable — significant improvements needed** |

## Anti-Patterns Verdict

Moderate slop. Copy is not sloppy — the composition choices are where training-data defaults show: eyebrow on every section, identical card grid, emoji glyphs, feature chip row with developer vocabulary, coming-badge as status chip. Deterministic scan returned [] — issues are structural/compositional, not lexical.

## Overall Impression

The copy is genuinely good and the color system is correctly applied. But the page is a brand-aligned editorial wrapper around a SaaS scaffold. The emotional high point (the hero) is real; the page then spends five more sections eroding it. Cut the chip row and the Reader section, let the strong copy carry more weight with less structure.

## What's Working

1. The copy: "For children who hear better than they type," "a real diary for hands that don't cooperate," "wanted her own Anne Frank" have specific voice.
2. Color token discipline is solid and consistently applied.
3. The "what it is not" structure earns trust by naming what was deliberately rejected.

## Priority Issues

**[P0] No prefers-reduced-motion support** — WCAG 2.1 AA 2.3.3 failure. Every hover transition and transform runs without a reduced-motion query. Fix: add media query suppressing all transitions and transforms.

**[P1] Feature chip row breaks tone** — "Docker · MIT licensed · Tailscale-ready" immediately after "wanted her own Anne Frank." Developer vocabulary in a children's diary. Delete it.

**[P1] Reader section misplaced** — Coming-soon section for a different product before user has taken any action. Breaks the emotional throughline. Move to /reader page or footer sentence.

**[P2] Emoji glyphs are a category error** — 🎙 🐦 📖 🔒 against "aged paper, cottage-core" positioning. Replace with SVG ornaments, typographic ornaments, or nothing.

**[P2] Card hover is SaaS pattern** — translateY + box-shadow on hover. Remove transform and shadow; keep only border-color shift to --accent.

## Persona Red Flags

**Jordan (first-timer):** Dev-vocabulary chips, duplicate credentials, Reader section before first action, cta-note too small to read on mobile.

**Sam (accessibility-dependent):** P0 reduced-motion failure, emoji glyphs in screen reader context, nav CTA ~3.8:1 contrast (fails AA for .78rem text).

**Casey (distracted mobile):** Very long page, cta-note unreadable at mobile sizes, demo-box gap may wrap on portrait tablet.

**Wren (project-specific: 11yo, ADHD, motor differences, tablet in bed):** Nav at .78rem is adult scale. Privacy assurance buried in third sentence. "Taylor's diary is waiting" should appear earlier.

## Minor Observations

- h1 `margin: 0 auto` does nothing without a width constraint
- `.not-list` uses `var(--dark-rule)` — fragile if moved to a light section
- Footer demo-pill contrast likely fails AA at .68rem
