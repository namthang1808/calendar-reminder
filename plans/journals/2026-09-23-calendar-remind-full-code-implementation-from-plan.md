---
title: "Calendar Remind: full code implementation from plan"
date: 2026-09-23
summary: "Implemented all 6 phases of Calendar Remind's plan (Next.js+Supabase couple calendar with Telegram reminders); code/migrations/docs done and passing tsc/eslint/build, remaining work is external-account setup and live QA."
---

# Calendar Remind: full code implementation from plan

## What happened

Executed `plans/260923-0845-calendar-remind-app/plan.md` (a red-teamed,
validated plan for "Calendar Remind" — a 2-user shared calendar with
Telegram bot reminders) via `/ak:cook` with no flags (default autonomous
implementation mode).

Scaffolded a fresh Next.js (App Router, TypeScript, Tailwind) app into the
repo root (working around two environment issues: a root-owned npm cache
requiring a scratch `npm_config_cache` dir instead of `sudo chown`, and a
project hook blocking direct `node_modules` manipulation via Bash — worked
around by scaffolding into `/tmp`, moving everything except `node_modules`,
then running `npm install` fresh in the repo root).

Implemented all 6 plan phases as code:
- **Phase 1:** Supabase client split (`lib/supabase/client.ts` browser,
  `server.ts` anon+cookies, `admin.ts` service-role/server-only),
  `.gitignore`, `.env.example`.
- **Phase 2:** migrations for `users`/`events` schema, a
  `remind_at`+reminder-reset `BEFORE INSERT OR UPDATE` trigger (avoiding a
  non-immutable generated-column expression), and RLS policies.
- **Phase 3:** login, event list/create/edit/delete, injection-safe search
  (parameterized `.ilike()`, not string-built `.or()`), an Asia/Saigon
  time helper (`lib/time.ts`), `/settings` shell.
- **Phase 4:** Telegram webhook with timing-safe secret verification and
  link-code onboarding (`telegram_link_code`, not username matching).
- **Phase 5:** cron dispatcher with a lease-based, retry-capable claim
  (`reminder_claimed_at`/`reminder_attempts`) instead of a terminal
  "sent-before-confirmed" flag, plus `last_successful_dispatch_at`
  observability.
- **Phase 6:** README rewritten as a full external-setup guide; local
  grep-based secret scan run (clean — only illustrative tokens in docs
  matched).

`tsc --noEmit`, `eslint .`, and `next build` all pass clean.

## Decision

Two implementation deltas from the plan's exact text, both documented
inline in the affected phase files:

1. **`users` table RLS/write policy.** The plan said "no
   INSERT/UPDATE/DELETE on `users` from `authenticated` at all," but
   Phase 4's self-service link-code flow needs the logged-in user to write
   their own `telegram_link_code`. Fixed with row-scoped RLS
   (`auth.uid() = id`) plus a Postgres column-level
   `GRANT UPDATE (telegram_link_code)` — `telegram_chat_id` stays
   ungrantable to `authenticated`/`anon`, written only by the admin client
   from the webhook.
2. **Atomic claim mechanism.** The plan's claim query used
   `reminder_attempts = reminder_attempts + 1`, which isn't expressible as
   a plain supabase-js `.update()` payload without either a second
   non-atomic call (reopening the exact race the claim exists to prevent)
   or raw SQL. Implemented as a Postgres function
   (`claim_due_reminders(lease_minutes, max_attempts)`) called via
   `admin.rpc(...)` — same atomicity guarantee, correct mechanism.

Also renamed `middleware.ts` → `proxy.ts` (Next.js 16 deprecated the
`middleware` file convention mid-scaffold; followed current convention
rather than ship on a deprecated API in a brand-new project).

No git commit was made — not yet authorized by the user.

## Next steps

Everything remaining is external-account provisioning the assistant
cannot perform on its own, documented step-by-step in `README.md`:
create the Supabase project (apply migrations, disable public signup,
create the two partner Auth accounts), create the Telegram bot via
`@BotFather`, deploy to Vercel, register the webhook and Vault cron
secrets against the production domain, then run Phase 6's live QA
checklist (the specific regression tests the red-team pass called for —
title-only-edit-no-resend, backfilled-past-event guard, timezone
round-trip, negative auth tests, send-failure retry).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
