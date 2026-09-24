import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySecret } from "@/lib/verify-secret";

type TelegramUpdate = {
  message?: {
    text?: string;
    chat: { id: number; type: string };
  };
};

export async function POST(request: NextRequest) {
  const secretHeader = request.headers.get("x-telegram-bot-api-secret-token");
  if (!verifySecret(secretHeader, process.env.TELEGRAM_WEBHOOK_SECRET)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  const message = update?.message;

  // Private chats only -- ignore group/channel updates so a group's
  // chat.id can never be bound as a "partner's" reminder destination.
  if (!message || message.chat.type !== "private" || !message.text) {
    return NextResponse.json({ ok: true });
  }

  const match = /^\/start\s+(\S+)/.exec(message.text);
  if (!match) {
    return NextResponse.json({ ok: true });
  }
  const code = match[1];

  const admin = createAdminClient();
  const { data: user } = await admin
    .from("users")
    .select("id")
    .eq("telegram_link_code", code)
    .single();

  if (user) {
    await admin
      .from("users")
      .update({ telegram_chat_id: message.chat.id, telegram_link_code: null })
      .eq("id", user.id);
  }
  // Unmatched or already-consumed code: ignore silently. This is a private
  // 2-user app, not a public bot with a signup flow.

  return NextResponse.json({ ok: true });
}
