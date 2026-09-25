import { normalizeAgentSessionLookupId, requireAgentSessionLookupId } from "./agent-sessions-api.js";
import { resolvePlatformApiUrl, type ChatBackendConnection } from "./connection.js";
import { requestPlatform } from "./platform-request.js";
import { MainSequenceAiError } from "./error-source.js";
import { buildRuntimeHttpErrorMessage } from "./http-error.js";
import {
  normalizeAgentRuntimeInteraction,
  type AgentRuntimeInteraction,
  type AgentRuntimePresence,
  type AgentRuntimePresencePhase,
} from "./runtime-interaction.js";

export type {
  AgentRuntimePresence,
  AgentRuntimePresencePhase,
} from "./runtime-interaction.js";

export interface AgentSessionRuntimeAccess {
  sessionId: string;
  codingAgentId: string | null;
  codingAgentServiceId: string | null;
  mode: "token" | "unavailable" | null;
  rpcUrl: string | null;
  token: string | null;
  isReady: boolean | null;
  serviceRuntimeId: string | null;
  ready: Record<string, unknown> | null;
  reconciliation: Record<string, unknown> | null;
  runtimeInteraction: AgentRuntimeInteraction;
  runtimePresence: AgentRuntimePresence;
  detail: string | null;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeIdentifier(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return normalizeString(value);
}

function normalizeBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function normalizeRuntimeAccessMode(value: unknown): AgentSessionRuntimeAccess["mode"] {
  const normalized = normalizeString(value);
  return normalized === "token" || normalized === "unavailable" ? normalized : null;
}

function normalizeOptionalRecord(value: unknown) {
  const record = asRecord(value);
  return Object.keys(record).length > 0 ? record : null;
}

const RUNTIME_PRESENCE_PHASES = new Set<AgentRuntimePresencePhase>([
  "not_deployed",
  "observing",
  "idle",
  "provisioning",
  "pulling_image",
  "starting",
  "serving",
  "redeploying",
  "failed",
]);
const RUNTIME_WAKE_STATES = new Set<NonNullable<AgentRuntimePresence["wake"]>["state"]>([
  "requested",
  "in_progress",
  "serving",
  "failed",
  "expired",
  "superseded",
]);

function normalizeNullableReplica(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

export function normalizeAgentRuntimePresence(value: unknown): AgentRuntimePresence | null {
  const candidate = asRecord(value);
  const phase = normalizeString(candidate.phase) as AgentRuntimePresencePhase | null;
  const replicas = asRecord(candidate.replicas);
  const detail = normalizeString(candidate.detail);
  if (!phase || !RUNTIME_PRESENCE_PHASES.has(phase) || !detail) {
    return null;
  }

  const rawWake = candidate.wake == null ? null : asRecord(candidate.wake);
  let wake: AgentRuntimePresence["wake"] = null;
  if (rawWake) {
    const operationUid = normalizeString(rawWake.operation_uid ?? rawWake.operationUid);
    const state = normalizeString(rawWake.state) as NonNullable<AgentRuntimePresence["wake"]>["state"] | null;
    const requestedAt = normalizeString(rawWake.requested_at ?? rawWake.requestedAt);
    const deadlineAt = normalizeString(rawWake.deadline_at ?? rawWake.deadlineAt);
    if (!operationUid || !state || !RUNTIME_WAKE_STATES.has(state) || !requestedAt || !deadlineAt) {
      return null;
    }
    wake = { operationUid, state, requestedAt, deadlineAt };
  }

  return {
    phase,
    replicas: {
      desired: normalizeNullableReplica(replicas.desired),
      actual: normalizeNullableReplica(replicas.actual),
    },
    detail,
    observedAt: normalizeString(candidate.observed_at ?? candidate.observedAt),
    wake,
  };
}

function buildAgentSessionRuntimeAccessUrl(
  connection: ChatBackendConnection,
  sessionId: string | number,
) {
  const normalizedSessionId = requireAgentSessionLookupId(
    sessionId,
    "AgentSession runtime access",
  );
  return resolvePlatformApiUrl(
    connection,
    `/api/v1/agent-sessions/${encodeURIComponent(normalizedSessionId)}/resolve-runtime-access/`,
  );
}

function normalizeRuntimeAccess(
  payload: unknown,
  options: {
    fallbackSessionId: string | number;
  },
): AgentSessionRuntimeAccess {
  const candidate = asRecord(payload);
  const sessionId =
    normalizeAgentSessionLookupId(candidate.uid) ??
    normalizeAgentSessionLookupId(candidate.agent_session_uid) ??
    normalizeAgentSessionLookupId(candidate.session_uid) ??
    normalizeAgentSessionLookupId(candidate.sessionUid) ??
    normalizeAgentSessionLookupId(candidate.runtime_session_uid) ??
    normalizeAgentSessionLookupId(candidate.runtimeSessionUid) ??
    requireAgentSessionLookupId(options.fallbackSessionId, "AgentSession runtime access");
  const runtimeInteraction = normalizeAgentRuntimeInteraction(
    candidate.runtime_interaction ?? candidate.runtimeInteraction,
  );
  const runtimePresence = normalizeAgentRuntimePresence(
    candidate.runtime_presence ?? candidate.runtimePresence,
  );
  if (!runtimeInteraction || !runtimePresence) {
    throw new MainSequenceAiError(
      "Runtime access response is missing the runtime interaction or presence contract.",
      { source: "frontend_runtime_parser" },
    );
  }

  return {
    sessionId,
    codingAgentId: normalizeIdentifier(
      candidate.coding_agent_uid ??
        candidate.codingAgentUid ??
        candidate.coding_agent_id ??
        candidate.codingAgentId,
    ),
    codingAgentServiceId: normalizeIdentifier(
      candidate.coding_agent_service_uid ??
        candidate.codingAgentServiceUid ??
        candidate.coding_agent_service_id ??
        candidate.codingAgentServiceId,
    ),
    mode: normalizeRuntimeAccessMode(candidate.mode),
    rpcUrl: normalizeString(candidate.rpc_url) ?? normalizeString(candidate.rpcUrl),
    token: normalizeString(candidate.token),
    isReady: normalizeBoolean(candidate.is_ready) ?? normalizeBoolean(candidate.isReady),
    serviceRuntimeId: normalizeIdentifier(
      candidate.service_runtime_uid ??
        candidate.serviceRuntimeUid ??
        candidate.service_runtime ??
        candidate.serviceRuntime,
    ),
    ready: normalizeOptionalRecord(candidate.ready),
    reconciliation: normalizeOptionalRecord(candidate.reconciliation),
    runtimeInteraction,
    runtimePresence,
    detail: normalizeString(candidate.detail),
  };
}

export async function fetchAgentSessionRuntimeAccess({
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
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
  });

  if (token) {
    headers.set("Authorization", `${tokenType} ${token}`);
  }

  const requestUrl = buildAgentSessionRuntimeAccessUrl(connection, sessionId);
  let response: Response;
  try {
    response = await requestPlatform(connection, requestUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
      signal,
    });
  } catch (error) {
    throw new MainSequenceAiError(
      error instanceof Error
        ? error.message
        : "AgentSession runtime access request failed before receiving a response.",
      { source: "assistant_runtime_access" },
    );
  }

  if (!response.ok) {
    throw new MainSequenceAiError(
      await buildRuntimeHttpErrorMessage({
        fallbackMessage: `AgentSession runtime access failed with status ${response.status}.`,
        method: "POST",
        operation: `AgentSession runtime access request failed for session ${sessionId}`,
        response,
        url: requestUrl,
      }),
      {
        source: "assistant_runtime_access",
        status: response.status,
      },
    );
  }

  const payload = (await response.json()) as unknown;
  return normalizeRuntimeAccess(payload, {
    fallbackSessionId: sessionId,
  });
}
