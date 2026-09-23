import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchAgentSessionRuntimeAccess } from "./agent-session-runtime-access.js";
import { MainSequenceAiError } from "./error-source.js";
import { createChatBackendConnection } from "./connection.js";

const connection = createChatBackendConnection({ apiBaseUrl: "http://localhost:8000" });

function readyRuntimeEnvelope() {
  return {
    runtime_interaction: {
      state: "ready",
      can_submit: true,
      notice: null,
      operation: null,
      retry_after_ms: null,
    },
    runtime_presence: {
      phase: "serving",
      replicas: { desired: 1, actual: 1 },
      detail: "The agent is running.",
      observed_at: "2026-09-03T10:00:00Z",
      wake: null,
    },
  };
}

function wakingRuntimeEnvelope() {
  return {
    runtime_interaction: {
      state: "waking",
      can_submit: false,
      notice: null,
      operation: null,
      retry_after_ms: 2000,
    },
    runtime_presence: {
      phase: "provisioning",
      replicas: { desired: 1, actual: 0 },
      detail: "The Agent runtime is starting.",
      observed_at: "2026-09-03T10:00:00Z",
      wake: null,
    },
  };
}

describe("command center runtime access contract", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("normalizes the AgentSession runtime-access payload", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ...readyRuntimeEnvelope(),
          coding_agent_service_id: "91",
          coding_agent_id: "executor-agent",
          mode: "token",
          rpc_url: "https://executor.coding-agent.main-sequence.app/",
          token: "signed-token",
          is_ready: true,
          service_runtime_uid: "runtime-uid-123",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    const runtimeAccess = await fetchAgentSessionRuntimeAccess({
      connection,
      sessionId: "session-uid-91",
    });

    expect(runtimeAccess.sessionId).toBe("session-uid-91");
    expect(runtimeAccess.isReady).toBe(true);
    expect(runtimeAccess.serviceRuntimeId).toBe("runtime-uid-123");
    expect(runtimeAccess).not.toHaveProperty("imageDrift");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/agent-sessions/session-uid-91/resolve-runtime-access/"),
      expect.objectContaining({
        body: "{}",
        method: "POST",
      }),
    );
  });

  it("preserves the canonical unavailable runtime state", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ...wakingRuntimeEnvelope(),
          coding_agent_service_uid: "00000000-0000-4000-8000-000000000091",
          mode: "unavailable",
          rpc_url: null,
          token: null,
          is_ready: false,
          ready: {
            ready: false,
            detail: "The Agent runtime is starting.",
          },
          reconciliation: { queued: true },
          detail: "The Agent runtime is starting.",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const runtimeAccess = await fetchAgentSessionRuntimeAccess({
      connection,
      sessionId: "session-uid-91",
    });

    expect(runtimeAccess).toMatchObject({
      codingAgentServiceId: "00000000-0000-4000-8000-000000000091",
      detail: "The Agent runtime is starting.",
      isReady: false,
      mode: "unavailable",
      ready: {
        ready: false,
        detail: "The Agent runtime is starting.",
      },
      reconciliation: { queued: true },
      rpcUrl: null,
      token: null,
    });
  });

  it("normalizes the backend-owned runtime interaction envelope", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          mode: "unavailable",
          is_ready: false,
          runtime_presence: {
            phase: "not_deployed",
            replicas: { desired: null, actual: null },
            detail: "This agent has not been deployed yet.",
            observed_at: null,
            wake: null,
          },
          runtime_interaction: {
            state: "update_required",
            can_submit: false,
            notice: {
              code: "agent_runtime_update_required",
              severity: "warning",
              title: "Agent update required",
              message: "This agent must be redeployed before it can take messages.",
            },
            operation: null,
            retry_after_ms: null,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const runtimeAccess = await fetchAgentSessionRuntimeAccess({
      connection,
      sessionId: "session-uid-91",
    });

    expect(runtimeAccess.runtimeInteraction).toMatchObject({
      state: "update_required",
      canSubmit: false,
      notice: {
        code: "agent_runtime_update_required",
        title: "Agent update required",
      },
    });
  });

  it("normalizes ADR-027 runtime presence without deriving admission", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          mode: "unavailable",
          is_ready: true,
          runtime_presence: {
            phase: "provisioning",
            replicas: { desired: 1, actual: 0 },
            detail: "Waiting for a machine to become available.",
            observed_at: "2026-09-03T10:00:00Z",
            wake: {
              operation_uid: "00000000-0000-4000-8000-000000000027",
              state: "in_progress",
              requested_at: "2026-09-03T09:59:50Z",
              deadline_at: "2026-09-03T10:09:50Z",
            },
          },
          runtime_interaction: {
            state: "waking",
            can_submit: false,
            notice: null,
            operation: null,
            retry_after_ms: 2000,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const runtimeAccess = await fetchAgentSessionRuntimeAccess({
      connection,
      sessionId: "session-uid-91",
    });

    expect(runtimeAccess.runtimeInteraction?.state).toBe("waking");
    expect(runtimeAccess.runtimePresence).toEqual({
      phase: "provisioning",
      replicas: { desired: 1, actual: 0 },
      detail: "Waiting for a machine to become available.",
      observedAt: "2026-09-03T10:00:00Z",
      wake: {
        operationUid: "00000000-0000-4000-8000-000000000027",
        state: "in_progress",
        requestedAt: "2026-09-03T09:59:50Z",
        deadlineAt: "2026-09-03T10:09:50Z",
      },
    });
  });

  it("rejects invalid runtime-access lookups before calling fetch", async () => {
    await expect(fetchAgentSessionRuntimeAccess({ connection, sessionId: "undefined" })).rejects.toThrow(
      "valid session uid",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts numeric runtime-access lookups and forwards them to the backend", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ...wakingRuntimeEnvelope(),
          coding_agent_service_uid: "00000000-0000-4000-8000-000000000091",
          mode: "unavailable",
          rpc_url: null,
          token: null,
          is_ready: false,
          ready: {
            ready: false,
            detail: "The Agent runtime is starting.",
          },
          reconciliation: { queued: true },
          detail: "The Agent runtime is starting.",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(fetchAgentSessionRuntimeAccess({ connection, sessionId: 91 })).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/agent-sessions/91/resolve-runtime-access/"),
      expect.anything(),
    );
  });

  it("keeps platform runtime-access failures out of the Agent runtime HTTP source", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "Runtime activation is unavailable." }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const error = await fetchAgentSessionRuntimeAccess({
      connection,
      sessionId: "session-uid-91",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MainSequenceAiError);
    expect((error as MainSequenceAiError).source).toBe("assistant_runtime_access");
    expect((error as Error).message).not.toContain("Agent runtime HTTP");
  });
});
