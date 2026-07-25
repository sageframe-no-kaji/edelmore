# oEdelmore monorepo audit — 2026-07-03

Full review of both apps (diary: shipped v1.2; reader: Kamae docs, no code), the three
shared packages, and the Kamae chains. Focus areas per the practitioner's request:
what is actually shared vs. what the docs claim, bugs, page-turning, and audio
continuity during page turns.

**Verification stack at time of audit: fully green.** Biome clean, `svelte-check`
0 errors, 339/339 tests passing, 100% line coverage in the diary. The findings below
are things the stack cannot see: security posture, animation mechanics, audio timing,
doc drift, and dead surface.

---

## 1. Executive summary

1. **The code sharing is actually in good shape.** All three packages
   (`@edelmore/design`, `@edelmore/book`, `@edelmore/narration`) exist, are consumed
   by the diary, and contain no duplicated code. The confusion is almost entirely a
   **documentation problem**: roughly half the chain and public docs still describe
   the pre-Ho-03 sharing model, and three different docs name three different
   page-turn mechanisms (View Transitions, StPageFlip, clone-rotate) when only one —
   the clone-rotate in `packages/book/BookShell.svelte` — exists.
2. **Two security findings in the diary need fixing before anything else** (§3.1):
   the `/admin` gate is unthrottled and stores the raw admin PIN in a cookie, and the
   `(authenticated)` layout guard does not actually protect page server loads.
3. **Page-turning displeasure has a known, already-diagnosed root cause** — the
   clone-out-of-context flip plus an unexplained 500 ms delay on every forward flip.
   The filed ho-11 (View Transitions rewrite) is the right fix and was never
   executed; it should be re-filed against `packages/book` and executed **before**
   the reader builds on the shell (§4).
4. **Audio continuity has a structural flaw, not a tuning flaw**: the per-spread
   chain/preload design cuts the current page's audio whenever the next page's audio
   happens to become ready — fast TTS clips the final words of every page, slow TTS
   produces a gap plus a visible flash back to edit mode. The filed diary ho-08
   (whole-entry audio) is the correct fix and also deletes most of the complexity
   (§5).
5. **The reader's path is clear and mostly non-code**: Kamae 2 follow-up (7 open
   decisions) → Kamae 4 re-flow → Ho-04+. The substrate work above (page-turn
   rewrite, whole-entry audio pattern) should land first so the reader never builds
   on mechanisms slated for replacement (§7).

---

## 2. How the projects are intertwined — documented vs. actual

### Actual (verified against code)

| Package | Contains | Diary consumption |
|---|---|---|
| `@edelmore/design` | CSS only: `tokens.css` (cream/ink/gold palette, `--font-serif`), `fonts.css` (**Google Fonts CDN import — no local `.woff2`**), `base.css` | `apps/diary/src/app.css:2` |
| `@edelmore/book` | `BookShell.svelte` (leather shell + clone-rotate flip), `Spread.svelte`, `styles.css` | `(authenticated)/+layout.svelte:9` |
| `@edelmore/narration` | Wire adapter only: types, `isKokoroVoiceUri`, `audioBlobUrlFromBase64`, `createSpeakHandler`, `createVoicesHandler` | API shims + `BirdNarrator`/`VoicePicker` helpers |

Deliberately **per-app** (diary-local): `BirdNarrator.svelte`, `ReaderView.svelte`,
`VoicePicker.svelte`, `MicQuill.svelte`, `tokenize.ts`. This matches the post-Ho-03
rescope and the root `CLAUDE.md` bar ("extract when the second consumer arrives AND
both apps must consume this exact behavior").

### Where the docs contradict the code (the confusion inventory)

| Doc | Claim | Reality |
|---|---|---|
| Root `README.md` | "packages directory is intentionally empty"; reader "no code yet" | Three shipped packages (06-19 → 07-02) |
| Diary `README.md` | Page turn = "StPageFlip, wrapped in a Svelte action"; pre-monorepo clone instructions | StPageFlip was rejected in ho-03; repo is `edelmore`, app at `apps/diary/` |
| Reader `README.md` + seed + Kamae 2 | Page turn = "View Transitions API… same as the diary" | `startViewTransition` appears nowhere; View Transitions was tried and replaced during diary ho-03 (`f2e4b08` → `c4374a3`) |
| Reader Kamae 2 / Kamae 4 / seed | `@edelmore/narration` contains `BirdNarrator`, `VoicePicker`, `ReaderView`, `tokenize` | Package is wire-adapter-only; correction lives only in Ho-03 Reflect + `kamae-2-followup-prep.md` |
| Diary `CLAUDE.md` | Flip primitive "in `(authenticated)/+layout.svelte`" | Lives in `packages/book/BookShell.svelte` since Ho-02 |
| Root `CLAUDE.md` / Kamae 2 | design = "tokens, **fonts**"; "`.woff2` files live in `packages/design/fonts/`" | One CDN `@import`; no font files (Ho-01 documented the deviation; upstream docs never updated) |
| `HO-STATUS.md` rule §54 | "Only wire types + protocol adapters clear the shared-package bar" | `@edelmore/book`/`design` are presentation and don't meet that stated bar; root `CLAUDE.md`'s phrasing is the consistent one |
| Layout comments (`+layout.svelte:420,1945`) | BirdNarrator "extracted to / from `@edelmore/narration`" | BirdNarrator is diary-local |
| Diary ho-08 doc (TTS) | Streaming deferred (Decision 9); Web Speech fallback mandatory (Decision 6) | Code streams NDJSON; Web Speech path is entirely gone (see §5.4) |

### Chain-integrity problems

- **ho-08 number collision** (violates "abandoned numbers stay dead"): shipped
  `hos/ho-08-narration-via-tts.md` vs. the newly filed Post-v1.0 outline entry
  "ho-08 — chapter-continuous audio". The new work needs a fresh number.
- `ho-11-…md`'s own H1 reads "**ho-09** — Page-Turn Rewrite"; diary hos jump 08 → 11
  with no 09/10 docs; diary Kamae 4's Phase 4 heading disagrees with its own table.
- Stale frontmatter: ho-08(TTS), ho-12 shipped but `status: open`; reader ho-03
  `status: planned` though merged as `5f1bce1`; the per-spread-vs-whole-entry note
  says "decision pending" though it resolved.
- ho-12's precondition cites a shipped ho-11 at `e709385` — no such commits exist.
- Two identical copies of the reader seed (`apps/reader/docs/seed.md` committed,
  `apps/reader/ho-process/seed.md` gitignored) — drift-prone; different docs point at
  each.
- `HO-STATUS.md` hides shipped 07.1 / 08(TTS) / 12 and open 11 behind
  "ho-00 → ho-07 shipped".

---

## 3. Bugs

### 3.1 Security (fix first)

- **[critical] `apps/diary/src/routes/admin/+page.server.ts:29-43`** — the
  `ADMIN_PIN` unlock has **no throttle** (login has one precisely because a 4-digit
  PIN brute-forces in minutes; the admin gate, reachable pre-login, has none) and on
  success **stores the raw PIN in a cookie** for 60 minutes, comparing it back with
  `cookies.get(ADMIN_COOKIE) === pin`. Fix: reuse `createThrottle()`; set an opaque
  random token (or HMAC) instead of the PIN.
- **[critical] `(authenticated)/+page.server.ts:6`, `[date]/+page.server.ts:11`** —
  the layout guard **does not protect page loads**. SvelteKit runs all server loads
  concurrently; only `await parent()` serializes. Unauthenticated hits *execute*
  `listEntryDates(locals.db, undefined)` (better-sqlite3 TypeError) on every request;
  the redirect wins only by accident of kit's internal await order. Verified against
  the installed kit 2.66.0. Fix: check `locals.user` in each page load (or guard by
  path in `hooks.server.ts`); drop the `locals.user!` assertions.

### 3.2 Audio / narration pipeline

- **[bug] `BirdNarrator.svelte:464-482` — the chain cut is unsynchronized with
  speech.** `tryChainNow()` calls `cutCurrentAudio()` the moment the first preloaded
  chunk is warm — regardless of whether the current page's remaining ~30 chars
  (`BOUNDARY_LOOKAHEAD_CHARS`, ≈1.5-2.5 s of speech) have been spoken. Fast Kokoro →
  the last words of every page are clipped. This is structural: `CHAIN_GAP_MS = 0`
  assumes the cut lands at the natural end of the page's audio, but the trigger is
  network readiness, not playback position.
- **[bug] `BirdNarrator.svelte:391-408` + `+layout.svelte:437` — visible editor flash
  mid-narration.** When current audio drains before preload is warm, `chainOrEnd()`
  sets phase `loading`; the layout's `birdPlaying` derivation
  (`playing || paused`) then goes false, unmounting `ReaderView` and mounting the
  textareas for the duration of the wait, then flipping back. Every slow chain =
  flash of edit mode.
- **[bug] highlight dead zone at every bird page turn** — the flip fires at boundary
  (~30 chars early), so `currentNarrationCharIndex` points into the *previous* page
  while the new spread's `ReaderView` is showing; `localCharIndex < 0` → no highlight
  until the chained audio starts (`ReaderView.svelte:26-30`). The tail words of every
  page are spoken (when not clipped) but never highlighted.
- **[bug] `packages/narration/api/speak.ts:344-345`** — `audioOffset` collapses to
  `0` for a chunk whose `timestamps` array is empty (silence/punctuation-only),
  snapping the client's absolute clock to zero mid-stream. Carry a running offset
  forward instead. (Also: first-word `start_time` overstates the offset by any
  leading pause.)
- **[bug] `packages/narration/api/speak.ts:165-170,374`** — the idle timer is never
  cleared at request start; an armed timer can fire mid-generation and stop/unload
  Kokoro under an active request. Clear at handler entry, re-arm on completion.
- **[smell] `packages/narration/api/speak.ts:311-380`** — no `cancel()` on the
  ReadableStream and no AbortSignal on the upstream fetch: a client that stops
  playback leaves GPU generation running for the full text.
- **[bug/decision] Web Speech fallback is gone.** ho-08(TTS) Decision 6 mandates a
  Web Speech path when Kokoro is down or a browser voice is chosen;
  `resolveVoice()` (`BirdNarrator.svelte:130-132`) silently coerces any non-Kokoro
  URI to `bf_emma`, and a Kokoro outage leaves the bird silently dead (fetch fails →
  `idle`). Either restore the fallback or file the abandonment as a decision — today
  it's an undocumented regression relative to the chain.
- **[bug, minor] pause race at chunk boundaries** — `pause()` clicked in the moment
  between chunks (`audioEl === null`, stream still pushing) sets phase `paused`, but
  the next `ingestChunk` sees `audioEl === null` and starts playback anyway
  (`BirdNarrator.svelte:316-318`), overriding the user's pause.

### 3.3 Page-flip mechanics

- **[bug] `packages/book/BookShell.svelte:99-226` — `isFlipping` never resets if
  `mutate()` throws.** `flip()` has no try/finally; `navigateTo` (fetch + `goto`) can
  reject, leaving `isFlipping = true` forever — the book is permanently locked until
  reload. Wrap the body in try/finally.
- **[bug] textarea clones lose typed text on keyboard-driven flips.** `makeFace`
  uses `cloneNode(true)`; a cloned `<textarea>` carries attributes, not the live
  `.value` (set by property in the projection effect). On click-driven flips the
  textarea blurs first and the markdown div renders — fine. On **keyboard** flips
  (ArrowRight/ArrowDown at page end) the textarea keeps focus, the markdown div is
  unmounted (`{#if activeEditor !== 'left'}`), and the rotating front face shows an
  empty page ("Begin writing…" placeholder) for the first 90° of the turn. Needs a
  browser check to confirm severity, but the mechanism is clear from the code.
- **[known, ho-11] clone-out-of-context artifacts** — `.page` styling depends on
  parent `.spread` classes; clones detach from that context (marbled-glued-to-cover,
  missing page-stack stripes, whole-book ghosting, first-frame snap). Already fully
  diagnosed in ho-11.
- **[known, ho-11 Decision 4] the 500 ms forward delay** (`BookShell.svelte:131-133`)
  — every forward flip waits half a second before anything moves; with navigation in
  `mutate()`, perceived forward-flip latency is 500 ms + network + 700 ms tween,
  and backward flips have no delay (asymmetric feel). Introduced in `b3226db` with no
  comment. This, more than the tween itself, is likely why turning "never felt
  pleasing."
- **[smell] input dropped during flips** — the `isFlipping` guard silently discards
  clicks/keys for ~1.2 s per forward flip; holding an arrow key turns one page per
  1.2 s with no queueing.

### 3.4 UI components

- **[bug] `TocPage.svelte:31-40`** — `visibleCount` is a ratchet: it can shrink on a
  small window but can never grow back (measurement only sees already-rendered
  items), and it never resets when `entries` grows. Fix: reset to full, `tick()`,
  measure, clamp (the CoverPage pattern).
- **[bug] `MicQuill.svelte:12-18,66-70`** — recording state is module-scoped with no
  lifecycle cleanup: navigate away mid-recording and the mic stays hot, the timer
  runs to the 90 s cap, and the transcription fires into a destroyed component's
  closure.
- **[bug] `MicQuill.svelte:31-38,221-227`** — error messages exist only as an
  `aria-label` + color change: never visibly rendered, never announced (no live
  region). Effectively dead UI.
- **[bug] `MicQuill.svelte:179-201`** — `suppressClick` latches if a hold-cancel ends
  with the pointer off the button; the next genuine tap is swallowed.
- **[bug] `[date]/+page.server.ts:27-28`** — visiting an entry-less past date gives
  `nextDate = null` unconditionally: back-navigation works, forward dead-ends even
  when newer entries exist. Mirror the `prevDate` logic.
- **[smell]** CalendarModal: Escape fires `onClose()` twice (window + div handler);
  no focus management despite `aria-modal`; prev-month from January of `minYear`
  leaves the year select blank.
- **[smell]** VoicePicker: unaborted mount fetch writes state after unmount; preview
  blob URL leaks on error; rapid clicks overlay simultaneous previews.
- **[smell]** settings `currentSize` optimistic state never reconciles after a failed
  action. Login/admin PIN inputs have no accessible name.
- **[smell]** `ReaderView.svelte:21-36` — effect reads and writes `currentSpanIndex`
  (converges, but one refactor from a loop; track prev index in a plain local).

### 3.5 Backend smells

- `logout` is a state-changing GET (`logout/+server.ts:6`) — convert to POST action.
- `db.ts:86-92` migration loop swallows *all* errors (I/O, BUSY, disk-full), not just
  duplicate-column. Inspect and rethrow.
- `settings/+page.server.ts:59-72` — six sequential writes, not transactional;
  partial failure commits some settings while reporting total failure.
- `POST /api/entries` accepts future dates the UI forbids — enforce
  `date <= todayIso()` at the write boundary.
- `app.d.ts` `Locals.user` omits `voice_uri` → forces the `as any` reads in the
  layout. Add the field, drop the casts.

### 3.6 Dead surface (delete in one sweep)

`seedIfEmpty` (a count check masquerading as seeding — `hooks.server.ts` discards its
boolean), `updateUserCoverId` (only its own test calls it), `SpeakResponse` type
(pre-streaming shape, consumed nowhere), `SpeakRequest.speed` (declared, ignored —
server pins 1.0), `Spread.svelte`'s `spreadIndex`/`spreadCount` props (passed in,
never used), the layout's `leftStack`/`rightStack` deriveds (`+layout.svelte:561-562`
— BookShell computes its own), `BirdNarrator.seekTo` (no caller), the
`pcm/opus/flac` branches of `formatToMime`, and the `handleNarrationEnd` no-op with
its stale "auto-advance" comment.

---

## 4. Page-turning: assessment and proposal

The mechanism (`packages/book/BookShell.svelte`) is a hand-rolled clone-rotate:
snapshot old pages via `cloneNode`, hide the live pages, rotate a two-faced wrapper,
swap faces at 90°. It works, but its failure class is inherent — **any content whose
rendering depends on parent CSS context, live element state (textarea values,
highlights), or pseudo-elements breaks in the clone**. Four days of patching during
ho-03 confirmed each patch surfaces the next artifact. On top of it: the 500 ms
forward delay, the throw-locks-the-book bug, and asymmetric forward/backward feel.

**Proposal — execute the View Transitions rewrite, in `packages/book`, before any
reader code.** ho-11's plan is sound and current (browser support is a met
precondition; the phased A→E execution with per-step browser verification is the
right shape). Three adjustments:

1. **Forward-only bookkeeping:** ho-11 was filed pre-extraction against the diary's
   layout; the code now lives in `packages/book`. Close ho-11 as superseded and file
   a fresh ho carrying its Think section over, updated for the package. (Which chain
   owns package-level hos is a practitioner decision — precedent says the reader's
   chain, which owned Ho-01–03.)
2. **Resolve the 500 ms delay inside the rewrite** (ho-11 Decision 4 already plans
   this): find what it actually waits for, then delete it or replace it with an
   event-driven coordination. Do not carry an unexplained delay into the new
   mechanism.
3. **Fix `isFlipping`/try-finally now** — it's a five-line fix independent of the
   rewrite and removes a lock-up hazard in shipped software.

Why before the reader: the reader inherits `BookShell` as-is. Every artifact fixed
after reader Ho-04 gets verified twice, on two apps. Fixed now, the reader never sees
the clone mechanism at all — and the reader's own docs already (incorrectly) promise
View Transitions, so this rewrite also *makes the docs true* instead of rewriting
them twice.

---

## 5. Audio continuity: assessment and proposal

The per-spread model synthesizes each spread separately, then plays a timing game at
every boundary: fire ~30 chars early → flip the page (500 ms delay + 700 ms tween)
→ preload next spread's audio → cut current audio when preload warms → swap. The
game is unwinnable because the cut trigger is **network readiness**, not playback
position (§3.2): fast TTS clips words, slow TTS gaps and flashes the editor, and the
tail of every page is never highlighted. `BirdNarrator` carries ~250 lines of
chain/prewarm/race plumbing to mitigate what the model itself causes.

**Proposal — the filed "whole-entry audio" pivot is correct; open it (renumbered,
see §2) as the next diary code ho.** One synthesis request per entry; the NDJSON
streaming path already delivers chunks progressively, so time-to-first-audio stays
short. Page turns become a *consumer* of the highlight timeline: when
`currentNarrationCharIndex` crosses `splitPoints[spread*2+1]`, flip. No cut, no
chain, no preload, no gap, no editor flash, highlight continuous through the turn.
Deletes: `chainArmed`/`chainPending`/`prewarmChunk`/`tryChainNow`/`cutCurrentAudio`/
`preloadNext` and both races found in §3.2.

Fold into the same ho (they're one behavior surface): the pause-race fix, the
`birdPlaying` derivation treating mid-entry `loading` as still-narrating (trivial
after the pivot), and an explicit decision on the Web Speech fallback (restore or
formally abandon — today's silent coercion to `bf_emma` is neither).

Independent of the pivot, fix in `@edelmore/narration` (shared, the reader needs
these too): idle-timer clear at request start, stream `cancel()` + upstream abort,
and the empty-timestamps `audioOffset` bug.

**On sharing:** the reader wants whole-chapter audio from day one — the same engine
shape. Per the extraction bar, do *not* pre-extract: build the whole-entry engine
diary-local, design it headless (state machine separate from bird UI), and extract
to `@edelmore/narration` only when the reader's narration ho arrives as the second
consumer. That is the Ho-03 lesson applied forward.

---

## 6. How the projects SHOULD be intertwined

The current three-package split is right. What needs to change is the *statement* of
it, and two eventual additions:

1. **One sharing rule, stated once.** Root `CLAUDE.md`'s bar is the good one. Fix
   `HO-STATUS.md`'s "only wire types + protocol adapters" line to match (book and
   design are presentation and legitimately shared — the bar is "both apps must
   consume this exact behavior," not "no presentation").
2. **`@edelmore/design`** — stays the CSS substrate. Either add the promised local
   `.woff2` files or update root `CLAUDE.md`/Kamae 2 to say "CDN fonts" — currently
   the docs promise what the package doesn't do.
3. **`@edelmore/book`** — stays the shell + spread; becomes the home of the
   page-turn rewrite (§4). Drop the dead `spreadIndex`/`spreadCount` props or use
   them. Note in the package README that consumers must supply `/edge.png`.
4. **`@edelmore/narration`** — stays wire-adapter-only *for now*; grows the headless
   narration engine only when the reader's narration ho makes it a second consumer
   (§5). The server-side fixes (§5, last paragraph) go in now since both apps will
   consume the handler factory.
5. **Packages get their own verification.** Today `packages/` is covered only
   incidentally through the diary's suite and has no test/lint/check scripts of its
   own (`packages/*/package.json` have no scripts). Minimum: a small vitest config
   per TS-bearing package (narration), and the workspace `check` including the
   packages. Otherwise the reader can break a package the diary's suite doesn't
   exercise.

---

## 7. The push to get the reader done

Ordered; A-track (code) and B-track (docs/design) can run in parallel. One session
per ho, per the discipline.

**A0 — Security + lock-up hotfix (diary chain, small).** Admin throttle + opaque
cookie; page-load guards; `flip()` try/finally. Ship this week; it's shipped
software with kids' diaries behind it.

**A1 — Narration wire-adapter hardening (`@edelmore/narration`).** Idle-timer clear,
stream cancel/abort, `audioOffset` carry-forward, dead-type removal. Small, shared,
reader-blocking-adjacent.

**A2 — Page-turn rewrite in `packages/book`** (supersedes ho-11; §4). The single
biggest "pleasingness" lever, and it must precede reader UI work.

**A3 — Whole-entry audio pivot (diary chain; renumbered from the colliding
"ho-08"; §5).** Kills the boundary-cut/gap/flash class. Also the dry run for the
reader's whole-chapter model.

**A4 — Hygiene sweep (one small ho).** Dead-surface deletions (§3.6), UI bug batch
(TocPage ratchet, MicQuill lifecycle/error visibility, VoicePicker abort,
`nextDate` dead-end, logout→POST, migration-error rethrow, transactional settings,
`voice_uri` typing).

**B1 — Doc realignment (can start today, no code).** Root README, diary README,
reader README/seed, diary CLAUDE.md flip location, HO-STATUS rule wording +
shipped-ho visibility, stale frontmatter, ho-08 collision (renumber the new one),
ho-11 disposition, single seed copy. This directly dissolves the "serious confusion"
— the code mostly agrees with itself; the docs don't.

**B2 — Reader Kamae 2 follow-up** (the 7 decisions; leans already drafted in
`notes/kamae-2-followup-prep.md`) → **B3 — Kamae 4 re-flow** → then reader Ho-04
(EPUB ingestion) onward. Also schedule the deferred **narration-drift spike** on
long content before reader Ho-04 — it's been pushed three times and gates the
whole-chapter audio model.

Sequencing rationale: B1/B2/B3 are conversations and documents — they don't collide
with A-track code sessions. A2 and A3 change exactly the substrate the reader
consumes; landing them first means reader hos build on the final mechanisms, once.

---

## 8. What's genuinely good (so it doesn't get churned)

- The verification stack is real: 100% lines, green pre-commit, CI gating deploys.
- `content.ts` / `overflow.ts` / `cursor.ts` / `tokenize.ts` survived a hostile trace
  — the offset math, binary searches, and the 06-12 corruption post-mortem encoded in
  `applyPageEdit` all hold.
- The server layer is thin and disciplined: locals injection, all SQL in `db.ts`,
  routes as validators + delegation, no diary text in logs.
- The extraction seams are clean — env-to-config shims, no duplicated code, and the
  Ho-03 Reflect honestly recorded the scope drift that caused today's doc confusion.
- ReaderView's padding/negative-margin cancellation (keeping bird-mode layout
  identical to editor `splitPoints`) is load-bearing and correctly documented
  in-place.
