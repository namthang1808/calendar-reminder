---
title: "Phase 3: Event CRUD & Search UI"
status: in-progress
priority: P1
effort: "6h"
dependencies: [2]
---

# Phase 3: Event CRUD & Search UI

## Context Links

- Brainstorm contract: `../reports/brainstorm-260923-1529-calendar-remind.md` (Acceptance criteria, Constraints)

## Overview

Build the web app's core user-facing surface: login for the two fixed
accounts, a shared chronological event list, low-friction event
create/edit/delete, and search/filter by title and date range.

## Key Insights

- The real-world trigger for event creation is an off-hand mid-chat mention
  ("dinner with friends next week"), so the create form must default to
  only `title` + `start_at` as required fields — everything else optional.
- No timezone picker — all input/display assumes Asia/Saigon, stored as UTC
  `timestamptz` underneath.

<!-- Updated: Red Team Session 2026-09-23 — Findings 2, 3, 4, 6, 11, 13 -->
**Red-team corrections applied:**
- **[Finding 6, High]** "Assumes Asia/Saigon" was never backed by an actual
  conversion step. Server Actions run on Vercel with a UTC clock, so a
  naive `new Date("2026-09-25T19:00")` would store the wrong instant (off
  by 7 hours). Added an explicit shared timezone helper (Implementation
  Steps) used by every write and every display path.
- **[Finding 2, Critical]** Mutations now call `lib/supabase/server.ts`
  (the anon + session-cookie client from Phase 1's corrected split), not a
  service-role client — this is what makes Phase 2's RLS policy actually
  run for real app traffic instead of being bypassed.
- **[Finding 3 / 4, Critical]** `remind_at` derivation and the
  `reminder_sent` reset on edit are now owned entirely by the Phase 2
  database trigger, not by hand-written app-code diffing. Removed the
  "reset reminder_sent on relevant field changes" app-code requirement —
  the trigger fires on every `UPDATE` to `start_at`/`remind_offset_minutes`
  regardless of which client made the change, which also closes the gap
  where a direct (non-Server-Action) edit could skip the reset.
- **[Finding 13, Medium]** The search box's `ILIKE` filter needed an
  injection guard — PostgREST's `.or()` string-building is vulnerable to
  filter-syntax injection via unescaped user input.
- **[Finding 11, Medium]** This phase now creates the settings/onboarding
  page (previously assumed to be created by Phase 4, which broke the
  "Phase 3 and 4 run in parallel" claim in `plan.md`). Phase 4 only adds
  bot-specific content to a page this phase owns.

## Requirements

- [x] Login page authenticating against the two Supabase Auth accounts from Phase 2 (no signup route; signup is disabled server-side per Phase 2, not just omitted from the UI).
- [x] Event list view: shared, chronologically sorted, visible to both accounts identically, all times displayed in Asia/Saigon.
- [x] Create event: title + start date/time required; description, location, end time, reminder offset optional (default 60 minutes, from Phase 2's schema default).
- [x] Edit event: same fields as create, pre-filled.
- [x] Delete event with a confirmation step (irreversible action).
- [x] Search/filter: text match on title/description (`ILIKE`, injection-safe) plus a date-range filter (Asia/Saigon day boundaries, not UTC midnight).
- [x] Mobile-responsive layout — Tailwind utility classes throughout; not yet visually verified in a real browser viewport (see Todo).
- [x] `app/(app)/settings/page.tsx` created here (shell + onboarding-status display) — Phase 4 adds the Telegram-specific instructions and link code into it.
- [x] A shared `lib/time.ts` helper: `parseAsiaSaigon(input: string): Date` (treats a naive `YYYY-MM-DDTHH:mm` value as `+07:00`) and `formatAsiaSaigon(date: Date): string`, used by every place that reads or displays `start_at`/`end_at`.

## Architecture

- Next.js Server Actions for mutations, calling `lib/supabase/server.ts`
  (the anon + cookie client, not the admin client — RLS applies to every
  mutation this phase makes).
- Server Components for the initial event list render; client-side
  interactivity (search input, forms) as needed.
- `remind_at` and `reminder_sent` are never written directly by this
  phase's code — the Phase 2 trigger owns both, so a Server Action simply
  writes `start_at`/`remind_offset_minutes` and the trigger keeps the
  reminder fields correct.

## Related Code Files

- Create: `app/(auth)/login/page.tsx`
- Create: `app/(app)/events/page.tsx` (list + search)
- Create: `app/(app)/events/new/page.tsx` (create form)
- Create: `app/(app)/events/[id]/edit/page.tsx`
- Create: `app/(app)/settings/page.tsx` (onboarding-status shell; Phase 4 extends it)
- Create: `app/actions/events.ts` (Server Actions: create, update, delete)
- Create: `lib/time.ts` (Asia/Saigon parse/format helpers)
- Create: `components/event-list.tsx`, `components/event-form.tsx`, `components/event-search.tsx`

## Implementation Steps

1. Build `lib/time.ts` first — `parseAsiaSaigon` and `formatAsiaSaigon`, both explicit about the `+07:00` offset (Vietnam has no DST, so a fixed offset is sufficient; no timezone library dependency needed).
2. Build the login page using Supabase Auth's email/password flow; redirect authenticated sessions to `/events`.
3. Add route protection (middleware or layout-level session check) so `/events/*` and `/settings` require an authenticated session from one of the two accounts.
4. Build the event list page: query `events` ordered by `start_at`, render title/date (via `formatAsiaSaigon`)/location.
5. Build the create/edit form with the required-vs-optional field split above; the form submits a naive local datetime string, and the Server Action parses it with `parseAsiaSaigon` before writing `start_at`. Do **not** write `remind_at` or `reminder_sent` — the Phase 2 trigger handles both.
6. Build delete with a confirm dialog, calling a Server Action.
7. Build search/filter: a date-range picker whose bounds go through `parseAsiaSaigon`, plus a text input. For the text match, use **parameterized `.ilike()` calls** (e.g. two separate `.or()`-free `.ilike()` queries unioned in code, or a Postgres RPC function taking `term text` as a bound parameter) rather than string-interpolating the term into a PostgREST `.or()` filter expression — this avoids filter-syntax injection from characters like `,` `(` `)` in the search box. Escape `%`/`_` in the term before use as a LIKE wildcard.
8. Build `app/(app)/settings/page.tsx` as a shell showing each partner's onboarding status (Telegram linked / not linked) — Phase 4 fills in the actual bot-linking instructions and code.
9. Verify mobile layout at common phone viewport widths.

## Todo

- [x] `lib/time.ts` helper built and used by every read/write of `start_at`/`end_at`
- [x] Mutations confirmed (by code review) to go through `lib/supabase/server.ts` (anon client) — `app/actions/events.ts` imports only `@/lib/supabase/server`, never `admin.ts`
- [x] Search uses parameterized `.ilike()` calls (two separate queries merged in JS), not string-built `.or()` filters — see `app/(app)/events/page.tsx`
- [x] Date-range filter uses Asia/Saigon day boundaries via `asiaSaigonDayBounds()`, not UTC midnight
- [x] `/settings` shell created; route protection wired via `proxy.ts` matcher (`/events/:path*`, `/settings/:path*`)
- [ ] Login works for both accounts, rejects unknown credentials — needs a real Supabase project + accounts (README Setup)
- [ ] Event list shows all events regardless of `created_by`, times shown in Asia/Saigon — needs live data to verify end-to-end
- [ ] Create form enforces only title + start time as required — needs live verification
- [ ] Edit correctly updates `start_at`; `remind_at`/`reminder_sent` reset verified as trigger-driven — needs a live database with the Phase 2 trigger applied
- [ ] Delete requires confirmation — needs live verification (client-side `window.confirm`, code is in place)
- [ ] Layout verified on a mobile viewport — needs a running dev server + browser check

## Success Criteria

- Manual test: User A creates an event, User B (different session/account) sees it in their list without refresh-order surprises.
- Manual test: entering "19:00" for an event stores an instant that, when reformatted with `formatAsiaSaigon`, still reads "19:00" — proves the parse/format round-trip is correct, not just visually plausible.
- Manual test: searching a partial title substring returns the expected event; a search term containing `,` or `(` does not error or return unexpected rows.
- Manual test: editing an event's start time (via the UI, which uses the anon client) flips `reminder_sent` back to `false` in the database — proving the trigger fires under real RLS, not just under an admin client.

## Edge Cases & Considerations

- Empty state: first-ever event list with zero events should render a clear "no events yet" state, not a blank screen.
- An event with only `start_at` (no `end_at`) must render sensibly in the list (no "Invalid Date" or crash).
- A title-only edit on an already-sent event (no `start_at`/`remind_offset_minutes` change) must **not** reset `reminder_sent` — verified by the trigger's `IS DISTINCT FROM` guard, tested explicitly in Phase 6.

## Risk Assessment

- **Risk:** A future contributor "optimizes" by moving `remind_at`/`reminder_sent` writes back into application code, silently reintroducing the immutability/consistency bug the Phase 2 trigger fixed.
  **Mitigation:** Comment in `app/actions/events.ts` pointing at the Phase 2 trigger as the source of truth for these two fields.

## Security Considerations

- Server Actions must re-check the session server-side before every mutation — never trust client-supplied user identity.
- Search input must never be string-interpolated directly into a PostgREST filter expression.

## Next Steps

- Phase 4 (Telegram bot) extends the `/settings` page this phase created rather than building its own, and depends on this phase's route protection being in place first — Phase 3 and Phase 4 are **not** independently parallelizable (corrected in `plan.md`).
