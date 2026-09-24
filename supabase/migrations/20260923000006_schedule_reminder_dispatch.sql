-- Schedules the reminder dispatcher every 10 minutes via pg_cron + pg_net,
-- calling the production Next.js route directly (not a separate Supabase
-- Edge Function) -- see plans/260923-0845-calendar-remind-app/
-- research/researcher-01-scheduling.md for why (Vercel Hobby Cron cannot
-- run at 10-minute granularity at all; pg_cron's 1-minute floor can).
--
-- Guarded: this only schedules the job if both Vault secrets already
-- exist, so a fresh `supabase db push` on a database that hasn't had its
-- production URL/secret configured yet doesn't fail or schedule a job that
-- would 404/401 on every run. Re-run this migration (or the equivalent SQL
-- manually) after creating the Vault secrets during Phase 5/6 setup.

create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (select 1 from vault.decrypted_secrets where name = 'reminder_endpoint_url')
     and exists (select 1 from vault.decrypted_secrets where name = 'cron_shared_secret')
  then
    perform cron.schedule(
      'send-due-reminders',
      '*/10 * * * *',
      $cron$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_endpoint_url'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_shared_secret')
        ),
        body := '{}'::jsonb
      ) as request_id;
      $cron$
    );
  end if;
end;
$$;
