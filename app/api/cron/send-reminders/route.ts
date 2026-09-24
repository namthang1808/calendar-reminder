import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySecret } from "@/lib/verify-secret";
import { sendTelegramMessage } from "@/lib/telegram";
import { formatAsiaSaigon } from "@/lib/time";
import type { EventRow } from "@/lib/db/types";

const LEASE_MINUTES = 15;
const MAX_ATTEMPTS = 5;

export async function POST(request: NextRequest) {
  if (!verifySecret(request.headers.get("x-cron-secret"), process.env.CRON_SHARED_SECRET)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const admin = createAdminClient();

  // Atomic lease claim via a single SQL statement (see the
  // claim_due_reminders_fn migration) -- overlapping/duplicate cron
  // invocations can't double-claim a row, and a previously-failed send is
  // retried once its lease expires, bounded by reminder_attempts.
  const { data: claimed, error: claimError } = await admin.rpc("claim_due_reminders", {
    lease_minutes: LEASE_MINUTES,
    max_attempts: MAX_ATTEMPTS,
  });

  if (claimError) {
    return NextResponse.json({ ok: false, error: claimError.message }, { status: 500 });
  }

  const events = (claimed ?? []) as EventRow[];
  let sentCount = 0;
  let retriedCount = 0;

  if (events.length > 0) {
    const { data: recipients } = await admin
      .from("users")
      .select("telegram_chat_id")
      .not("telegram_chat_id", "is", null);

    const chatIds = (recipients ?? [])
      .map((r) => r.telegram_chat_id)
      .filter((id): id is number => id !== null);

    for (const event of events) {
      const messageText = `Reminder: ${event.title} at ${formatAsiaSaigon(event.start_at)}${
        event.location ? ` (${event.location})` : ""
      }`;

      // No onboarded recipients yet: nothing to send, but don't mark the
      // row sent -- retry once someone links their Telegram account.
      let allSucceeded = chatIds.length > 0;
      for (const chatId of chatIds) {
        try {
          await sendTelegramMessage(chatId, messageText);
        } catch (err) {
          allSucceeded = false;
          console.error(`Reminder send failed for event ${event.id}, chat ${chatId}:`, err);
        }
      }

      if (allSucceeded) {
        await admin.from("events").update({ reminder_sent: true }).eq("id", event.id);
        sentCount += 1;
      } else {
        // reminder_sent stays false; the lease is already consumed, so
        // this row is retried once reminder_claimed_at ages past
        // LEASE_MINUTES, up to MAX_ATTEMPTS.
        retriedCount += 1;
        if (event.reminder_attempts >= MAX_ATTEMPTS) {
          console.error(
            `Reminder for event ${event.id} exhausted ${MAX_ATTEMPTS} attempts and will not retry again.`,
          );
        }
      }
    }
  }

  await admin
    .from("system_status")
    .update({ last_successful_dispatch_at: new Date().toISOString() })
    .eq("id", 1);

  return NextResponse.json({
    ok: true,
    claimed: events.length,
    sent: sentCount,
    retried: retriedCount,
  });
}
