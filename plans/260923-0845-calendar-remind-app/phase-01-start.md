---
title: "Phase 1: Project Scaffold & Supabase Setup"
status: in-progress
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Project Scaffold & Supabase Setup

## Context Links

- Brainstorm contract: `../reports/brainstorm-260923-1529-calendar-remind.md`

## Overview

Stand up the empty repo as a working Next.js + Supabase project: framework
scaffold, Supabase project provisioning, environment configuration, and a
deployable skeleton on Vercel. This phase produces no user-visible feature —
it produces the foundation every later phase builds on.

## Key Insights

- The repo root currently contains `README.md`, `.claude/`, `.agentkit/`,
  and now `plans/` (created by this planning session) — none of these are
  on `create-next-app`'s allowed-file list for scaffolding into a non-empty
  directory, so a direct `create-next-app .` will likely refuse to run.
- Two fixed user accounts (the couple) means no public signup surface is
  needed anywhere in the app UI — but the actual access-control boundary is
  disabling signups server-side in Supabase (handled in Phase 2), not the
  absence of a signup page.

<!-- Updated: Red Team Session 2026-09-23 — Findings 2, 8, 12, 15 -->
**Red-team corrections applied:**
- **[Finding 15, Medium]** `create-next-app` scaffolding into the repo root
  will likely fail given the existing `plans/`, `.claude/`, `.agentkit/`
  directories. Scaffold into a temporary directory and move the generated
  files into the repo root instead of scaffolding in place.
- **[Finding 8, High]** `SUPABASE_URL`/`SUPABASE_ANON_KEY` as originally
  named would never reach the browser — Next.js only inlines
  `NEXT_PUBLIC_*`-prefixed variables into the client bundle. Renamed to
  `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **[Finding 2, Critical]** One `lib/supabase/server.ts` was originally
  described as carrying the service-role key "for the cron dispatcher and
  trusted server actions" — this contradicted Phase 2's RLS design, which
  assumes Server Actions run as the authenticated user, not as an
  RLS-bypassing admin. Split into two helpers: `server.ts` (anon key +
  session cookies, used by Server Actions and Server Components) and
  `admin.ts` (service-role key, used only by the Phase 4 webhook and
  Phase 5 cron routes).
- **[Finding 12, Medium]** `.gitignore` doesn't exist in the repo yet — it
  was incorrectly listed as "Modify." Changed to "Create," and moved to the
  first implementation step so it exists before any secret is created
  locally, not after.

## Requirements

- [ ] Next.js app (App Router, TypeScript) scaffolded, coexisting with the existing `plans/`, `.claude/`, `.agentkit/`, `README.md`, `.git`.
- [ ] `.gitignore` created (not modified — it doesn't exist yet) excluding `.env`, `.env.local`, `.env*.local`, `node_modules`, `.next`, **before** any real secret is created locally.
- [ ] Supabase project created (or an existing one designated) with connection details captured as environment variables, never committed.
- [ ] Two Supabase client helpers, per the corrected client split: `lib/supabase/server.ts` (anon key + cookie-based session, for Server Actions/Server Components) and `lib/supabase/admin.ts` (service-role key, `import 'server-only'`, for the cron/webhook routes only).
- [ ] Browser-reachable env vars use the `NEXT_PUBLIC_` prefix; the service-role key never does.
- [ ] Project deployable to Vercel with environment variables documented (not hardcoded) in a `.env.example` file.

## Architecture

- Framework: Next.js (App Router) — chosen in the brainstorm for a single
  responsive web app serving both partners.
- Data/auth layer: Supabase (Postgres + Auth), chosen over Firebase because
  the app's explicit search/filter requirement needs real SQL, not
  Firestore's document query model.
- Hosting: Vercel (or the platform confirmed compatible with the scheduling
  approach chosen in Phase 5 — see `research/researcher-01-scheduling.md`).
- Client boundary (corrected): `server.ts` (anon + cookies, respects RLS,
  used by all user-facing code) is architecturally distinct from
  `admin.ts` (service-role, bypasses RLS, used only by two trusted
  server-only routes). No Server Action ever imports `admin.ts`.

## Related Code Files

- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`
- Create: `.gitignore`
- Create: `lib/supabase/client.ts` (browser client, anon key)
- Create: `lib/supabase/server.ts` (server client, anon key + session cookies — for Server Actions/Server Components)
- Create: `lib/supabase/admin.ts` (server-only client, service-role key — for cron/webhook routes only)
- Create: `.env.example`
- Modify: `README.md` (replace the one-line placeholder with real setup instructions, including the "never re-enable public signup" note from Phase 2)

## Implementation Steps

1. Create `.gitignore` first (`.env`, `.env.local`, `.env*.local`, `node_modules`, `.next`) — before any secret exists locally.
2. Scaffold the Next.js app into a temporary directory (`create-next-app /tmp/calendar-remind-scaffold` with TypeScript, App Router, no default demo content beyond a placeholder home page), then move its generated files into the repo root, preserving `plans/`, `.claude/`, `.agentkit/`, `README.md`, `.git`.
3. Create a Supabase project (or confirm the target project) and record `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in `.env.example` as placeholders only.
4. Add `lib/supabase/client.ts` (browser-safe, anon key, reads `NEXT_PUBLIC_*` vars), `lib/supabase/server.ts` (anon key + `@supabase/ssr` cookie helpers, per Supabase's current App Router SSR pattern), and `lib/supabase/admin.ts` (service-role key, `import 'server-only'` guard so it errors if ever imported client-side).
5. Connect the repo to Vercel (or the confirmed host) and set the real environment variables there, not in source.
6. Verify a minimal deploy renders the placeholder home page successfully.
7. Update `README.md` with actual project description, local dev setup steps, and the "public signup must stay disabled in Supabase" note.

## Todo

- [x] `.gitignore` created before any local secret exists
- [x] Next.js scaffold in place (moved from a temp scaffold directory, existing repo dirs untouched) — not yet git-committed, pending user authorization
- [x] `.env.example` documents all vars with correct `NEXT_PUBLIC_` prefixing — Supabase project itself not yet provisioned (external account, see README Setup)
- [x] Three Supabase client helpers created: `client.ts`, `server.ts` (anon), `admin.ts` (service-role, server-only)
- [ ] First deploy succeeds on the hosting platform, browser client confirmed non-`undefined` — blocked on Vercel + real Supabase project (see README Setup)

## Success Criteria

- `npm run build` succeeds locally with no type errors.
- A deployed preview URL renders without runtime errors, and a browser-side Supabase call (not just the server-rendered page) succeeds — proves the `NEXT_PUBLIC_` env vars actually reached the client bundle.
- No secret value appears anywhere in git history (`git log -p -- .env*` is empty), and no one-off setup script containing a token was ever committed (spot-check any script added in Phase 4/5 for hardcoded secrets before merging).

## Risk Assessment

- **Risk:** Committing a real Supabase key by accident during setup.
  **Mitigation:** `.env.example` contains placeholders only; real values are
  set directly in the Vercel dashboard and local `.env.local` (gitignored
  from step 1, before any real value exists).
- **Risk:** `create-next-app` scaffolding directly into the repo root fails or, worse, silently reorganizes existing files.
  **Mitigation:** Scaffold into a temp directory first, then move files deliberately.

## Security Considerations

- Service-role key must never reach the browser bundle and must never be
  imported outside `lib/supabase/admin.ts` — confined to the Phase 4
  webhook route and the Phase 5 cron route.
- `NEXT_PUBLIC_`-prefixed vars are, by definition, public — never put the
  service-role key or any other secret behind that prefix.

## Next Steps

- Phase 2 depends on the Supabase project existing and both `server.ts`
  (Server Actions) and `admin.ts` (Phase 4/5 routes) being importable.
