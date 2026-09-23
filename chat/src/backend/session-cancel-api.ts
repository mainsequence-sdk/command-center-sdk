import {
  fetchMainSequenceAiAssistantResponse,
  type MainSequenceAiAssistantRuntimeTarget,
} from "./assistant-endpoint.js";
import type { ChatBackendConnection } from "./connection.js";
import { buildRuntimeHttpErrorMessage } from "./http-error.js";

export interface CancelChatSessionRequest {
  runtimeSessionUid: string;
  threadId: string;
  userUid: string | number | null;
  reason?: "user_requested" | string;
  message?: string;
}

const CANCEL_CHAT_SESSION_TIMEOUT_MS = 10_000;

export async function cancelChatSession({
  body,
  connection,
  organizationEnvironmentUid,
  runtimeTarget,
  timeoutMs = CANCEL_CHAT_SESSION_TIMEOUT_MS,
  token,
  tokenType = "Bearer",
}: {
  body: CancelChatSessionRequest;
  connection: ChatBackendConnection;
  organizationEnvironmentUid: string;
  runtimeTarget?: MainSequenceAiAssistantRuntimeTarget;
  timeoutMs?: number;
  token?: string | null;
  tokenType?: string;
}) {
  // Users press Stop precisely when the runtime is wedged — the cancel
  // request must never hang indefinitely. The timeout signal also bounds
  // the runtime-access resolution step, not just the POST.
  const { response, url } = await fetchMainSequenceAiAssistantResponse({
    accept: "application/json",
    connection,
    currentSessionId: body.runtimeSessionUid,
    organizationEnvironmentUid,
    requestPath: "/api/chat/session/cancel",
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      runtime_session_uid: body.runtimeSessionUid,
      thread_id: body.threadId,
      user_uid: body.userUid !== null && body.userUid !== undefined ? String(body.userUid) : null,
      reason: body.reason ?? "user_requested",
      message: body.message ?? "User pressed stop.",
    }),
    runtimeTarget,
    sessionToken: token,
    sessionTokenType: tokenType,
    sessionUserUid:
      body.userUid !== null && body.userUid !== undefined ? String(body.userUid) : null,
  });

  if (!response.ok) {
    throw new Error(
      await buildRuntimeHttpErrorMessage({
        fallbackMessage: `Session cancellation failed with status ${response.status}.`,
        method: "POST",
        operation: "Agent session cancellation request failed",
        response,
        url,
      }),
    );
  }
}
