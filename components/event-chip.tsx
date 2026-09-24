import Link from "next/link";
import { formatAsiaSaigon } from "@/lib/time";
import type { EventRow } from "@/lib/db/types";

export function EventChip({ event }: { event: EventRow }) {
  return (
    <Link
      href={`/events/${event.id}`}
      title={event.title}
      className="truncate rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent transition-colors hover:bg-accent hover:text-accent-contrast"
    >
      <span className="font-medium">
        {formatAsiaSaigon(event.start_at, { hour: "numeric", minute: "2-digit" })}
      </span>{" "}
      {event.title}
    </Link>
  );
}
