-- Single-row table tracking the last successful dispatch run, so a broken
-- pg_cron schedule is detectable (stale timestamp) rather than only
-- discoverable by a couple noticing a missed reminder.
create table if not exists public.system_status (
  id integer primary key default 1 check (id = 1), -- enforce a single row
  last_successful_dispatch_at timestamptz
);

insert into public.system_status (id, last_successful_dispatch_at)
values (1, null)
on conflict (id) do nothing;

alter table public.system_status enable row level security;
-- No policies granted to authenticated/anon -- only the admin client
-- (which bypasses RLS) reads/writes this table.
