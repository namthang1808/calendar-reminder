-- Shared-calendar RLS: "shared" means shared between the two known
-- accounts, not "any authenticated Supabase user." That requires BOTH:
--   1. public signup disabled in Supabase Auth project settings (not a
--      migration concern -- see README setup steps), and
--   2. this policy checking actual membership in public.users, not just
--      auth.uid() IS NOT NULL.
-- Either alone is an incomplete fix (see plan red-team Finding 1).

alter table public.users enable row level security;
alter table public.events enable row level security;

-- Membership check as a SECURITY DEFINER function, not an inline
-- `exists (select ... from users ...)` in each policy. A policy ON `users`
-- that queries `users` in its own USING clause re-triggers that same
-- policy's evaluation for the subquery, which queries `users` again --
-- infinite recursion ("infinite recursion detected in policy for relation
-- users"). A SECURITY DEFINER function runs its body with the function
-- owner's privileges, which bypasses RLS for that one internal query and
-- breaks the cycle. Every policy below (on both `users` and `events`)
-- reuses this function instead of repeating the subquery.
create or replace function public.is_known_member(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.users u where u.id = uid);
$$;

-- users: members may see the roster (needed for onboarding-status UI in
-- Phase 3's /settings page).
create policy users_select_members on public.users
  for select
  to authenticated
  using (public.is_known_member(auth.uid()));

-- A user may update only their OWN row (RLS), and even then only the
-- telegram_link_code column (column-level GRANT below) -- generating a
-- link code from the authenticated /settings page is legitimate
-- self-service, but writing telegram_chat_id must stay admin-only (it's
-- what the Phase 4 webhook sets after verifying a /start <code> exchange).
-- No INSERT/DELETE from authenticated or anon on users at all.
create policy users_update_own_link_code on public.users
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

revoke update on public.users from authenticated;
grant update (telegram_link_code) on public.users to authenticated;

-- events: any authenticated member has full CRUD on every event -- this is
-- the deliberate shared-calendar model, not per-owner isolation. Do not
-- "fix" this into `created_by = auth.uid()` scoping.
create policy events_select_members on public.events
  for select
  to authenticated
  using (public.is_known_member(auth.uid()));

create policy events_insert_members on public.events
  for insert
  to authenticated
  with check (public.is_known_member(auth.uid()));

create policy events_update_members on public.events
  for update
  to authenticated
  using (public.is_known_member(auth.uid()))
  with check (public.is_known_member(auth.uid()));

create policy events_delete_members on public.events
  for delete
  to authenticated
  using (public.is_known_member(auth.uid()));
