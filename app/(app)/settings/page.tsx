import { createClient } from "@/lib/supabase/server";
import { TelegramLinkPanel } from "@/components/telegram-link-panel";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("telegram_chat_id, telegram_link_code")
    .eq("id", user.id)
    .single();

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Settings</h1>
      <TelegramLinkPanel
        isLinked={Boolean(profile?.telegram_chat_id)}
        existingCode={profile?.telegram_link_code ?? null}
      />
    </div>
  );
}
