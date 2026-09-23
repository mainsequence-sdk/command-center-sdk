import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createChatBackendConnection } from "./connection.js";
import {
  createEmptySessionInsightsSnapshot,
  normalizeSessionInsightsSnapshot,
} from "./session-insights.js";
import { fetchSessionInsights } from "./session-insights-api.js";

const connection = createChatBackendConnection({ apiBaseUrl: "http://localhost:8000" });

describe("session insights contract", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("normalizes the current Pi empty-insights payload shape", () => {
    const snapshot = normalizeSessionInsightsSnapshot({
      has_insights: false,
      agent_session_uid: "session-uid-73",
      harness: "pi",
      harness_protocol: "pi-checkpoint-v1",
      harness_version: "",
      checkpoint_version: 4,
      bundle_hash: "bundle-123",
      computed_at: null,
      flushed_at: null,
      reason: null,
      insights: {},
      updated_at: null,
    });

    expect(snapshot.hasInsights).toBe(false);
    expect(snapshot.agentSessionId).toBe("session-uid-73");
    expect(snapshot.harness).toBe("pi");

    if (snapshot.harness !== "pi") {
      throw new Error("Expected Pi insights.");
    }

    expect(snapshot.harnessProtocol).toBe("pi-checkpoint-v1");
    expect(snapshot.harnessVersion).toBe("");
    expect(snapshot.checkpointVersion).toBe(4);
    expect(snapshot.bundleHash).toBe("bundle-123");
    expect(snapshot.computedAt).toBeNull();
    expect(snapshot.flushedAt).toBeNull();
    expect(snapshot.reason).toBeNull();
    expect(snapshot.updatedAt).toBeNull();
    expect(snapshot.info).toEqual({});
    expect(snapshot.context).toBeNull();
    expect(snapshot.model).toBeNull();
    expect(snapshot.usage).toBeNull();
    expect(snapshot.lastTurn).toBeNull();
    expect(snapshot.session.agentSessionId).toBe("session-uid-73");
  });

  it("normalizes Tau insights with native entry provenance", () => {
    const snapshot = normalizeSessionInsightsSnapshot({
      has_insights: true,
      agent_session_uid: "session-uid-73",
      harness: "tau",
      harness_protocol: "tau-session-v1",
      harness_version: "0.3.1",
      entry_count: 4,
      last_sequence: 7,
      active_branch_entry_count: 3,
      entry_type_counts: {
        message: 3,
        session_info: 1,
      },
      title: "Competition analysis",
      computed_at: "2026-07-26T19:25:00Z",
      reason: "tau_entries_projection",
      updated_at: "2026-07-26T19:24:00Z",
      insights: {
        version: 1,
        model: {
          provider: "openai",
          model: "gpt-5.4",
          reasoningEffort: "high",
        },
        session: {
          agentSessionId: "session-uid-73",
          sessionId: "thread-123",
          threadId: "thread-123",
          status: "running",
          startedAt: "2026-07-26T19:00:00Z",
          updatedAt: "2026-07-26T19:24:00Z",
          lastError: null,
        },
        usage: {
          totalMessages: 3,
          userMessages: 1,
          assistantMessages: 2,
          assistantTurns: 2,
          toolCalls: 1,
          toolResults: 0,
          estimatedCostUsd: 0.42,
          tokens: {
            input: 100,
            output: 50,
            cacheRead: 10,
            cacheWrite: 5,
            total: 165,
          },
        },
        context: {
          source: "tau_entries",
          status: "reported_by_last_assistant",
          tokens: 100,
          latestCompaction: null,
        },
        lastTurn: {
          completedAt: "2026-07-26T19:24:00Z",
          finishReason: "stop",
          errorMessage: null,
          model: {
            provider: "openai",
            model: "gpt-5.4",
          },
          tokens: {
            input: 60,
            output: 20,
            cacheRead: 10,
            cacheWrite: 5,
            total: 95,
          },
        },
      },
    });

    expect(snapshot.harness).toBe("tau");

    if (snapshot.harness !== "tau") {
      throw new Error("Expected Tau insights.");
    }

    expect(snapshot.agentSessionId).toBe("session-uid-73");
    expect(snapshot.harnessProtocol).toBe("tau-session-v1");
    expect(snapshot.entryCount).toBe(4);
    expect(snapshot.lastSequence).toBe(7);
    expect(snapshot.activeBranchEntryCount).toBe(3);
    expect(snapshot.entryTypeCounts).toEqual({
      message: 3,
      session_info: 1,
    });
    expect(snapshot.title).toBe("Competition analysis");
    expect(snapshot.model?.reasoningEffort).toBe("high");
    expect(snapshot.usage?.tokens.cacheRead).toBe(10);
    expect(snapshot.lastTurn?.finishReason).toBe("stop");
  });

  it("rejects a harness and protocol mismatch", () => {
    expect(() =>
      normalizeSessionInsightsSnapshot({
        agent_session_uid: "session-uid-73",
        harness: "tau",
        harness_protocol: "pi-checkpoint-v1",
        harness_version: "0.3.1",
        insights: {},
      }),
    ).toThrow("tau-session-v1");
  });

  it("maps a legacy 404 insights lookup to the empty snapshot contract", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "not found" }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    await expect(fetchSessionInsights({ connection, sessionId: "session-uid-73" })).resolves.toEqual(
      createEmptySessionInsightsSnapshot({
        sessionId: "session-uid-73",
      }),
    );
  });

  it("accepts numeric insights lookups and forwards them to the backend", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "not found" }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    await expect(fetchSessionInsights({ connection, sessionId: 73 })).resolves.toEqual(
      createEmptySessionInsightsSnapshot({
        sessionId: "73",
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/agent-sessions/73/"),
      expect.anything(),
    );
  });
});
