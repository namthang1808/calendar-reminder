"use client";

import { useActionState } from "react";
import { createEvent, type EventFormState } from "@/app/actions/events";

const initialState: EventFormState = { error: null };

const inputClass =
  "rounded-[calc(var(--radius-card)-0.25rem)] border border-border bg-background px-3.5 py-2.5 text-base text-foreground transition-colors placeholder:text-muted focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";
const labelClass = "text-sm font-medium text-foreground";

export function EventForm() {
  const [state, formAction, pending] = useActionState(createEvent, initialState);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5 rounded-card border border-border bg-surface p-6 sm:p-8"
    >
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Title *</span>
        <input
          type="text"
          name="title"
          required
          placeholder="Dinner with friends"
          className={inputClass}
        />
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Start *</span>
          <input type="datetime-local" name="start_at" required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>End (optional)</span>
          <input type="datetime-local" name="end_at" className={inputClass} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Location (optional)</span>
        <input type="text" name="location" placeholder="District 1" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Notes (optional)</span>
        <textarea name="description" rows={3} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Remind me before (minutes)</span>
        <input
          type="number"
          name="remind_offset_minutes"
          min={0}
          defaultValue={60}
          className={`${inputClass} max-w-32`}
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
        className="self-start rounded-[calc(var(--radius-card)-0.25rem)] bg-accent px-5 py-2.5 text-base font-medium text-accent-contrast shadow-[0_1px_2px_hsl(var(--shadow-color)/0.1)] transition-all hover:bg-accent-hover hover:-translate-y-px active:translate-y-0 disabled:pointer-events-none disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create event"}
      </button>
    </form>
  );
}
