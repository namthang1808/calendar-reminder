"use client";

import { useState, useTransition } from "react";
import { generateTelegramLinkCode } from "@/app/actions/telegram-link";

export function TelegramLinkPanel({
  isLinked,
  existingCode,
}: {
  isLinked: boolean;
  existingCode: string | null;
}) {
  const [code, setCode] = useState<string | null>(existingCode);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  const deepLink = code && botUsername ? `https://t.me/${botUsername}?start=${code}` : null;

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const result = await generateTelegramLinkCode();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCode(result.code);
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-6">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-serif text-lg font-semibold text-foreground">Telegram reminders</h2>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
            isLinked
              ? "bg-accent-soft text-accent"
              : "border border-border-strong text-muted"
          }`}
        >
          {isLinked ? "Linked" : "Not linked"}
        </span>
      </div>
      <p className="text-sm text-muted">
        {isLinked
          ? "Your Telegram account is linked. You'll receive reminder messages before each event."
          : "Link your Telegram account to receive reminder messages."}
      </p>
      {deepLink ? (
        <a
          href={deepLink}
          target="_blank"
          rel="noreferrer"
          className="rounded-[calc(var(--radius-card)-0.25rem)] bg-accent px-4 py-2.5 text-center text-sm font-medium text-accent-contrast shadow-[0_1px_2px_hsl(var(--shadow-color)/0.1)] transition-all hover:bg-accent-hover hover:-translate-y-px active:translate-y-0"
        >
          Open Telegram to {isLinked ? "re-link" : "link"}
        </a>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={handleGenerate}
        className="self-start text-sm font-medium text-muted underline-offset-4 transition-colors hover:text-accent hover:underline disabled:pointer-events-none disabled:opacity-50"
      >
        {pending ? "Generating…" : isLinked ? "Generate a new link code" : "Get a link code"}
      </button>
    </section>
  );
}
