import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchAgentSessionRuntimeAccess: vi.fn(),
}));

vi.mock("./agent-session-runtime-access.js", () => ({
  fetchAgentSessionRuntimeAccess: mocks.fetchAgentSessionRuntimeAccess,
}));

import { resetAgentRuntimeServingState } from "./agent-runtime-serving.js";
import {
  clearMainSequenceAiResolvedRuntimeAccess,
  fetchMainSequenceAiAssistantResponse,
  fetchVerifiedAgentSessionRuntimeAccess,
  resolveMainSequenceAiAssistantAccess,
} from "./assistant-endpoint.js";
import { MainSequenceAiError } from "./error-source.js";
import { RuntimeInteractionBlockedError } from "./runtime-interaction.js";
import { createChatBackendConnection } from "./connection.js";

const connection = createChatBackendConnection({ apiBaseUrl: "http://localhost:8000" });

const organizationEnvironmentUid = "environment-uid-91";

function readyRuntimeAccess() {
  return {
    sessionId: "session-uid-91",
    codingAgentId: "agent-uid-91",
    codingAgentServiceId: null,
    mode: "token" as const,
    rpcUrl: "https://agent-runtime.example.test",
    token: "runtime-token",
    isReady: true,
    serviceRuntimeId: "runtime-uid-91",
    ready: null,
    reconciliation: null,
    runtimeInteraction: {
      state: "ready" as const,
      canSubmit: true,
      notice: null,
      operation: null,
      retryAfterMs: null,
    },
    runtimePresence: {
      phase: "serving" as const,
      replicas: { desired: 1, actual: 1 },
      detail: "The Agent is running.",
      observedAt: "2026-09-03T10:00:00Z",
      wake: null,
    },
    detail: null,
  };
}

describe("assistant endpoint resolver", () => {
  beforeEach(() => {
    clearMainSequenceAiResolvedRuntimeAccess();
    resetAgentRuntimeServingState();
    mocks.fetchAgentSessionRuntimeAccess.mockReset();
    vi.unstubAllGlobals();
  });

  it("resolves every Agent through its concrete AgentSession runtime access", async () => {
    mocks.fetchAgentSessionRuntimeAccess.mockResolvedValue(readyRuntimeAccess());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    const access = await resolveMainSequenceAiAssistantAccess({
      connection,
      currentSessionId: "session-uid-91",
      organizationEnvironmentUid,
      sessionToken: "session-token",
    });

    expect(mocks.fetchAgentSessionRuntimeAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-uid-91",
        token: "session-token",
      }),
    );
    expect(access.assistantEndpoint).toBe("https://agent-runtime.example.test");
    expect(access.codingAgentServiceId).toBeNull();
  });

  it("requires a concrete AgentSession id", async () => {
    await expect(
      resolveMainSequenceAiAssistantAccess({
        connection,
        organizationEnvironmentUid,
        sessionToken: "session-token",
      }),
    ).rejects.toThrow("requires a concrete session id");
  });

  it("sends requests to the runtime resolved from the AgentSession", async () => {
    mocks.fetchAgentSessionRuntimeAccess.mockResolvedValue(readyRuntimeAccess());
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchMainSequenceAiAssistantResponse({
      connection,
      currentSessionId: "session-uid-91",
      method: "POST",
      organizationEnvironmentUid,
      requestPath: "/api/chat",
      sessionToken: "session-token",
    });

    expect(result.url).toBe("https://agent-runtime.example.test/api/chat");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://agent-runtime.example.test/api/chat",
      expect.objectContaining({ method: "POST" }),
    );
    // ADR 093: the Agent is asked whether it answers before the message goes out.
    expect(fetchMock.mock.calls.map(([, init]) => (init as RequestInit).method)).toEqual([
      "GET",
      "POST",
    ]);
  });

  it("uses Agent runtime HTTP only after invoking the runtime transport", async () => {
    mocks.fetchAgentSessionRuntimeAccess.mockResolvedValue(readyRuntimeAccess());
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 200 }))
        .mockRejectedValue(new Error("network unavailable")),
    );

    const error = await fetchMainSequenceAiAssistantResponse({
      connection,
      currentSessionId: "session-uid-91",
      method: "POST",
      organizationEnvironmentUid,
      requestPath: "/api/chat",
      sessionToken: "session-token",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MainSequenceAiError);
    expect((error as MainSequenceAiError).source).toBe("assistant_backend_http");
    expect((error as MainSequenceAiError).code).toBe("agent_unreachable");
    expect((error as Error).message).toContain("Agent runtime HTTP");
  });

  it("holds the message while an Agent the platform calls ready does not answer", async () => {
    mocks.fetchAgentSessionRuntimeAccess.mockResolvedValue(readyRuntimeAccess());
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const error = await fetchMainSequenceAiAssistantResponse({
      connection,
      agentName: "Research Planner",
      currentSessionId: "session-uid-91",
      method: "POST",
      organizationEnvironmentUid,
      requestPath: "/api/chat",
      sessionToken: "session-token",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RuntimeInteractionBlockedError);
    const blocked = error as RuntimeInteractionBlockedError;
    expect(blocked.source).toBe("frontend_request_not_sent");
    expect(blocked.runtimeInteraction).toMatchObject({ state: "waking", canSubmit: false });
    expect(blocked.runtimeInteraction.notice?.message).toContain("Research Planner");
    expect(blocked.runtimePresence.wake?.state).toBe("in_progress");
    // Only the readiness check went out; the message itself was never sent.
    expect(fetchMock.mock.calls.map(([, init]) => (init as RequestInit).method)).toEqual(["GET"]);
  });

  it("treats a 502, 503 or 504 for an Agent that is not up as not serving", async () => {
    mocks.fetchAgentSessionRuntimeAccess.mockResolvedValue(readyRuntimeAccess());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

    const runtimeAccess = await fetchVerifiedAgentSessionRuntimeAccess({
      connection,
      agentName: "Research Planner",
      sessionId: "session-uid-91",
      token: "session-token",
    });

    expect(runtimeAccess.isReady).toBe(false);
    expect(runtimeAccess.runtimeInteraction.state).toBe("waking");
    // The platform's address and token are kept for the next check.
    expect(runtimeAccess.rpcUrl).toBe("https://agent-runtime.example.test");
    expect(runtimeAccess.token).toBe("runtime-token");
  });

  it("follows an idle Agent from waking to ready across the poller's checks", async () => {
    mocks.fetchAgentSessionRuntimeAccess.mockImplementation(async () => readyRuntimeAccess());
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const check = () =>
      fetchVerifiedAgentSessionRuntimeAccess({
        connection,
        agentName: "Research Planner",
        sessionId: "session-uid-91",
        token: "session-token",
      });

    const first = await check();
    const second = await check();
    const third = await check();

    expect(first.runtimeInteraction.state).toBe("waking");
    expect(second.runtimeInteraction.state).toBe("waking");
    // One wake, one clock: the elapsed time on screen does not restart with every check.
    expect(second.runtimePresence.wake?.requestedAt).toBe(first.runtimePresence.wake?.requestedAt);
    expect(third.runtimeInteraction).toMatchObject({ state: "ready", canSubmit: true });
    expect(third.isReady).toBe(true);

    // The message that was held goes out without asking the Agent a fourth time.
    await fetchMainSequenceAiAssistantResponse({
      connection,
      currentSessionId: "session-uid-91",
      method: "POST",
      organizationEnvironmentUid,
      requestPath: "/api/chat",
      sessionToken: "session-token",
    });
    expect(fetchMock.mock.calls.map(([, init]) => (init as RequestInit).method)).toEqual([
      "GET",
      "GET",
      "GET",
      "POST",
    ]);
  });

  it("never upgrades or re-checks a decision the platform already blocks", async () => {
    const blockedAccess = {
      ...readyRuntimeAccess(),
      runtimeInteraction: {
        state: "update_required" as const,
        canSubmit: false,
        notice: null,
        operation: null,
        retryAfterMs: null,
      },
    };
    mocks.fetchAgentSessionRuntimeAccess.mockResolvedValue(blockedAccess);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const runtimeAccess = await fetchVerifiedAgentSessionRuntimeAccess({
      connection,
      sessionId: "session-uid-91",
      token: "session-token",
    });

    expect(runtimeAccess).toBe(blockedAccess);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
