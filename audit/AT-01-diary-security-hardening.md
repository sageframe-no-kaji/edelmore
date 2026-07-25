---
created: 2026-07-03
type: agent-task
status: complete
pr: https://github.com/sageframe-no-kaji/edelmore/pull/12
parent: audit/2026-07-03-monorepo-audit.md
project: edelmore-diary
---

**Goal**

Close the two critical security findings from the 2026-07-03 audit: throttle the `/admin` PIN gate and stop storing the raw `ADMIN_PIN` in a cookie; make the `(authenticated)` page server loads actually guard on `locals.user` instead of asserting it.

**Problem**

1. `apps/diary/src/routes/admin/+page.server.ts:29-43` — the `unlock` action compares the submitted PIN with no attempt throttle (the login route throttles for exactly this reason: 4-digit PINs brute-force in minutes), then persists the **plaintext admin PIN** in the `admin_gate` cookie for 60 minutes and re-authorizes by comparing `cookies.get(ADMIN_COOKIE) === env.ADMIN_PIN`.
2. `apps/diary/src/routes/(authenticated)/+page.server.ts:6` and `(authenticated)/[date]/+page.server.ts:11` — SvelteKit 2 runs layout and page server loads **concurrently**; only `await parent()` serializes them. The `locals.user!` assertions mean unauthenticated requests execute `listEntryDates(locals.db, undefined)` (better-sqlite3 TypeError) on every hit; the login redirect wins only by accident of kit's internal await ordering.

**Files**

- Modify: `apps/diary/src/routes/admin/+page.server.ts`
- Modify: `apps/diary/src/routes/admin/admin.test.ts`
- Modify: `apps/diary/src/routes/(authenticated)/+page.server.ts`
- Modify: `apps/diary/src/routes/(authenticated)/[date]/+page.server.ts`
- Modify: `apps/diary/src/routes/(authenticated)/root.test.ts`
- Modify: `apps/diary/src/routes/(authenticated)/[date]/date.test.ts`
- Read-only: `apps/diary/src/lib/auth.ts` (existing throttle implementation to reuse)
- Read-only: `apps/diary/src/routes/login/+page.server.ts` (reference for how login consumes the throttle)

**Required Changes**

1. **Throttle the admin unlock action.** Reuse the same throttle mechanism the login action uses (see `lib/auth.ts` / `login/+page.server.ts` for the existing pattern — reuse it, do not write a second implementation). Failed unlock attempts count against the throttle; a throttled request gets the same shape of failure response the login route produces.

2. **Replace the plaintext-PIN cookie with an opaque token.** On successful unlock, generate a cryptographically random token (`crypto.randomBytes`, ≥32 bytes, hex/base64url), store it in a module-level `Map<string, number>` of token → expiry (60 minutes, same as today), and set THAT in the `admin_gate` cookie (httpOnly, sameSite strict, path `/admin` — preserve today's cookie attributes except the value). Authorization checks membership + unexpired. Expired entries are pruned on check. A server restart invalidating admin sessions is acceptable and expected.

3. **Guard the page loads.** In both `(authenticated)/+page.server.ts` and `(authenticated)/[date]/+page.server.ts`: if `!locals.user`, `redirect(303, '/login')` before any DB access. Remove the `locals.user!` non-null assertions. Keep the layout guard as-is (it still covers layout data).

4. **Tests.**
   - Admin: unlock sets a cookie that does NOT equal `ADMIN_PIN`; N failed attempts trigger the throttle; a valid token authorizes; an expired token does not.
   - Pages: calling each page load with `locals.user` undefined redirects to `/login` and does not touch the db (pass a db stub that throws on any call to prove it).

**Acceptance**

- [ ] `admin_gate` cookie value is never the `ADMIN_PIN` (asserted in a test).
- [ ] Repeated failed unlock attempts are throttled via the existing throttle mechanism (asserted in a test).
- [ ] Both `(authenticated)` page loads redirect unauthenticated requests without executing a DB query (asserted in tests).
- [ ] No `locals.user!` assertion remains in either page load.
- [ ] Full verify stack green: lint, check, test with coverage ≥ the configured floor.

**Verification**

```bash
npm run lint
npm run check
npm run test:coverage
grep -n 'locals.user!' apps/diary/src/routes/\(authenticated\)/+page.server.ts apps/diary/src/routes/\(authenticated\)/\[date\]/+page.server.ts || echo "no assertions — OK"
```

**Do Not**

- Do not touch the login route's session mechanism — it is sound; only the admin gate changes.
- Do not introduce a new dependency for the token or throttle; `node:crypto` and the existing throttle suffice.
- Do not move the guard into `hooks.server.ts` path-matching — the per-load guard was chosen to keep the change local and testable.
- Do not fix the `nextDate` dead-end in `[date]/+page.server.ts` — that is AT-04's scope; keep this diff security-only.

**Commit**

Single commit on branch `fix/at-01-diary-security`. Message format:

```
fix(diary): throttle admin gate, opaque admin cookie, guard page loads

Admin unlock reuses the login throttle and stores a random expiring token
instead of the raw ADMIN_PIN. (authenticated) page loads check locals.user
before touching the DB instead of asserting it.
```

No AI-attribution trailers (no Co-Authored-By, no Generated-with). This overrides any default commit template.
