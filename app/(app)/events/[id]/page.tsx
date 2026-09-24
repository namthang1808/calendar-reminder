import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatAsiaSaigon } from "@/lib/time";
import { DeleteEventButton } from "@/components/delete-event-button";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("*").eq("id", id).single();

  if (!event) {
    notFound();
  }

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <Link
        href="/events"
        className="text-sm font-medium text-muted transition-colors hover:text-accent"
      >
        &larr; Back to calendar
      </Link>

      <div className="flex flex-col gap-5 rounded-card border border-border bg-surface p-6 sm:p-8">
        <h1 className="font-serif text-2xl font-semibold text-foreground">{event.title}</h1>

        <dl className="flex flex-col gap-4">
          <div>
            <dt className="text-sm font-medium text-muted">When</dt>
            <dd className="mt-0.5 text-foreground">
              {formatAsiaSaigon(event.start_at)}
              {event.end_at ? ` – ${formatAsiaSaigon(event.end_at)}` : ""}
            </dd>
          </div>

          {event.location ? (
            <div>
              <dt className="text-sm font-medium text-muted">Location</dt>
              <dd className="mt-0.5 text-foreground">{event.location}</dd>
            </div>
          ) : null}

          {event.description ? (
            <div>
              <dt className="text-sm font-medium text-muted">Notes</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-foreground">{event.description}</dd>
            </div>
          ) : null}

          <div>
            <dt className="text-sm font-medium text-muted">Reminder</dt>
            <dd className="mt-0.5 text-foreground">
              {event.remind_offset_minutes} minutes before
            </dd>
          </div>
        </dl>

        <div className="pt-2">
          <DeleteEventButton eventId={event.id} />
        </div>
      </div>
    </div>
  );
}
