import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CalendarView } from "@/components/calendar-view";
import { EventSearch } from "@/components/event-search";
import { asiaSaigonMonthBounds, asiaSaigonToday } from "@/lib/time";
import { formatMonthLabel, shiftMonth } from "@/lib/calendar-grid";
import { toIlikePattern } from "@/lib/search";
import type { EventRow } from "@/lib/db/types";

const MONTH_KEY = /^\d{4}-\d{2}$/;

function monthHref(month: string, q: string): string {
  const params = new URLSearchParams({ month });
  if (q) params.set("q", q);
  return `/events?${params.toString()}`;
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; q?: string }>;
}) {
  const params = await searchParams;
  const todayKey = asiaSaigonToday();
  const currentMonth = todayKey.slice(0, 7);
  const month = params.month && MONTH_KEY.test(params.month) ? params.month : currentMonth;
  const q = (params.q ?? "").slice(0, 100).trim();

  const { start, end } = asiaSaigonMonthBounds(month);
  const supabase = await createClient();

  let events: EventRow[] = [];

  if (q) {
    // Two separate bound .ilike() queries, merged and deduped in JS --
    // never a string-built .or() filter (PostgREST filter-injection risk).
    const pattern = toIlikePattern(q);
    const [titleResult, descriptionResult] = await Promise.all([
      supabase
        .from("events")
        .select("*")
        .ilike("title", pattern)
        .gte("start_at", start.toISOString())
        .lt("start_at", end.toISOString()),
      supabase
        .from("events")
        .select("*")
        .ilike("description", pattern)
        .gte("start_at", start.toISOString())
        .lt("start_at", end.toISOString()),
    ]);

    const merged = new Map<string, EventRow>();
    for (const row of titleResult.data ?? []) merged.set(row.id, row);
    for (const row of descriptionResult.data ?? []) merged.set(row.id, row);
    events = Array.from(merged.values());
  } else {
    const { data } = await supabase
      .from("events")
      .select("*")
      .gte("start_at", start.toISOString())
      .lt("start_at", end.toISOString());
    events = data ?? [];
  }

  const navLinkClass =
    "flex h-9 w-9 items-center justify-center rounded-[calc(var(--radius-card)-0.25rem)] border border-border text-foreground transition-colors hover:bg-surface-hover";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Events</h1>
        <Link
          href="/events/new"
          className="rounded-[calc(var(--radius-card)-0.25rem)] bg-accent px-4 py-2 text-sm font-medium text-accent-contrast shadow-[0_1px_2px_hsl(var(--shadow-color)/0.1)] transition-all hover:bg-accent-hover hover:-translate-y-px active:translate-y-0"
        >
          New event
        </Link>
      </div>

      <EventSearch defaultQuery={q} month={month} />

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link
            href={monthHref(shiftMonth(month, -1), q)}
            aria-label="Previous month"
            className={navLinkClass}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M10 3L5 8l5 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          <Link
            href={monthHref(shiftMonth(month, 1), q)}
            aria-label="Next month"
            className={navLinkClass}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M6 3l5 5-5 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          <h2 className="font-serif text-lg font-semibold text-foreground">
            {formatMonthLabel(month)}
          </h2>
        </div>
        {month !== currentMonth ? (
          <Link
            href={monthHref(currentMonth, q)}
            className="text-sm font-medium text-muted transition-colors hover:text-accent"
          >
            Today
          </Link>
        ) : null}
      </div>

      <CalendarView yearMonth={month} events={events} todayKey={todayKey} />
    </div>
  );
}
