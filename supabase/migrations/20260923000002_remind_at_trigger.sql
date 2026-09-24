-- remind_at derivation and reminder-reset-on-edit both live here, in a
-- single trigger, instead of app code or a generated column.
--
-- Why not a generated column: `start_at - (offset || ' minutes')::interval`
-- is not Postgres-immutable (timestamptz - interval depends on the session
-- TimeZone setting; int || text concatenation isn't immutable either), so
-- Postgres rejects it as a GENERATED ALWAYS AS expression. make_interval()
-- has no such restriction, and a BEFORE trigger has no immutability
-- requirement at all.
--
-- Why a trigger and not app code: this fires for every INSERT/UPDATE
-- regardless of which client made the change (Server Action, direct
-- PostgREST call, dashboard edit), so the reminder-reset invariant can't be
-- silently skipped by a code path that forgot to call it.

create or replace function public.set_remind_at_and_reset_reminder()
returns trigger
language plpgsql
as $$
begin
  new.remind_at := new.start_at - make_interval(mins => new.remind_offset_minutes);

  if tg_op = 'UPDATE' and (
    new.start_at is distinct from old.start_at
    or new.remind_offset_minutes is distinct from old.remind_offset_minutes
  ) then
    new.reminder_sent := false;
    new.reminder_claimed_at := null;
    new.reminder_attempts := 0;
  end if;

  return new;
end;
$$;

drop trigger if exists events_set_remind_at on public.events;
create trigger events_set_remind_at
  before insert or update on public.events
  for each row
  execute function public.set_remind_at_and_reset_reminder();
