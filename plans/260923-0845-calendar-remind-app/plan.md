---
title: "Calendar Remind — Couple Shared Calendar App"
description: "Shared web calendar for two users with Telegram bot reminders, built on Next.js + Supabase."
status: in-progress
priority: P1
effort: "21h"
branch: master
tags: [feature, frontend, backend, database, infra]
blockedBy: []
blocks: []
created: 2026-09-23
---

# Calendar Remind — Couple Shared Calendar App

## Overview

A lightweight, two-user web application where either partner — primarily
the wife — creates calendar events in under a minute, both partners see one
searchable shared calendar, and each event triggers a Telegram bot message
reminder before it starts. Built on Next.js (App Router) + Supabase
(Postgres + Auth), deployed on Vercel, with Supabase `pg_cron`/`pg_net`
driving a ~10-minute polling-outbox reminder dispatcher.

Full contract (outcome, constraints, non-goals, acceptance criteria,
trade-offs) is recorded in the brainstorm report this plan implements:
`../reports/brainstorm-260923-1529-calendar-remind.md`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Either partner can create/edit/delete a shared event in under a minute | P1 |
| 2 | Both partners see one searchable, chronologically sorted event list | P1 |
| 3 | A Telegram bot message reminder fires before each event, reliably and without duplicates | P1 |
| 4 | App is deployed, mobile-usable, and low-ops (free-tier hosting, no servers to patch) | P1 |

## Research

Two research passes ran before drafting Phases 4–5, since both introduced
genuine unknowns not resolvable from the (empty) repo:

- `research/researcher-01-scheduling.md` — confirms Vercel Hobby Cron is
  hard-capped at once/day and **cannot** run the ~10-minute reminder poll;
  recommends Supabase `pg_cron` + `pg_net` calling the Next.js API route
  instead, with a documented open risk (free-tier 7-day inactivity pause,
  unconfirmed whether pg_cron activity itself prevents it).
- `research/researcher-02-telegram-bot.md` — confirms webhook (not long
  polling) is required on Vercel serverless, documents `secret_token`
  webhook verification, the `/start` chat_id capture flow, and recommends a
  dependency-free raw-`fetch` implementation (or grammY if any library is
  wanted; Telegraf is not recommended due to over a year of maintenance
  inactivity).

This corrects an assumption carried over from the brainstorm (which named
"Vercel Cron or Supabase pg_cron" as interchangeable options) — they are not
interchangeable at the required 10-minute granularity on free tiers.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Project Scaffold & Supabase Setup](./phase-01-start.md) | In progress — code complete, live deploy pending |
| 2 | [Database Schema & Auth](./phase-02-database-schema-and-auth.md) | In progress — migrations written, not yet applied to a live project |
| 3 | [Event CRUD & Search UI](./phase-03-event-crud-and-search-ui.md) | In progress — code complete, live verification pending |
| 4 | [Telegram Bot Integration](./phase-04-telegram-bot-integration.md) | In progress — code complete, bot/webhook registration pending |
| 5 | [Reminder Cron Dispatcher](./phase-05-reminder-cron-dispatcher.md) | In progress — code complete, Vault/cron scheduling pending |
| 6 | [Testing & Deployment](./phase-06-testing-and-deployment.md) | In progress — README + secret scan done, live QA pending |

**Session summary (2026-09-23 cook session):** all application code, database
migrations, and documentation are written and pass `tsc --noEmit`, `eslint`,
and `next build` locally. What remains is entirely external-account
provisioning (Supabase project, Telegram bot, Vercel deployment) and the
live QA that depends on it — see `README.md` "Setup" for the exact manual
steps and each phase file's Todo section for precise per-item status.

<!-- Updated: Red Team Session 2026-09-23 — Finding 11 -->
Dependency shape (corrected — the original "Phase 3 and 4 run in parallel"
claim was false, per red-team Finding 11: Phase 4 modifies a `/settings`
page that only Phase 3 creates, and both touch `.env.example`): Phase 1
blocks everything. Phase 2 blocks Phases 3 and 5. Phase 3 blocks Phase 4
(Phase 4 extends the `/settings` shell and route protection Phase 3
builds). Phase 5 depends on both Phase 2 (schema) and Phase 4
(`sendTelegramMessage`). Phase 6 depends on Phases 3, 4, and 5 all being
complete.

## Non-Goals (from brainstorm, carried forward)

- No group/friends scheduling beyond the two fixed accounts.
- No two-way sync/import with Google/Outlook calendars.
- No native mobile app, push notifications, SMS, or email channels.
- No recurring-event engine.
- No offline-first behavior or per-user permission roles.

## Success Criteria

- [ ] Either partner creates an event (title + time required) in under a minute.
- [ ] Both partners see the same event list with working title/date-range search.
- [ ] Editing or deleting an event correctly reschedules or cancels its reminder — no stale or duplicate sends.
- [ ] A due reminder reaches both partners' Telegram chats via the real (not manually triggered) `pg_cron` schedule.
- [ ] App is deployed, reachable, and usable from both partners' phones.

## Dependencies

- Supabase project (Postgres + Auth + `pg_cron`/`pg_net` extensions) — free tier.
- Vercel project (Hobby tier) for Next.js hosting.
- A Telegram bot token from `@BotFather` — one-time manual setup, not automatable.

## Red Team Review

### Session — 2026-09-23
**Findings:** 15 (15 accepted, 0 rejected)
**Severity breakdown:** 4 Critical, 5 High, 6 Medium

Four hostile reviewers (Security Adversary, Failure Mode Analyst,
Assumption Destroyer, Scope & Complexity Critic — Full tier, since the
plan has 6 phases) ran in parallel against the drafted plan and the two
research reports. 37 raw findings were collected and deduplicated to 15
distinct issues; several were independently caught by 3–4 reviewers using
different lenses, which is why they're treated as high-confidence rather
than single-source claims. All 15 passed the evidence filter (each cites a
specific phase:line or a verified repo/Postgres/Next.js fact) and were
accepted and applied — see each phase file's "Red-team corrections
applied" note for the specific fix.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Supabase Auth public signup never disabled — RLS policy alone doesn't stop a stranger from self-registering and getting full CRUD | Critical | Accept | Phase 2 |
| 2 | Service-role key ownership contradicted itself across phases; `users` table had RLS enabled with zero policies | Critical | Accept | Phases 1, 2, 3, 4, 5 |
| 3 | Dispatcher marked `reminder_sent = true` before the Telegram send succeeded — a failure permanently lost the reminder | Critical | Accept | Phase 5 |
| 4 | Proposed `remind_at` generated-column expression is not Postgres-immutable and would fail migration | Critical | Accept | Phase 2 |
| 5 | `/start` matching relied on a `users` column that didn't exist; Telegram usernames are mutable/optional | High | Accept | Phases 2, 4 |
| 6 | Timezone conversion was assumed but never implemented — risk of 7-hour-off reminders | High | Accept | Phase 3 |
| 7 | Claim query had no lower time bound — backfilled/past events could trigger spurious sends | High | Accept | Phase 5 |
| 8 | Browser Supabase env vars lacked the `NEXT_PUBLIC_` prefix required to reach the client bundle | High | Accept | Phase 1 |
| 9 | Vault-stored cron URL/secret created by hand, not re-verified against the production domain; keep-alive ping wouldn't have worked anyway | High | Accept | Phases 4, 5, 6 |
| 10 | No observability on cron dispatch failures | Medium | Accept | Phase 5 |
| 11 | "Phase 3 and 4 run in parallel" was false (shared settings page, shared `.env.example` edits) | Medium | Accept | plan.md, Phases 3, 4 |
| 12 | `.gitignore` claimed as "Modify" but doesn't exist in the repo | Medium | Accept | Phase 1 |
| 13 | Search box's `ILIKE`/`.or()` filter needed injection-safe handling | Medium | Accept | Phase 3 |
| 14 | Webhook/cron secret checks needed timing-safe comparison and fail-closed behavior | Medium | Accept | Phases 4, 5 |
| 15 | `create-next-app` scaffolding into the repo root would likely fail given existing `plans/`/`.claude/`/`.agentkit/` | Medium | Accept | Phase 1 |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-database-schema-and-auth.md`, `phase-03-event-crud-and-search-ui.md`, `phase-04-telegram-bot-integration.md`, `phase-05-reminder-cron-dispatcher.md`, `phase-06-testing-and-deployment.md`.
- Decision deltas checked: client split (`server.ts` vs `admin.ts`), `remind_at`/`reminder_sent` ownership moved from app code to a Phase 2 trigger, `/start` matching moved from username to `telegram_link_code`, env var renaming (`NEXT_PUBLIC_*`), dependency shape (Phase 3 → Phase 4, not parallel), dropped staging-project/keep-alive-ping ideas.
- Reconciled stale references: 6 (Phase 3's old "reset reminder_sent in app code" requirement removed; Phase 4's username-matching requirement replaced; Phase 5's boolean-claim query replaced with the lease claim throughout; Phase 6's staging-project step replaced with direct-production testing; plan.md's parallel-phases claim corrected; Phase 1/2's service-role-key wording reconciled with the two-client split).
- Unresolved contradictions: 0.

## Validation Log

### Session 1 — 2026-09-23
**Trigger:** Post-red-team validation pass before marking the plan ready for implementation.
**Questions asked:** 3

#### Questions & Answers

1. **[Risk]** Phase 6 now tests directly against the production Supabase project (staging was dropped in the red-team fix, since a second project would duplicate Vault secrets, the `pg_cron` job, and the Telegram webhook, and a bot only supports one webhook at a time). A schema backup is taken first per the repo's database rule. Is testing directly on production acceptable for this 2-user app?
   - Options: Yes, test on production with backup first | No, set up a separate free Supabase project for testing
   - **Answer:** Yes, test on production with backup first.
   - **Rationale:** Confirms Phase 6 as already written — no separate staging environment, avoiding the Vault/webhook-duplication complexity the red-team flagged as a risk in its own right.

2. **[Scope]** Phase 5's dispatcher tracks `last_successful_dispatch_at` so a broken cron schedule is detectable, but V1 only checks it manually (no automated alert). Should V1 include a self-alert?
   - Options: Manual monitoring only for V1 (Recommended) | Add a simple self-alert
   - **Answer:** Manual monitoring only for V1.
   - **Rationale:** Confirms Phase 5's Risk Assessment as already written; keeps V1 scope to what the brainstorm and plan already committed to, no new alerting logic added.

3. **[Assumptions]** The brainstorm left the default reminder lead time open (60 vs 180 minutes). Phase 2 currently defaults to 60 minutes, editable per event. Keep that default?
   - Options: 60 minutes (Recommended) | 180 minutes (3 hours)
   - **Answer:** 60 minutes.
   - **Rationale:** Resolves the brainstorm's last open item; matches Phase 2's existing schema default, no change needed.

#### Confirmed Decisions
- Test environment for Phase 6: direct production testing with a pre-verification backup — no staging project.
- Cron alerting scope for V1: manual monitoring via `last_successful_dispatch_at`, no automated self-alert.
- Default `remind_offset_minutes`: 60, editable per event.

#### Action Items
- None — all three answers confirmed the plan as already written by the red-team fixes; no phase files require further edits.

#### Impact on Phases
- None — this session closes the plan's remaining open decision points without introducing new changes.

### Verification Results
- **Tier:** Full (6 phases) — satisfied by the red-team session's per-reviewer verification roles (Fact Checker, Flow Tracer, Scope Auditor, Contract Verifier) rather than a separate pass, per the guard in `validate-workflow.md` Step 2.5 ("If `## Red Team Review` already exists with verification evidence, skip to Step 3").
- No `[UNVERIFIED]` tags remain in any phase file.

### Whole-Plan Consistency Sweep
- Files reread: `plan.md` and all six `phase-*.md` files.
- Decision deltas checked: the three validation answers above (all confirm existing plan content; none change it).
- Reconciled stale references: 0 (no plan content changed as a result of this session).
- Unresolved contradictions: 0.

**Recommendation:** Proceed to implementation.

<!-- slug: calendar-remind-app -->