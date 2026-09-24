import { describe, expect, it } from "vitest";
import { buildMonthGrid, shiftMonth, formatMonthLabel } from "@/lib/calendar-grid";

describe("buildMonthGrid", () => {
  it("returns a fixed 42-cell grid", () => {
    expect(buildMonthGrid("2026-09")).toHaveLength(42);
  });

  it("starts the grid on the Sunday on/before the 1st", () => {
    // 2026-09-01 is a Tuesday, so the grid should start 2026-08-30 (Sunday).
    const days = buildMonthGrid("2026-09");
    expect(days[0].dateKey).toBe("2026-08-30");
  });

  it("marks every day of the target month as inCurrentMonth, leading/trailing days as not", () => {
    const days = buildMonthGrid("2026-09");
    const inMonth = days.filter((d) => d.inCurrentMonth);
    expect(inMonth).toHaveLength(30); // September has 30 days
    expect(inMonth[0].dateKey).toBe("2026-09-01");
    expect(inMonth[inMonth.length - 1].dateKey).toBe("2026-09-30");
    expect(days[0].inCurrentMonth).toBe(false);
  });

  it("produces consecutive calendar dates with no gaps or duplicates", () => {
    const days = buildMonthGrid("2026-09");
    const keys = days.map((d) => d.dateKey);
    expect(new Set(keys).size).toBe(42);
    for (let i = 1; i < days.length; i++) {
      const prev = new Date(`${days[i - 1].dateKey}T00:00:00Z`);
      const curr = new Date(`${days[i].dateKey}T00:00:00Z`);
      expect(curr.getTime() - prev.getTime()).toBe(24 * 60 * 60 * 1000);
    }
  });

  it("handles a December-to-January month boundary correctly", () => {
    const days = buildMonthGrid("2026-12");
    const inMonth = days.filter((d) => d.inCurrentMonth);
    expect(inMonth[0].dateKey).toBe("2026-12-01");
    expect(inMonth[inMonth.length - 1].dateKey).toBe("2026-12-31");
  });
});

describe("shiftMonth", () => {
  it("moves forward a month", () => {
    expect(shiftMonth("2026-09", 1)).toBe("2026-10");
  });

  it("moves backward a month", () => {
    expect(shiftMonth("2026-09", -1)).toBe("2026-08");
  });

  it("rolls over the year forward at December", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("rolls over the year backward at January", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("formatMonthLabel", () => {
  it("formats a year-month as a readable label", () => {
    expect(formatMonthLabel("2026-09")).toBe("September 2026");
  });

  it("does not shift the month due to UTC/local timezone mismatch", () => {
    // The classic bug: constructing a Date from Y/M/D and formatting it in
    // a non-UTC timezone can roll the date to the adjacent month.
    expect(formatMonthLabel("2026-01")).toBe("January 2026");
    expect(formatMonthLabel("2026-12")).toBe("December 2026");
  });
});
