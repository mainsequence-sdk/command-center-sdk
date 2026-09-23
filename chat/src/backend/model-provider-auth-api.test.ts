import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cancelModelProviderSignIn,
  fetchModelProviderSignInAttempt,
  signOffModelProvider,
  startModelProviderSignIn,
} from "./model-provider-auth-api.js";
import { createChatBackendConnection } from "./connection.js";

const connection = createChatBackendConnection({ apiBaseUrl: "http://localhost:8000" });

describe("model provider auth api", () => {
  const userUid = "00000000-0000-4000-8000-000000000123";
  const fetchMock = vi.fn();
  const attempt = {
    uid: "10000000-0000-4000-8000-000000000456",
    provider: "openai-codex",
    flow_kind: "browser",
    status: "awaiting_browser",
    next_action: {
      type: "open_url",
      authorization_url: "https://provider.example/authorize",
      instructions: "Complete sign-in in the provider window.",
    },
    created_at: "2026-08-31T10:00:00Z",
    updated_at: "2026-08-31T10:00:01Z",
    expires_at: "2026-08-31T10:10:00Z",
    completed_at: null,
    error_code: null,
  };

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts sign-in directly on the platform and normalizes its durable attempt", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(attempt), {
        headers: { "Content-Type": "application/json" },
        status: 201,
      }),
    );

    const result = await startModelProviderSignIn({
      connection,
      createdByUserUid: userUid,
      provider: "openai-codex",
      token: "session-token",
    });

    expect(result).toMatchObject({
      statusCode: 201,
      provider: "openai-codex",
      attempt: {
        id: attempt.uid,
        status: "awaiting_browser",
        nextAction: {
          type: "open_url",
          url: "https://provider.example/authorize",
        },
      },
    });

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(requestInit?.headers);
    expect(requestUrl).toContain("/api/v1/model-provider-sign-in-attempts/");
    expect(requestUrl).not.toContain("/api/model-providers/");
    expect(requestUrl).not.toContain("created_by_user_uid=");
    expect(requestInit?.method).toBe("POST");
    expect(JSON.parse(String(requestInit?.body))).toEqual({ provider: "openai-codex" });
    expect(headers.get("Authorization")).toBe("Bearer session-token");
  });

  it("polls and cancels the same user-owned platform attempt without a runtime session", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify(attempt), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...attempt, status: "cancelled" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      );

    await fetchModelProviderSignInAttempt({
      connection,
      createdByUserUid: userUid,
      provider: "openai-codex",
      attemptId: attempt.uid,
      token: "session-token",
    });
    const cancelled = await cancelModelProviderSignIn({
      connection,
      createdByUserUid: userUid,
      provider: "openai-codex",
      attemptId: attempt.uid,
      token: "session-token",
    });

    expect(cancelled.status).toBe("cancelled");
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      `/api/v1/model-provider-sign-in-attempts/${attempt.uid}/`,
    );
    expect(fetchMock.mock.calls[1]?.[0]).toContain(
      `/api/v1/model-provider-sign-in-attempts/${attempt.uid}/cancel/`,
    );
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain("agent_session_uid");
    expect(fetchMock.mock.calls[1]?.[0]).not.toContain("agent_session_uid");
  });

  it("signs off by revoking the platform credential directly", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          provider: "openai-codex",
          status: "revoked",
          version: 2,
          credential_hash: "sha256:credential",
          revoked_at: "2026-08-31T10:05:00Z",
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      ),
    );

    await signOffModelProvider({
      connection,
      createdByUserUid: userUid,
      provider: "openai-codex",
      token: "session-token",
    });

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(requestUrl).toContain("/api/v1/model-provider-credentials/revoke/");
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      provider: "openai-codex",
      reason: "user_signoff",
    });
  });

  it("rejects legacy numeric user ids before starting sign-in", async () => {
    await expect(
      startModelProviderSignIn({
        connection,
        createdByUserUid: "4",
        provider: "openai-codex",
        token: "session-token",
      }),
    ).rejects.toThrow("legacy numeric user id");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
