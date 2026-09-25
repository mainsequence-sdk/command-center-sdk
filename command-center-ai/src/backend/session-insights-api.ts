import { requireAgentSessionLookupId } from "./agent-sessions-api.js";
import { resolvePlatformApiUrl, type ChatBackendConnection } from "./connection.js";
import { requestPlatform } from "./platform-request.js";
import { MainSequenceAiError } from "./error-source.js";
import { buildRuntimeHttpErrorMessage } from "./http-error.js";
import {
  createEmptySessionInsightsSnapshot,
  normalizeSessionInsightsSnapshot,
  type SessionInsightsSnapshot,
} from "./session-insights.js";

function buildSessionInsightsUrl(connection: ChatBackendConnection, sessionId: string | number) {
  const normalizedSessionId = requireAgentSessionLookupId(
    sessionId,
    "AgentSession insights",
  );
  return resolvePlatformApiUrl(
    connection,
    `/api/v1/agent-sessions/${encodeURIComponent(normalizedSessionId)}/insights/`,
  );
}

export async function fetchSessionInsights({
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
  const requestUrl = buildSessionInsightsUrl(connection, sessionId);
  const headers = new Headers({
    Accept: "application/json",
  });

  if (token) {
    headers.set("Authorization", `${tokenType} ${token}`);
  }

  let response: Response;

  try {
    response = await requestPlatform(connection, requestUrl, {
      method: "GET",
      headers,
      signal,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown fetch error.";
    throw new MainSequenceAiError(
      `Failed to load session insights for session ${sessionId} from ${requestUrl}. ${detail}`,
      {
        source: "agent_session_insights",
      },
    );
  }

  if (!response.ok) {
    if (response.status === 404) {
      return createEmptySessionInsightsSnapshot({
        sessionId,
      });
    }

    throw new MainSequenceAiError(
      await buildRuntimeHttpErrorMessage({
        fallbackMessage: `Session insights failed with status ${response.status}.`,
        method: "GET",
        operation: `Agent session insights request failed for session ${sessionId}`,
        response,
        url: requestUrl,
      }),
      {
        source: "agent_session_insights",
        status: response.status,
      },
    );
  }

  const payload = (await response.json()) as unknown;
  return normalizeSessionInsightsSnapshot(payload) satisfies SessionInsightsSnapshot;
}
