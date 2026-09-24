import { describe, expect, it } from "vitest";
import {
  parseAsiaSaigon,
  formatAsiaSaigon,
  toDatetimeLocalValue,
  asiaSaigonDayBounds,
} from "@/lib/time";

describe("parseAsiaSaigon", () => {
  it("treats a naive datetime-local value as +07:00, not UTC", () => {
    // 19:00 in Saigon (+07:00) is 12:00 UTC the same day.
    const result = parseAsiaSaigon("2026-09-25T19:00");
    expect(result.toISOString()).toBe("2026-09-25T12:00:00.000Z");
  });

  it("round-trips through formatAsiaSaigon back to the same wall-clock time", () => {
    const input = "2026-12-31T23:30";
    const parsed = parseAsiaSaigon(input);
    const formatted = formatAsiaSaigon(parsed, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    expect(formatted).toBe("23:30");
  });

  it("throws on empty input rather than silently producing an invalid date", () => {
    expect(() => parseAsiaSaigon("")).toThrow();
  });

  it("throws on an unparseable string rather than returning Invalid Date", () => {
    expect(() => parseAsiaSaigon("not-a-date")).toThrow();
  });

  it("respects an explicit offset instead of forcing +07:00", () => {
    // If a value already carries a UTC designator, don't double-offset it.
    const result = parseAsiaSaigon("2026-09-25T12:00:00.000Z");
    expect(result.toISOString()).toBe("2026-09-25T12:00:00.000Z");
  });
});

describe("formatAsiaSaigon", () => {
  it("formats a UTC instant as Asia/Saigon wall-clock time", () => {
    // 12:00 UTC = 19:00 in Saigon (+07:00).
    const formatted = formatAsiaSaigon("2026-09-25T12:00:00.000Z", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    expect(formatted).toBe("19:00");
  });

  it("accepts a Date object as well as an ISO string", () => {
    const date = new Date("2026-09-25T12:00:00.000Z");
    const formatted = formatAsiaSaigon(date, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    expect(formatted).toBe("19:00");
  });
});

describe("toDatetimeLocalValue", () => {
  it("produces a value that re-parses to the same instant (form pre-fill round-trip)", () => {
    const original = parseAsiaSaigon("2026-09-25T19:00");
    const localValue = toDatetimeLocalValue(original);
    expect(localValue).toBe("2026-09-25T19:00");
    const reparsed = parseAsiaSaigon(localValue);
    expect(reparsed.toISOString()).toBe(original.toISOString());
  });

  it("pads single-digit month/day/hour/minute", () => {
    const date = new Date("2026-01-05T01:05:00.000Z"); // 08:05 Saigon
    expect(toDatetimeLocalValue(date)).toBe("2026-01-05T08:05");
  });
});

describe("asiaSaigonDayBounds", () => {
  it("returns UTC instants for Asia/Saigon midnight-to-midnight, not UTC midnight", () => {
    const { start, end } = asiaSaigonDayBounds("2026-09-25");
    // Saigon 2026-09-25 00:00 = UTC 2026-09-24 17:00.
    expect(start.toISOString()).toBe("2026-09-24T17:00:00.000Z");
    // Saigon 2026-09-25 23:59:59.999 = UTC 2026-09-25 16:59:59.999.
    expect(end.toISOString()).toBe("2026-09-25T16:59:59.999Z");
  });

  it("excludes an event that falls in the previous UTC day but the correct Saigon day", () => {
    // 2026-09-25 06:00 Saigon (an early-morning event) is 2026-09-24 23:00 UTC --
    // a naive UTC-midnight boundary would wrongly exclude it from "2026-09-25".
    const eventAt = parseAsiaSaigon("2026-09-25T06:00");
    const { start, end } = asiaSaigonDayBounds("2026-09-25");
    expect(eventAt.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(eventAt.getTime()).toBeLessThanOrEqual(end.getTime());
  });
});
