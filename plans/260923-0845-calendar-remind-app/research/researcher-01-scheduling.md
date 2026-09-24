# Research: Scheduled Trigger for Polling-Outbox Reminder Job

Scope: how to trigger the `UPDATE events ... RETURNING *` polling job every ~10
minutes for a 2-user Next.js + Supabase app on free/cheap tiers. Telegram bot
integration is explicitly out of scope (covered by a separate researcher).

## 1. Vercel Cron — Hobby vs Pro minimum frequency

Confirmed current as of Vercel's own docs, last updated 2026-07-15 and
2026-08-11 respectively:

| Plan | Cron jobs/project | Minimum interval | Timing precision |
|---|---|---|---|
| Hobby | 100 | **Once per day** | Per-hour window (±59 min) |
| Pro | 100 | Once per minute | Per-minute |
| Enterprise | 100 | Once per minute | Per-minute |

Source: [Usage & Pricing for Cron Jobs](https://vercel.com/docs/cron-jobs/usage-and-pricing) (Vercel docs, last_updated 2026-07-15).

The historical Hobby restriction is **still true today**: a `vercel.json` cron
expression that would fire more than once per day (e.g. `*/10 * * * *`, `0 * * * *`)
**fails at deploy time** with the error "Hobby accounts are limited to daily
cron jobs." On Hobby, even a once-daily job isn't precise — `0 1 * * *` can
fire anywhere in the 1:00–1:59 am window. On Pro and above, invocation happens
within the specified minute. Source: [Managing Cron Jobs – "Cron jobs accuracy"](https://vercel.com/docs/cron-jobs/manage-cron-jobs#cron-jobs-accuracy) (Vercel docs, last_updated 2026-08-11).

Also relevant for reliability regardless of plan: Vercel cron delivery is
**best-effort, not guaranteed** — occasional missed invocations and occasional
duplicate invocations both happen, so any cron-triggered job (Vercel or
otherwise) must be idempotent and lock-protected. Source: same page, section
"Cron job delivery and idempotency" (Vercel docs, 2026-08-11). This is a good
fit for the `WHERE reminder_sent = false` pattern already planned, since a
duplicate run finds nothing left to update.

**Conclusion for this project**: Vercel Hobby cron cannot do ~10-minute
polling — it is capped at once/day. Pro plan supports 1-minute granularity but
is a paid tier ($20/mo/seat as of Vercel's public pricing), which is
disproportionate for a 2-user hobby app if a free alternative exists.

## 2. Alternatives evaluated

### (a) Supabase `pg_cron` + `pg_net` calling an Edge Function/webhook directly from Postgres

`pg_cron` is a Postgres extension enabled by default on every Supabase
project (all tiers, since it ships with the Postgres build Supabase runs), and
`pg_net` is a Supabase-maintained extension for async HTTP from SQL that must
be enabled once via Dashboard → Database → Extensions or `create extension
pg_net;`. Source: [Supabase Cron docs](https://supabase.com/docs/guides/cron)
and [pg_net extension docs](https://supabase.com/docs/guides/database/extensions/pg_net)
(Supabase docs, fetched 2026-09-23; a 2026 roundup at
[crontap.com/guides/supabase-cron-jobs](https://crontap.com/guides/supabase-cron-jobs) corroborates: "pg_cron inside the database, enabled by default on every Supabase project").

Supabase's own "Supabase Cron" dashboard UI is a wrapper around the same
`pg_cron`/`pg_net` primitives, letting you pick SQL snippet, DB function, HTTP
request, or Edge Function invocation as the job type without hand-writing the
extension SQL. Source: [Supabase Cron docs](https://supabase.com/docs/guides/cron).

`pg_cron` accepts standard 5-field cron syntax with a **1-minute minimum
interval** (Supabase's own hosted "Cron" product additionally allows
second-level jobs down to 1–59 seconds, but that's the dashboard wrapper, not
raw `pg_cron`). Source: same docs page, corroborated by
[dev.to pg_cron guide](https://dev.to/kanta13jp1/supabase-pgcron-complete-guide-automate-scheduled-jobs-in-postgresql-5dih).
Recommended job budget: no more than 8 concurrent jobs, each under 10 minutes
runtime — trivially satisfied here.

Important caveat specific to this project: **Supabase free-tier projects
auto-pause after 7 consecutive days with no database activity** (no API
requests, queries, or Edge Function calls), and pg_cron jobs stop firing while
paused. Source: [Project Pausing docs](https://supabase.com/docs/guides/platform/free-project-pausing)
(Supabase docs) plus corroborating 2026 write-ups noting the 7-day window is
still current as of September 2026 (e.g. [adhdecode.com Supabase pause/resume overview](https://adhdecode.com/articles/supabase/supabase-project-pause-resume/)).
The docs do not explicitly confirm whether pg_cron's own scheduled queries
count as qualifying "activity" — this is unresolved (see open questions). In
practice, a 2-user couple app is very likely to generate at least one real
user login/request per week regardless, which independently avoids the pause;
treat pg_cron activity as a bonus, not a guarantee.

### (b) Supabase Edge Functions + Supabase's own scheduling

This is really the same mechanism as (a) — Supabase's "Schedule Function"
feature (`supabase functions deploy` + the Cron dashboard, or a raw
`cron.schedule(...)` calling `net.http_post` against the function's
`/functions/v1/<name>` URL) is `pg_cron` + `pg_net` under the hood. Source:
[Scheduling Edge Functions docs](https://supabase.com/docs/guides/functions/schedule-functions)
(Supabase docs). There's no separate "Edge Function-only" scheduler distinct
from pg_cron on this platform, so (a) and (b) collapse into one option for
decision purposes. The only design choice within this option is whether the
`pg_net` HTTP call target is a Supabase Edge Function (Deno runtime, colocated
with the DB, lower latency to Postgres) or an external Next.js API route on
Vercel (keeps all app logic in one codebase). Given this project is already a
Next.js app, routing the pg_net call straight at a Next.js API route avoids
maintaining a second runtime (Deno Edge Functions) just for this one job —
unless there's a reason to keep the DB update logic entirely inside Postgres
(see recommendation).

### (c) Free external cron-trigger service or GitHub Actions hitting a Next.js API route

**cron-job.org**: unlimited free jobs down to a 1-minute minimum interval,
running for over 15 years, with response capture, a REST API, and run-now
testing. Trade-offs: no SLA, no guaranteed uptime, only the last 50 executions
and 2 days of response history are retained, no automatic retry on failure,
and a 30-second request timeout. Source: [cron-job.org FAQ](https://cron-job.org/en/faq/)
and a September-2026-dated comparison at [dev.to/ronency Best External Cron Job Services Compared (2026)](https://dev.to/ronency/best-external-cron-job-services-compared-2026-8a3),
corroborated by [runhooks.app's cron-job.org reliability write-up](https://runhooks.app/blog/preventing-supabase-free-tier-pausing/) noting occasional peak-hour delay.

**GitHub Actions `schedule:`**: enforces a **5-minute minimum interval**
(`* * * * *` is accepted as valid syntax but silently never fires faster than
5 min); documented and observed delays of 5–30 minutes are common, worse
(50–60 min) under load, and GitHub explicitly states scheduled runs can be
**dropped entirely** with no error under high load. Source: multiple 2025/2026
GitHub Community discussions — [#156282 "Unexpected delay in scheduled GitHub Actions workflows"](https://github.com/orgs/community/discussions/156282),
[#147369 "cron schedule is not running at the specified time"](https://github.com/orgs/community/discussions/147369) — and a dated guide
[oneuptime.com "How to Use Scheduled Workflows (Cron) in GitHub Actions" (2025-12-20)](https://oneuptime.com/blog/post/2025-12-20-scheduled-workflows-cron-github-actions/view).
GitHub Actions is free for public repos and has a generous free minute budget
for private repos, so cost isn't the concern here — reliability at 10-minute
granularity is the concern, since a 20–30 minute delay on a "remind me in 10
minutes" feature is user-visible and defeats the purpose.

Both options in (c) are viable purely as a **secondary/fallback trigger**
(e.g., to catch a missed pg_cron run or provide redundancy), not as the sole
mechanism, given their lack of SLA and GitHub's documented drop-under-load
behavior.

## 3. Concrete schedule config at ~10-minute granularity

**pg_cron + pg_net calling an HTTP endpoint (recommended shape):**

```sql
select cron.schedule(
  'send-due-reminders',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_endpoint_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

Source syntax pattern: [Supabase Cron docs](https://supabase.com/docs/guides/cron)
and [Scheduling Edge Functions docs](https://supabase.com/docs/guides/functions/schedule-functions)
(both Supabase docs, current 2026). Secrets are pulled from Supabase Vault
rather than hardcoded in the SQL job body, per the same docs' recommendation.

**Vercel `vercel.json` (Pro-only, for reference — not usable on Hobby):**

```json
{
  "crons": [
    { "path": "/api/cron/send-reminders", "schedule": "*/10 * * * *" }
  ]
}
```

**GitHub Actions fallback (5-min floor, use `*/10` for alignment):**

```yaml
on:
  schedule:
    - cron: '*/10 * * * *'
```

## 4. Authentication for each trigger

- **Vercel Cron**: set a `CRON_SECRET` env var (≥16 random chars); Vercel
  automatically sends it as `Authorization: Bearer <CRON_SECRET>` on every
  invocation. The route handler compares the header to the env var and
  returns 401 on mismatch. Source: [Managing Cron Jobs – "Securing cron jobs"](https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs)
  (Vercel docs, 2026-08-11), which includes a copy-pasteable Next.js Route
  Handler example. Vercel also sends `x-vercel-cron-schedule` identifying
  which cron fired, useful only if multiple schedules share one path.

- **pg_net calling a Next.js API route or Edge Function**: pg_net does not
  add any implicit auth — you must set your own headers in the `net.http_post`
  call (as in the SQL above), e.g. a shared secret header (`x-cron-secret`)
  checked against an env var on the receiving route, exactly analogous to
  Vercel's `CRON_SECRET` pattern. If the target is a Supabase Edge Function
  with JWT verification enabled, current guidance (2026) is to send the
  **secret/anon key on the `apikey` header**, not `Authorization: Bearer`,
  because new-format Supabase secret keys are not JWTs and are rejected by
  Authorization-header verification; alternatively disable `verify_jwt` and
  validate the shared secret yourself in the function body. Source:
  [Securing Edge Functions docs](https://supabase.com/docs/guides/functions/auth)
  and GitHub discussion [supabase/cli#4287 "Recommended Pattern for pg_cron to Edge Function Authentication"](https://github.com/supabase/cli/issues/4287)
  (2026). Store the shared secret in Supabase Vault, not inline in the cron
  job SQL, per the Supabase Cron docs.

- **cron-job.org / GitHub Actions hitting a Next.js API route**: same
  shared-secret pattern — configure a custom header (cron-job.org supports
  custom headers per job) or a `secrets.CRON_SECRET` GitHub Actions repo
  secret sent as a header via `curl`, checked server-side identically to the
  Vercel pattern.

## 5. Recommendation

Use **Supabase `pg_cron` + `pg_net`, firing every 10 minutes directly at
Vercel Hobby's Next.js API route** (not a Supabase Edge Function), protected
by a shared-secret header. This is free on both platforms (Vercel Hobby +
Supabase Free), meets the 10-minute requirement exactly (pg_cron's 1-minute
floor comfortably covers it, unlike Vercel Hobby's 1-day floor), and keeps all
application logic — the reminder-selection query, Telegram send, and any
future notification logic — in the single Next.js codebase instead of
splitting it across a second Deno Edge Function runtime. The trade-off is one
new dependency (pg_net extension + Vault-stored secret) and the unresolved
question of whether pg_cron activity alone prevents the 7-day free-tier
pause — mitigated in practice because a 2-user personal app will almost
certainly see at least one real login/request per week, and can be belt-and-
braced with a free cron-job.org ping (1-min minimum interval, no cost) or
GitHub Actions workflow as a redundant/keep-alive trigger if that turns out to
matter. Do not rely on Vercel Cron on Hobby for this job — it is hard-capped
at once per day and cannot satisfy the ~10-minute requirement at all; only
upgrading to Vercel Pro ($20/mo) would unlock 1-minute Vercel cron, which is
unjustified cost for a 2-user app when the free pg_cron path works.

## Open questions

- Supabase's docs do not explicitly state whether a pg_cron job's own
  `net.http_post` calls count as "activity" that resets the 7-day free-tier
  inactivity-pause timer. Recommend either testing empirically after launch
  or adding a trivial redundant keep-alive ping (see recommendation) rather
  than assuming.
- Not investigated: Vercel Hobby function execution limits/cold-start
  behavior when invoked by an external pg_net POST (should behave like any
  other Hobby serverless function invocation, but wasn't separately verified
  in this pass since it's a general Vercel Functions concern, not a
  scheduling-specific one).
