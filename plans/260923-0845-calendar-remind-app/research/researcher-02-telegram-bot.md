# Telegram Bot Integration for a 2-User Serverless (Vercel + Next.js) App

Scope: bot creation, webhook vs polling, chat_id capture, library choice, sendMessage example, rate limits. Cron/scheduling is covered by a separate researcher.

## 1. Creating the bot via @BotFather

Flow, confirmed by multiple current guides (Medium, betterclaw.io, agent37.com — all accessed September 2026, describing the unchanged standard BotFather flow):

1. In Telegram, open the chat with `@BotFather` (verify the blue checkmark / official handle).
2. Send `/newbot`.
3. Provide a display name (not unique).
4. Provide a username, which must be globally unique and end in `bot` (e.g. `CalendarRemindBot`).
5. BotFather returns the bot token, a string like `1234567890:ABC-DEF1234ghIkl-zyx57W2v1u123456789`. This is a secret — store it as a Vercel environment variable, never commit it.

This is a one-time, manual step; no further research needed since it hasn't changed in years and is not API-automatable (BotFather itself has no public bot-creation API).
Source: [Create a Telegram bot using BotFather](https://medium.com/shibinco/create-a-telegram-bot-using-botfather-and-get-the-api-token-900ba00e0f39), [BetterClaw guide](https://www.betterclaw.io/guide/generate-telegram-bot-token) (both accessed 2026-09-23).

## 2. Webhook vs long polling — webhook is correct for Vercel serverless

Long polling requires a process that stays alive making repeated blocking HTTP requests to Telegram to wait for updates. Vercel Next.js API routes / Route Handlers are invoked per-request and torn down afterward (no persistent process), so long polling cannot run there — there is nothing to keep the poll loop alive between invocations.

grammY's own deployment-types guide (official framework docs) states this explicitly: long polling is for "hosted 'backend' instances, i.e. machines that actively run your bot 24/7," while webhooks are for "serverless platforms, such as cloud functions or programmable edge networks," specifically because webhooks let the infra "scale your infrastructure down to zero when no requests are coming."
Source: [grammY — Long Polling vs. Webhooks](https://grammy.dev/guide/deployment-types) (accessed 2026-09-23, undated content but reflects current grammY docs).

**Registration**: call the Bot API method `setWebhook` once (e.g. via a `curl`/`fetch` call, run manually or from a one-off setup script — not on every request) to tell Telegram where to POST updates:

```
POST https://api.telegram.org/bot<TOKEN>/setWebhook
{
  "url": "https://<your-vercel-domain>/api/telegram/webhook",
  "secret_token": "<random-1-256-char-string>",
  "allowed_updates": ["message"]
}
```

**Securing the webhook**: `setWebhook` accepts an optional `secret_token` parameter (1–256 chars, `A-Z a-z 0-9 _ -`). Once set, every webhook POST from Telegram includes header `X-Telegram-Bot-Api-Secret-Token` with that value. Your Next.js route handler should reject any request where this header doesn't match the stored secret, which prevents random requests to your public webhook URL from being treated as genuine Telegram updates.
Source: official Telegram Bot API reference, `setWebhook` method, [core.telegram.org/bots/api](https://core.telegram.org/bots/api) (accessed 2026-09-23); corroborated by [nguyenthanhluan.com secret_token glossary](https://nguyenthanhluan.com/en/glossary/secret_token-for-setwebhook-en/) and [teleclaw.com webhook setup guide](https://teleclaw.com/blog/telegram-bot-webhook-setup).

## 3. Capturing each partner's chat_id

Flow (standard Bot API pattern, confirmed against the official API reference and matches how grammY/Telegraf examples wire up `/start`):

1. Each partner opens a chat with the bot in Telegram and sends `/start`.
2. Telegram POSTs an `Update` object to your webhook URL. For a text command this is `update.message`, containing `message.chat.id` (the numeric chat_id you need for `sendMessage`) and `message.from` (the sender's Telegram user id, `username`, first/last name).
3. Since this is a fixed 2-user app, resolve identity with a simple allow-list rather than building generic onboarding: seed the `users` table with each partner's known Telegram `username` (or a one-time invite code sent out-of-band, e.g. `/start <code>` as a deep-link payload — Telegram supports `https://t.me/<bot_username>?start=<payload>` which arrives as `/start <payload>` in `message.text`). On receiving `/start`, match `message.from.username` (or the payload) against the known user row and persist `message.chat.id` into that user's `chat_id` column.
4. Handle unmatched senders by simply not storing anything (reject/ignore) — since this is a private 2-user app, there is no need for a signup flow.

This is a straightforward application of the documented `Update`/`Message` object shape; no separate mechanism is needed. Source: [core.telegram.org/bots/api](https://core.telegram.org/bots/api) — `Update`, `Message`, `Chat` object definitions (accessed 2026-09-23); deep-link start parameter behavior documented in the same reference under `sendMessage`/bot commands and widely used in library examples (e.g. grammY's own onboarding examples at [grammy.dev](https://grammy.dev)).

## 4. Library recommendation: grammY over Telegraf or raw fetch

| Criterion | grammY | Telegraf | Raw `fetch` |
|---|---|---|---|
| Last npm publish | `1.46.0`, 2026-08-26 (verified via npm registry API) | `4.16.3`, 2024-02-29 (verified via npm registry API) — over 2.5 years stale | N/A, no dependency |
| Last GitHub push | 2026-08-26 (verified via GitHub API) | 2025-01-11 (verified via GitHub API) — ~20 months stale as of Sep 2026 | N/A |
| GitHub stars | 3,752 | 9,190 (larger historical community, but momentum has stalled) | N/A |
| Weekly npm downloads | ~3.76M (2026-09-15–21, npm download API) | ~259K (same window) | N/A |
| Serverless/webhook fit | Built-in `webhookCallback(bot, "next-js")` adapter for Next.js Route Handlers; documented Vercel deployment guide | Also supports `webhookCallback`, but less current framework-adapter coverage and stale docs relative to current Next.js versions | Full manual control, zero abstraction |
| Bot API version currency | Tracks latest Bot API promptly (per grammY's own comparison page) | Historically lags a few Bot API versions behind | N/A (you implement only what you call) |
| Complexity for "mostly outbound + one inbound command" use case | Minimal: a few lines for webhook handler + `bot.command("start", ...)` handler | Similar minimal surface, but built on a less-maintained core | Simplest possible: one `fetch` call for `sendMessage`, and a manual webhook route to parse `/start`; no library dependency at all |

Sources: npm registry API (`registry.npmjs.org/grammy`, `registry.npmjs.org/telegraf`, queried 2026-09-23), GitHub REST API (`api.github.com/repos/grammyjs/grammY`, `api.github.com/repos/telegraf/telegraf`, queried 2026-09-23), npm downloads API (`api.npmjs.org/downloads/point/last-week/...`, queried 2026-09-23), [grammY hosting guide for Vercel](https://grammy.dev/hosting/vercel) (accessed 2026-09-23), [grammY framework comparison page](https://grammy.dev/resources/comparison) (accessed 2026-09-23).

**Recommendation for this project**: given the app's needs are minimal (parse one `/start` command per user, send scheduled outbound messages), either grammY or raw `fetch` calls are architecturally sound; Telegraf is the weaker choice today due to its stale maintenance (no publish/push in over a year as of this research). Between grammY and raw `fetch`: raw `fetch` avoids a dependency entirely and is arguably simpler for a project this small (you only need `sendMessage` for output and a manual JSON-body parse for `/start` input, both trivial). grammY adds value mainly through its typed API surface, built-in `webhookCallback("next-js")` adapter (saves you writing the secret-token check and JSON parsing boilerplate yourself), and Bot API type coverage as the app possibly grows more commands later. For a project that is genuinely "send messages + handle one command forever," raw `fetch` is defensible under YAGNI; if any conversational growth (more commands, inline keyboards, etc.) is plausible, grammY is the safer pick given it's the only actively maintained option of the two libraries compared.

## 5. Minimal sendMessage example

Raw HTTPS POST (no library), which is all that's needed regardless of which webhook-parsing approach is chosen:

```ts
async function sendTelegramMessage(chatId: number, text: string) {
  const res = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    }
  );
  if (!res.ok) throw new Error(`Telegram sendMessage failed: ${res.status}`);
  return res.json();
}
```

Equivalent with grammY, if adopted:

```ts
import { Bot } from "grammy";
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);
await bot.api.sendMessage(chatId, text);
```

Both call the same underlying Bot API `sendMessage` method. Source: [core.telegram.org/bots/api](https://core.telegram.org/bots/api) `sendMessage` method definition (accessed 2026-09-23); grammY API shape confirmed via [grammy.dev/hosting/vercel](https://grammy.dev/hosting/vercel) (accessed 2026-09-23).

## 6. Rate limits — non-issue at 2-user scale

From the official Telegram Bots FAQ (`core.telegram.org/bots/faq`, accessed 2026-09-23, content undated but is Telegram's current living FAQ):

- Single chat: avoid sending more than **1 message/second** to the same chat_id; short bursts may be tolerated before 429s appear.
- Groups: bots may not send more than **20 messages/minute** in a group (not applicable here — this app sends 1:1 direct messages, not group messages).
- Bulk/broadcast: bots may not broadcast more than **~30 messages/second** across all chats without enabling paid broadcasts (up to 1000/sec, at a Telegram Stars cost per message beyond the free tier) — this only matters for mass-broadcast bots with many users.

At the scale of this app — 2 users, each receiving at most a handful of reminder messages per day, individually rate-limited well under 1/second — none of these limits are reachable. No rate-limit handling logic is needed beyond basic retry-on-429 as defensive coding.
Source: [core.telegram.org/bots/faq](https://core.telegram.org/bots/faq), official Telegram Bots FAQ (accessed 2026-09-23).

## Limitations

This report did not investigate: Vercel Cron / scheduling mechanics (explicitly out of scope, covered by another researcher), message formatting options (Markdown/HTML parse modes), delivery-failure handling if a user blocks the bot, or multi-bot-per-environment considerations. These are implementation details, not blockers for the architecture decision.

## Unresolved questions

- Whether to use grammY or raw `fetch` is a judgment call under YAGNI vs. future extensibility; no further research changes the trade-off — this is a decision for the plan/brainstorm phase, not for research.
- Whether the onboarding-code deep-link (`/start <payload>`) or plain username allow-listing is preferred for matching users is a product decision, not a technical constraint — either is trivial to implement with the same webhook payload shape.

## Recommendation

Use a Telegram webhook (not long polling) registered via `setWebhook` with a `secret_token`, verified on every incoming request against the `X-Telegram-Bot-Api-Secret-Token` header, hitting a Next.js Route Handler on Vercel; capture each partner's `chat_id` from the `message.chat.id` field of the `/start` update matched against a seeded 2-row allow-list in the `users` table; and send reminders via the Bot API `sendMessage` method, either through a raw `fetch` POST or through grammY's `bot.api.sendMessage`. Prefer grammY over Telegraf if any library is used at all — Telegraf's core has not been published to npm or pushed to GitHub in over a year (last release 2024-02-29, last push 2025-01-11) versus grammY's active cadence (last release 2026-08-26), making Telegraf the higher-adoption-risk choice despite its larger historical star count. Given the app's minimal bot surface (one inbound command, scheduled outbound messages), a dependency-free raw-`fetch` implementation is also fully sufficient and defensible under KISS/YAGNI; grammY is worth adding only if you want its typed API and its built-in `webhookCallback("next-js")` adapter to avoid hand-rolling the secret-token check and update parsing. Telegram's rate limits (1 msg/sec/chat, ~30 msg/sec global) are not a constraint at 2-user scale.
