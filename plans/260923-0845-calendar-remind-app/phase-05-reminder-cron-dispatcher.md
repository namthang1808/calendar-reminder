---
title: "Phase 5: Reminder Cron Dispatcher"
status: in-progress
priority: P1
effort: "3h"
dependencies: [2, 4]
---

# Phase 5: Reminder Cron Dispatcher

## Context Links

- Research: `research/researcher-01-scheduling.md`
- Brainstorm contract: `../reports/brainstorm-260923-1529-calendar-remind.md` (polling-outbox pattern, idempotency edge cases)

## Overview

Build the scheduled job that finds due, unsent reminders and sends them via
`sendTelegramMessage` (Phase 4), triggered every ~10 minutes by Supabase
`pg_cron`/`pg_net` calling a protected Next.js API route.

## Key Insights (from research — corrects an assumption from the brainstorm)

- **Vercel Hobby Cron cannot do this job at all.** It is hard-capped at
  once-per-day with up to ±59-minute jitter; a `*/10 * * * *` schedule
  fails at deploy time on Hobby. Only Vercel Pro ($20/mo) unlocks 1-minute
  cron — an unjustified cost for a 2-user app. Source:
  `research/researcher-01-scheduling.md` §1.
- **Use Supabase `pg_cron` + `pg_net` instead**, calling the Next.js API
  route directly (not a separate Supabase Edge Function, to keep all
  reminder logic in one codebase). `pg_cron` is enabled by default on every
  Supabase project; `pg_net` needs a one-time `create extension pg_net;`.
  1-minute minimum interval comfortably covers the 10-minute requirement.
  Source: same report, §2(a)/(b) and §3.
- **Cron delivery is best-effort everywhere** — both Vercel-style and
  pg_cron-style triggers can occasionally miss or duplicate an invocation.
  The dispatcher must be idempotent by construction, not "usually correct."
- **Open risk, not yet resolved by research:** Supabase free-tier projects
  auto-pause after 7 consecutive days of zero database activity; it's
  undocumented whether pg_cron's own queries count as activity. Mitigation:
  a real user login/request from the couple's actual weekly usage very
  likely prevents this in practice; the observability mechanism added below
  (not a keep-alive ping — see red-team correction) surfaces it if it does
  happen.
- **Auth pattern:** no implicit auth from pg_net — send a shared secret
  header (`x-cron-secret`) from the `net.http_post` call, stored in
  Supabase Vault, checked against an env var in the route handler.

<!-- Updated: Red Team Session 2026-09-23 — Findings 2, 3, 4, 7, 9, 10, 14 -->
**Red-team corrections applied:**
- **[Finding 3, Critical]** The original design set `reminder_sent = true`
  *before* attempting the Telegram send, so any send failure (Telegram
  5xx/429, function timeout, a partner not yet onboarded) permanently lost
  that reminder with no retry — a terminal boolean is at-most-once
  delivery, not "reliable." Replaced with a **lease-based claim**
  (`reminder_claimed_at`, `reminder_attempts` columns from Phase 2):
  claim by setting a short-lived lease, only set `reminder_sent = true`
  after every recipient with a known `chat_id` has been sent successfully,
  and let the next cycle retry unsent rows whose lease has expired, up to
  a bounded attempt count.
- **[Finding 4, Critical]** `remind_at` is now trigger-maintained (Phase 2
  fix) — this phase's query is unaffected by the mechanism change but no
  longer needs to (and must not) recompute it.
- **[Finding 7, High]** The claim query had no lower time bound, so
  backfilling a past event or editing an already-past event's time would
  send a reminder for something already over. Added `AND start_at > now()`.
- **[Finding 2, Critical]** The dispatcher now explicitly uses
  `lib/supabase/admin.ts` (service-role, from Phase 1's corrected client
  split) — documented here as one of exactly two legitimate admin-client
  call sites (the other being Phase 4's webhook).
- **[Finding 9, High]** Vault's stored endpoint URL now targets the stable
  production domain from the start (matching Phase 4's webhook
  correction), and Phase 6 adds a step to verify/update it if the domain
  ever changes — closing the "scheduled to a URL that later becomes
  stale" gap.
- **[Finding 10, Medium]** Added a `last_successful_dispatch_at` tracking
  mechanism so a broken schedule is detected by a stale timestamp, not
  only by a couple noticing a missed reminder.
- **[Finding 14, Medium]** The `x-cron-secret` check now specifies
  timing-safe comparison and fail-closed behavior when the env var is
  unset, matching Phase 4's webhook secret check.
- The cron-job.org keep-alive idea from the original draft is **dropped**:
  a trivial `/api/health` ping that never touches Supabase would not
  actually count as database activity and cannot prevent the free-tier
  pause it was meant to guard against. The `last_successful_dispatch_at`
  mechanism gives real signal instead of a false sense of mitigation.

## Requirements

- [x] `app/api/cron/send-reminders/route.ts` — protected Next.js Route Handler that runs the dispatch logic, using `lib/supabase/admin.ts`.
- [x] Route rejects any request missing/mismatching the `x-cron-secret` header (env var `CRON_SHARED_SECRET`), using the same timing-safe `verifySecret` helper as Phase 4, and fails closed if the env var is unset.
- [x] Atomic **lease claim**.
  <!-- Updated: Implementation session 2026-09-23 -- design delta from the original plan text -->
  **Delta from the original plan:** the plain-SQL claim shape described here (`UPDATE ... SET reminder_attempts = reminder_attempts + 1 ...`) can't be issued as a single supabase-js `.update()` call — that method takes a plain value payload, not a SQL expression, so `reminder_attempts + 1` isn't expressible without either a second non-atomic call (which would reopen the exact race this claim exists to close) or raw SQL. Implemented instead as a Postgres function, `claim_due_reminders(lease_minutes, max_attempts)` (`supabase/migrations/20260923000004_claim_due_reminders_fn.sql`), containing the same atomic `UPDATE ... RETURNING` in real SQL, called via `admin.rpc("claim_due_reminders", {...})`. Same guarantee, correct mechanism.
- [x] For each claimed row, send a Telegram message to every partner with a non-null `chat_id` via `sendTelegramMessage` from Phase 4; skip (log, don't error) when there are zero onboarded recipients.
- [x] Only after **all** attempted sends for a row succeed, `UPDATE` that row to `reminder_sent = true`. If any send fails, leave `reminder_sent = false` so the lease expiry allows a retry on a later cycle (bounded by `reminder_attempts < 5`).
- [x] On every run, update `system_status.last_successful_dispatch_at` (`supabase/migrations/20260923000005_system_status.sql`).
- [x] Supabase migration enabling `pg_net` and scheduling the `cron.schedule(...)` job at `*/10 * * * *` — `supabase/migrations/20260923000006_schedule_reminder_dispatch.sql`, guarded to no-op until the Vault secrets exist (see Vault Todo item below).
- [x] A send failure for one event does not abort processing of other due events in the same run (per-event try/catch in the route handler).

## Architecture

- Trigger: Supabase `pg_cron` (`*/10 * * * *`) → `pg_net.http_post` → Next.js API route on Vercel (production domain).
- Dispatcher: single Route Handler using `lib/supabase/admin.ts` (service-role, from Phase 1) to bypass RLS for the claim query, since this is a trusted server-side job, not a user-scoped request — this is one of exactly two legitimate uses of the admin client (the other is Phase 4's webhook).
- Reliability: a **lease-based claim** (`reminder_claimed_at` + `reminder_attempts`), not a terminal `reminder_sent` flag set before sending — `reminder_sent` becomes true only after confirmed delivery to every onboarded recipient. This is what makes the dispatcher retry-capable instead of merely idempotent-on-duplicate-invocation.

## Related Code Files

- Create: `app/api/cron/send-reminders/route.ts`
- Create: `supabase/migrations/20260923000004_claim_due_reminders_fn.sql` (atomic claim RPC, see delta note above)
- Create: `supabase/migrations/20260923000005_system_status.sql` (`last_successful_dispatch_at` tracking)
- Create: `supabase/migrations/20260923000006_schedule_reminder_dispatch.sql`
- Create: `lib/verify-secret.ts` (shared timing-safe compare, also used by Phase 4's webhook)
- Modify: `.env.example` — add `CRON_SHARED_SECRET`

## Implementation Steps

1. Implement the Route Handler: verify `x-cron-secret` header (timing-safe, fail-closed), run the atomic lease-claim query via `lib/supabase/admin.ts`, loop over claimed rows sending Telegram messages to each recipient with a known `chat_id`, mark `reminder_sent = true` per row only if every attempted send succeeded, update `last_successful_dispatch_at`, and return a summary (count sent/retried/failed).
2. Add the `pg_net` extension migration (`create extension if not exists pg_net;`).
3. Add the `system_status` table (single row) or equivalent for `last_successful_dispatch_at`.
4. Store the deployed **production** route URL and `CRON_SHARED_SECRET` value in Supabase Vault (`vault.create_secret` or dashboard UI) — do not hardcode either in the migration SQL.
5. Add the `cron.schedule('send-due-reminders', '*/10 * * * *', ...)` migration calling `net.http_post` with the Vault-stored URL and secret header, per the researched SQL shape.
6. Deploy, then manually trigger the route once (bypassing the schedule) to verify a due test event gets claimed and a message sent, and `reminder_sent` only flips to `true` after that success.
7. Verify a second immediate call to the route does not re-send an already-`reminder_sent = true` event (confirms terminal state is respected), and separately verify that a row left `reminder_sent = false` after a simulated send failure is retried on the next lease-expired call.

## Todo

- [x] Route handler implemented with timing-safe, fail-closed shared-secret verification
- [x] Lease-based claim implemented via the `claim_due_reminders` RPC (`reminder_claimed_at`, `reminder_attempts`, bounded retries)
- [x] `reminder_sent` set only after confirmed delivery to every onboarded recipient (code review — not yet exercised against a live Telegram failure)
- [x] `start_at > now()` guard present in `claim_due_reminders` SQL
- [x] Per-row send failures logged (`console.error`), not fatal to the batch
- [x] `last_successful_dispatch_at` updated on every run
- [ ] `pg_cron`/`pg_net` migration scheduling the job — migration written, but only takes effect once Vault secrets exist and it's re-applied (blocked on a live Supabase project + production URL)
- [ ] Vault secrets configured (production endpoint URL, shared secret) — blocked on deployment (README Setup step 4)

## Success Criteria

- An event with `remind_at` in the past, `start_at` still in the future, and `reminder_sent = false` triggers a Telegram message to both onboarded partners within one 10-minute cycle of deployment.
- A simulated Telegram send failure for one recipient leaves that event's `reminder_sent = false` and results in a retry on a subsequent cycle (within the 5-attempt bound), rather than losing the reminder.
- Manually invoking the route twice in a row for the same already-successfully-sent event sends exactly one message, not two.
- A backfilled event with `start_at` in the past does not trigger a send.
- A simulated Telegram send failure for one event does not prevent other due events in the same batch from sending.

## Edge Cases & Considerations

- **Late-created events:** an event created with `remind_at` already in the past but `start_at` still in the future must still be picked up and sent on the next poll — the claim query's `remind_at <= now() AND start_at > now()` condition satisfies this correctly (the added lower bound does not break the late-creation case, since it bounds on `start_at`, not `remind_at`).
- **Backfilled/past events:** an event whose `start_at` is already in the past when created or edited must **not** trigger a send — covered by the new `start_at > now()` guard.
- **Edited events:** `remind_at`/`reminder_sent`/`reminder_claimed_at`/`reminder_attempts` reset is owned by the Phase 2 trigger, which fires regardless of which client made the edit — verify this interaction explicitly in Phase 6's test pass.
- **Unonboarded recipient:** an event claimed while one partner's `telegram_chat_id` is still null must send to the onboarded partner and not mark the row fully sent in a way that permanently skips the other partner — log and leave `reminder_sent = false` if any recipient couldn't be reached, subject to the same bounded-retry logic.
- **Timezone:** `remind_at`/`start_at` are `timestamptz` (UTC underneath); `now()` in Postgres is also UTC-aware, so no explicit Asia/Saigon conversion is needed in the query itself — conversion happens in Phase 3's `lib/time.ts` at write time and in the Telegram message text (Phase 4/5 formatting), not here.

## Risk Assessment

- **Risk:** pg_cron job silently stops firing if the Supabase project auto-pauses, or if the Vault-stored URL becomes stale after a domain change.
  **Signal:** `last_successful_dispatch_at` older than ~20 minutes (two missed cycles).
  **Response:** manually resume the project via dashboard, or update the Vault URL (see Phase 6); a future iteration could alert on this signal via a scheduled check, but manual monitoring is sufficient at 2-user scale for V1.
- **Risk:** Telegram bot token or webhook secret leaked via a misconfigured log statement.
  **Mitigation:** never log full request bodies/headers in the route handler; log only counts and event ids.
- **Risk:** Bounded retry (`reminder_attempts < 5`) means a persistently failing send (e.g. a permanently blocked bot) eventually stops retrying silently.
  **Mitigation:** log the final exhausted-attempts state distinctly from a normal skip, so it's visible in Vercel logs even without a dedicated alerting mechanism.

## Security Considerations

- The dispatcher route uses `lib/supabase/admin.ts` (service-role) — it must be unreachable without the correct, timing-safe-verified `x-cron-secret`, since this endpoint bypasses RLS entirely.
- Shared secret and webhook URL live in Supabase Vault, not in migration source or client-reachable code.

## Next Steps

- Phase 6 covers end-to-end verification of the full create → edit → reminder-fires flow, verifies the Vault URL matches the production domain, and covers final deployment.
