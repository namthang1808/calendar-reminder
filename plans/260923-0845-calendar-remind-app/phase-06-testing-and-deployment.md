---
title: "Phase 6: Testing & Deployment"
status: in-progress
priority: P1
effort: "4h"
dependencies: [3, 4, 5]
---

# Phase 6: Testing & Deployment

## Context Links

- Brainstorm contract: `../reports/brainstorm-260923-1529-calendar-remind.md` (Acceptance criteria)

## Overview

End-to-end verification of the full couple's-calendar flow against the
brainstorm's acceptance criteria, including the correctness and security
regressions the red-team pass surfaced, plus final production deployment
and a real README update for both partners.

<!-- Updated: Red Team Session 2026-09-23 — Findings 1, 5, 6, 7, 9, 12 -->
**Red-team corrections applied:**
- **[Finding 9, High]** Dropped the ambiguous "staging Supabase project"
  option — a second project would need its own Vault secrets, `pg_cron`
  job, and Telegram webhook (a bot has only one webhook, so pointing it at
  staging takes production offline). Test directly against the production
  Supabase project and Vercel deployment, with a schema backup taken first
  per the repo's database rule, since this is a 2-user personal app where
  a second environment adds more risk than it removes.
- **[Finding 1, Critical]** Added a negative test for the disabled-signup
  fix from Phase 2.
- **[Finding 5 / 6 / 7, High]** Added explicit regression tests for the
  Telegram link-code flow, the Asia/Saigon timezone round-trip, and the
  backfilled-past-event guard — each was a red-team finding whose fix
  needs a real test, not just a code change.
- **[Finding 12, Medium]** Added a secret-scan step over full git history,
  since the original `git log -p -- .env*` check would miss a token
  hardcoded into a one-off setup script.

## Requirements

- [ ] Full happy-path walkthrough: log in as each account, create an event with only title+time, see it in the other account's list, search for it, edit its time, confirm the reminder re-arms, delete it.
- [ ] Reminder correctness walkthrough: create an event whose `remind_at` is a few minutes in the future, wait for the next real `pg_cron` cycle (not a manual-only trigger), confirm both partners receive the Telegram message.
- [ ] Edit-resets-reminder regression check: edit a not-yet-fired event's time via the web UI (anon/session client, not admin), confirm `reminder_sent` resets to `false` via the Phase 2 trigger and the reminder still fires at the new time.
- [ ] **Title-only edit does not resend:** edit only the title/description of an already-`reminder_sent = true` event; confirm `reminder_sent` stays `true` and no duplicate message is sent.
- [ ] **Backfilled/past event does not send:** create or edit an event so `start_at` is in the past; confirm the dispatcher's `start_at > now()` guard skips it.
- [ ] **Timezone round-trip check:** create an event at a known local time (e.g. 19:00), confirm the Telegram reminder message and the event-list display both show 19:00 Asia/Saigon, not a UTC-shifted time.
- [ ] **Telegram link-code flow:** generate a code from `/settings`, confirm `/start <code>` links the correct account, confirm a second `/start <code>` attempt (or a code from a different session) does not overwrite an already-linked `chat_id`.
- [ ] **Negative auth tests:** an unauthenticated request is rejected by RLS; a freshly self-signed-up third Supabase Auth account is rejected (proves Phase 2's signup-disable and `EXISTS`-based policy both work); a cron/webhook request with a missing or wrong secret header is rejected (fail-closed).
- [ ] **Send-failure retry check:** simulate a Telegram send failure for one event, confirm `reminder_sent` stays `false` and the row is retried on a later cycle rather than lost.
- [ ] Idempotency spot-check: manually re-invoke the cron route for an already-successfully-sent event, confirm no duplicate message.
- [ ] Mobile viewport check on the event list, create/edit form, search, and `/settings`.
- [ ] Production deployment on the confirmed host (Vercel) with all env vars set: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `CRON_SHARED_SECRET`.
- [ ] `setWebhook` and the Vault `reminder_endpoint_url` both confirmed pointed at the same final production URL (not a preview URL) — the two were only kept in sync by convention in Phase 4/5, so verify explicitly here.
- [x] Grep-based secret scan (no `gitleaks` binary available locally) over tracked-eligible files confirms no live bot token, webhook secret, cron secret, or Supabase key present — only illustrative example tokens in research docs and unrelated AgentKit skill documentation matched. Re-run `gitleaks detect` for full-history coverage once real secrets have actually existed at any point (none have yet — no `.env.local` was ever created in this session).
- [x] `README.md` rewritten with real project description, full external-account setup steps, the "never re-enable public signup" note, and onboarding instructions.

## Architecture

No new architecture in this phase — this is verification and deployment
against Phases 1–5's implementation.

## Related Code Files

- Modify: `README.md`
- Modify: Vercel dashboard env var configuration (not committed to source)
- Modify: `supabase/migrations/` only if verification surfaces a schema fix (should be rare this late)

## Implementation Steps

1. Back up the production Supabase database before this phase's verification pass, per the repo's rule to back up before any schema/data change — this phase may surface a late schema fix.
2. Run the full happy-path walkthrough from both accounts directly against production.
3. Run the reminder-correctness walkthrough, timing against real `pg_cron` firing.
4. Run the edit-resets-reminder, title-only-no-resend, backfilled-past-event, timezone round-trip, and link-code checks.
5. Run the negative auth tests (unauthenticated, third-party signup, missing/wrong secret headers).
6. Run the send-failure retry check and the idempotency spot-check.
7. Check mobile layout on the four core screens.
8. Finalize production env vars in Vercel, confirm the deploy builds and serves correctly, and confirm the browser client receives real (non-`undefined`) config.
9. Verify `setWebhook` and the Vault endpoint URL both point at the same final production domain.
10. Run a full-history secret scan.
11. Rewrite `README.md`.

## Todo

- [ ] Happy-path walkthrough passed for both accounts
- [ ] Reminder fires correctly via the real `pg_cron` schedule (not just a manual route call)
- [ ] Edit-resets-reminder verified
- [ ] Title-only edit does not resend an already-sent reminder
- [ ] Backfilled/past event does not trigger a send
- [ ] Timezone round-trip verified (message and list agree, both in Asia/Saigon)
- [ ] Telegram link-code flow verified, including the no-overwrite case
- [ ] Negative auth tests passed (unauthenticated, third-party signup, missing/wrong cron and webhook secrets)
- [ ] Send-failure retry verified (not permanently lost)
- [ ] Idempotency verified (no duplicate sends on an already-sent event)
- [ ] Mobile layout verified
- [ ] Production env vars set with correct names/prefixes, deploy verified
- [ ] Webhook and Vault URL both confirmed against the same production domain
- [x] Secret scan clean (grep-based; see Requirements note on full-history `gitleaks` follow-up)
- [x] README rewritten with setup + onboarding instructions

## Success Criteria

- Every acceptance criterion in the brainstorm contract (`../reports/brainstorm-260923-1529-calendar-remind.md`) is demonstrably satisfied in the deployed app.
- Every red-team finding applied in Phases 1–5 has a corresponding passing test in this phase, not just a code change.
- Both partners can, from their own phones, create/view/search events and have received at least one real Telegram reminder end-to-end.

## Risk Assessment

- **Risk:** a manual-only verification of Phase 5 could pass while the real `pg_cron` schedule is misconfigured (e.g. wrong URL in Vault) and silently never fires in production.
  **Mitigation:** this phase's Step 3 explicitly requires waiting for a real scheduled firing, not just a manual route invocation, before calling the reminder path verified; Step 9 additionally cross-checks the Vault URL against the live webhook URL.

## Next Steps

- None — this is the final phase. Any post-launch work (secondary email channel, `.ics` export, recurring events) is out of scope per the brainstorm's "Improvement opportunities," not part of this plan.
