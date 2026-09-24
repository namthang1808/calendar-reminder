export async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set.");
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  if (res.status === 429) {
    const body = (await res.json().catch(() => null)) as
      | { parameters?: { retry_after?: number } }
      | null;
    const retryAfterSeconds = body?.parameters?.retry_after ?? 1;
    await new Promise((resolve) => setTimeout(resolve, retryAfterSeconds * 1000));
    const retryRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!retryRes.ok) {
      throw new Error(`Telegram sendMessage failed after retry: ${retryRes.status}`);
    }
    return;
  }

  if (!res.ok) {
    throw new Error(`Telegram sendMessage failed: ${res.status}`);
  }
}
