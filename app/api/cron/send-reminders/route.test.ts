import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// vi.mock factories are hoisted above imports, so the mutable state they
// close over must be created with vi.hoisted() to exist in time.
const adminState = vi.hoisted(() => ({ client: null as unknown as AdminClientMock }));
const telegramState = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => adminState.client,
}));
vi.mock("@/lib/telegram", () => ({
  sendTelegramMessage: (...args: [number, string]) => telegramState.send(...args),
}));

type EventRow = {
  id: string;
  title: string;
  location: string | null;
  start_at: string;
  reminder_attempts: number;
};

type UpdateSpy = (payload: unknown, col: string, val: unknown) => void;

type AdminClientMock = {
  rpc: (name: string, args: unknown) => Promise<{ data: EventRow[]; error: unknown }>;
  from: (table: string) => unknown;
};

function makeAdminClient(opts: {
  claimedEvents: EventRow[];
  claimError?: { message: string } | null;
  chatIds: number[];
  eventsUpdateSpy: UpdateSpy;
  systemStatusUpdateSpy: UpdateSpy;
}): AdminClientMock {
  const from = vi.fn((table: string) => {
    if (table === "users") {
      return {
        select: () => ({
          not: () =>
            Promise.resolve({ data: opts.chatIds.map((id) => ({ telegram_chat_id: id })) }),
        }),
      };
    }
    if (table === "events") {
      return {
        update: (payload: unknown) => ({
          eq: (col: string, val: unknown) => {
            opts.eventsUpdateSpy(payload, col, val);
            return Promise.resolve({});
          },
        }),
      };
    }
    if (table === "system_status") {
      return {
        update: (payload: unknown) => ({
          eq: (col: string, val: unknown) => {
            opts.systemStatusUpdateSpy(payload, col, val);
            return Promise.resolve({});
          },
        }),
      };
    }
    throw new Error(`Unexpected table in test mock: ${table}`);
  });

  return {
    rpc: vi.fn(() =>
      Promise.resolve({ data: opts.claimedEvents, error: opts.claimError ?? null }),
    ),
    from,
  };
}

function makeRequest(secretHeader?: string) {
  return new NextRequest("http://localhost/api/cron/send-reminders", {
    method: "POST",
    headers: secretHeader ? { "x-cron-secret": secretHeader } : {},
  });
}

const sampleEvent: EventRow = {
  id: "event-1",
  title: "Dinner with friends",
  location: "District 1",
  start_at: "2026-09-25T12:00:00.000Z",
  reminder_attempts: 1,
};

describe("POST /api/cron/send-reminders", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SHARED_SECRET", "correct-cron-secret");
    telegramState.send.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a request with a missing secret header (fails closed)", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest(undefined));
    expect(res.status).toBe(401);
  });

  it("rejects a request with the wrong secret header", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("rejects every request when CRON_SHARED_SECRET is unset, even a header of the literal string 'undefined'", async () => {
    vi.stubEnv("CRON_SHARED_SECRET", "");
    const { POST } = await import("./route");
    const res = await POST(makeRequest("undefined"));
    expect(res.status).toBe(401);
  });

  it("marks an event reminder_sent only after every onboarded recipient's send succeeds", async () => {
    const eventsUpdateSpy = vi.fn();
    const systemStatusUpdateSpy = vi.fn();
    adminState.client = makeAdminClient({
      claimedEvents: [sampleEvent],
      chatIds: [111, 222],
      eventsUpdateSpy,
      systemStatusUpdateSpy,
    });
    telegramState.send.mockResolvedValue(undefined);

    const { POST } = await import("./route");
    const res = await POST(makeRequest("correct-cron-secret"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, claimed: 1, sent: 1, retried: 0 });
    expect(telegramState.send).toHaveBeenCalledTimes(2);
    expect(eventsUpdateSpy).toHaveBeenCalledWith(
      { reminder_sent: true },
      "id",
      sampleEvent.id,
    );
    expect(systemStatusUpdateSpy).toHaveBeenCalledOnce();
  });

  it("leaves reminder_sent false (retries later) when a send fails for one recipient -- the Critical red-team fix, not the original at-most-once behavior", async () => {
    const eventsUpdateSpy = vi.fn();
    const systemStatusUpdateSpy = vi.fn();
    adminState.client = makeAdminClient({
      claimedEvents: [sampleEvent],
      chatIds: [111, 222],
      eventsUpdateSpy,
      systemStatusUpdateSpy,
    });
    telegramState.send.mockImplementation(async (chatId: number) => {
      if (chatId === 222) throw new Error("Telegram 500");
    });

    const { POST } = await import("./route");
    const res = await POST(makeRequest("correct-cron-secret"));
    const body = await res.json();

    expect(body).toMatchObject({ ok: true, claimed: 1, sent: 0, retried: 1 });
    // The row must NOT be marked reminder_sent: true on a partial failure.
    expect(eventsUpdateSpy).not.toHaveBeenCalledWith(
      { reminder_sent: true },
      "id",
      sampleEvent.id,
    );
  });

  it("does not send anything and does not mark reminder_sent when there are zero onboarded recipients, but still updates dispatch status", async () => {
    const eventsUpdateSpy = vi.fn();
    const systemStatusUpdateSpy = vi.fn();
    adminState.client = makeAdminClient({
      claimedEvents: [sampleEvent],
      chatIds: [],
      eventsUpdateSpy,
      systemStatusUpdateSpy,
    });

    const { POST } = await import("./route");
    const res = await POST(makeRequest("correct-cron-secret"));
    const body = await res.json();

    expect(body).toMatchObject({ claimed: 1, sent: 0, retried: 1 });
    expect(telegramState.send).not.toHaveBeenCalled();
    expect(eventsUpdateSpy).not.toHaveBeenCalled();
    expect(systemStatusUpdateSpy).toHaveBeenCalledOnce();
  });

  it("returns a clean 200 with zero counts when nothing is due, without querying recipients", async () => {
    const eventsUpdateSpy = vi.fn();
    const systemStatusUpdateSpy = vi.fn();
    const fromSpy = vi.fn();
    adminState.client = makeAdminClient({
      claimedEvents: [],
      chatIds: [],
      eventsUpdateSpy,
      systemStatusUpdateSpy,
    });
    // Wrap `from` to also detect a "users" call, which should never happen
    // when there are zero claimed events.
    const originalFrom = adminState.client.from;
    adminState.client.from = vi.fn((table: string) => {
      fromSpy(table);
      return originalFrom(table);
    });

    const { POST } = await import("./route");
    const res = await POST(makeRequest("correct-cron-secret"));
    const body = await res.json();

    expect(body).toMatchObject({ ok: true, claimed: 0, sent: 0, retried: 0 });
    expect(fromSpy).not.toHaveBeenCalledWith("users");
    expect(systemStatusUpdateSpy).toHaveBeenCalledOnce();
  });

  it("returns 500 and stops processing when the claim RPC itself errors", async () => {
    adminState.client = makeAdminClient({
      claimedEvents: [],
      claimError: { message: "db unreachable" },
      chatIds: [],
      eventsUpdateSpy: vi.fn(),
      systemStatusUpdateSpy: vi.fn(),
    });

    const { POST } = await import("./route");
    const res = await POST(makeRequest("correct-cron-secret"));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(telegramState.send).not.toHaveBeenCalled();
  });
});
