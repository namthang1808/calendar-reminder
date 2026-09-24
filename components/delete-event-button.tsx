"use client";

import { useTransition } from "react";
import { deleteEvent } from "@/app/actions/events";

export function DeleteEventButton({ eventId }: { eventId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      className="rounded-[calc(var(--radius-card)-0.25rem)] border border-danger px-4 py-2.5 text-sm font-medium text-danger transition-colors hover:bg-danger hover:text-accent-contrast disabled:pointer-events-none disabled:opacity-50"
      onClick={() => {
        if (!window.confirm("Delete this event? This can't be undone.")) return;
        startTransition(() => {
          void deleteEvent(eventId);
        });
      }}
    >
      {pending ? "Deleting…" : "Delete event"}
    </button>
  );
}
