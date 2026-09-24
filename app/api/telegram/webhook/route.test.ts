import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const adminState = vi.hoisted(() => ({ client: null as unknown as AdminClientMock }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => adminState.client,
}));

type UpdateSpy = (payload: unknown, col: string, val: unknown) => void;

type AdminClientMock = { from: (table: string) => unknown };

function makeAdminClient(opts: {
  matchedUserId: string | null;
  updateSpy: UpdateSpy;
}): AdminClientMock {
  const from = vi.fn((table: string) => {
    if (table !== "users") throw new Error(`Unexpected table in test mock: ${table}`);
    return {
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: opts.matchedUserId ? { id: opts.matchedUserId } : null,
            }),
        }),
      }),
      update: (payload: unknown) => ({
        eq: (col: string, val: unknown) => {
          opts.updateSpy(payload, col, val);
          return Promise.resolve({});
        },
      }),
    };
  });
  return { from };
}

function makeRequest(opts: { secretHeader?: string; body?: unknown; rawBody?: string }) {
  return new NextRequest("http://localhost/api/telegram/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opts.secretHeader ? { "X-Telegram-Bot-Api-Secret-Token": opts.secretHeader } : {}),
    },
    body: opts.rawBody ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
}

const privateStartUpdate = (code: string) => ({
  message: {
    text: `/start ${code}`,
    chat: { id: 987654321, type: "private" },
  },
});

describe("POST /api/telegram/webhook", () => {
  beforeEach(() => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "correct-webhook-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a request with a missing secret header (fails closed)", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ body: privateStartUpdate("abc") }));
    expect(res.status).toBe(401);
  });

  it("rejects a request with the wrong secret header", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ secretHeader: "wrong", body: privateStartUpdate("abc") }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects every request when TELEGRAM_WEBHOOK_SECRET is unset", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "");
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ secretHeader: "correct-webhook-secret", body: privateStartUpdate("abc") }),
    );
    expect(res.status).toBe(401);
  });

  it("ignores a /start update from a group chat -- never binds a group's chat.id as a reminder destination", async () => {
    const updateSpy = vi.fn();
    adminState.client = makeAdminClient({ matchedUserId: "user-1", updateSpy });

    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({
        secretHeader: "correct-webhook-secret",
        body: {
          message: { text: "/start abc", chat: { id: 111, type: "group" } },
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("ignores a message with no /start command", async () => {
    const updateSpy = vi.fn();
    adminState.client = makeAdminClient({ matchedUserId: "user-1", updateSpy });

    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({
        secretHeader: "correct-webhook-secret",
        body: { message: { text: "hello", chat: { id: 111, type: "private" } } },
      }),
    );

    expect(res.status).toBe(200);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("links the matching user's chat_id and clears the link code on a valid /start <code>", async () => {
    const updateSpy = vi.fn();
    adminState.client = makeAdminClient({ matchedUserId: "user-42", updateSpy });

    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ secretHeader: "correct-webhook-secret", body: privateStartUpdate("the-code") }),
    );

    expect(res.status).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith(
      { telegram_chat_id: 987654321, telegram_link_code: null },
      "id",
      "user-42",
    );
  });

  it("silently ignores /start <code> when no user matches -- no signup flow for a private 2-user app", async () => {
    const updateSpy = vi.fn();
    adminState.client = makeAdminClient({ matchedUserId: null, updateSpy });

    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({
        secretHeader: "correct-webhook-secret",
        body: privateStartUpdate("unknown-code"),
      }),
    );

    expect(res.status).toBe(200);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("does not crash on a malformed JSON body", async () => {
    adminState.client = makeAdminClient({ matchedUserId: null, updateSpy: vi.fn() });
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ secretHeader: "correct-webhook-secret", rawBody: "{not valid json" }),
    );
    expect(res.status).toBe(200);
  });
});
