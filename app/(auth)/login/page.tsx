"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/actions/auth";

const initialState: LoginState = { error: null };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-8 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06),0_8px_24px_hsl(var(--shadow-color)/0.08)]">
        <h1 className="font-serif text-3xl font-semibold text-foreground">Calendar Remind</h1>
        <p className="mt-2 text-sm text-muted">Your shared calendar, just for two.</p>

        <form action={formAction} className="mt-8 flex flex-col gap-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="rounded-[calc(var(--radius-card)-0.25rem)] border border-border bg-background px-3.5 py-2.5 text-base text-foreground transition-colors placeholder:text-muted focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Password</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="rounded-[calc(var(--radius-card)-0.25rem)] border border-border bg-background px-3.5 py-2.5 text-base text-foreground transition-colors placeholder:text-muted focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
          </label>

          {state.error ? (
            <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
              {state.error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="mt-1 rounded-[calc(var(--radius-card)-0.25rem)] bg-accent px-4 py-2.5 text-base font-medium text-accent-contrast shadow-[0_1px_2px_hsl(var(--shadow-color)/0.1)] transition-all hover:bg-accent-hover hover:-translate-y-px active:translate-y-0 disabled:pointer-events-none disabled:opacity-50"
          >
            {pending ? "Logging in…" : "Log in"}
          </button>
        </form>
      </div>
    </main>
  );
}
