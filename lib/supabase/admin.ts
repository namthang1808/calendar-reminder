import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

/**
 * Service-role client that bypasses RLS entirely.
 *
 * Exactly two call sites are legitimate:
 *  - app/api/telegram/webhook/route.ts (no user session exists yet)
 *  - app/api/cron/send-reminders/route.ts (trusted scheduled job)
 *
 * Never import this from a Server Action, Server Component, or anything
 * reachable from a user-scoped request — that would bypass the shared-but-
 * membership-checked RLS policy from the database schema.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
