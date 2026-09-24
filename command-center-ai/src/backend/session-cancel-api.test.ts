import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchMainSequenceAiAssistantResponse: vi.fn(),
}));

vi.mock("./assistant-endpoint.js", () => ({
  fetchMainSequenceAiAssistantResponse: mocks.fetchMainSequenceAiAssistantResponse,
}));

import { cancelChatSession } from "./session-cancel-api.js";
import { createChatBackendConnection } from "./connection.js";

const connection = createChatBackendConnection({ apiBaseUrl: "http://localhost:8000" });

describe("session cancel api", () => {
  beforeEach(() => {
    mocks.fetchMainSequenceAiAssistantResponse.mockReset();
    mocks.fetchMainSequenceAiAssistantResponse.mockResolvedValue({
      response: new Response("{}", { status: 200 }),
    });
  });

  it("uses uid fields in the cancel envelope", async () => {
    await cancelChatSession({
      connection,
      body: {
        runtimeSessionUid: "session-uid",
        threadId: "thread-uid",
        userUid: "user-uid",
      },
      organizationEnvironmentUid: "environment-uid",
    });

    const request = mocks.fetchMainSequenceAiAssistantResponse.mock.calls[0]?.[0];
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;

    expect(request.currentSessionId).toBe("session-uid");
    expect(request.organizationEnvironmentUid).toBe("environment-uid");
    expect(body).toMatchObject({
      runtime_session_uid: "session-uid",
      thread_id: "thread-uid",
      user_uid: "user-uid",
    });
    expect(body).not.toHaveProperty("runtime_session_id");
    expect(body).not.toHaveProperty("userId");
  });
});
