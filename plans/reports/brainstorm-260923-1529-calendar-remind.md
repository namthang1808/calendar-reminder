# Brainstorm: Calendar Remind (couple shared schedule app)

Date: 2026-09-23
Participants: thangvynam1808@gmail.com (primary dev), wife (primary event creator)

## Outcome

A lightweight, two-user web application where either partner — primarily the
wife — can quickly create/edit calendar events (title, date/time, optional
location and notes), both partners can view and search the full shared
calendar, and the app proactively sends a Telegram (or Zalo, fallback) bot
message before each event so the reminder reaches a channel they already
check, without either partner having to remember to look.

## Constraints

- Exactly two users, fixed accounts. No public signup, no multi-tenant model.
- "Lightweight" is a hard constraint on ongoing ops/cost, not just initial
  build effort — favor managed/serverless over anything self-hosted.
- Web app is the primary CRUD/viewing surface. No native mobile app.
- Reminder delivery is a bot message (Telegram for V1; Zalo OA as fallback
  if Telegram is rejected in practice), not push notifications, SMS, or
  email.
- Must support search/filter over events (explicit in the problem
  statement: "view, search").
- Single timezone: Asia/Saigon. No timezone picker needed.
- Event creation must be low-friction — the real-world trigger is an
  off-hand mention mid-chat, so data entry has to be fast (title + date/time
  as the only required fields).

## Non-goals (V1)

- Group/friends scheduling beyond the two users.
- Two-way sync or import from Google/Outlook calendars.
- Native mobile app or PWA push notifications.
- SMS/email/push as reminder channels.
- Recurring-event engine (the motivating example — "dinner with friends next
  week" — is a one-off event; add repeat rules later only if a real need
  shows up).
- Offline-first behavior or conflict resolution — single shared database,
  always-online usage is assumed.
- Per-user permissions/roles — both partners have equal full CRUD rights on
  every event, matching "either of us" in the problem statement.

## Acceptance criteria

- Either partner can log in and create an event (title + date/time, optional
  location/notes) in well under a minute.
- Both partners see one shared, chronologically sorted event list with
  search/filter by title and date range.
- A per-event reminder offset (sane default, editable) triggers a Telegram
  bot message to both partners' registered chat IDs at the correct
  Asia/Saigon local time.
- Editing an event's time or reminder offset, or deleting the event,
  correctly reschedules or cancels the pending reminder — no stale or
  duplicate sends.
- The app is reachable and usable from both partners' phones via a
  mobile-responsive web view, with no manual maintenance required beyond
  free-tier limits that don't matter at 2-user scale.

## Better approaches

None — recommended direction is the requested one. Sharing a Google/Apple
Calendar was explicitly considered and rejected (doesn't fit the
"she books → he gets nudged" workflow and mixes in unrelated personal/work
events), so a purpose-built shared calendar is the right scope, not a
build-vs-buy detour.

## Trade-offs

### 1. Stack and hosting

| Approach | Depends on | Fails first when |
|---|---|---|
| **Supabase (Postgres + Auth) + Next.js on Vercel + scheduled function** (recommended) | Free-tier managed Postgres is enough for 2 users' worth of events indefinitely; SQL is the natural fit for date-range search | You need full self-hosting / no vendor at all |
| Firebase (Firestore + Auth) + Cloud Functions + Cloud Scheduler | Firestore's document model is acceptable for the query patterns you need | Date-range + text search gets awkward — Firestore needs composite indexes and doesn't do `ILIKE`-style search well, which fights the explicit "search" requirement |
| Self-hosted Node/Express + Postgres on a VPS + node-cron | You're willing to own uptime, TLS, backups, and patching | Almost immediately — this contradicts the "lightweight, low ops" constraint for a 2-user app |

**Recommendation:** Supabase (Postgres) for data + auth, Next.js on Vercel
for the web app, and a scheduled serverless function (Vercel Cron or
Supabase's `pg_cron`/Edge Functions) as the reminder dispatcher. This is the
smallest stack that still gives you real SQL for search/filter, managed auth
you don't have to build, and zero servers to patch.

### 2. Bot platform: Telegram vs Zalo

| Approach | Depends on | Fails first when |
|---|---|---|
| **Telegram Bot API** (recommended) | Both of you are willing to have Telegram installed (or already do) | Neither of you wants another chat app just for this |
| Zalo Official Account API | Zalo is already your daily driver in Vietnam, so the message lands somewhere you already look | OA registration/verification and template-message rules outside the conversation window add real setup friction for a personal, non-business use case |

**Recommendation:** Telegram for V1 — free, self-serve setup via
`@BotFather` in minutes, mature Node SDKs (`telegraf`/`node-telegram-bot-api`),
and a message from a bot you `/start`ed once reads exactly like a normal
push notification in daily use. Keep Zalo OA as the documented fallback if
Telegram friction turns out to be higher than expected in practice.

### 3. Reminder scheduling mechanism

| Approach | Depends on | Fails first when |
|---|---|---|
| **Polling cron + `reminder_sent` flag** (recommended) | ~10-minute granularity is acceptable — nobody needs a couple's dinner reminder accurate to the second | Sub-minute precision reminders become a real requirement (not stated here) |
| Per-event scheduled job (e.g. Upstash QStash delayed delivery) | You want exact-time firing without polling overhead | The extra scheduling infra and per-event job lifecycle management isn't justified at this scale |

**Recommendation:** A cron job every ~10 minutes queries
`events WHERE remind_at BETWEEN now() AND now() + interval AND reminder_sent = false`,
sends the Telegram message, then flags the row. This is the standard
polling-outbox pattern for reminder systems: it decouples "event was
created/edited" from "notification was sent," so it's crash-safe and
trivially idempotent, and it avoids owning a scheduler service.

## Proposed architecture (for the next planning pass)

**Pattern:** CRUD web app + polling-outbox notification dispatcher, cleanly
separated. Event writes never call Telegram synchronously — a request that
creates an event should never be able to fail or duplicate-send because of a
downstream bot API hiccup. The dispatcher is a separate scheduled job that
only reads "what needs sending now," which is the standard way to keep a
side-effecting integration out of the request path.

**Data model (V1, single shared calendar — no per-user ownership on reads):**

- `users` — 2 fixed rows: `id`, `name`, `telegram_chat_id`, `created_at`.
- `events` — `id`, `title`, `description` (nullable), `location` (nullable),
  `start_at timestamptz`, `end_at timestamptz` (nullable),
  `created_by → users.id`, `remind_offset_minutes` (default e.g. 60),
  `remind_at` (generated/derived from `start_at - remind_offset_minutes`,
  or computed at write time), `reminder_sent boolean default false`,
  `created_at`, `updated_at`.

Single `remind_offset_minutes` per event, not a separate reminder-rules
table — one reminder per event is all the acceptance criteria call for;
adding multi-reminder support now would be scope the request didn't ask for.

**Auth:** Supabase Auth (email/password or magic link) restricted to the two
pre-created accounts — no signup route exposed in the app. Both accounts get
equal read/write access to all events; this is a deliberate deviation from
typical per-owner Row Level Security, since the whole point is a *shared*
calendar, not row-level isolation.

**Search:** simple `ILIKE` on `title`/`description` plus a `start_at` range
filter is sufficient at this scale — no need for a full-text-search engine.

## Edge cases and considerations for planning

- **Bot chat-id onboarding:** each partner must `/start` the Telegram bot
  once so the app can capture their `chat_id` and store it against their
  user row — a one-time manual step, needs a simple settings/onboarding UI.
- **Reminder re-fires on edit:** changing `start_at` or
  `remind_offset_minutes` on an event must reset `reminder_sent = false`,
  otherwise an edited event silently loses its reminder.
- **Late-created events:** if an event is created with its reminder window
  already in the past (e.g. added 10 minutes before start), the dispatcher
  should still send immediately on the next poll rather than skip it.
- **Cron overlap/idempotency:** guard against double sends if a poll run
  overlaps the next one (e.g. `UPDATE ... SET reminder_sent = true WHERE
  reminder_sent = false RETURNING ...` as an atomic claim, not a separate
  read-then-write).
- **Timezone:** all `timestamptz` handling should assume Asia/Saigon input
  in the UI and store UTC underneath — don't build a timezone selector.

## Improvement opportunities (later, not V1)

- Optional secondary email channel once Telegram is validated in real use.
- Read-only `.ics` feed export so either partner can subscribe from their
  native phone calendar app without building two-way sync.
- Recurring events, if a real recurring commitment shows up in practice.

## Handoff

Next step: `ak-plan` to turn this contract into an implementation plan
(schema migration, Next.js app scaffold, Telegram bot setup, cron
dispatcher), then `/ak:cook` to execute.

## Unresolved questions

- None material to starting the plan. Open item to confirm during planning:
  the exact default `remind_offset_minutes` value (e.g. 60 vs 180 minutes)
  — a small default, easy to change later, not worth blocking on now.
