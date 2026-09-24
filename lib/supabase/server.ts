import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/db/types";

/**
 * Anon-key client bound to the current user's session cookies.
 * Every read/write through this client is subject to RLS as that user.
 * Used by Server Actions and Server Components — never by the cron or
 * webhook routes, which need lib/supabase/admin.ts instead.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component that can't write cookies;
            // safe to ignore when middleware refreshes the session.
          }
        },
      },
    },
  );
}
