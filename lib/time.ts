// Vietnam has no DST, so a fixed +07:00 offset is sufficient -- no timezone
// database dependency needed. Every place that reads or writes start_at/
// end_at (Server Actions, the Telegram message text) must go through these
// two functions rather than the platform's local Date parsing/formatting,
// since the Vercel runtime clock is UTC, not Asia/Saigon.

const OFFSET = "+07:00";

/**
 * Parses a naive `YYYY-MM-DDTHH:mm` value (as produced by an
 * `<input type="datetime-local">`) as Asia/Saigon wall-clock time.
 */
export function parseAsiaSaigon(input: string): Date {
  if (!input) {
    throw new Error("parseAsiaSaigon: empty input");
  }
  const withOffset = /[+-]\d{2}:\d{2}$|Z$/.test(input) ? input : `${input}${OFFSET}`;
  const date = new Date(withOffset);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`parseAsiaSaigon: invalid input "${input}"`);
  }
  return date;
}

/**
 * Formats an instant as Asia/Saigon wall-clock time for display (event
 * list, Telegram reminder message).
 */
export function formatAsiaSaigon(
  date: Date | string,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  },
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: "Asia/Saigon",
  }).format(d);
}

/**
 * Formats an instant as a `YYYY-MM-DDTHH:mm` value suitable for pre-filling
 * an `<input type="datetime-local">`, in Asia/Saigon wall-clock time.
 */
export function toDatetimeLocalValue(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Saigon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Asia/Saigon day boundaries (as UTC instants) for a date-range filter. */
export function asiaSaigonDayBounds(dateOnly: string): { start: Date; end: Date } {
  const start = parseAsiaSaigon(`${dateOnly}T00:00`);
  const end = parseAsiaSaigon(`${dateOnly}T23:59:59.999`);
  return { start, end };
}

/** "YYYY-MM-DD" for an instant, as an Asia/Saigon calendar date. Used to
 * bucket events onto the correct day cell in the month calendar. */
export function asiaSaigonDateKey(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Saigon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Today's date key ("YYYY-MM-DD") as an Asia/Saigon calendar date. */
export function asiaSaigonToday(): string {
  return asiaSaigonDateKey(new Date());
}

/** [start, end) UTC instant bounds for a "YYYY-MM" month, Asia/Saigon. */
export function asiaSaigonMonthBounds(yearMonth: string): { start: Date; end: Date } {
  const [yearStr, monthStr] = yearMonth.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr); // 1-12
  const start = parseAsiaSaigon(`${yearMonth}-01T00:00`);
  const nextYearMonth =
    month === 12
      ? `${year + 1}-01`
      : `${year}-${String(month + 1).padStart(2, "0")}`;
  const end = parseAsiaSaigon(`${nextYearMonth}-01T00:00`);
  return { start, end };
}
