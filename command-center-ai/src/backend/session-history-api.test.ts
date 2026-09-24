import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchSessionHistory } from "./session-history-api.js";
import { createChatBackendConnection } from "./connection.js";

const connection = createChatBackendConnection({ apiBaseUrl: "http://localhost:8000" });

describe("session history api", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("rejects invalid session lookups before hitting the backend", async () => {
    await expect(fetchSessionHistory({ connection, sessionId: "undefined" })).rejects.toThrow(
      "valid session uid",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts numeric session lookups and forwards them to the backend", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(fetchSessionHistory({ connection, sessionId: 87 })).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/agent-sessions/87/history/"),
      expect.anything(),
    );
  });
});
