import {
  buildPlatformApiUrl,
  resolvePlatformApiUrl,
  resolveRequestUrl,
  type ChatBackendConnection,
} from "./connection.js";
import { requestPlatform } from "./platform-request.js";
import { MainSequenceAiError, withMainSequenceAiErrorSource } from "./error-source.js";
import { buildRuntimeHttpErrorMessage } from "./http-error.js";

export interface AgentSessionApiRecord {
  id?: number | string | null;
  uid?: string | null;
  agent_uid?: string | null;
  agent_session?: number | string | null;
  agent_session_uid?: string | null;
  session_uid?: string | null;
  runtime_session_uid?: string | null;
  agent?: number | AgentSessionApiAgent;
  agent_name: string;
  organization_environment_uid?: string | null;
  organization_environment_name?: string | null;
  name?: string | null;
  parent_step?: number | null;
  parent_session_uid?: string | null;
  sequence?: number;
  step_type?: string;
  actor_type?: string;
  actor_name?: string;
  title?: string;
  summary?: string;
  harness?: "pi" | "tau" | null;
  harness_protocol?: "pi-checkpoint-v1" | "tau-session-v1" | null;
  harness_version?: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  llm_provider: string;
  llm_model: string;
  llm_thinking?: string | null;
  active_provider?: string | null;
  active_model?: string | null;
  active_thinking?: string | null;
  engine_name: string;
  runtime_state?: string | null;
  working?: boolean;
  runtime_config_override?: Record<string, unknown>;
  runtime_config_snapshot?: Record<string, unknown>;
  catalog_digest?: string | null;
  input_payload?: Record<string, unknown>;
  output_payload?: Record<string, unknown>;
  error_detail?: string;
  external_step_id?: string;
  metadata?: Record<string, unknown>;
  session_metadata?: Record<string, unknown>;
  created_by_user?: number;
  created_by_user_uid?: string | null;
  is_archived?: boolean;
  archived_at?: string | null;
  /** Owner capability links; `application_logs_url` targets the session log route. */
  observability?: {
    application_logs_url?: string | null;
    resource_usage_url?: string | null;
    deployment_runs_url?: string | null;
    sessions_url?: string | null;
  } | null;
  bound_handle?: {
    uid?: string | null;
    handle_unique_id?: string | null;
    owner_user_uid?: string | null;
    owner_user?: number | string | null;
    is_locked?: boolean | null;
  } | null;
  bound_handles?: Array<{
    id?: number | string | null;
    uid?: string | null;
    handle_unique_id?: string | null;
    owner_user?: number | string | null;
    owner_user_uid?: string | null;
    is_locked: boolean;
  }>;
}

export interface AgentSessionApiAgent {
  id?: number | null;
  uid?: string | null;
  name?: string | null;
  organization_environment_uid?: string | null;
  organization_environment_name?: string | null;
}

export type AgentSessionSerializedRecord = AgentSessionApiRecord & Record<string, unknown>;

export interface StartedAgentSessionResult {
  sessionId: string;
  record: AgentSessionApiRecord | null;
}

function createClientThreadId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `thread-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class AgentSessionNotFoundError extends Error {
  readonly status = 404;
  readonly sessionId: string;

  constructor(sessionId: string | number, message = "AgentSession not found.") {
    super(message);
    this.name = "AgentSessionNotFoundError";
    this.sessionId = String(sessionId);
  }
}

export function isAgentSessionNotFoundError(error: unknown): error is AgentSessionNotFoundError {
  return error instanceof AgentSessionNotFoundError;
}

function buildLatestAgentSessionsUrl({
  connection,
  createdByUserUid,
  agentId,
  organizationEnvironmentUid,
}: {
  connection: ChatBackendConnection;
  createdByUserUid: string | null | undefined;
  agentId?: number | string | null;
  organizationEnvironmentUid: string;
}) {
  const url = buildPlatformApiUrl(connection, "/api/v1/agent-sessions/");
  url.searchParams.set(
    "organization_environment_uid",
    requireOrganizationEnvironmentUid(organizationEnvironmentUid),
  );

  const normalizedAgentId = normalizeIdentifier(agentId);

  if (normalizedAgentId) {
    url.searchParams.set(/^\d+$/.test(normalizedAgentId) ? "agent_id" : "agent_uid", normalizedAgentId);
  }

  if (
    createdByUserUid !== null &&
    createdByUserUid !== undefined &&
    `${createdByUserUid}`.trim()
  ) {
    url.searchParams.set("created_by_user_uid", String(createdByUserUid));
  }

  url.searchParams.set("is_archived", "false");
  url.searchParams.set("ordering", "-started_at");
  url.searchParams.set("limit", "20");

  return resolveRequestUrl(connection, url, "platform");
}

function buildArchivedAgentSessionsUrl({
  agentUid,
  connection,
  createdByUserUid,
  limit,
  organizationEnvironmentUid,
}: {
  agentUid: string;
  connection: ChatBackendConnection;
  createdByUserUid: string;
  limit: number;
  organizationEnvironmentUid: string;
}) {
  const url = buildPlatformApiUrl(connection, "/api/v1/agent-sessions/");
  url.searchParams.set(
    "organization_environment_uid",
    requireOrganizationEnvironmentUid(organizationEnvironmentUid),
  );
  url.searchParams.set("agent_uid", agentUid);
  url.searchParams.set("created_by_user_uid", createdByUserUid);
  url.searchParams.set("is_archived", "true");
  url.searchParams.set("ordering", "-archived_at");
  url.searchParams.set("limit", String(limit));
  return resolveRequestUrl(connection, url, "platform");
}

function buildAgentSessionSearchUrl({
  connection,
  createdByUserUid,
  limit,
  organizationEnvironmentUid,
  query,
}: {
  connection: ChatBackendConnection;
  createdByUserUid: string;
  limit: number;
  organizationEnvironmentUid: string;
  query: string;
}) {
  const url = buildPlatformApiUrl(connection, "/api/v1/agent-sessions/");
  url.searchParams.set(
    "organization_environment_uid",
    requireOrganizationEnvironmentUid(organizationEnvironmentUid),
  );
  url.searchParams.set("created_by_user_uid", createdByUserUid);
  url.searchParams.set("is_archived", "false");
  url.searchParams.set("q", query);
  url.searchParams.set("ordering", "-started_at");
  url.searchParams.set("limit", String(limit));
  return resolveRequestUrl(connection, url, "platform");
}

function buildDeleteAgentSessionUrl(
  connection: ChatBackendConnection,
  sessionId: string | number,
) {
  const normalizedSessionId = requireAgentSessionLookupId(sessionId, "AgentSession delete");
  return resolvePlatformApiUrl(
    connection,
    `/api/v1/agent-sessions/${encodeURIComponent(normalizedSessionId)}/`,
  );
}

function buildAgentSessionArchiveActionUrl(
  connection: ChatBackendConnection,
  sessionId: string | number,
  action: "archive" | "unarchive",
) {
  const normalizedSessionId = requireAgentSessionLookupId(
    sessionId,
    `AgentSession ${action}`,
  );
  return resolvePlatformApiUrl(
    connection,
    `/api/v1/agent-sessions/${encodeURIComponent(normalizedSessionId)}/${action}/`,
  );
}

function buildAgentSessionDetailUrl(
  connection: ChatBackendConnection,
  sessionId: string | number,
) {
  const normalizedSessionId = requireAgentSessionLookupId(sessionId, "AgentSession detail");
  return resolvePlatformApiUrl(
    connection,
    `/api/v1/agent-sessions/${encodeURIComponent(normalizedSessionId)}/`,
  );
}

function buildAgentSessionModelConfigUrl(
  connection: ChatBackendConnection,
  sessionId: string | number,
) {
  const normalizedSessionId = requireAgentSessionLookupId(
    sessionId,
    "AgentSession model config",
  );
  return resolvePlatformApiUrl(
    connection,
    `/api/v1/agent-sessions/${encodeURIComponent(normalizedSessionId)}/`,
  );
}

function buildStartNewAgentSessionUrl(
  connection: ChatBackendConnection,
  agentId: string | number,
) {
  return resolvePlatformApiUrl(
    connection,
    `/api/v1/agents/${encodeURIComponent(String(agentId))}/start-new-session/`,
  );
}

function buildGetOrCreateAgentSessionUrl(
  connection: ChatBackendConnection,
  agentUid: string | number,
) {
  return resolvePlatformApiUrl(
    connection,
    `/api/v1/agents/${encodeURIComponent(String(agentUid))}/sessions/get-or-create-session/`,
  );
}

function normalizeIdentifier(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function requireOrganizationEnvironmentUid(value: unknown) {
  const normalized = normalizeIdentifier(value);

  if (!normalized) {
    throw new MainSequenceAiError(
      "AgentSession requests require organization_environment_uid.",
      { source: "frontend_runtime_guard" },
    );
  }

  return normalized;
}

export function assertAgentSessionEnvironment(
  record: AgentSessionApiRecord,
  organizationEnvironmentUid: string,
) {
  const expectedEnvironmentUid = requireOrganizationEnvironmentUid(
    organizationEnvironmentUid,
  );
  const actualEnvironmentUid = normalizeIdentifier(
    record.organization_environment_uid,
  );

  if (actualEnvironmentUid !== expectedEnvironmentUid) {
    throw new MainSequenceAiError(
      actualEnvironmentUid
        ? `AgentSession belongs to Organization Environment ${actualEnvironmentUid}, not ${expectedEnvironmentUid}.`
        : "AgentSession response did not include organization_environment_uid.",
      { source: "frontend_runtime_guard" },
    );
  }

  return record;
}

export function normalizeAgentSessionLookupId(value: unknown) {
  const normalized = normalizeIdentifier(value);

  if (!normalized) {
    return null;
  }

  const lowered = normalized.toLowerCase();

  if (lowered === "undefined" || lowered === "null") {
    return null;
  }

  return normalized;
}

export function requireAgentSessionLookupId(
  value: unknown,
  contextLabel = "AgentSession",
) {
  const normalized = normalizeAgentSessionLookupId(value);

  if (!normalized) {
    throw new MainSequenceAiError(`${contextLabel} requires a valid session uid.`, {
      source: "frontend_runtime_guard",
    });
  }

  return normalized;
}

function isAgentSessionApiRecord(value: unknown): value is AgentSessionApiRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    (
      normalizeAgentSessionLookupId(candidate.uid) !== null ||
      normalizeAgentSessionLookupId(candidate.agent_session_uid) !== null ||
      normalizeAgentSessionLookupId(candidate.session_uid) !== null ||
      normalizeAgentSessionLookupId(candidate.runtime_session_uid) !== null
    ) &&
    (
      normalizeIdentifier(candidate.agent_session) !== null ||
      typeof candidate.status === "string" ||
      typeof candidate.started_at === "string"
    )
  );
}

function extractStartedAgentSessionRecord(value: unknown): AgentSessionApiRecord | null {
  if (isAgentSessionApiRecord(value)) {
    return value;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  return (
    extractStartedAgentSessionRecord(candidate.session) ??
    extractStartedAgentSessionRecord(candidate.result) ??
    extractStartedAgentSessionRecord(candidate.data)
  );
}

function extractStartedAgentSessionId(value: unknown): string | null {
  const record = extractStartedAgentSessionRecord(value);

  if (record) {
    return getAgentSessionRecordSessionId(record);
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  return (
    normalizeAgentSessionLookupId(candidate.uid) ??
    normalizeAgentSessionLookupId(candidate.agent_session_uid) ??
    normalizeAgentSessionLookupId(candidate.session_uid) ??
    normalizeAgentSessionLookupId(candidate.runtime_session_uid) ??
    extractStartedAgentSessionId(candidate.agent_session) ??
    extractStartedAgentSessionId(candidate.session) ??
    extractStartedAgentSessionId(candidate.result) ??
    extractStartedAgentSessionId(candidate.data)
  );
}

function collectBackendErrorMessages(
  value: unknown,
  fieldLabel?: string,
): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [fieldLabel ? `${fieldLabel}: ${trimmed}` : trimmed] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectBackendErrorMessages(entry, fieldLabel));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const candidate = value as Record<string, unknown>;
  const directMessage = [
    ...collectBackendErrorMessages(candidate.message),
    ...collectBackendErrorMessages(candidate.detail),
    ...collectBackendErrorMessages(candidate.error),
  ];

  if (directMessage.length > 0) {
    return directMessage;
  }

  return Object.entries(candidate).flatMap(([key, entry]) =>
    collectBackendErrorMessages(entry, key === "non_field_errors" ? fieldLabel : key),
  );
}

/**
 * The platform refuses to create a session when neither the request nor the
 * Agent's defaults provide a model: HTTP 400 with `llm_provider` and/or
 * `llm_model` reported as required. Callers catch this one error, ask the
 * person for a model, and create the session again with it.
 */
export class AgentSessionModelRequiredError extends Error {
  readonly agentLookupId: string;
  readonly missing: { provider: boolean; model: boolean };

  constructor(message: string, { agentLookupId, missing }: { agentLookupId: string; missing: { provider: boolean; model: boolean } }) {
    super(message);
    this.name = "AgentSessionModelRequiredError";
    this.agentLookupId = agentLookupId;
    this.missing = missing;
  }
}

function fieldReportsRequired(value: unknown): boolean {
  const entries = Array.isArray(value) ? value : [value];
  return entries.some((entry) => typeof entry === "string" && /required/i.test(entry));
}

/** Returns which model fields the platform reported as required, or null for any other failure. */
export function readAgentSessionModelRequirement(
  status: number,
  payload: unknown,
): { provider: boolean; model: boolean } | null {
  if (status !== 400 || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const provider = fieldReportsRequired(record.llm_provider);
  const model = fieldReportsRequired(record.llm_model);
  return provider || model ? { provider, model } : null;
}

function buildAgentSessionCreationErrorMessage(payload: unknown) {
  const messages = collectBackendErrorMessages(payload)
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (messages.length === 0) {
    return "Unable to create a new session for this agent.";
  }

  return messages.join(" ");
}

export function getAgentSessionRecordSessionId(record: AgentSessionApiRecord) {
  return (
    normalizeAgentSessionLookupId(record.uid) ??
    normalizeAgentSessionLookupId(record.agent_session_uid) ??
    normalizeAgentSessionLookupId(record.session_uid) ??
    normalizeAgentSessionLookupId(record.runtime_session_uid) ??
    ""
  );
}

export function getAgentSessionRecordAgentLookupId(record: AgentSessionApiRecord) {
  if (record.agent && typeof record.agent === "object" && !Array.isArray(record.agent)) {
    const nestedUid = normalizeIdentifier(record.agent.uid);

    if (nestedUid) {
      return nestedUid;
    }
  }

  return normalizeIdentifier(record.agent_uid);
}

export function getAgentSessionRecordAgentId(record: AgentSessionApiRecord) {
  if (typeof record.agent === "number" && Number.isFinite(record.agent)) {
    return record.agent;
  }

  if (record.agent && typeof record.agent === "object" && !Array.isArray(record.agent)) {
    return typeof record.agent.id === "number" && Number.isFinite(record.agent.id)
      ? record.agent.id
      : null;
  }

  return null;
}

export function getAgentSessionRecordAgentName(record: AgentSessionApiRecord) {
  const agentName = record.agent_name?.trim();

  if (agentName) {
    return agentName;
  }

  if (record.agent && typeof record.agent === "object" && !Array.isArray(record.agent)) {
    return record.agent.name?.trim() || "";
  }

  return "";
}

export function getAgentSessionRecordTitle(record: AgentSessionApiRecord) {
  const sessionId = getAgentSessionRecordSessionId(record);
  return (
    record.name?.trim() ||
    record.title?.trim() ||
    record.summary?.trim() ||
    `Agent session ${sessionId}`
  );
}

export function getAgentSessionRecordSummary(record: AgentSessionApiRecord) {
  const trimmed = record.summary?.trim();
  return trimmed || null;
}

export function getAgentSessionRecordHandleUniqueId(record: AgentSessionApiRecord) {
  const singularHandle = record.bound_handle;

  if (singularHandle?.handle_unique_id?.trim()) {
    return singularHandle.handle_unique_id.trim();
  }

  const legacyHandle = Array.isArray(record.bound_handles) ? record.bound_handles[0] : null;
  return legacyHandle?.handle_unique_id?.trim() || null;
}

export function getAgentSessionRecordUpdatedAt(record: AgentSessionApiRecord) {
  return record.ended_at || record.started_at || new Date().toISOString();
}

function readAgentSessionListPayload(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload as AgentSessionApiRecord[];
  }

  if (
    payload &&
    typeof payload === "object" &&
    "results" in payload &&
    Array.isArray((payload as { results?: unknown }).results)
  ) {
    return (payload as { results: AgentSessionApiRecord[] }).results;
  }

  return [];
}

export async function fetchLatestAgentSessions({
  agentId,
  connection,
  createdByUserUid,
  organizationEnvironmentUid,
  signal,
  token,
  tokenType = "Bearer",
}: {
  agentId?: string | number | null;
  connection: ChatBackendConnection;
  createdByUserUid?: string | null;
  organizationEnvironmentUid: string;
  signal?: AbortSignal;
  token?: string | null;
  tokenType?: string;
}) {
  const headers = new Headers({
    Accept: "application/json",
  });

  if (token) {
    headers.set("Authorization", `${tokenType} ${token}`);
  }

  const requestUrl = buildLatestAgentSessionsUrl({
    connection,
    createdByUserUid,
    agentId,
    organizationEnvironmentUid,
  });
  const response = await requestPlatform(connection, requestUrl, {
    method: "GET",
    headers,
    signal,
  });

  if (!response.ok) {
    throw new Error(
      await buildRuntimeHttpErrorMessage({
        fallbackMessage: `Session list failed with status ${response.status}.`,
        method: "GET",
        operation: "Agent session list request failed",
        response,
        url: requestUrl,
      }),
    );
  }

  return readAgentSessionListPayload((await response.json()) as unknown).map((record) =>
    assertAgentSessionEnvironment(record, organizationEnvironmentUid),
  );
}

export async function fetchArchivedAgentSessions({
  agentUid,
  connection,
  createdByUserUid,
  limit = 20,
  organizationEnvironmentUid,
  signal,
  token,
  tokenType = "Bearer",
}: {
  agentUid: string;
  connection: ChatBackendConnection;
  createdByUserUid: string;
  limit?: number;
  organizationEnvironmentUid: string;
  signal?: AbortSignal;
  token?: string | null;
  tokenType?: string;
}) {
  const normalizedAgentUid = normalizeIdentifier(agentUid);
  const normalizedCreatedByUserUid = normalizeIdentifier(createdByUserUid);

  if (!normalizedAgentUid || !normalizedCreatedByUserUid) {
    throw new MainSequenceAiError(
      "Archived AgentSession list requires agent_uid and created_by_user_uid.",
      {
        source: "frontend_runtime_guard",
      },
    );
  }

  const headers = new Headers({
    Accept: "application/json",
  });

  if (token) {
    headers.set("Authorization", `${tokenType} ${token}`);
  }

  const requestUrl = buildArchivedAgentSessionsUrl({
    connection,
    agentUid: normalizedAgentUid,
    createdByUserUid: normalizedCreatedByUserUid,
    limit: Math.max(1, Math.min(100, Math.floor(limit))),
    organizationEnvironmentUid,
  });
  const response = await requestPlatform(connection, requestUrl, {
    method: "GET",
    headers,
    signal,
  });

  if (!response.ok) {
    throw new Error(
      await buildRuntimeHttpErrorMessage({
        fallbackMessage: `Archived session list failed with status ${response.status}.`,
        method: "GET",
        operation: `Archived AgentSession list request failed for agent ${normalizedAgentUid}`,
        response,
        url: requestUrl,
      }),
    );
  }

  return readAgentSessionListPayload((await response.json()) as unknown).map((record) =>
    assertAgentSessionEnvironment(record, organizationEnvironmentUid),
  );
}

export async function searchAgentSessions({
  connection,
  createdByUserUid,
  limit = 20,
  organizationEnvironmentUid,
  query,
  signal,
  token,
  tokenType = "Bearer",
}: {
  connection: ChatBackendConnection;
  createdByUserUid: string;
  limit?: number;
  organizationEnvironmentUid: string;
  query: string;
  signal?: AbortSignal;
  token?: string | null;
  tokenType?: string;
}) {
  const normalizedCreatedByUserUid = normalizeIdentifier(createdByUserUid);
  const normalizedQuery = query.trim();

  if (!normalizedCreatedByUserUid || !normalizedQuery) {
    throw new MainSequenceAiError(
      "AgentSession search requires created_by_user_uid and a query.",
      {
        source: "frontend_runtime_guard",
      },
    );
  }

  const headers = new Headers({
    Accept: "application/json",
  });

  if (token) {
    headers.set("Authorization", `${tokenType} ${token}`);
  }

  const requestUrl = buildAgentSessionSearchUrl({
    connection,
    createdByUserUid: normalizedCreatedByUserUid,
    limit: Math.max(1, Math.min(100, Math.floor(limit))),
    organizationEnvironmentUid,
    query: normalizedQuery,
  });
  const response = await requestPlatform(connection, requestUrl, {
    method: "GET",
    headers,
    signal,
  });

  if (!response.ok) {
    throw new Error(
      await buildRuntimeHttpErrorMessage({
        fallbackMessage: `Conversation search failed with status ${response.status}.`,
        method: "GET",
        operation: "AgentSession conversation search failed",
        response,
        url: requestUrl,
      }),
    );
  }

  return readAgentSessionListPayload((await response.json()) as unknown).map((record) =>
    assertAgentSessionEnvironment(record, organizationEnvironmentUid),
  );
}

export async function deleteAgentSessionRequest({
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
  const headers = new Headers();

  if (token) {
    headers.set("Authorization", `${tokenType} ${token}`);
  }

  const requestUrl = buildDeleteAgentSessionUrl(connection, sessionId);
  const response = await requestPlatform(connection, requestUrl, {
    method: "DELETE",
    headers,
    signal,
  });

  if (!response.ok) {
    throw new Error(
      await buildRuntimeHttpErrorMessage({
        fallbackMessage: `Session delete failed with status ${response.status}.`,
        method: "DELETE",
        operation: `Agent session delete request failed for session ${sessionId}`,
        response,
        url: requestUrl,
      }),
    );
  }
}

async function mutateAgentSessionArchiveState({
  action,
  connection,
  sessionId,
  signal,
  token,
  tokenType = "Bearer",
}: {
  action: "archive" | "unarchive";
  connection: ChatBackendConnection;
  sessionId: string | number;
  signal?: AbortSignal;
  token?: string | null;
  tokenType?: string;
}) {
  const headers = new Headers({
    Accept: "application/json",
  });

  if (token) {
    headers.set("Authorization", `${tokenType} ${token}`);
  }

  const requestUrl = buildAgentSessionArchiveActionUrl(connection, sessionId, action);
  const response = await requestPlatform(connection, requestUrl, {
    method: "POST",
    headers,
    signal,
  });

  if (!response.ok) {
    throw new Error(
      await buildRuntimeHttpErrorMessage({
        fallbackMessage: `Session ${action} failed with status ${response.status}.`,
        method: "POST",
        operation: `AgentSession ${action} request failed for session ${sessionId}`,
        response,
        url: requestUrl,
      }),
    );
  }

  return (await response.json()) as AgentSessionApiRecord;
}

export function archiveAgentSessionRequest(
  input: Omit<Parameters<typeof mutateAgentSessionArchiveState>[0], "action">,
) {
  return mutateAgentSessionArchiveState({
    ...input,
    action: "archive",
  });
}

export function unarchiveAgentSessionRequest(
  input: Omit<Parameters<typeof mutateAgentSessionArchiveState>[0], "action">,
) {
  return mutateAgentSessionArchiveState({
    ...input,
    action: "unarchive",
  });
}

export async function fetchAgentSessionDetail({
  connection,
  organizationEnvironmentUid,
  sessionId,
  signal,
  token,
  tokenType = "Bearer",
}: {
  connection: ChatBackendConnection;
  organizationEnvironmentUid: string;
  sessionId: string | number;
  signal?: AbortSignal;
  token?: string | null;
  tokenType?: string;
}): Promise<AgentSessionSerializedRecord> {
  const headers = new Headers({
    Accept: "application/json",
  });

  if (token) {
    headers.set("Authorization", `${tokenType} ${token}`);
  }

  const requestUrl = buildAgentSessionDetailUrl(connection, sessionId);
  const response = await requestPlatform(connection, requestUrl, {
    method: "GET",
    headers,
    signal,
  });

  if (!response.ok) {
    const message = await buildRuntimeHttpErrorMessage({
      fallbackMessage: `Session detail failed with status ${response.status}.`,
      method: "GET",
      operation: `Agent session detail request failed for session ${sessionId}`,
      response,
      url: requestUrl,
    });

    if (response.status === 404) {
      throw new AgentSessionNotFoundError(
        sessionId,
        withMainSequenceAiErrorSource({
          message,
          source: "agent_session_detail",
        }),
      );
    }

    throw new MainSequenceAiError(message, {
      source: "agent_session_detail",
      status: response.status,
    });
  }

  const record = (await response.json()) as AgentSessionSerializedRecord;
  assertAgentSessionEnvironment(record, organizationEnvironmentUid);
  return record;
}

export async function startNewAgentSessionRequest({
  agentId,
  connection,
  signal,
  threadId,
  token,
  tokenType = "Bearer",
}: {
  agentId: string | number;
  connection: ChatBackendConnection;
  signal?: AbortSignal;
  threadId?: string | null;
  token?: string | null;
  tokenType?: string;
}): Promise<StartedAgentSessionResult> {
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
  });

  if (token) {
    headers.set("Authorization", `${tokenType} ${token}`);
  }

  const normalizedThreadId = normalizeIdentifier(threadId) ?? createClientThreadId();

  const requestUrl = buildStartNewAgentSessionUrl(connection, agentId);
  const response = await requestPlatform(connection, requestUrl, {
    method: "POST",
    body: JSON.stringify({
      thread_id: normalizedThreadId,
    }),
    headers,
    signal,
  });

  const rawBody = await response.clone().text().catch(() => "");
  let payload: unknown = null;

  if (rawBody.trim()) {
    try {
      payload = JSON.parse(rawBody) as unknown;
    } catch {
      payload = rawBody;
    }
  }

  if (!response.ok) {
    const message = await buildRuntimeHttpErrorMessage({
      fallbackMessage: buildAgentSessionCreationErrorMessage(payload),
      method: "POST",
      operation: `Agent session creation request failed for agent ${agentId}`,
      response,
      url: requestUrl,
    });
    const missing = readAgentSessionModelRequirement(response.status, payload);
    if (missing) {
      throw new AgentSessionModelRequiredError(message, { agentLookupId: String(agentId), missing });
    }
    throw new Error(message);
  }

  const record = extractStartedAgentSessionRecord(payload);
  const sessionId = extractStartedAgentSessionId(payload);

  if (!sessionId) {
    throw new Error("Session creation succeeded but no AgentSession uid was returned.");
  }

  return {
    sessionId,
    record,
  };
}

export async function getOrCreateAgentSessionRequest({
  agentUid,
  connection,
  handleUniqueId,
  parentSessionUid,
  llmModel,
  llmProvider,
  llmThinking,
  name,
  signal,
  sessionUid,
  token,
  tokenType = "Bearer",
}: {
  agentUid: string | number;
  connection: ChatBackendConnection;
  handleUniqueId?: string | null;
  llmModel?: string | null;
  llmProvider?: string | null;
  llmThinking?: string | null;
  name?: string | null;
  parentSessionUid?: string | null;
  signal?: AbortSignal;
  sessionUid?: string | number | null;
  token?: string | null;
  tokenType?: string;
}): Promise<StartedAgentSessionResult> {
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
  });

  if (token) {
    headers.set("Authorization", `${tokenType} ${token}`);
  }

  const normalizedSessionUid = normalizeAgentSessionLookupId(sessionUid);
  const normalizedHandleUniqueId = normalizeIdentifier(handleUniqueId);

  if (Boolean(normalizedSessionUid) === Boolean(normalizedHandleUniqueId)) {
    throw new MainSequenceAiError(
      "AgentSession get-or-create requires exactly one of session_uid or handle_unique_id.",
      {
        source: "frontend_runtime_guard",
      },
    );
  }

  const body: Record<string, string> = {};

  if (normalizedSessionUid) {
    body.session_uid = normalizedSessionUid;
  } else if (normalizedHandleUniqueId) {
    body.handle_unique_id = normalizedHandleUniqueId;

    const normalizedName = normalizeIdentifier(name);
    const normalizedParentSessionUid = normalizeAgentSessionLookupId(parentSessionUid);
    const normalizedLlmProvider = normalizeIdentifier(llmProvider);
    const normalizedLlmModel = normalizeIdentifier(llmModel);
    const normalizedLlmThinking = typeof llmThinking === "string" ? llmThinking : null;

    if (normalizedName) {
      body.name = normalizedName;
    }

    if (normalizedParentSessionUid) {
      body.parent_session_uid = normalizedParentSessionUid;
    }

    if (normalizedLlmProvider) {
      body.llm_provider = normalizedLlmProvider;
    }

    if (normalizedLlmModel) {
      body.llm_model = normalizedLlmModel;
    }

    if (normalizedLlmThinking !== null) {
      body.llm_thinking = normalizedLlmThinking;
    }
  }

  const requestUrl = buildGetOrCreateAgentSessionUrl(connection, agentUid);
  const response = await requestPlatform(connection, requestUrl, {
    method: "POST",
    body: JSON.stringify(body),
    headers,
    signal,
  });

  const rawBody = await response.clone().text().catch(() => "");
  let payload: unknown = null;

  if (rawBody.trim()) {
    try {
      payload = JSON.parse(rawBody) as unknown;
    } catch {
      payload = rawBody;
    }
  }

  if (!response.ok) {
    const message = await buildRuntimeHttpErrorMessage({
      fallbackMessage: buildAgentSessionCreationErrorMessage(payload),
      method: "POST",
      operation: `Agent session get-or-create request failed for agent ${agentUid}`,
      response,
      url: requestUrl,
    });
    const missing = readAgentSessionModelRequirement(response.status, payload);
    if (missing) {
      throw new AgentSessionModelRequiredError(message, { agentLookupId: String(agentUid), missing });
    }
    throw new Error(message);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("AgentSession get-or-create succeeded but did not return an AgentSession object.");
  }

  const record = payload as AgentSessionApiRecord;
  const sessionId = normalizeAgentSessionLookupId(record.uid);

  if (!sessionId) {
    throw new Error("AgentSession get-or-create succeeded but no AgentSession uid was returned.");
  }

  return {
    sessionId,
    record,
  };
}

export async function patchAgentSessionModelConfig({
  connection,
  llmModel,
  llmProvider,
  llmThinking,
  sessionId,
  signal,
  token,
  tokenType = "Bearer",
}: {
  connection: ChatBackendConnection;
  llmModel: string;
  llmProvider: string;
  llmThinking?: string | null;
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

  const requestUrl = buildAgentSessionModelConfigUrl(connection, sessionId);
  const response = await requestPlatform(connection, requestUrl, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      llm_provider: llmProvider,
      llm_model: llmModel,
      llm_thinking: typeof llmThinking === "string" ? llmThinking : "",
    }),
    signal,
  });

  if (!response.ok) {
    const errorPayload = (await response
      .clone()
      .json()
      .catch(() => null)) as Record<string, unknown> | null;
    const errorCode =
      typeof errorPayload?.error_code === "string" ? errorPayload.error_code : null;
    const detail = typeof errorPayload?.detail === "string" ? errorPayload.detail : null;

    throw new MainSequenceAiError(
      await buildRuntimeHttpErrorMessage({
        fallbackMessage: `Session model update failed with status ${response.status}.`,
        method: "PATCH",
        operation: `Agent session model update request failed for session ${sessionId}`,
        response,
        url: requestUrl,
      }),
      {
        code: errorCode,
        detail,
        source: "agent_session_selection",
        status: response.status,
      },
    );
  }

  const payload = (await response.json()) as unknown;

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new MainSequenceAiError(
      "AgentSession model update succeeded without returning the canonical AgentSession.",
      { source: "agent_session_selection", status: response.status },
    );
  }

  return payload as AgentSessionSerializedRecord;
}
