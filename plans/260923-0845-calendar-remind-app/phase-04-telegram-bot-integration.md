---
title: "Phase 4: Telegram Bot Integration"
status: in-progress
priority: P1
effort: "3h"
dependencies: [2, 3]
---

# Phase 4: Telegram Bot Integration

## Context Links

- Research: `research/researcher-02-telegram-bot.md`
- Brainstorm contract: `../reports/brainstorm-260923-1529-calendar-remind.md` (Bot platform trade-off, edge case: bot chat-id onboarding)

## Overview

Register a Telegram bot, wire a webhook endpoint that captures each
partner's `chat_id` via `/start`, and provide a `sendTelegramMessage`
function the Phase 5 dispatcher will call. This phase delivers the delivery
channel; Phase 5 delivers the scheduling logic that uses it.

## Key Insights (from research)

- Long polling cannot run on Vercel serverless functions (no persistent
  process between invocations) — a webhook is the only viable approach.
  Source: `research/researcher-02-telegram-bot.md` §2.
- Telegram's `setWebhook` accepts a `secret_token`; every genuine webhook
  POST then carries `X-Telegram-Bot-Api-Secret-Token`, which the route
  handler must verify to reject spoofed requests to the public webhook URL.
- Dependency-free raw `fetch` calls are fully sufficient for this app's
  minimal bot surface (one inbound command, scheduled outbound sends) and
  are the simpler build under KISS — no bot framework dependency needed.
  grammY remains the documented fallback if the bot surface grows later
  (Telegraf is not recommended: no npm publish or GitHub push in over a
  year as of this research).
- Rate limits (1 msg/sec/chat) are not reachable at 2-user scale — no
  rate-limiting logic needed beyond a basic retry-on-429.

<!-- Updated: Red Team Session 2026-09-23 — Findings 2, 5, 9, 14 -->
**Red-team corrections applied:**
- **[Finding 5, High]** Matching `/start` against `message.from.username`
  had no backing column (Phase 2's original schema had none) and Telegram
  usernames are optional and mutable — a released/re-claimed username
  could hijack a partner's `chat_id`. Now matches on the
  `telegram_link_code` column added in Phase 2, exchanged via a
  `/start <code>` deep link generated from the authenticated `/settings`
  page (Phase 3), and never overwrites an already-set `telegram_chat_id`
  without the partner re-authenticating in the web app first.
- **[Finding 2, Critical]** The webhook write to `users.telegram_chat_id`
  now explicitly uses `lib/supabase/admin.ts` (service-role, from Phase 1's
  corrected client split) — this is a documented, necessary use of the
  admin client, since the webhook has no user session and `users` has no
  client-writable RLS policy (Phase 2).
- **[Finding 9, High]** `setWebhook` now targets the stable production
  domain from the start, not a preview URL — Vercel's Deployment
  Protection covers preview deployments by default and would 401 Telegram's
  webhook POSTs.
- **[Finding 14, Medium]** The secret-token check now specifies
  timing-safe comparison and fail-closed behavior when the env var is
  unset, rather than a bare `!==` comparison.

## Requirements

- [ ] Telegram bot created via `@BotFather`; token stored as `TELEGRAM_BOT_TOKEN` env var — blocked on your Telegram account (README Setup step 2).
- [ ] Webhook route handler at `app/api/telegram/webhook/route.ts` registered via `setWebhook` — code is in place (`app/api/telegram/webhook/route.ts`); registration itself needs the deployed production URL (README Setup step 2.4).
- [x] Webhook handler rejects any request whose `X-Telegram-Bot-Api-Secret-Token` header doesn't match the stored secret, using a timing-safe comparison (`lib/verify-secret.ts`), and fails closed if `TELEGRAM_WEBHOOK_SECRET` is unset or empty.
- [x] `/settings` page shows each logged-in partner a link-code button (`components/telegram-link-panel.tsx`) with a deep link and manual `/start <code>` instructions.
- [x] `/start <code>` handling implemented in `app/api/telegram/webhook/route.ts`, matching on `telegram_link_code` via the admin client.
  <!-- Updated: Implementation session 2026-09-23 -- design delta from the original plan text -->
  **Delta from the original plan:** rather than a separate "unlink" action that clears `telegram_chat_id` from the client (which the corrected `users` RLS/GRANT design in Phase 2 doesn't permit — only `telegram_link_code` is client-writable), re-linking is just generating a *new* code from `/settings`. The webhook overwrites `telegram_chat_id` whenever it finds a matching, still-valid `telegram_link_code` — issuing a fresh code is what authorizes the overwrite, whether or not a `chat_id` was already set. Same security property (binding requires an authenticated web-session action first), simpler mechanism.
- [x] `sendTelegramMessage(chatId, text)` helper (raw `fetch`, with 429 retry honoring `retry_after`) in `lib/telegram.ts`, imported by Phase 5's dispatcher.
- [x] `chat.type === "private"` check in place in the webhook handler.

## Architecture

- Webhook: Next.js Route Handler (`app/api/telegram/webhook/route.ts`), stateless, verifies secret header (timing-safe, fail-closed), parses `Update`, handles `/start <code>`, uses `lib/supabase/admin.ts` for the `users` write, returns 200 quickly (no long processing).
- Outbound: `lib/telegram.ts` exporting `sendTelegramMessage`, imported by the Phase 5 cron route — never called synchronously from event-creation code (per the brainstorm's outbox pattern).
- Identity binding: authenticated web session (Phase 3 `/settings`) generates the link code → out-of-band Telegram `/start <code>` exchange → webhook (admin client) persists `chat_id`. No step in this flow trusts unauthenticated input for anything beyond "does this code match an issued one."

## Related Code Files

- Create: `app/api/telegram/webhook/route.ts`
- Create: `lib/telegram.ts`
- Create: `app/actions/telegram-link.ts` (Server Action: generate/clear `telegram_link_code`, called from `/settings`)
- Modify: `app/(app)/settings/page.tsx` (created by Phase 3) — add the Telegram link-code UI and instructions
- Modify: `.env.example` — add `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`

## Implementation Steps

1. Create the bot via `@BotFather` (`/newbot`), capture the token into `.env.local` and the Vercel dashboard (not committed).
2. Generate a random `TELEGRAM_WEBHOOK_SECRET` (1–256 chars) and store it alongside the token.
3. Implement `app/actions/telegram-link.ts`: a Server Action (using `lib/supabase/server.ts`, the anon/session client, so it runs as the logged-in partner) that generates a random `telegram_link_code`, stores it on that user's row, and returns it for display.
4. Add the link-code UI to `/settings`: show the code and a deep link (`https://t.me/<bot_username>?start=<code>`) plus plain-text instructions.
5. Implement `app/api/telegram/webhook/route.ts`: verify the secret header (timing-safe compare, fail-closed on missing env var), parse the `Update`, and on `message.text` starting with `/start ` with `chat.type === "private"`, extract the code, look up the matching `users` row via `lib/supabase/admin.ts`, and — only if `telegram_chat_id` is currently null — set `telegram_chat_id` and clear `telegram_link_code`.
6. Implement `lib/telegram.ts` with `sendTelegramMessage(chatId: number, text: string)` per the researched raw-`fetch` example.
7. After the webhook route is deployed to the **production** domain (not a preview URL) and reachable, call `setWebhook` once (a one-off script reading the token from env, not hardcoded, and not committed) pointing at the production webhook URL with the secret token.
8. Manually verify: both partners generate a code from `/settings`, `/start <code>` the bot, both `users` rows get a `telegram_chat_id`, and a manual `sendTelegramMessage` call reaches each partner's Telegram app.

## Todo

- [x] Webhook route verifies the secret header with a timing-safe comparison and fails closed if the env var is missing
- [x] Link-code Server Action implemented (`app/actions/telegram-link.ts`), gated on `supabase.auth.getUser()`
- [x] `/start <code>` handler matches on `telegram_link_code`, writes via `admin.ts` (see delta note above on the overwrite/relink mechanism)
- [x] `chat.type === "private"` check in place
- [ ] Bot created, token and webhook secret stored as env vars — blocked on your Telegram account
- [ ] `sendTelegramMessage` helper manually verified against both partners' real chats — blocked on a real bot token
- [ ] `setWebhook` registered against the **production** deployed URL — blocked on deployment

## Success Criteria

- Both partners' `users.telegram_chat_id` populated after generating a code from `/settings` and sending `/start <code>`.
- A manual call to `sendTelegramMessage` for each stored `chat_id` results in a received Telegram message.
- A forged POST to the webhook URL without the correct secret header is rejected (non-200 or ignored), including when tested against a deployment where the secret env var is temporarily unset (must fail closed, not open).
- Sending `/start <code>` a second time for an already-linked account does not change `telegram_chat_id`.

## Edge Cases & Considerations

- A partner blocking the bot after onboarding will cause `sendMessage` to fail — Phase 5's dispatcher handles this (see Phase 5's per-recipient delivery tracking).
- If `/start <code>` arrives with an unrecognized or already-consumed code, the handler ignores it silently — this is a private 2-user app, not a public bot.
- Adding the bot to a group and sending `/start` must be ignored (`chat.type !== "private"`) — otherwise a group chat's `chat.id` could be bound and broadcast private reminders to the group.

## Security Considerations

- Webhook secret-token verification is mandatory, timing-safe, and fail-closed — without it, anyone who discovers the webhook URL could inject fake `/start` events.
- Bot token and webhook secret live only in environment variables, never in client-reachable code or in any committed setup script.
- Link-code matching (not username matching) means the binding is tied to an authenticated web session, not to a mutable, publicly-discoverable Telegram handle.

## Next Steps

- Phase 5's dispatcher imports `sendTelegramMessage` from `lib/telegram.ts` and queries `users.telegram_chat_id` for both partners.
