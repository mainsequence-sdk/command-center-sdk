import { afterEach, describe, expect, it, vi } from "vitest";

import { type AgentSessionApiRecord } from "../backend/agent-sessions-api.js";
import {
  createDefaultAgentSessionAgent,
  createEmptyAgentSession,
  readAgentSessions,
  toAgentSessionRecordFromApi,
  writeAgentSessions,
} from "./agent-sessions.js";

describe("AgentSession local persistence", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("partitions cached sessions by user and Organization Environment", () => {
    const values = new Map<string, string>();
    const localStorage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        values.set(key, value);
      }),
    } as unknown as Storage;
    vi.stubGlobal("window", { localStorage });

    const session = {
      ...createEmptyAgentSession(),
      id: "development-session-uid",
      organizationEnvironmentUid: "development-environment-uid",
    };

    writeAgentSessions(
      "user-uid",
      "development-environment-uid",
      [session],
    );

    expect(
      readAgentSessions("user-uid", "development-environment-uid").map(
        (entry) => entry.id,
      ),
    ).toEqual(["development-session-uid"]);
    expect(readAgentSessions("user-uid", "production-environment-uid")).toEqual([]);
    expect([...values.keys()]).toEqual([
      "ms.main-sequence-ai.agent-sessions:user-uid:development-environment-uid",
    ]);
  });
});

describe("AgentSession records merged from the API", () => {
  function buildApiRecord(overrides: Partial<AgentSessionApiRecord> = {}): AgentSessionApiRecord {
    return {
      uid: "session-uid",
      agent_uid: "agent-uid",
      agent_name: "Research Planner",
      status: "active",
      started_at: "2026-09-17T10:00:00Z",
      ended_at: null,
      llm_provider: "openai",
      llm_model: "gpt-5",
      engine_name: "tau",
      ...overrides,
    };
  }

  function buildKnownSession() {
    return {
      ...createEmptyAgentSession({
        ...createDefaultAgentSessionAgent(),
        uid: "agent-uid",
        name: "Research Planner",
        agentUniqueId: "research-planner",
      }),
      id: "session-uid",
    };
  }

  it("keeps the Agent's unique id when the refreshed record is the same Agent", () => {
    const merged = toAgentSessionRecordFromApi(buildApiRecord(), buildKnownSession());

    expect(merged.agent?.agentUniqueId).toBe("research-planner");
    expect(merged.agent).not.toHaveProperty("requestAgentType");
  });

  it("keeps the Agent's unique id when the record does not identify the Agent", () => {
    const merged = toAgentSessionRecordFromApi(
      buildApiRecord({ agent_uid: null }),
      buildKnownSession(),
    );

    expect(merged.agent?.agentUniqueId).toBe("research-planner");
  });

  it("drops the unique id when the record names a different Agent", () => {
    const merged = toAgentSessionRecordFromApi(
      buildApiRecord({ agent_uid: "another-agent-uid" }),
      buildKnownSession(),
    );

    expect(merged.agent?.agentUniqueId).toBe("");
    expect(merged.agent?.uid).toBe("another-agent-uid");
  });
});
