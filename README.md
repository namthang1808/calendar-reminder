# Calendar Remind

A shared calendar for two people. Either partner can create an event in
under a minute; both see one searchable list; a Telegram bot message
reminds you both before each event starts.

Stack: Next.js (App Router) on Vercel, Supabase (Postgres + Auth) for data
and auth, a Telegram bot webhook for onboarding, and Supabase
`pg_cron`/`pg_net` (not Vercel Cron — see
`plans/260923-0845-calendar-remind-app/research/researcher-01-scheduling.md`
for why) to dispatch reminders every ~10 minutes.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in real values, see "Setup" below
npm run dev
```

`.env.local` is gitignored. Never commit real secrets — only
`.env.example` (placeholders) is tracked.

## Setup (one-time, requires your own accounts)

These steps need accounts and credentials this repo's assistant cannot
create on its own — Supabase, Telegram, and Vercel access are yours to
provision.

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com) (free tier is
   sufficient for 2 users).
2. In **Project Settings → API**, copy the Project URL and the `anon`
   public key into `.env.local` as `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Copy the `service_role` secret key as
   `SUPABASE_SERVICE_ROLE_KEY` — **never** prefix this one with
   `NEXT_PUBLIC_`.
3. **Disable public signups** (Authentication → Sign In / Providers →
   turn off "Allow new users to sign up", or set `enable_signup = false`
   under `[auth]` in `supabase/config.toml` if you manage config via the
   CLI). This is a hard requirement, not optional — the shared-calendar RLS
   policy assumes only the two accounts you create below can ever exist.
   **Do not re-enable this later**, even temporarily, while exploring the
   dashboard.
4. Apply the migrations in `supabase/migrations/` in order (via the
   Supabase CLI `supabase db push` once you've `supabase link`ed the
   project, or by running each file's SQL in the SQL Editor in filename
   order). The last migration (`schedule_reminder_dispatch.sql`) is a
   no-op until step 5 below creates its Vault secrets — that's intentional,
   re-run it (or its SQL) afterward.
5. Create the two partner accounts:
   ```sql
   -- run once per partner, via the Supabase SQL editor or
   -- supabase.auth.admin.createUser from a trusted script
   ```
   Use `supabase.auth.admin.createUser({ email, password })` (requires the
   service-role key) for each partner, then insert a matching row:
   ```sql
   insert into public.users (id, name) values ('<auth-user-id>', 'Partner name');
   ```
6. Enable the `pg_net` extension if the migration didn't already
   (Database → Extensions → `pg_net`).

### 2. Telegram bot

1. Message [`@BotFather`](https://t.me/BotFather) on Telegram, send
   `/newbot`, follow the prompts. Copy the token into `.env.local` as
   `TELEGRAM_BOT_TOKEN`.
2. Generate a random string (e.g. `openssl rand -hex 32`) for
   `TELEGRAM_WEBHOOK_SECRET` in `.env.local`.
3. Set `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` to your bot's `@username`
   (without the `@`) — this is public by nature and safe to expose.
4. After deploying (step 3 below), register the webhook **against your
   production domain, not a preview URL** (Vercel's Deployment Protection
   covers preview deployments by default and would reject Telegram's
   webhook calls):
   ```bash
   curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{
       "url": "https://<your-production-domain>/api/telegram/webhook",
       "secret_token": "<TELEGRAM_WEBHOOK_SECRET>",
       "allowed_updates": ["message"]
     }'
   ```

### 3. Vercel deployment

1. Import this repo into Vercel.
2. Set all env vars from `.env.example` in the Vercel dashboard (Production
   environment): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`,
   `TELEGRAM_WEBHOOK_SECRET`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`,
   `CRON_SHARED_SECRET` (generate another random string for this one).
3. Deploy. Note the production domain for the webhook step above.

### 4. Reminder scheduling (Supabase pg_cron)

Vercel's free Hobby-tier Cron is capped at once/day, so scheduling lives in
Supabase instead. In the SQL editor, create the two Vault secrets with your
production values, then re-apply (or manually run)
`supabase/migrations/20260923000006_schedule_reminder_dispatch.sql`:

```sql
select vault.create_secret('https://<your-production-domain>/api/cron/send-reminders', 'reminder_endpoint_url');
select vault.create_secret('<CRON_SHARED_SECRET>', 'cron_shared_secret');
```

### 5. Onboarding (both partners)

1. Log in to the deployed app with your Supabase Auth account.
2. Go to **Settings**, click **Get a link code**, then open the generated
   Telegram deep link (or manually message the bot with `/start <code>`).
3. Repeat for the other partner. Reminders now reach both Telegram
   accounts automatically.

## Project structure

- `app/` — Next.js App Router pages, Server Actions (`app/actions/`), and
  API routes (`app/api/`).
- `lib/supabase/` — three clients: `client.ts` (browser, anon key),
  `server.ts` (Server Actions/Components, anon key + session cookies),
  `admin.ts` (service-role, used only by the cron and webhook routes).
- `lib/time.ts` — Asia/Saigon parse/format helpers (Vietnam has no DST, so
  a fixed `+07:00` offset is used).
- `supabase/migrations/` — schema, RLS policies, the `remind_at`/
  reminder-reset trigger, the atomic claim RPC, and cron scheduling.
- `plans/260923-0845-calendar-remind-app/` — the brainstorm, plan, and
  research reports this app was built from, including a red-team review
  that found and fixed 15 issues before implementation.

## Design notes worth knowing before changing this code

- **`events` RLS is intentionally shared, not per-owner.** Both partners
  have full CRUD on every event — don't "fix" this into
  `created_by = auth.uid()` scoping.
- **`remind_at` and the reminder-reset-on-edit are owned by a database
  trigger** (`set_remind_at_and_reset_reminder`), not application code.
  Don't move this logic into a Server Action — it needs to fire regardless
  of which client makes the edit.
- **The reminder dispatcher uses a lease-based claim**
  (`reminder_claimed_at`/`reminder_attempts`), not a terminal
  `reminder_sent = true` set before sending. A row is only marked sent
  after every onboarded recipient's message succeeds, so a Telegram outage
  retries instead of silently losing the reminder.
- **`lib/supabase/admin.ts` (service-role) has exactly two legitimate call
  sites**: the Telegram webhook and the cron dispatcher. Never import it
  from a Server Action or anything reachable from a user request.
