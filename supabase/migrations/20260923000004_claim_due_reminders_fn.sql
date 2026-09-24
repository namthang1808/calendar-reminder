-- Atomic lease claim as a single SQL statement (UPDATE ... RETURNING),
-- callable via admin.rpc('claim_due_reminders'). Doing the
-- reminder_claimed_at bump and the reminder_attempts increment as two
-- separate application-level UPDATE calls would reopen the exact race this
-- function exists to close -- an increment-by-column-reference isn't
-- expressible as a plain supabase-js .update() payload, so it belongs in
-- SQL, not app code.
create or replace function public.claim_due_reminders(
  lease_minutes integer,
  max_attempts integer
)
returns setof public.events
language sql
as $$
  update public.events
  set
    reminder_claimed_at = now(),
    reminder_attempts = reminder_attempts + 1
  where
    reminder_sent = false
    and remind_at <= now()
    and start_at > now()
    and (
      reminder_claimed_at is null
      or reminder_claimed_at < now() - make_interval(mins => lease_minutes)
    )
    and reminder_attempts < max_attempts
  returning *;
$$;

-- Only the service-role (admin) client calls this -- revoke from the
-- authenticated/anon roles that would otherwise inherit EXECUTE by default.
revoke all on function public.claim_due_reminders(integer, integer) from public, anon, authenticated;
