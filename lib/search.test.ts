import { describe, expect, it } from "vitest";
import { escapeLikePattern, toIlikePattern } from "@/lib/search";

describe("escapeLikePattern", () => {
  it("escapes the percent wildcard", () => {
    expect(escapeLikePattern("50%")).toBe("50\\%");
  });

  it("escapes the underscore wildcard", () => {
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
  });

  it("escapes a literal backslash", () => {
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeLikePattern("dinner with friends")).toBe("dinner with friends");
  });

  it("escapes multiple special characters in one term", () => {
    expect(escapeLikePattern("100%_off\\sale")).toBe("100\\%\\_off\\\\sale");
  });
});

describe("toIlikePattern", () => {
  it("wraps the escaped term in wildcard percent signs", () => {
    expect(toIlikePattern("dinner")).toBe("%dinner%");
  });

  it("escapes wildcards inside the term before wrapping, so they match literally", () => {
    // A search for a literal "50%" must not become a broader wildcard match.
    expect(toIlikePattern("50%")).toBe("%50\\%%");
  });

  it("does not let a PostgREST filter-syntax character change query structure", () => {
    // This is a value passed to a bound .ilike(column, pattern) parameter,
    // never string-concatenated into a filter expression, but the pattern
    // itself must still not be corrupted by these characters.
    const term = "party,at(the)office";
    const pattern = toIlikePattern(term);
    expect(pattern).toBe(`%${term}%`);
  });
});
