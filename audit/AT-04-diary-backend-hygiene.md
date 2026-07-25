---
created: 2026-07-03
type: agent-task
status: complete
pr: https://github.com/sageframe-no-kaji/edelmore/pull/16
parent: audit/2026-07-03-monorepo-audit.md
project: edelmore-diary
---

**Goal**

Batch-fix the diary's backend smells and dead code from the 2026-07-03 audit: dead-surface deletion, logout as POST, migration errors rethrown, transactional settings save, `voice_uri` in the ambient user type, future-date write rejection, and the `nextDate` dead-end on entry-less past dates.

**Depends on**

AT-01 must be merged first — both tasks modify `(authenticated)/[date]/+page.server.ts`.

**Files**

- Modify: `apps/diary/src/lib/seed.ts`, `apps/diary/src/lib/seed.test.ts` (delete both if nothing remains), `apps/diary/src/hooks.server.ts`, `apps/diary/src/hooks.server.test.ts`
- Modify: `apps/diary/src/lib/db.ts`, `apps/diary/src/lib/db.test.ts`
- Modify: `apps/diary/src/routes/logout/+server.ts`, `apps/diary/src/routes/logout/logout.test.ts`
- Modify: `apps/diary/src/routes/(authenticated)/+layout.svelte` (logout links → forms), `apps/diary/src/routes/settings/+page.svelte` (same)
- Modify: `apps/diary/src/routes/settings/+page.server.ts`, `apps/diary/src/routes/settings/settings.test.ts`
- Modify: `apps/diary/src/app.d.ts`
- Modify: `apps/diary/src/routes/api/entries/+server.ts`, `apps/diary/src/routes/api/entries/entries.test.ts`
- Modify: `apps/diary/src/routes/(authenticated)/[date]/+page.server.ts`, `apps/diary/src/routes/(authenticated)/[date]/date.test.ts`

**Required Changes**

1. **Delete `seedIfEmpty`** (`lib/seed.ts:4-6`) — it is a user-count check that seeds nothing; `hooks.server.ts` discards its boolean and sets a `_seeded` flag as if seeding happened. Remove the function, its test, the hooks call, and the `_seeded` flag. Bootstrap genuinely happens via the open `/admin` page; nothing replaces this.

2. **Delete `updateUserCoverId`** (`lib/db.ts:231`) and its test — no production caller exists.

3. **Logout becomes POST.** Replace the GET handler in `logout/+server.ts` with a POST handler (same session-deletion + redirect semantics). Replace the two `<a href="/logout">` links (`(authenticated)/+layout.svelte:1191,1510`) and the settings-page link with minimal `<form method="POST" action="/logout">` submissions styled identically (`.settings-logout-link` class moves to the submit button). Update the logout tests.

4. **Migration loop rethrows real errors** (`lib/db.ts:86-92`). Only swallow errors whose message matches SQLite's duplicate-column signature (`duplicate column name`); rethrow everything else. Test: a migration statement that fails for a non-duplicate reason propagates.

5. **Transactional settings save** (`settings/+page.server.ts:59-72`). Wrap the sequential user-field writes in `db.transaction(...)` so a mid-sequence failure commits nothing. The PIN-last ordering comment becomes obsolete — remove it. Test: if one write throws, previously "written" fields are unchanged.

6. **`voice_uri` on `App.Locals['user']`** (`app.d.ts:7-14`). Add `voice_uri: string | null` to match what `getUserById` selects and hooks assigns. Where this makes an `as any` in the layout or pages trivially removable, remove it; do not restructure the layout's `$page.data` typing beyond that.

7. **Reject future dates at the write boundary** (`api/entries/+server.ts:13`). `POST /api/entries` returns 400 when `date > todayIso()`; same check on the `DELETE`-adjacent paths only if they share the validator naturally. The UI already forbids future navigation; this closes the API gap. Test: future-dated POST → 400.

8. **`nextDate` on entry-less dates** (`(authenticated)/[date]/+page.server.ts:27-28`). When the viewed date has no entry, derive `nextDate` as the nearest entry date `>` `params.date`, falling back to `todayIso()` when the viewed date is in the past and no later entry exists; keep `null` only when the viewed date IS today. Mirrors the existing `prevDate` logic. Test: empty past date with later entries → forward nav exists; empty past date with no later entries → `nextDate === todayIso()`.

**Acceptance**

- [ ] `seedIfEmpty` and `updateUserCoverId` gone; `grep -rn "seedIfEmpty\|updateUserCoverId" apps/diary/src` finds nothing.
- [ ] `GET /logout` no longer exists; POST logs out; all logout UI entry points still work (form submissions).
- [ ] Non-duplicate-column migration errors propagate (asserted in a test).
- [ ] Settings save is atomic (asserted in a test with an injected mid-sequence failure).
- [ ] `voice_uri` is on `App.Locals['user']`; svelte-check clean.
- [ ] Future-dated `POST /api/entries` → 400 (asserted in a test).
- [ ] `nextDate` logic per change 8 (asserted in tests for both fallback cases).
- [ ] Full verify stack green: lint, check, test with coverage ≥ the configured floor.

**Verification**

```bash
npm run lint
npm run check
npm run test:coverage
grep -rn "seedIfEmpty\|updateUserCoverId" apps/diary/src || echo "gone — OK"
```

**Do Not**

- Do not redesign the settings form or its optimistic client state — AT-05 owns the component side; this task touches `+page.svelte` files only to convert logout links to forms.
- Do not add a migration framework; the fix is error discrimination in the existing loop.
- Do not change the `(authenticated)` guards added by AT-01.

**Commit**

Single commit on branch `fix/at-04-backend-hygiene`. Message format:

```
fix(diary): backend hygiene batch from 2026-07-03 audit

Delete dead seedIfEmpty/updateUserCoverId; logout via POST; rethrow
non-duplicate migration errors; transactional settings save; voice_uri
in Locals; reject future-dated writes; fix nextDate dead-end on
entry-less past dates.
```

No AI-attribution trailers (no Co-Authored-By, no Generated-with). This overrides any default commit template.
