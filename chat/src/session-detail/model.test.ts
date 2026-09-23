import { describe, expect, it } from "vitest";

import { normalizeAgentSessionCoreDetail } from "./model.js";

describe("AgentSession detail model", () => {
  it("preserves the current multi-harness session serializer contract", () => {
    const detail = normalizeAgentSessionCoreDetail({
      uid: "session-uid-73",
      agent_uid: "agent-uid-12",
      agent_name: "CodeRepository Executor",
      harness: "tau",
      harness_protocol: "tau-session-v1",
      harness_version: "0.3.1",
      status: "running",
      started_at: "2026-07-26T19:00:00Z",
      ended_at: null,
      is_archived: false,
      archived_at: null,
      llm_provider: "openai",
      llm_model: "gpt-5",
      llm_thinking: "medium",
      active_provider: "openai",
      active_model: "gpt-5.4",
      active_thinking: "high",
      engine_name: "tau",
    });

    expect(detail.harness).toBe("tau");
    expect(detail.harnessProtocol).toBe("tau-session-v1");
    expect(detail.harnessVersion).toBe("0.3.1");
    expect(detail.isArchived).toBe(false);
    expect(detail.activeProvider).toBe("openai");
    expect(detail.activeModel).toBe("gpt-5.4");
    expect(detail.activeThinking).toBe("high");
  });
});
