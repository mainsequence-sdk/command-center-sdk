import type { ThreadMessageLike } from "@assistant-ui/react";

import {
  getAgentSessionRecordAgentId,
  getAgentSessionRecordAgentName,
  getAgentSessionRecordHandleUniqueId,
  getAgentSessionRecordSessionId,
  getAgentSessionRecordTitle,
  normalizeAgentSessionLookupId,
  type AgentSessionApiRecord,
  type AgentSessionSerializedRecord,
} from "../backend/agent-sessions-api.js";

export const DEFAULT_AGENT_LABEL = "Agent";

export interface AgentSessionAgent {
  id: number | null;
  uid?: string | null;
  name: string;
  displayLabel: string;
  agentUniqueId: string;
  description: string;
  status: string;
  llmProvider: string;
  llmModel: string;
  engineName: string;
  organizationEnvironmentUid?: string | null;
  organizationEnvironmentName?: string | null;
}

/**
 * Marks the session a chat opens behind its stable handle (the default session). The value keeps
 * its original name so session lists stored by earlier versions stay readable.
 */
export const DEFAULT_SESSION_ORIGIN = "command_center_shortcut";
export type DefaultSessionOrigin = typeof DEFAULT_SESSION_ORIGIN;

export interface AgentSessionRecord {
  id: string;
  sessionName?: string | null;
  title: string;
  preview: string | null;
  runtimeSessionId: string | null;
  sessionKey: string | null;
  handleUniqueId: string | null;
  threadId: string | null;
  codeRepositoryBranchId: string | null;
  cwd: string | null;
  runtimeState: string | null;
  working: boolean;
  updatedAt: string;
  organizationEnvironmentUid?: string | null;
  organizationEnvironmentName?: string | null;
  agent: AgentSessionAgent | null;
  origin: DefaultSessionOrigin | null;
  isPlaceholder: boolean;
  serializedSession: AgentSessionSerializedRecord | null;
  messages: ThreadMessageLike[];
}

export type AgentSessionSummary = Omit<AgentSessionRecord, "messages" | "serializedSession">;

export interface StreamCreatedAgentSession {
  agentId: number | null;
  agentSessionId: string;
  agentUniqueId: string | null;
  sessionKey: string | null;
  threadId: string | null;
}

function buildStorageKey(userId: string | null, organizationEnvironmentUid: string | null) {
  return `ms.main-sequence-ai.agent-sessions:${userId ?? "anonymous"}:${organizationEnvironmentUid ?? "no-environment"}`;
}

function inferRuntimeSessionId(id: string) {
  return normalizeAgentSessionLookupId(id);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeSerializedThinkingValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function extractTextContent(message: ThreadMessageLike) {
  if (typeof message.content === "string") {
    return message.content.trim();
  }

  if (!Array.isArray(message.content)) {
    return "";
  }

  return message.content
    .flatMap((part) => {
      if (part.type !== "text" || typeof part.text !== "string") {
        return [];
      }

      return [part.text];
    })
    .join("")
    .trim();
}

export function createAgentSessionId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `agent-session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** The fields of an Agent record that a session keeps, as the platform's agent list returns them. */
export interface AgentSessionAgentSource {
  id: number;
  uid?: string;
  name: string;
  displayLabel: string;
  agent_unique_id: string;
  description: string;
  status?: string;
  llm_provider: string;
  llm_model: string;
  engine_name: string;
  organization_environment_uid?: string | null;
}

export function toAgentSessionAgent(agent: AgentSessionAgentSource): AgentSessionAgent {
  return {
    id: agent.id > 0 ? agent.id : null,
    uid: agent.uid ?? null,
    name: agent.name,
    displayLabel: agent.displayLabel,
    agentUniqueId: agent.agent_unique_id,
    description: agent.description,
    status: agent.status ?? "",
    llmProvider: agent.llm_provider,
    llmModel: agent.llm_model,
    engineName: agent.engine_name,
    organizationEnvironmentUid: agent.organization_environment_uid ?? null,
    organizationEnvironmentName: null,
  };
}

export function createDefaultAgentSessionAgent(): AgentSessionAgent {
  return {
    id: null,
    uid: null,
    name: DEFAULT_AGENT_LABEL,
    displayLabel: DEFAULT_AGENT_LABEL,
    agentUniqueId: "",
    description: "",
    status: "",
    llmProvider: "",
    llmModel: "",
    engineName: "",
    organizationEnvironmentUid: null,
    organizationEnvironmentName: null,
  };
}

export function toAgentSessionRecordFromApi(
  record: AgentSessionApiRecord,
  existing?: AgentSessionRecord,
): AgentSessionRecord {
  const sessionId = getAgentSessionRecordSessionId(record);
  if (!sessionId) {
    throw new Error(
      "AgentSession response did not include uid, agent_session_uid, session_uid, or runtime_session_uid.",
    );
  }
  const updatedAt = record.ended_at || record.started_at || new Date().toISOString();
  const title = getAgentSessionRecordTitle(record);
  const sessionName =
    record.name !== undefined
      ? record.name?.trim() || null
      : existing?.sessionName?.trim() || null;
  const preview = record.summary?.trim() || null;
  const recordAgentId = getAgentSessionRecordAgentId(record);
  const recordAgentUid = record.agent_uid?.trim() || null;
  const recordAgentName = getAgentSessionRecordAgentName(record);
  const hasCanonicalSessionUid = Boolean(
    normalizeAgentSessionLookupId(record.uid) ||
      normalizeAgentSessionLookupId(record.agent_session_uid) ||
      normalizeAgentSessionLookupId(record.session_uid) ||
      normalizeAgentSessionLookupId(record.runtime_session_uid),
  );
  const handleUniqueId = getAgentSessionRecordHandleUniqueId(record) ?? existing?.handleUniqueId ?? null;
  // A session never changes Agent, so the known unique id survives a refresh
  // unless the record explicitly names a different Agent.
  const recordNamesAnotherAgent =
    (recordAgentId !== null &&
      typeof existing?.agent?.id === "number" &&
      existing.agent.id !== recordAgentId) ||
    (recordAgentUid !== null &&
      Boolean(existing?.agent?.uid) &&
      existing?.agent?.uid !== recordAgentUid);
  const preservedAgentUniqueId =
    existing?.agent?.agentUniqueId && !recordNamesAnotherAgent
      ? existing.agent.agentUniqueId
      : null;

  return {
    id: sessionId,
    sessionName,
    title,
    preview,
    runtimeSessionId:
      hasCanonicalSessionUid
        ? sessionId
        : normalizeAgentSessionLookupId(existing?.runtimeSessionId) ?? sessionId,
    sessionKey: existing?.sessionKey ?? null,
    handleUniqueId,
    threadId: existing?.threadId ?? null,
    codeRepositoryBranchId: existing?.codeRepositoryBranchId ?? null,
    cwd: existing?.cwd ?? null,
    runtimeState: record.runtime_state?.trim() || existing?.runtimeState || null,
    // `working` is run-scoped truth: when the backend omits the field, the
    // session is NOT working. Falling back to `existing.working` let one hung
    // stream wedge "Session is working..." forever, because the API never
    // sends working:false to clear it. The provider re-applies the flag for
    // the session that owns the live client stream.
    working: record.working ?? false,
    updatedAt,
    organizationEnvironmentUid:
      record.organization_environment_uid?.trim() ||
      existing?.organizationEnvironmentUid ||
      null,
    organizationEnvironmentName:
      record.organization_environment_name?.trim() ||
      existing?.organizationEnvironmentName ||
      null,
    origin: existing?.origin ?? null,
    isPlaceholder: false,
    serializedSession: existing?.serializedSession ?? null,
    agent: {
      id: recordAgentId ?? existing?.agent?.id ?? null,
      uid: recordAgentUid || existing?.agent?.uid || null,
      name: recordAgentName || existing?.agent?.name || "",
      displayLabel: existing?.agent?.displayLabel || "",
      agentUniqueId: preservedAgentUniqueId ?? "",
      description: existing?.agent?.description || "",
      status: record.status || existing?.agent?.status || "",
      llmProvider: record.llm_provider || existing?.agent?.llmProvider || "",
      llmModel: record.llm_model || existing?.agent?.llmModel || "",
      engineName: record.engine_name || existing?.agent?.engineName || "",
      organizationEnvironmentUid:
        record.organization_environment_uid?.trim() ||
        existing?.agent?.organizationEnvironmentUid ||
        null,
      organizationEnvironmentName:
        record.organization_environment_name?.trim() ||
        existing?.agent?.organizationEnvironmentName ||
        null,
    },
    messages: existing?.messages ?? [],
  };
}

export function summarizeAgentSession(record: AgentSessionRecord): AgentSessionSummary {
  const { messages: _messages, serializedSession: _serializedSession, ...summary } = record;
  return summary;
}

export function buildAgentSessionTitle({
  agent,
  messages,
}: {
  agent: AgentSessionAgent | null;
  messages: readonly ThreadMessageLike[];
}) {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const firstUserText = firstUserMessage ? extractTextContent(firstUserMessage) : "";

  if (firstUserText) {
    return firstUserText.length > 72 ? `${firstUserText.slice(0, 69)}...` : firstUserText;
  }

  if (agent?.displayLabel) {
    return agent.displayLabel;
  }

  return "New agent session";
}

export function buildAgentSessionPreview(messages: readonly ThreadMessageLike[]) {
  const latestMessage = [...messages]
    .reverse()
    .find((message) => message.role === "assistant" || message.role === "user");

  if (!latestMessage) {
    return null;
  }

  const text = extractTextContent(latestMessage);
  if (!text) {
    return null;
  }

  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

export function createEmptyAgentSession(
  agent: AgentSessionAgent | null = null,
  options: { placeholder?: boolean } = {},
): AgentSessionRecord {
  return {
    id: createAgentSessionId(),
    sessionName: null,
    title: agent?.displayLabel ?? "New agent session",
    preview: null,
    runtimeSessionId: null,
    sessionKey: null,
    handleUniqueId: null,
    threadId: null,
    codeRepositoryBranchId: null,
    cwd: null,
    runtimeState: null,
    working: false,
    updatedAt: new Date().toISOString(),
    organizationEnvironmentUid: agent?.organizationEnvironmentUid ?? null,
    organizationEnvironmentName: agent?.organizationEnvironmentName ?? null,
    agent,
    origin: null,
    isPlaceholder: options.placeholder ?? false,
    serializedSession: null,
    messages: [],
  };
}

export function attachSerializedSessionToSession(
  session: AgentSessionRecord,
  serializedSession: AgentSessionSerializedRecord,
) {
  return {
    ...toAgentSessionRecordFromApi(serializedSession, session),
    serializedSession: cloneJson(serializedSession),
  } satisfies AgentSessionRecord;
}

export function toDefaultSessionRecordFromApi(
  record: AgentSessionApiRecord,
  existing?: AgentSessionRecord,
): AgentSessionRecord {
  const nextSession = toAgentSessionRecordFromApi(record, existing);

  return {
    ...nextSession,
    origin: DEFAULT_SESSION_ORIGIN,
    serializedSession: cloneJson(record as AgentSessionSerializedRecord),
  };
}

export function applyModelConfigToSerializedSession(
  serializedSession: AgentSessionSerializedRecord | null,
  {
    model,
    provider,
    thinking = "",
  }: {
    model: string;
    provider: string;
    thinking?: string | null;
  },
) {
  if (!serializedSession) {
    return null;
  }

  return {
    ...cloneJson(serializedSession),
    llm_model: model,
    llm_provider: provider,
    llm_thinking: normalizeSerializedThinkingValue(thinking),
  } satisfies AgentSessionSerializedRecord;
}

export function updateAgentSessionSnapshot({
  session,
  messages,
  updatedAt = new Date().toISOString(),
}: {
  session: AgentSessionRecord;
  messages: readonly ThreadMessageLike[];
  updatedAt?: string;
}): AgentSessionRecord {
  const normalizedMessages = cloneJson([...messages]) as ThreadMessageLike[];

  return {
    ...session,
    messages: normalizedMessages,
    isPlaceholder: normalizedMessages.length > 0 ? false : session.isPlaceholder,
    preview: buildAgentSessionPreview(normalizedMessages),
    title: buildAgentSessionTitle({
      agent: session.agent,
      messages: normalizedMessages,
    }),
    updatedAt,
  };
}

export function attachAgentToSession(session: AgentSessionRecord, agent: AgentSessionAgentSource) {
  const nextAgent = toAgentSessionAgent(agent);
  return {
    ...session,
    agent: nextAgent,
    origin: session.origin,
    isPlaceholder: false,
    title:
      session.messages.length === 0
        ? nextAgent.displayLabel
        : buildAgentSessionTitle({ agent: nextAgent, messages: session.messages }),
    updatedAt: new Date().toISOString(),
  };
}

export function promoteAgentSessionFromStream({
  session,
  stream,
  messages,
}: {
  session: AgentSessionRecord;
  stream: StreamCreatedAgentSession;
  messages: readonly ThreadMessageLike[];
}) {
  const nextAgent =
    session.agent || createDefaultAgentSessionAgent();

  return updateAgentSessionSnapshot({
    session: {
      ...session,
      id: stream.agentSessionId,
      runtimeSessionId: stream.agentSessionId,
      sessionKey: stream.sessionKey ?? session.sessionKey,
      handleUniqueId: session.handleUniqueId,
      threadId: stream.threadId ?? session.threadId,
      origin: session.origin,
      isPlaceholder: false,
      updatedAt: new Date().toISOString(),
      agent: {
        ...nextAgent,
        id: stream.agentId ?? nextAgent.id,
        agentUniqueId: stream.agentUniqueId ?? nextAgent.agentUniqueId,
      },
    },
    messages,
  });
}

export function readAgentSessions(
  userId: string | null,
  organizationEnvironmentUid: string | null,
) {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(
      buildStorageKey(userId, organizationEnvironmentUid),
    );
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return [];
      }

      const candidate = entry as Partial<AgentSessionRecord>;

      const storedSessionId = normalizeAgentSessionLookupId(candidate.id);

      if (!storedSessionId) {
        return [];
      }

      return [
        {
          id: storedSessionId,
          sessionName:
            typeof candidate.sessionName === "string" && candidate.sessionName.trim()
              ? candidate.sessionName.trim()
              : null,
          title:
            typeof candidate.title === "string" && candidate.title.trim()
              ? candidate.title
              : "New agent session",
          preview: typeof candidate.preview === "string" ? candidate.preview : null,
          runtimeSessionId:
            normalizeAgentSessionLookupId(candidate.runtimeSessionId)
              ? normalizeAgentSessionLookupId(candidate.runtimeSessionId)
              : inferRuntimeSessionId(storedSessionId),
          sessionKey:
            typeof candidate.sessionKey === "string" && candidate.sessionKey
              ? candidate.sessionKey
              : null,
          handleUniqueId:
            typeof candidate.handleUniqueId === "string" && candidate.handleUniqueId
              ? candidate.handleUniqueId
              : null,
          threadId:
            typeof candidate.threadId === "string" && candidate.threadId
              ? candidate.threadId
              : null,
          codeRepositoryBranchId:
            typeof candidate.codeRepositoryBranchId === "string" && candidate.codeRepositoryBranchId
              ? candidate.codeRepositoryBranchId
              : null,
          cwd:
            typeof candidate.cwd === "string" && candidate.cwd
              ? candidate.cwd
              : null,
          runtimeState:
            typeof candidate.runtimeState === "string" && candidate.runtimeState
              ? candidate.runtimeState
              : null,
          // Restored sessions are never working — a persisted working flag
          // from a hung stream must not survive a reload.
          working: false,
          updatedAt:
            typeof candidate.updatedAt === "string" && candidate.updatedAt
              ? candidate.updatedAt
              : new Date().toISOString(),
          organizationEnvironmentUid:
            typeof candidate.organizationEnvironmentUid === "string" &&
            candidate.organizationEnvironmentUid.trim()
              ? candidate.organizationEnvironmentUid.trim()
              : organizationEnvironmentUid,
          organizationEnvironmentName:
            typeof candidate.organizationEnvironmentName === "string" &&
            candidate.organizationEnvironmentName.trim()
              ? candidate.organizationEnvironmentName.trim()
              : null,
          origin:
            candidate.origin === DEFAULT_SESSION_ORIGIN
              ? DEFAULT_SESSION_ORIGIN
              : null,
          agent:
            candidate.agent && typeof candidate.agent === "object" && !Array.isArray(candidate.agent)
              ? (() => {
                  const agent = candidate.agent as Partial<AgentSessionAgent>;

                  return {
                    id: typeof agent.id === "number" && Number.isFinite(agent.id) ? agent.id : null,
                    uid: typeof agent.uid === "string" && agent.uid.trim() ? agent.uid.trim() : null,
                    name: typeof agent.name === "string" ? agent.name : "",
                    displayLabel: typeof agent.displayLabel === "string" ? agent.displayLabel : "",
                    agentUniqueId:
                      typeof agent.agentUniqueId === "string" ? agent.agentUniqueId : "",
                    description: typeof agent.description === "string" ? agent.description : "",
                    status: typeof agent.status === "string" ? agent.status : "",
                    llmProvider: typeof agent.llmProvider === "string" ? agent.llmProvider : "",
                    llmModel: typeof agent.llmModel === "string" ? agent.llmModel : "",
                    engineName: typeof agent.engineName === "string" ? agent.engineName : "",
                    organizationEnvironmentUid:
                      typeof agent.organizationEnvironmentUid === "string" &&
                      agent.organizationEnvironmentUid.trim()
                        ? agent.organizationEnvironmentUid.trim()
                        : organizationEnvironmentUid,
                    organizationEnvironmentName:
                      typeof agent.organizationEnvironmentName === "string" &&
                      agent.organizationEnvironmentName.trim()
                        ? agent.organizationEnvironmentName.trim()
                        : null,
                  } satisfies AgentSessionAgent;
                })()
              : null,
          isPlaceholder: Boolean(candidate.isPlaceholder),
          serializedSession:
            candidate.serializedSession &&
            typeof candidate.serializedSession === "object" &&
            !Array.isArray(candidate.serializedSession)
              ? cloneJson(candidate.serializedSession as AgentSessionSerializedRecord)
              : null,
          messages: Array.isArray(candidate.messages)
            ? cloneJson(candidate.messages as ThreadMessageLike[])
            : [],
        } satisfies AgentSessionRecord,
      ];
    });
  } catch {
    return [];
  }
}

export function writeAgentSessions(
  userId: string | null,
  organizationEnvironmentUid: string | null,
  sessions: readonly AgentSessionRecord[],
) {
  if (typeof window === "undefined") {
    return;
  }

  // Persist lightweight summaries only. The backend owns conversation
  // history; mirroring full message arrays and serialized session blobs into
  // one localStorage key ran a large synchronous JSON.stringify on every
  // list change and silently stopped persisting anything once the ~5MB quota
  // filled up.
  const persistedSessions = sessions.map((session) => ({
    ...session,
    messages: [],
    serializedSession: null,
    working: false,
  }));

  try {
    window.localStorage.setItem(
      buildStorageKey(userId, organizationEnvironmentUid),
      JSON.stringify(persistedSessions),
    );
  } catch {
    // Ignore localStorage failures and keep the in-memory session list authoritative.
  }
}
