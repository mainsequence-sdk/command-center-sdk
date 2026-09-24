import { describe, expect, it } from "vitest";

import { normalizeSessionHistorySnapshot } from "./session-history.js";

describe("session history provenance", () => {
  it("preserves backend agent-origin provenance on user messages", () => {
    // Field names mirror the platform's history payload —
    // the session emits agentUid/agentSessionUid and the provenance emits
    // callerAgentSessionUid/targetAgentUid.
    const snapshot = normalizeSessionHistorySnapshot({
      version: 1,
      session: {
        sessionId: "87",
        threadId: "87",
        agentName: "code-repository-executor",
        agentUid: "agent-uid-25",
        agentSessionUid: "session-uid-87",
        status: "running",
        startedAt: "2026-05-10T12:00:00.000Z",
        updatedAt: "2026-05-10T12:00:02.000Z",
        error: null,
      },
      messages: [
        {
          id: "u_1",
          role: "user",
          createdAt: "2026-05-10T12:00:00.000Z",
          content: [
            {
              type: "text",
              text: "Inspect the prepared code repository and summarize the next implementation step.",
            },
          ],
          provenance: {
            origin: "agent",
            channel: "a2a",
            callerAgentName: "research-assistant",
            handleUniqueId: "6f41da6f-bfd8-4598-a8a2-822bfabfba51",
            callerAgentSessionUid: "session-uid-52",
            targetAgentUid: "agent-uid-25",
          },
        },
      ],
      inProgressMessage: null,
    });

    expect(snapshot.session.agentUid).toBe("agent-uid-25");
    expect(snapshot.session.agentSessionUid).toBe("session-uid-87");
    expect(snapshot.messages).toHaveLength(1);
    expect(snapshot.messages[0]).toMatchObject({
      role: "user",
      content: [
        {
          type: "data-main_sequence_ai_provenance",
          data: {
            origin: "agent",
            channel: "a2a",
            callerAgentName: "research-assistant",
            handleUniqueId: "6f41da6f-bfd8-4598-a8a2-822bfabfba51",
            callerAgentSessionUid: "session-uid-52",
            targetAgentUid: "agent-uid-25",
          },
        },
        {
          type: "text",
          text: "Inspect the prepared code repository and summarize the next implementation step.",
        },
      ],
      metadata: {
        custom: {
          mainSequenceAi: {
            provenance: {
              origin: "agent",
              channel: "a2a",
              callerAgentName: "research-assistant",
              handleUniqueId: "6f41da6f-bfd8-4598-a8a2-822bfabfba51",
              callerAgentSessionUid: "session-uid-52",
              targetAgentUid: "agent-uid-25",
            },
          },
        },
      },
    });
  });

  it("carries the verified actor fields", () => {
    const snapshot = normalizeSessionHistorySnapshot({
      version: 1,
      session: {
        sessionId: "88",
        threadId: "88",
        agentName: "research-assistant",
        agentUid: "e49e23e5-d7a6-4ebc-912e-d5257252945f",
        agentSessionUid: "session-uid-88",
        status: "complete",
        startedAt: "2026-09-02T12:00:00.000Z",
        updatedAt: "2026-09-02T12:00:02.000Z",
        error: null,
      },
      messages: [
        {
          id: "u_1",
          role: "user",
          createdAt: "2026-09-02T12:00:00.000Z",
          content: [{ type: "text", text: "Status?" }],
          provenance: {
            origin: "agent",
            channel: "a2a",
            actorKind: "agent",
            actorUid: "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
            actorName: "Code Repository Executor",
            callerAgentSessionUid: "session-uid-52",
            targetAgentUid: "e49e23e5-d7a6-4ebc-912e-d5257252945f",
          },
        },
        {
          id: "a_1",
          role: "assistant",
          createdAt: "2026-09-02T12:00:01.000Z",
          content: [{ type: "text", text: "All green." }],
          provenance: {
            origin: "agent",
            channel: "a2a",
            targetAgentUid: "e49e23e5-d7a6-4ebc-912e-d5257252945f",
          },
        },
      ],
      inProgressMessage: null,
    });

    expect(snapshot.messages).toHaveLength(2);
    expect(snapshot.messages[0]?.metadata).toMatchObject({
      custom: {
        mainSequenceAi: {
          provenance: {
            actorKind: "agent",
            actorUid: "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
            actorName: "Code Repository Executor",
            targetAgentUid: "e49e23e5-d7a6-4ebc-912e-d5257252945f",
          },
        },
      },
    });
    expect(snapshot.messages[1]?.metadata).toMatchObject({
      custom: {
        mainSequenceAi: {
          provenance: {
            actorKind: null,
            actorUid: null,
            actorName: null,
            targetAgentUid: "e49e23e5-d7a6-4ebc-912e-d5257252945f",
          },
        },
      },
    });
  });

  it("falls back to legacy agentId/agentSessionId field names", () => {
    const snapshot = normalizeSessionHistorySnapshot({
      version: 1,
      session: {
        sessionId: "87",
        threadId: "87",
        agentId: 25,
        agentSessionId: 87,
        status: "completed",
        startedAt: null,
        updatedAt: null,
        error: null,
      },
      messages: [],
      inProgressMessage: null,
    });

    expect(snapshot.session.agentUid).toBe("25");
    expect(snapshot.session.agentSessionUid).toBe("87");
  });
});

describe("session history tool calls", () => {
  it("keeps tool-call parts with their arguments and results", () => {
    const snapshot = normalizeSessionHistorySnapshot({
      version: 1,
      session: {
        sessionId: "88",
        threadId: "88",
        agentUid: "agent-uid-25",
        agentSessionUid: "session-uid-88",
        status: "completed",
        startedAt: "2026-09-03T12:00:00.000Z",
        updatedAt: "2026-09-03T12:00:05.000Z",
        error: null,
      },
      messages: [
        {
          id: "u_1",
          role: "user",
          createdAt: "2026-09-03T12:00:00.000Z",
          content: [{ type: "text", text: "List my repositories." }],
        },
        {
          id: "a_1",
          role: "assistant",
          createdAt: "2026-09-03T12:00:01.000Z",
          content: [
            {
              type: "tool-call",
              toolCallId: "call-1",
              toolName: "mainsequence__code_repository_list",
              args: { limit: 5 },
              result: {
                content: [{ type: "text", text: "[]" }],
                details: { mcp_tool: "code_repository_list", is_error: false },
              },
              isError: false,
            },
          ],
        },
        {
          id: "a_2",
          role: "assistant",
          createdAt: "2026-09-03T12:00:03.000Z",
          content: [
            { type: "tool-call", toolCallId: "", toolName: "dropped" },
            { type: "text", text: "You have no repositories." },
          ],
        },
      ],
      inProgressMessage: null,
    });

    expect(snapshot.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "assistant",
    ]);
    expect(snapshot.messages[1]?.content).toEqual([
      {
        type: "tool-call",
        toolCallId: "call-1",
        toolName: "mainsequence__code_repository_list",
        args: { limit: 5 },
        result: {
          content: [{ type: "text", text: "[]" }],
          details: { mcp_tool: "code_repository_list", is_error: false },
        },
        isError: false,
      },
    ]);
    expect(snapshot.messages[2]?.content).toEqual([
      { type: "text", text: "You have no repositories." },
    ]);
  });
});
