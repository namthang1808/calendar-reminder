import { describe, expect, it } from "vitest";
import { verifySecret } from "@/lib/verify-secret";

describe("verifySecret", () => {
  it("returns true when the received value matches the expected secret", () => {
    expect(verifySecret("correct-secret", "correct-secret")).toBe(true);
  });

  it("returns false on a mismatched value", () => {
    expect(verifySecret("wrong-secret", "correct-secret")).toBe(false);
  });

  it("fails closed when the expected env var is unset (undefined) -- the exact scenario a preview deployment missing CRON_SHARED_SECRET would hit", () => {
    expect(verifySecret("anything", undefined)).toBe(false);
  });

  it("fails closed when the received header is missing (null)", () => {
    expect(verifySecret(null, "correct-secret")).toBe(false);
  });

  it("fails closed when both are missing, rather than treating absence as a match", () => {
    expect(verifySecret(null, undefined)).toBe(false);
  });

  it("fails closed on an empty-string expected secret", () => {
    expect(verifySecret("", "")).toBe(false);
  });

  it("does not throw on a length mismatch (would crash node:crypto's timingSafeEqual if unguarded)", () => {
    expect(() => verifySecret("short", "a-much-longer-secret-value")).not.toThrow();
    expect(verifySecret("short", "a-much-longer-secret-value")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(verifySecret("Secret", "secret")).toBe(false);
  });
});
