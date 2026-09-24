import { timingSafeEqual } from "node:crypto";

/**
 * Timing-safe comparison that fails closed: returns false (never throws or
 * skips the check) when either the expected secret or the received value is
 * missing/empty, e.g. an env var unset in a preview environment.
 */
export function verifySecret(received: string | null, expected: string | undefined): boolean {
  if (!received || !expected) return false;

  const receivedBuf = Buffer.from(received);
  const expectedBuf = Buffer.from(expected);
  if (receivedBuf.length !== expectedBuf.length) return false;

  return timingSafeEqual(receivedBuf, expectedBuf);
}
