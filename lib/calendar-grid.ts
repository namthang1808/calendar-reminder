// Pure calendar-layout math on Y/M/D integers, always via Date.UTC -- never
// touches the runtime's local timezone or a real instant. The caller is
// responsible for resolving "YYYY-MM" against Asia/Saigon first (see
// asiaSaigonToday/asiaSaigonDateKey in lib/time.ts); once that's a plain
// year-month string, laying out a grid for it needs no timezone at all.

export type CalendarDay = {
  dateKey: string; // "YYYY-MM-DD"
  dayOfMonth: number;
  inCurrentMonth: boolean;
};

/** Sunday-first 6-week (42-day) grid for a "YYYY-MM" month. */
export function buildMonthGrid(yearMonth: string): CalendarDay[] {
  const [yearStr, monthStr] = yearMonth.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr); // 1-12

  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const startWeekday = firstOfMonth.getUTCDay(); // 0 = Sunday
  const gridStart = new Date(Date.UTC(year, month - 1, 1 - startWeekday));

  const days: CalendarDay[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setUTCDate(gridStart.getUTCDate() + i);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    days.push({
      dateKey: `${y}-${m}-${day}`,
      dayOfMonth: d.getUTCDate(),
      inCurrentMonth: d.getUTCMonth() + 1 === month && y === year,
    });
  }
  return days;
}

export function shiftMonth(yearMonth: string, delta: number): string {
  const [yearStr, monthStr] = yearMonth.split("-");
  const d = new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthLabel(yearMonth: string): string {
  const [yearStr, monthStr] = yearMonth.split("-");
  const d = new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1, 1));
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}
