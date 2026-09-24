---
title: "Phase 2: Database Schema & Auth"
status: in-progress
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Database Schema & Auth

## Context Links

- Brainstorm contract: `../reports/brainstorm-260923-1529-calendar-remind.md` (Data model, Auth sections)

## Overview

Create the `users` and `events` tables, the Row Level Security (RLS)
policies that implement a *shared* calendar (not per-owner isolation), and
the two fixed Supabase Auth accounts for the couple.

## Key Insights

- This is a deliberate deviation from typical per-owner RLS: both accounts
  need full read/write on every event, since the whole point is a shared
  calendar. Document this explicitly in the migration comments so a future
  reader doesn't "fix" it into per-owner isolation.
- Single `remind_offset_minutes` per event, not a separate reminder-rules
  table — nothing in the acceptance criteria calls for multiple reminders
  per event. Default: 60 minutes, editable per event.

<!-- Updated: Red Team Session 2026-09-23 — Findings 1, 2, 4, 5 -->
**Red-team corrections applied:**
- **[Finding 1, Critical]** "No signup page in the app" is not the same as
  "signups are disabled." Supabase's `/auth/v1/signup` endpoint is public
  and callable with the anon key (which ships in the browser bundle) even
  with no UI for it. Without disabling signups server-side, a stranger can
  self-register and — since the RLS policy only checked
  `auth.uid() IS NOT NULL` — get full CRUD on the couple's events. Signups
  must be disabled in Supabase Auth settings, and the policy must check
  actual membership in `users`, not just "is authenticated."
- **[Finding 2, Critical]** The service-role key's scope contradicted
  itself across phases (Phase 1 gave it to "trusted server actions," this
  phase said "cron only," Phase 4's webhook needed privileged writes with
  nothing granted). Resolved by splitting into two client helpers (see
  Phase 1) and adding an explicit `users` RLS policy below — until now
  `users` had RLS enabled with zero policies, which silently denied every
  query against it, including the `events` policy's own membership lookup.
- **[Finding 4, Critical]** The generated-column expression
  `start_at - (remind_offset_minutes || ' minutes')::interval` is not
  Postgres-immutable (`timestamptz - interval` depends on the session
  `TimeZone` setting; `int || text` concatenation isn't immutable either)
  — that migration would fail. Resolved by moving both `remind_at`
  derivation and the reminder-reset-on-edit logic into a single
  `BEFORE INSERT OR UPDATE` trigger, which has no immutability
  restriction. This also removes the "how does an edit reset
  `reminder_sent`" gap Phase 3 previously left as hand-written app logic.
- **[Finding 5, High]** Phase 4's `/start` matching needed a column this
  schema didn't have. Added `telegram_link_code` (unique, nullable) —
  simpler and more robust than a Telegram username, which is optional and
  mutable. Also fixed `telegram_chat_id`'s type (`bigint`, not the default
  `integer` — Telegram chat IDs can exceed 32 bits).

## Requirements

- [x] `users` table: `id uuid references auth.users(id)`, `name text`, `telegram_chat_id bigint` (nullable until onboarded), `telegram_link_code text unique` (nullable, cleared once linked), `created_at`. — `init_schema.sql`
- [x] `events` table: `id`, `title`, `description` (nullable), `location` (nullable), `start_at timestamptz`, `end_at timestamptz` (nullable), `created_by → users.id`, `remind_offset_minutes int default 60` (`CHECK (remind_offset_minutes >= 0)`), `remind_at timestamptz` (trigger-maintained, see below), `reminder_sent boolean default false`, `reminder_claimed_at timestamptz` (nullable, Phase 5 lease), `reminder_attempts int default 0`, `created_at`, `updated_at`. — `init_schema.sql`
- [x] `remind_at` and reminder-reset are both owned by a single `BEFORE INSERT OR UPDATE` trigger on `events` (see Implementation Steps) — no application code computes or resets either field. — `remind_at_trigger.sql`
- [x] RLS enabled on **both** `users` and `events` — `rls_policies.sql`:
  - `events`: any authenticated user who has a matching `users` row may `SELECT`/`INSERT`/`UPDATE`/`DELETE` — not scoped to `created_by`.
  - `users`: authenticated members may `SELECT` all rows (needed for onboarding-status UI).
  <!-- Updated: Implementation session 2026-09-23 -- design delta from the original plan text -->
  **Delta from the original plan:** "no INSERT/UPDATE/DELETE from authenticated at all" turned out to be too strict — Phase 4's `/settings` self-service link-code flow (`app/actions/telegram-link.ts`) needs the logged-in user to write their *own* `telegram_link_code`. Fixed with `USING (auth.uid() = id)` row scoping plus a column-level `GRANT UPDATE (telegram_link_code) ON users TO authenticated` (all other columns, including `telegram_chat_id`, stay ungrantable to `authenticated`/`anon` — only the service-role admin client can write `telegram_chat_id`, from the Phase 4 webhook). Column-level GRANT is the correct Postgres primitive here since RLS alone can restrict rows but not columns.
- [ ] **Supabase Auth signup disabled** in project settings — code/migration side has nothing further to do here; this is a dashboard setting only you can flip once the Supabase project exists (see README Setup step 1.3).
- [ ] Two Supabase Auth accounts created for the two partners — blocked on the Supabase project existing (see README Setup step 1.5).
- [x] `updated_at` auto-updates via trigger on row update. — `init_schema.sql`

## Architecture

- Postgres schema, managed via Supabase SQL migrations (`supabase/migrations/`).
- `events` RLS policy shape: `USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid()))`, with a matching `WITH CHECK` on `INSERT`/`UPDATE` — this is what "is one of the two known user rows" actually means as a predicate, not `auth.uid() IS NOT NULL` alone.
- `remind_at` + reminder-reset trigger: `BEFORE INSERT OR UPDATE ON events FOR EACH ROW EXECUTE FUNCTION set_remind_at_and_reset_reminder()`, where the function does `NEW.remind_at := NEW.start_at - make_interval(mins => NEW.remind_offset_minutes);` and, on `UPDATE`, resets `NEW.reminder_sent := false` and `NEW.reminder_claimed_at := null` and `NEW.reminder_attempts := 0` only when `NEW.start_at IS DISTINCT FROM OLD.start_at OR NEW.remind_offset_minutes IS DISTINCT FROM OLD.remind_offset_minutes`. `make_interval` is immutable, unlike the earlier generated-column expression.

## Related Code Files

- Create: `supabase/migrations/<timestamp>_init_schema.sql`
- Create: `supabase/migrations/<timestamp>_rls_policies.sql`
- Create: `supabase/migrations/<timestamp>_remind_at_trigger.sql`
- Create: `lib/db/types.ts` (generated Supabase types or hand-written mirror)
- Modify: `lib/supabase/admin.ts` (service-role client from Phase 1, if a typed client needs the generated types — **not** `lib/supabase/server.ts`, which is the anon/cookie client; see Phase 1's client split)

## Implementation Steps

1. From this point forward every schema change in this project must follow a migration file, never a manual dashboard edit, so history stays reproducible. Once the project holds real data, back up before any further schema/data change per repo rule.
2. Write the `init_schema.sql` migration creating `users` and `events` with the columns above, plus indexes on `events(start_at)` and `events(reminder_sent, remind_at)` for the Phase 5 polling query.
3. Write the `remind_at_trigger.sql` migration: the `set_remind_at_and_reset_reminder()` function and its `BEFORE INSERT OR UPDATE` trigger, per the Architecture section.
4. Write the `rls_policies.sql` migration: enable RLS on both tables, add the `events` shared-access policy with the concrete `EXISTS`-based predicate above, add the `users` SELECT-only policy, add the narrow self-service `telegram_link_code` UPDATE path (row-scoped RLS + column-level GRANT, see the delta note above), and explicitly do **not** grant broader write access on `users` to `authenticated`/`anon`. Add an inline comment explaining why `events` access is shared, not per-owner.
5. In the Supabase dashboard, disable public signups (Authentication settings) — do this before creating the two real accounts, and note it in the README so it isn't silently re-enabled during dashboard exploration later.
6. Create the two Auth accounts (`supabase.auth.admin.createUser`, which requires the service-role key and is therefore not affected by the signup-disable setting), and insert matching rows in `users` linked by the Auth user id.
7. Add an `updated_at` trigger function and attach it to `events`.
8. Generate/hand-write TypeScript types for the schema and export from `lib/db/types.ts`.

## Todo

- [ ] Public signup disabled in Supabase Auth settings — verified by attempting a signup and confirming rejection
- [ ] `users` and `events` tables migrated with the full corrected column set (including `remind_at`, `telegram_link_code`, `reminder_claimed_at`, `reminder_attempts`)
- [ ] `remind_at`/reminder-reset trigger created and migration applies cleanly (confirms the immutability fix actually works)
- [ ] Indexes on `start_at` and `(reminder_sent, remind_at)` created
- [ ] `events` RLS policy uses the concrete `EXISTS`-based predicate, not `auth.uid() IS NOT NULL`
- [ ] `users` RLS policy: SELECT-only for members, no client-side writes
- [ ] Two Auth accounts created and linked to `users` rows
- [ ] `updated_at` trigger verified on a manual update

## Success Criteria

- A query as User A can read/write an event created by User B (proves shared, non-isolated RLS).
- A query as an unauthenticated client is rejected by RLS.
- A query as a **freshly self-signed-up third account** is rejected — either because signup itself fails (disabled), or, if a stale session somehow authenticates, because the `EXISTS` policy predicate finds no matching `users` row.
- Updating an event's `start_at` via the anon client (not a Server Action) correctly recomputes `remind_at` and resets `reminder_sent` — proves the trigger, not app code, owns this invariant.
- `supabase db push` (or equivalent migration apply command) runs clean from an empty database, including the trigger migration.

## Risk Assessment

- **Risk:** Default Supabase RLS examples online assume per-owner isolation; copying one verbatim would silently break the shared-calendar requirement.
  **Mitigation:** Explicit policy review against the "either partner has full CRUD" acceptance criterion before merging.
- **Risk:** Someone re-enables public signups later while exploring the Supabase dashboard for an unrelated reason, silently reopening Finding 1's hole.
  **Mitigation:** Documented in README as a "never re-enable" setting; Phase 6 adds a regression test for it.
- **Load-bearing assumption:** both partners are comfortable being named, fixed Auth accounts (no self-service password reset flow beyond Supabase's built-in one). If that assumption breaks (e.g. one partner wants a different login method), the auth phase needs rework — cheap to change now, more so once dependent phases reference these accounts.

## Security Considerations

- RLS must still require authentication AND known-user membership — "shared"
  means shared between the two known accounts, not "any authenticated
  Supabase user," which is why both the signup-disable step and the
  `EXISTS`-based policy predicate are required together; either alone is
  an incomplete fix.
- Service-role key (bypasses RLS) is used only by `lib/supabase/admin.ts`,
  imported only by the Phase 4 webhook route and the Phase 5 cron
  dispatcher route — never by Server Actions or any browser-reachable code.

## Next Steps

- Phase 3 (CRUD UI) and Phase 5 (cron dispatcher) both read/write against
  this schema and cannot start until it's migrated. Phase 4's webhook
  depends on the `telegram_link_code` column added here.
