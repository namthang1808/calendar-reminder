import { asiaSaigonDateKey } from "@/lib/time";
import { buildMonthGrid } from "@/lib/calendar-grid";
import { EventChip } from "@/components/event-chip";
import type { EventRow } from "@/lib/db/types";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarView({
  yearMonth,
  events,
  todayKey,
}: {
  yearMonth: string;
  events: EventRow[];
  todayKey: string;
}) {
  const days = buildMonthGrid(yearMonth);

  const eventsByDay = new Map<string, EventRow[]>();
  for (const event of events) {
    const key = asiaSaigonDateKey(event.start_at);
    const list = eventsByDay.get(key);
    if (list) {
      list.push(event);
    } else {
      eventsByDay.set(key, [event]);
    }
  }
  for (const list of eventsByDay.values()) {
    list.sort((a, b) => a.start_at.localeCompare(b.start_at));
  }

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="grid grid-cols-7 border-b border-border bg-surface-hover">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wide text-muted"
          >
            <span className="sm:hidden">{label[0]}</span>
            <span className="hidden sm:inline">{label}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const dayEvents = eventsByDay.get(day.dateKey) ?? [];
          const isToday = day.dateKey === todayKey;
          const isLastColumn = (i + 1) % 7 === 0;
          const isLastRow = i >= days.length - 7;

          return (
            <div
              key={day.dateKey}
              className={`flex min-h-24 flex-col gap-1 border-border p-1.5 sm:min-h-32 sm:p-2 ${
                isLastColumn ? "" : "border-r"
              } ${isLastRow ? "" : "border-b"} ${day.inCurrentMonth ? "" : "bg-background/60"}`}
            >
              <span
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm ${
                  isToday
                    ? "bg-accent font-medium text-accent-contrast"
                    : day.inCurrentMonth
                      ? "text-foreground"
                      : "text-muted"
                }`}
              >
                {day.dayOfMonth}
              </span>
              <div className="flex flex-col gap-1">
                {dayEvents.map((event) => (
                  <EventChip key={event.id} event={event} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
