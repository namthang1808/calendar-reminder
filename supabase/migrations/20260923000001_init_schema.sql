-- Calendar Remind: core schema for a 2-user shared calendar.
-- users mirrors auth.users for the two fixed partner accounts.
-- events is a shared calendar: any authenticated member may read/write any
-- row (see rls_policies migration) -- this is intentionally not per-owner.

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  telegram_chat_id bigint,
  telegram_link_code text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  location text,
  start_at timestamptz not null,
  end_at timestamptz,
  created_by uuid not null references public.users (id),
  remind_offset_minutes integer not null default 60
    constraint events_remind_offset_minutes_check check (remind_offset_minutes >= 0),
  remind_at timestamptz, -- trigger-maintained, see remind_at_trigger migration
  reminder_sent boolean not null default false,
  reminder_claimed_at timestamptz,
  reminder_attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_start_at_idx on public.events (start_at);
create index if not exists events_reminder_dispatch_idx
  on public.events (reminder_sent, remind_at);

-- updated_at maintenance, independent of the remind_at/reminder-reset logic.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
  before update on public.events
  for each row
  execute function public.set_updated_at();
