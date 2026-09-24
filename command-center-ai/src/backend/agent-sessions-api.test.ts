import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  archiveAgentSessionRequest,
  fetchArchivedAgentSessions,
  fetchAgentSessionDetail,
  fetchLatestAgentSessions,
  getAgentSessionRecordHandleUniqueId,
  getAgentSessionRecordSessionId,
  AgentSessionModelRequiredError,
  getOrCreateAgentSessionRequest,
  normalizeAgentSessionLookupId,
  patchAgentSessionModelConfig,
  searchAgentSessions,
  readAgentSessionModelRequirement,
  startNewAgentSessionRequest,
  unarchiveAgentSessionRequest,
  type AgentSessionApiRecord,
} from "./agent-sessions-api.js";
import { createChatBackendConnection } from "./connection.js";

const connection = createChatBackendConnection({ apiBaseUrl: "http://localhost:8000" });

function createAgentSessionRecord(
  overrides: Partial<AgentSessionApiRecord> = {},
): AgentSessionApiRecord {
  return {
    id: 91,
    agent_name: "Research Orchestrator",
    organization_environment_uid: "environment-uid",
    organization_environment_name: "Development",
    status: "completed",
    started_at: "2026-06-03T15:00:00Z",
    ended_at: null,
    llm_provider: "openai",
    llm_model: "gpt-5",
    engine_name: "python",
    ...overrides,
  };
}

describe("agent session api", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("prefers canonical uid fields over legacy numeric ids", () => {
    const record = createAgentSessionRecord({
      id: 91,
      uid: "session-uid-123",
      agent_session: 91,
      agent_session_uid: "legacy-ignored",
    });

    expect(getAgentSessionRecordSessionId(record)).toBe("session-uid-123");
  });

  it("treats nullish string ids as invalid lookup ids", () => {
    expect(normalizeAgentSessionLookupId("undefined")).toBeNull();
    expect(normalizeAgentSessionLookupId(" null ")).toBeNull();
    expect(normalizeAgentSessionLookupId("session-uid-123")).toBe("session-uid-123");
  });

  it("accepts numeric lookup ids", () => {
    expect(normalizeAgentSessionLookupId("52")).toBe("52");
    expect(normalizeAgentSessionLookupId(52)).toBe("52");
  });

  it("does not fall back to legacy numeric record ids", () => {
    const record = createAgentSessionRecord({
      id: 91,
      agent_session: 91,
      uid: null,
      agent_session_uid: null,
    });

    expect(getAgentSessionRecordSessionId(record)).toBe("");
  });

  it("reads the canonical singular bound_handle contract", () => {
    const record = createAgentSessionRecord({
      uid: "session-uid-123",
      bound_handle: {
        uid: "handle-uid-123",
        handle_unique_id: "portfolio-review-q2-2026",
        owner_user_uid: "user-uid-123",
        is_locked: false,
      },
      bound_handles: [
        {
          id: 91,
          handle_unique_id: "legacy-handle-should-not-win",
          owner_user: 4,
          is_locked: true,
        },
      ],
    });

    expect(getAgentSessionRecordHandleUniqueId(record)).toBe("portfolio-review-q2-2026");
  });

  it("rejects invalid detail lookups before calling fetch", async () => {
    await expect(
      fetchAgentSessionDetail({
        connection,
        organizationEnvironmentUid: "environment-uid",
        sessionId: "undefined",
      }),
    ).rejects.toThrow("valid session uid");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates sessions with a thread id and reads the returned session uid", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          uid: "session-uid-123",
          agent_name: "Research Orchestrator",
          status: "running",
          started_at: "2026-06-03T15:00:00Z",
          ended_at: null,
          llm_provider: "openai",
          llm_model: "gpt-5",
          engine_name: "python",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    const result = await startNewAgentSessionRequest({
      connection,
      agentId: 12,
      threadId: "thread-uid-123",
    });

    expect(result.sessionId).toBe("session-uid-123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      thread_id: "thread-uid-123",
    });
  });

  it("filters latest sessions by public agent uid when the lookup is not numeric", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    await fetchLatestAgentSessions({
      connection,
      agentId: "agent-uid-123",
      createdByUserUid: "user-uid-123",
      organizationEnvironmentUid: "environment-uid",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    const requestUrl = new URL(String(url));

    expect(requestUrl.searchParams.get("agent_uid")).toBe("agent-uid-123");
    expect(requestUrl.searchParams.has("agent_id")).toBe(false);
    expect(requestUrl.searchParams.get("created_by_user_uid")).toBe("user-uid-123");
    expect(requestUrl.searchParams.get("organization_environment_uid")).toBe(
      "environment-uid",
    );
    expect(requestUrl.searchParams.get("is_archived")).toBe("false");
    expect(requestUrl.searchParams.get("ordering")).toBe("-started_at");
    expect(requestUrl.searchParams.get("limit")).toBe("20");
  });

  it("rejects a session collection row from a different environment", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            createAgentSessionRecord({
              uid: "cross-environment-session",
              organization_environment_uid: "other-environment-uid",
            }),
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      fetchLatestAgentSessions({
        connection,
        createdByUserUid: "user-uid-123",
        organizationEnvironmentUid: "environment-uid",
      }),
    ).rejects.toThrow("belongs to Organization Environment other-environment-uid");
  });

  it("loads archived sessions for one public agent uid and the current user", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            createAgentSessionRecord({
              uid: "archived-session-uid-123",
              agent_uid: "agent-uid-123",
              is_archived: true,
              archived_at: "2026-07-26T20:00:00Z",
            }),
          ],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    const records = await fetchArchivedAgentSessions({
      connection,
      agentUid: "agent-uid-123",
      createdByUserUid: "user-uid-123",
      organizationEnvironmentUid: "environment-uid",
    });

    expect(records[0]?.uid).toBe("archived-session-uid-123");
    const [url] = fetchMock.mock.calls[0];
    const requestUrl = new URL(String(url));

    expect(requestUrl.searchParams.get("agent_uid")).toBe("agent-uid-123");
    expect(requestUrl.searchParams.get("created_by_user_uid")).toBe("user-uid-123");
    expect(requestUrl.searchParams.get("organization_environment_uid")).toBe(
      "environment-uid",
    );
    expect(requestUrl.searchParams.get("is_archived")).toBe("true");
    expect(requestUrl.searchParams.get("ordering")).toBe("-archived_at");
    expect(requestUrl.searchParams.get("limit")).toBe("20");
  });

  it("searches active conversations for the current user", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            createAgentSessionRecord({
              uid: "matched-session-uid-123",
              name: "Portfolio review",
              bound_handle: {
                uid: "handle-uid-123",
                handle_unique_id: "portfolio-review-primary",
                owner_user_uid: "user-uid-123",
                is_locked: false,
              },
            }),
          ],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    const records = await searchAgentSessions({
      connection,
      createdByUserUid: "user-uid-123",
      organizationEnvironmentUid: "environment-uid",
      query: "portfolio review",
    });

    expect(records[0]?.uid).toBe("matched-session-uid-123");
    const [url] = fetchMock.mock.calls[0];
    const requestUrl = new URL(String(url));

    expect(requestUrl.searchParams.get("created_by_user_uid")).toBe("user-uid-123");
    expect(requestUrl.searchParams.get("organization_environment_uid")).toBe(
      "environment-uid",
    );
    expect(requestUrl.searchParams.get("is_archived")).toBe("false");
    expect(requestUrl.searchParams.get("q")).toBe("portfolio review");
    expect(requestUrl.searchParams.get("ordering")).toBe("-started_at");
    expect(requestUrl.searchParams.get("limit")).toBe("20");
  });

  it("archives and unarchives a session through the canonical action endpoints", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            createAgentSessionRecord({
              uid: "session-uid-123",
              is_archived: true,
              archived_at: "2026-07-26T20:00:00Z",
            }),
          ),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            createAgentSessionRecord({
              uid: "session-uid-123",
              is_archived: false,
              archived_at: null,
            }),
          ),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );

    const archived = await archiveAgentSessionRequest({
      connection,
      sessionId: "session-uid-123",
    });
    const unarchived = await unarchiveAgentSessionRequest({
      connection,
      sessionId: "session-uid-123",
    });

    expect(archived.is_archived).toBe(true);
    expect(unarchived.is_archived).toBe(false);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/api/v1/agent-sessions/session-uid-123/archive/",
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "/api/v1/agent-sessions/session-uid-123/unarchive/",
    );
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("POST");
  });

  it("creates or reuses sessions with a handle using the canonical session endpoint", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          uid: "session-uid-123",
          agent_name: "Research Orchestrator",
          status: "running",
          started_at: "2026-06-03T15:00:00Z",
          ended_at: null,
          llm_provider: "openai",
          llm_model: "gpt-5",
          engine_name: "python",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    const result = await getOrCreateAgentSessionRequest({
      connection,
      agentUid: "agent-uid-123",
      handleUniqueId: "code-repository:alpha:primary-agent",
      name: "Primary agent session",
      llmProvider: "openai",
      llmModel: "gpt-5",
      llmThinking: "",
    });

    expect(result.sessionId).toBe("session-uid-123");
    expect(result.record?.uid).toBe("session-uid-123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, requestInit] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(
      "/api/v1/agents/agent-uid-123/sessions/get-or-create-session/",
    );
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      handle_unique_id: "code-repository:alpha:primary-agent",
      name: "Primary agent session",
      llm_provider: "openai",
      llm_model: "gpt-5",
      llm_thinking: "",
    });
  });

  it("resolves a canonical session by session uid", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          uid: "session-uid-123",
          agent_name: "Research Orchestrator",
          status: "running",
          started_at: "2026-06-03T15:00:00Z",
          ended_at: null,
          llm_provider: "openai",
          llm_model: "gpt-5",
          engine_name: "python",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    const result = await getOrCreateAgentSessionRequest({
      connection,
      agentUid: "agent-uid-123",
      sessionUid: "session-uid-123",
    });

    expect(result.sessionId).toBe("session-uid-123");
    const [, requestInit] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      session_uid: "session-uid-123",
    });
  });

  it("creates or reuses sessions with only a handle lookup key", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          uid: "session-uid-123",
          agent_name: "Research Orchestrator",
          status: "running",
          started_at: "2026-06-03T15:00:00Z",
          ended_at: null,
          llm_provider: "openai",
          llm_model: "gpt-5",
          engine_name: "python",
        }),
        {
          status: 201,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    await getOrCreateAgentSessionRequest({
      connection,
      agentUid: "agent-uid-123",
      handleUniqueId: "code-repository:alpha:primary-agent",
    });

    const [, requestInit] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      handle_unique_id: "code-repository:alpha:primary-agent",
    });
  });

  it("rejects session get-or-create requests with multiple lookup keys", async () => {
    await expect(
      getOrCreateAgentSessionRequest({
        connection,
        agentUid: "agent-uid-123",
        sessionUid: "session-uid-123",
        handleUniqueId: "code-repository:alpha:primary-agent",
      }),
    ).rejects.toThrow("exactly one of session_uid or handle_unique_id");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects session get-or-create requests without a lookup key", async () => {
    await expect(
      getOrCreateAgentSessionRequest({
        connection,
        agentUid: "agent-uid-123",
      }),
    ).rejects.toThrow("exactly one of session_uid or handle_unique_id");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects wrapped session get-or-create responses", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          session: {
            uid: "session-uid-123",
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    await expect(
      getOrCreateAgentSessionRequest({
        connection,
        agentUid: "agent-uid-123",
        handleUniqueId: "code-repository:alpha:primary-agent",
      }),
    ).rejects.toThrow("no AgentSession uid was returned");
  });

  it("returns the platform's canonical AgentSession after a model selection update", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          createAgentSessionRecord({
            uid: "session-uid-123",
            llm_provider: "openai-codex",
            llm_model: "gpt-5.6",
            llm_thinking: "high",
            catalog_digest: `sha256:${"a".repeat(64)}`,
          }),
        ),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      ),
    );

    const record = await patchAgentSessionModelConfig({
      connection,
      llmModel: "gpt-5.6",
      llmProvider: "openai-codex",
      llmThinking: "high",
      sessionId: "session-uid-123",
      token: "session-token",
    });

    expect(record).toMatchObject({
      llm_provider: "openai-codex",
      llm_model: "gpt-5.6",
      llm_thinking: "high",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      llm_provider: "openai-codex",
      llm_model: "gpt-5.6",
      llm_thinking: "high",
    });
  });

  it("preserves the platform's active-runtime conflict code on model selection updates", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail: "Model selection cannot change while a turn is working or persisting.",
          error_code: "agent_session_selection_runtime_active",
        }),
        { headers: { "Content-Type": "application/json" }, status: 409 },
      ),
    );

    await expect(
      patchAgentSessionModelConfig({
        connection,
        llmModel: "gpt-5.6",
        llmProvider: "openai-codex",
        sessionId: "session-uid-123",
      }),
    ).rejects.toMatchObject({
      code: "agent_session_selection_runtime_active",
      status: 409,
    });
  });
});

describe("model-required refusal", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const refusal = () =>
    new Response(
      JSON.stringify({ llm_provider: ["This field is required."], llm_model: ["This field is required."] }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );

  it("recognises only the 400 that reports the model fields as required", () => {
    expect(readAgentSessionModelRequirement(400, { llm_provider: "This field is required.", llm_model: ["This field is required."] })).toEqual({
      provider: true,
      model: true,
    });
    expect(readAgentSessionModelRequirement(400, { llm_model: ["This field is required."] })).toEqual({ provider: false, model: true });
    expect(readAgentSessionModelRequirement(400, { llm_model: ["Unknown model."] })).toBeNull();
    expect(readAgentSessionModelRequirement(400, { handle_unique_id: ["This field is required."] })).toBeNull();
    expect(readAgentSessionModelRequirement(500, { llm_model: ["This field is required."] })).toBeNull();
    expect(readAgentSessionModelRequirement(400, "llm_model: This field is required.")).toBeNull();
  });

  it("throws the typed error from get-or-create and from plain creation, keeping the readable message", async () => {
    fetchMock.mockResolvedValueOnce(refusal());
    const fromHandle = await getOrCreateAgentSessionRequest({
      connection,
      agentUid: "65eb5c94-a51b-4afe-9106-0a87c197f566",
      handleUniqueId: "command-center-shortcut",
      token: "jwt",
    }).catch((error: unknown) => error);
    expect(fromHandle).toBeInstanceOf(AgentSessionModelRequiredError);
    expect((fromHandle as AgentSessionModelRequiredError).missing).toEqual({ provider: true, model: true });
    expect((fromHandle as AgentSessionModelRequiredError).agentLookupId).toBe("65eb5c94-a51b-4afe-9106-0a87c197f566");
    expect((fromHandle as Error).message).toContain("This field is required");

    fetchMock.mockResolvedValueOnce(refusal());
    const fromStart = await startNewAgentSessionRequest({ connection, agentId: "agent-uid", token: "jwt" }).catch((error: unknown) => error);
    expect(fromStart).toBeInstanceOf(AgentSessionModelRequiredError);
  });

  it("keeps every other failure a plain error", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ detail: "Not found." }), { status: 404 }));
    const failure = await getOrCreateAgentSessionRequest({ connection, agentUid: "agent-uid", handleUniqueId: "handle", token: "jwt" }).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(AgentSessionModelRequiredError);
  });

  it("sends the chosen model on the retry", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ uid: "11111111-1111-4111-8111-111111111111" }), { status: 201 }));
    await getOrCreateAgentSessionRequest({
      connection,
      agentUid: "agent-uid",
      handleUniqueId: "command-center-shortcut",
      llmProvider: "openai-codex",
      llmModel: "gpt-5.5",
      token: "jwt",
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      handle_unique_id: "command-center-shortcut",
      llm_provider: "openai-codex",
      llm_model: "gpt-5.5",
    });
  });
});
