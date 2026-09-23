import { requireAgentSessionLookupId } from "./agent-sessions-api.js";
import { resolvePlatformApiUrl, type ChatBackendConnection } from "./connection.js";
import { MainSequenceAiError } from "./error-source.js";
import { buildRuntimeHttpErrorMessage } from "./http-error.js";
import {
  normalizeSessionHistorySnapshot,
  type SessionHistoryApiSession,
  type SessionHistorySnapshot,
} from "./session-history.js";

function createEmptySessionHistorySnapshot(sessionId: string): SessionHistorySnapshot {
  const session: SessionHistoryApiSession = {
    sessionId,
    threadId: null,
    agentUid: null,
    agentSessionUid: sessionId,
    status: "completed",
    startedAt: null,
    updatedAt: null,
    error: null,
  };

  return {
    version: 1,
    session,
    messages: [],
    inProgressMessage: null,
  };
}

function buildSessionHistoryUrl(connection: ChatBackendConnection, sessionId: string | number) {
  const normalizedSessionId = requireAgentSessionLookupId(
    sessionId,
    "AgentSession history",
  );
  return resolvePlatformApiUrl(
    connection,
    `/api/v1/agent-sessions/${encodeURIComponent(normalizedSessionId)}/history/`,
  );
}

export async function fetchSessionHistory({
  connection,
  sessionId,
  signal,
  token,
  tokenType = "Bearer",
}: {
  connection: ChatBackendConnection;
  sessionId: string | number;
  signal?: AbortSignal;
  token?: string | null;
  tokenType?: string;
}) {
  const requestUrl = buildSessionHistoryUrl(connection, sessionId);
  const headers = new Headers({
    Accept: "application/json",
  });

  if (token) {
    headers.set("Authorization", `${tokenType} ${token}`);
  }

  let response: Response;

  try {
    response = await fetch(requestUrl, {
      method: "GET",
      headers,
      signal,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown fetch error.";
    throw new MainSequenceAiError(
      `Failed to load session history for session ${sessionId} from ${requestUrl}. ${detail}`,
      {
        source: "agent_session_history",
      },
    );
  }

  if (!response.ok) {
    if (response.status === 404) {
      return createEmptySessionHistorySnapshot(String(sessionId));
    }

    throw new MainSequenceAiError(
      await buildRuntimeHttpErrorMessage({
        fallbackMessage: `Session history failed with status ${response.status}.`,
        method: "GET",
        operation: `Agent session history request failed for session ${sessionId}`,
        response,
        url: requestUrl,
      }),
      {
        source: "agent_session_history",
        status: response.status,
      },
    );
  }

  const payload = (await response.json()) as unknown;
  return normalizeSessionHistorySnapshot(payload) satisfies SessionHistorySnapshot;
}
