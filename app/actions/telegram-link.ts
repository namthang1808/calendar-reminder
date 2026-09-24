"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function generateLinkCode(): string {
  return randomBytes(9).toString("base64url"); // 12 URL-safe chars
}

/**
 * Generates (or regenerates, to re-link) a Telegram deep-link code for the
 * logged-in user. This is the only column of `users` an authenticated
 * session may write (see the column-level GRANT in the rls_policies
 * migration) -- telegram_chat_id itself is written only by the Phase 4
 * webhook, and only when it finds a non-null telegram_link_code matching
 * an incoming /start <code>. Generating a fresh code here is therefore
 * both "start onboarding" and "re-link" -- issuing a new code is what
 * authorizes the webhook to overwrite chat_id, whether or not one was
 * already set.
 */
export async function generateTelegramLinkCode(): Promise<
  { error: string } | { code: string }
> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be logged in." };
  }

  const code = generateLinkCode();
  const { error } = await supabase
    .from("users")
    .update({ telegram_link_code: code })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/settings");
  return { code };
}
