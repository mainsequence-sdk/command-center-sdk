import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  AssistantRuntimeProvider,
  type AssistantRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";

import { buildClientCheckingRuntimeInteraction } from "../backend/agent-runtime-serving.js";
import {
  createErrorAgentSessionReadiness,
  createIdleAgentSessionReadiness,
  createLoadingAgentSessionReadiness,
  createReadyAgentSessionReadiness,
  type AgentSessionInteractionReadiness,
} from "../backend/agent-session-readiness.js";
import { buildAgentSessionRequestBodyFragment } from "../backend/agent-session-request.js";
import { type AgentRuntimePresence } from "../backend/agent-session-runtime-access.js";
import {
  archiveAgentSessionRequest,
  deleteAgentSessionRequest,
  fetchAgentSessionDetail,
  fetchLatestAgentSessions,
  getAgentSessionRecordSessionId,
  getOrCreateAgentSessionRequest,
  normalizeAgentSessionLookupId,
  patchAgentSessionModelConfig,
  startNewAgentSessionRequest,
  unarchiveAgentSessionRequest,
  type AgentSessionApiRecord,
  type AgentSessionSerializedRecord,
} from "../backend/agent-sessions-api.js";
import {
  clearMainSequenceAiResolvedRuntimeAccess,
  fetchMainSequenceAiAssistantResponse,
  fetchVerifiedAgentSessionRuntimeAccess,
} from "../backend/assistant-endpoint.js";
import { MainSequenceAiError, withMainSequenceAiErrorSource } from "../backend/error-source.js";
import { buildRuntimeHttpErrorMessage } from "../backend/http-error.js";
import {
  type AvailableChatModelOption,
  type AvailableChatProviderOption,
  type AvailableChatReasoningEffortOption,
} from "../backend/model-catalog-api.js";
import {
  isTransientRuntimeInteraction,
  requestThroughRuntimeWake,
  type AgentRuntimeInteraction,
} from "../backend/runtime-interaction.js";
import { cancelChatSession } from "../backend/session-cancel-api.js";
import { fetchSessionHistory } from "../backend/session-history-api.js";
import { describeToolActivity, describeToolStatus } from "../backend/tool-activity.js";
import type { ChatBackendConnection } from "../backend/connection.js";
import {
  buildActiveSessionSummary,
  resolveAgentSessionDisplayId,
  resolveAgentSessionLabel,
  resolveAgentSessionLookupId,
  type ActiveSessionSummary,
  type AgentSessionDetailSnapshot,
} from "../session-detail/model.js";
import { useAgentSessionDetail } from "../session-detail/useAgentSessionDetail.js";
import { AgentIconsProvider } from "./agent-icons-context.js";
import {
  EMPTY_MESSAGE_QUEUE,
  MESSAGE_QUEUE_FULL_MESSAGE,
  MESSAGE_QUEUE_FULL_TITLE,
  clearMessageQueue,
  editQueuedMessage,
  enqueueQueuedMessage,
  holdMessageQueue,
  isMessageQueueHeld,
  readMessageQueue,
  rekeyMessageQueue,
  releaseMessageQueue,
  removeQueuedMessage,
  reorderQueuedMessage,
  returnQueuedMessage,
  takeNextQueuedMessage,
  writeMessageQueue,
  type MessageQueue,
  type QueuedMessage,
  type QueuedMessageHoldReason,
} from "./message-queue.js";
import {
  applyModelConfigToSerializedSession,
  attachSerializedSessionToSession,
  attachAgentToSession,
  buildAgentSessionTitle,
  createDefaultAgentSessionAgent,
  createEmptyAgentSession,
  promoteAgentSessionFromStream,
  readAgentSessions,
  summarizeAgentSession,
  toAgentSessionRecordFromApi,
  toDefaultSessionRecordFromApi,
  DEFAULT_SESSION_ORIGIN,
  updateAgentSessionSnapshot,
  writeAgentSessions,
  type AgentSessionAgentSource,
  type AgentSessionRecord,
  type AgentSessionSummary,
  type StreamCreatedAgentSession,
} from "./agent-sessions.js";
import {
  SessionModelSelectionCancelledError,
  createFreshSessionHandleId,
  createSessionWithModelFallback,
  type SessionModelChoice,
  type SessionModelSelectionRequest,
} from "./session-model-fallback.js";
import { useRunConfigOptions } from "./run-config-options.js";
import type {
  ChatAuth,
  ChatDefaultSession,
  ChatLaunchTarget,
  ChatNotify,
  DefaultSessionStatus,
} from "./types.js";
import { useLatestMessageDataStreamRuntime } from "./useLatestMessageDataStreamRuntime.js";

// The platform trusts that an Agent serves for a bounded time and does not say when that ends,
// so a "ready" can turn into "starting" at any moment. A decision older than this is confirmed
// again at the moments a person is about to use it (ADR 093): the chat coming into view, the
// tab returning, the composer taking focus.
const RUNTIME_ACCESS_RECHECK_AFTER_MS = 60_000;
const RUNTIME_ACCESS_REVALIDATE_AFTER_HIDDEN_MS = RUNTIME_ACCESS_RECHECK_AFTER_MS;
const RUNTIME_ACCESS_REVALIDATE_AFTER_IDLE_MS = RUNTIME_ACCESS_RECHECK_AFTER_MS;

export type ChatRunStatus = "idle" | "queued" | "thinking" | "responding" | "complete" | "error";

export interface ChatEngineValue {
  activeAgentLabel: string;
  /** The active session's agent name as recorded on the session; null while no session is selected. */
  activeAgentName: string | null;
  /** The active session's agent uid, for its icon; null while no session is selected. */
  activeAgentUid: string | null;
  activeSessionDetail: AgentSessionDetailSnapshot | null;
  activeSessionSummary: ActiveSessionSummary | null;
  activeSessionReadiness: AgentSessionInteractionReadiness;
  activeSessionDisplayId: string | null;
  activeSessionPreview: string | null;
  activeSessionUpdatedAt: string | null;
  activeRuntimeInteraction: AgentRuntimeInteraction | null;
  activeRuntimePresence: AgentRuntimePresence | null;
  availableModels: AvailableChatModelOption[];
  availableModelsError: string | null;
  availableProviders: AvailableChatProviderOption[];
  availableReasoningEfforts: AvailableChatReasoningEffortOption[];
  agentId: string | null;
  agentSessions: AgentSessionSummary[];
  archiveAgentSession: (sessionId: string) => Promise<boolean>;
  cancelActiveSession: () => Promise<void>;
  clearThread: () => void;
  /** The backend connection the engine was given, for parts that build URLs or messages from it. */
  connection: ChatBackendConnection;
  createAgentSession: () => void;
  currentSessionId: string | null;
  deleteAgentSession: (sessionId: string) => Promise<void>;
  hasRequestedAvailableModels: boolean;
  hasActiveChatStream: boolean;
  isLoadingAvailableModels: boolean;
  isActiveSessionReady: boolean;
  isActiveSessionLoading: boolean;
  isCreatingAgentSession: boolean;
  isUpdatingSessionModel: boolean;
  isCancellingSession: boolean;
  isLoadingLatestSessions: boolean;
  isAssistantRuntimeStarting: boolean;
  /** The active session is the default session behind the stable handle. */
  isDefaultSession: boolean;
  /** The active session was opened for a launch target, not from the default handle. */
  isDirectLaunchSession: boolean;
  latestSessionsError: string | null;
  /** ADR 087: messages written while the agent works, for the current session. */
  messageQueue: MessageQueue;
  queuedMessageCountBySessionId: Readonly<Record<string, number>>;
  enqueueMessage: (text: string) => boolean;
  removeQueuedMessage: (id: string) => void;
  editQueuedMessage: (id: string) => string | null;
  /** Drops the row at the given index (its index after the move). */
  reorderQueuedMessage: (id: string, toIndex: number) => void;
  clearMessageQueue: () => void;
  sendNextQueuedMessage: () => void;
  refreshActiveSessionRuntimeAccess: () => Promise<void>;
  /** Confirms again that the Agent answers when the last decision is old (ADR 093). */
  revalidateStaleRuntimeAccess: () => void;
  defaultSessionError: string | null;
  defaultSessionStatus: DefaultSessionStatus;
  /** Set while a session waits for the person to choose a model in the chat picker. */
  sessionModelSelectionRequest: SessionModelSelectionRequest | null;
  sessionModelLastUsed: ReadonlyArray<{ provider: string | null; model: string | null }>;
  resolveSessionModelSelection: (choice: SessionModelChoice) => void;
  cancelSessionModelSelection: () => void;
  refreshSessionDetail: () => void;
  retryDefaultSession: () => void;
  /** Selects the default session again, leaving any launched session. */
  restoreDefaultSessionSelection: () => void;
  /** Whether the current selection came from a launch target. */
  hasDirectLaunchSelection: () => boolean;
  /** Whatever the application passed as the view context of each request. */
  viewContext: unknown;
  refreshSessionInsights: () => void;
  requestAvailableModels: () => void;
  sessionNotice: string | null;
  selectedModelValue: string | null;
  selectedProviderValue: string | null;
  selectedReasoningEffortValue: string | null;
  setSelectedModelValue: (value: string | null) => void;
  setSelectedProviderValue: (value: string | null) => void;
  setSelectedReasoningEffortValue: (value: string | null) => void;
  startAgentSession: (agent: AgentSessionAgentSource) => void;
  openLatestOrStartAgentSessionById: (input: {
    agentId: string | number;
    label?: string | null;
  }) => Promise<void>;
  startAgentSessionById: (input: {
    agentId: string | number;
    label?: string | null;
  }) => Promise<void>;
  unarchiveAgentSession: (sessionId: string) => Promise<boolean>;
}

interface SessionRuntimeAccessUiMeta {
  runtimeInteraction: AgentRuntimeInteraction | null;
  runtimePresence: AgentRuntimePresence | null;
}

const ChatEngineContext = createContext<ChatEngineValue | null>(null);

// Live run progress is intentionally kept OUT of ChatFeatureContext:
// thinkingSummary changes on every reasoning delta, and putting it in the
// main context value re-rendered every useChatFeature() consumer per chunk.
// Components that render run progress opt into that churn explicitly via
// useChatRunStatus().
export interface ChatRunStatusValue {
  hasVisibleAssistantOutput: boolean;
  runStatus: ChatRunStatus;
  runStatusDetail: string | null;
  thinkingSummary: string | null;
}

const ChatRunStatusContext = createContext<ChatRunStatusValue | null>(null);

function extractAgentId(data: unknown) {
  if (typeof data === "string") {
    const trimmed = data.trim();
    return trimmed || null;
  }

  if (typeof data === "number" && Number.isFinite(data)) {
    return String(data);
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  const value = (data as Record<string, unknown>).agent_id;

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function extractNewSessionChunk(data: Record<string, unknown>): StreamCreatedAgentSession | null {
  if (data.type !== "new_session") {
    return null;
  }

  const payload = data.new_session;

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const normalizedAgentSessionId =
    normalizeAgentSessionLookupId(candidate.runtime_session_uid) ??
    normalizeAgentSessionLookupId(candidate.agent_session_uid) ??
    normalizeAgentSessionLookupId(candidate.session_uid) ??
    normalizeAgentSessionLookupId(candidate.uid);

  if (!normalizedAgentSessionId) {
    return null;
  }

  const rawAgentId = candidate.agent_id;
  const parsedAgentId =
    typeof rawAgentId === "number" && Number.isFinite(rawAgentId)
      ? rawAgentId
      : typeof rawAgentId === "string" && rawAgentId.trim()
        ? Number(rawAgentId)
        : null;

  return {
    agentId: parsedAgentId !== null && Number.isFinite(parsedAgentId) ? parsedAgentId : null,
    agentSessionId: normalizedAgentSessionId,
    agentUniqueId:
      typeof candidate.agent_unique_id === "string" && candidate.agent_unique_id.trim()
        ? candidate.agent_unique_id.trim()
        : null,
    sessionKey:
      typeof candidate.session_key === "string" && candidate.session_key.trim()
        ? candidate.session_key.trim()
        : null,
    threadId:
      typeof candidate.thread_id === "string" && candidate.thread_id.trim()
        ? candidate.thread_id.trim()
        : null,
  };
}

function createStartedAgentSessionRecord({
  fallbackSession,
  record,
  sessionId,
}: {
  fallbackSession: AgentSessionRecord;
  record: AgentSessionApiRecord | null;
  sessionId: string;
}) {
  if (record) {
    return toAgentSessionRecordFromApi(record, fallbackSession);
  }

  return {
    ...fallbackSession,
    id: sessionId,
    runtimeSessionId: sessionId,
    isPlaceholder: false,
    updatedAt: new Date().toISOString(),
    messages: [],
  } satisfies AgentSessionRecord;
}

function sortAgentSessions<T extends { updatedAt: string }>(sessions: readonly T[]) {
  return [...sessions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function normalizeCatalogKey(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

function isAbortLikeError(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.trim().toLowerCase();
  return message.includes("abort");
}

function findProviderValueBySessionProvider(
  providers: readonly AvailableChatProviderOption[],
  provider: string | null | undefined,
) {
  const normalizedProvider = normalizeCatalogKey(provider);

  if (!normalizedProvider) {
    return null;
  }

  const match = providers.find((entry) => normalizeCatalogKey(entry.value) === normalizedProvider);
  return match?.value ?? null;
}

function findModelIdBySessionModel(
  models: readonly AvailableChatModelOption[],
  {
    model,
    provider,
  }: {
    model: string | null | undefined;
    provider?: string | null;
  },
) {
  const normalizedModel = normalizeCatalogKey(model);

  if (!normalizedModel) {
    return null;
  }

  const normalizedProvider = normalizeCatalogKey(provider);
  const scopedModels = normalizedProvider
    ? models.filter((entry) => normalizeCatalogKey(entry.provider) === normalizedProvider)
    : models;
  const match =
    scopedModels.find((entry) => normalizeCatalogKey(entry.value) === normalizedModel) ??
    scopedModels.find((entry) => normalizeCatalogKey(entry.label) === normalizedModel);

  return match?.id ?? null;
}

function normalizeSessionModelValue(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolveSessionModelPreference(session: AgentSessionRecord | null) {
  return {
    provider: normalizeSessionModelValue(session?.agent?.llmProvider),
    model: normalizeSessionModelValue(session?.agent?.llmModel),
  };
}

function buildModelCatalogSignature({
  models,
  providers,
}: {
  models: readonly AvailableChatModelOption[];
  providers: readonly AvailableChatProviderOption[];
}) {
  return [
    providers.map((provider) => provider.value).join("|"),
    models.map((model) => model.id).join("|"),
  ].join("::");
}

function applyModelConfigToSession(
  session: AgentSessionRecord,
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
  if (!session.agent) {
    return session;
  }

  return {
    ...session,
    serializedSession: applyModelConfigToSerializedSession(session.serializedSession, {
      provider,
      model,
      thinking,
    }),
    agent: {
      ...session.agent,
      llmProvider: provider,
      llmModel: model,
    },
  } satisfies AgentSessionRecord;
}

function createFallbackAgentSessionAgentFromId({
  agentId,
  label,
}: {
  agentId: string | number;
  label?: string | null;
}) {
  const normalizedAgentId = String(agentId).trim();
  const nextAgent = createDefaultAgentSessionAgent();

  return {
    ...nextAgent,
    name: label?.trim() || nextAgent.name,
    displayLabel: label?.trim() || "",
    agentUniqueId: normalizedAgentId,
  };
}

function isDefaultSessionRecord(
  session: AgentSessionRecord | null | undefined,
  handleUniqueId: string,
  agentUid?: string | null,
) {
  if (
    session?.origin !== DEFAULT_SESSION_ORIGIN &&
    session?.handleUniqueId !== handleUniqueId
  ) {
    return false;
  }

  const normalizedAgentUid = agentUid?.trim();
  if (!normalizedAgentUid) {
    return true;
  }

  return session.agent?.uid?.trim() === normalizedAgentUid;
}

function findDefaultSessionId(
  sessions: readonly AgentSessionRecord[],
  handleUniqueId: string,
  agentUid?: string | null,
) {
  return (
    sessions.find((session) => isDefaultSessionRecord(session, handleUniqueId, agentUid))?.id ?? null
  );
}

// Stable identities for a session. The same logical AgentSession can come back
// from different endpoints under a different uid (uid vs runtime_session_uid),
// so we collapse the client id and runtime id into one namespace (`id:`) and
// treat the bound handle (`handle:`) as an extra anchor. This lets us recognize
// "the session the user is reading" across a list rebuild even when its id
// representation shifts.
function collectAgentSessionIdentityKeys(session: AgentSessionRecord): Set<string> {
  const keys = new Set<string>();
  const rawId = normalizeAgentSessionLookupId(session.id);

  if (rawId) {
    keys.add(`id:${rawId}`);
  }

  const runtimeId = normalizeAgentSessionLookupId(session.runtimeSessionId);

  if (runtimeId) {
    keys.add(`id:${runtimeId}`);
  }

  const handleUniqueId = session.handleUniqueId?.trim();

  if (handleUniqueId) {
    keys.add(`handle:${handleUniqueId}`);
  }

  return keys;
}

function agentSessionsShareIdentity(
  a: AgentSessionRecord | null | undefined,
  b: AgentSessionRecord | null | undefined,
): boolean {
  if (!a || !b) {
    return false;
  }

  const keysB = collectAgentSessionIdentityKeys(b);

  for (const key of collectAgentSessionIdentityKeys(a)) {
    if (keysB.has(key)) {
      return true;
    }
  }

  return false;
}

const DEFAULT_SESSION_UNAVAILABLE_MESSAGE = "The Agent's session could not be opened. Try again.";

function mergeDefaultSession(
  sessions: readonly AgentSessionRecord[],
  commandCenterSession: AgentSessionRecord,
  handleUniqueId: string,
) {
  const commandCenterLookupId = resolveAgentSessionLookupId(commandCenterSession);

  return sortAgentSessions([
    commandCenterSession,
    ...sessions.filter((session) => {
      if (session.id === commandCenterSession.id) {
        return false;
      }

      const lookupId = resolveAgentSessionLookupId(session);

      if (commandCenterLookupId && lookupId === commandCenterLookupId) {
        return false;
      }

      return !isDefaultSessionRecord(
        session,
        handleUniqueId,
        commandCenterSession.agent?.uid,
      );
    }),
  ]);
}

async function fetchDefaultAgentSession({
  agentUid,
  connection,
  existingSessions,
  handleUniqueId,
  name,
  requestModel,
  signal,
  token,
  tokenType,
  unavailableMessage,
}: {
  agentUid: string;
  connection: ChatBackendConnection;
  handleUniqueId: string;
  name: string;
  unavailableMessage: string;
  existingSessions: readonly AgentSessionRecord[];
  requestModel: () => Promise<SessionModelChoice>;
  signal: AbortSignal;
  token?: string | null;
  tokenType?: string;
}) {
  // An Agent without a default model cannot open its default session until the
  // person names one: ask, then bind that model to the same handle.
  const { record, sessionId } = await createSessionWithModelFallback({
    attempt: () =>
      getOrCreateAgentSessionRequest({
        connection,
        agentUid,
        handleUniqueId,
        name,
        signal,
        token,
        tokenType,
      }),
    requestModel,
    retryWithModel: (choice) =>
      getOrCreateAgentSessionRequest({
        connection,
        agentUid,
        handleUniqueId,
        llmModel: choice.model,
        llmProvider: choice.provider,
        llmThinking: choice.thinking ?? null,
        name,
        signal,
        token,
        tokenType,
      }),
  });

  if (!record) {
    throw new Error(unavailableMessage);
  }

  const existingSession =
    existingSessions.find((session) => session.id === sessionId) ??
    existingSessions.find((session) => resolveAgentSessionLookupId(session) === sessionId);

  return toDefaultSessionRecordFromApi(record, existingSession);
}

function getAgentLookupKey(agent: Pick<AgentSessionAgentSource, "id" | "uid">) {
  const uid = typeof agent.uid === "string" ? agent.uid.trim() : "";
  if (uid) {
    return uid;
  }
  return agent.id > 0 ? String(agent.id) : null;
}

export interface ChatEngineProviderProps {
  children: ReactNode;
  /** The connection to the platform (base URL and request-URL rewrite). */
  connection: ChatBackendConnection;
  /** The signed-in person's token and user uid. */
  auth: ChatAuth;
  /** The active Organization Environment. */
  environmentUid: string | null;
  /** Shows a short notice to the person (errors, confirmations). */
  notify: ChatNotify;
  /** Sent with every chat request as the request's view context; opaque to the engine. */
  viewContext?: unknown;
  /** Whether the chat is on screen. Nothing is fetched or verified while it is not. */
  isVisible: boolean;
  /** The session the application asks to show (for example from its URL). */
  requestedSessionId?: string | null;
  /** Do not resume a session on its own: start from nothing unless one is requested. */
  avoidImplicitSessionSelection?: boolean;
  /** The session behind a stable handle that the chat opens for one Agent. */
  defaultSession?: ChatDefaultSession | null;
  /** Whether the surface on screen shows the default session. */
  showsDefaultSession?: boolean;
  /** Opens (or starts) a session for this Agent once the chat is visible. */
  launchTarget?: ChatLaunchTarget | null;
  /** Asks the application to put the chat on screen (for example to choose a model). */
  onRequestVisible?: () => void;
  /** The requested session was archived; the application may drop the request. */
  onRequestedSessionRemoved?: (sessionId: string) => void;
}

export function ChatEngineProvider({
  auth,
  avoidImplicitSessionSelection = false,
  children,
  connection,
  defaultSession = null,
  environmentUid,
  isVisible,
  launchTarget = null,
  notify,
  onRequestVisible,
  onRequestedSessionRemoved,
  requestedSessionId = null,
  showsDefaultSession = false,
  viewContext,
}: ChatEngineProviderProps) {
  const requestedChatSessionId = requestedSessionId?.trim() || null;
  const shouldAvoidImplicitSessionSelection = avoidImplicitSessionSelection;
  const sessionUserId = auth.userUid ?? null;
  const sessionUserUid = auth.userUid ?? null;
  const sessionToken = auth.token ?? null;
  const sessionTokenType = auth.tokenType ?? "Bearer";
  const activeEnvironmentUid = environmentUid ?? null;
  const defaultSessionAgentUid = defaultSession?.agentUid?.trim() || null;
  const defaultSessionHandleUniqueId = defaultSession?.handleUniqueId ?? "";
  const defaultSessionName = defaultSession?.name ?? "";
  const defaultSessionSourceStatus = defaultSession?.status ?? "ready";
  const defaultSessionUnavailableMessage =
    defaultSession?.unavailableMessage?.trim() || DEFAULT_SESSION_UNAVAILABLE_MESSAGE;
  const [agentSessions, setAgentSessions] = useState<AgentSessionRecord[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<ChatRunStatus>("idle");
  const [runStatusDetail, setRunStatusDetail] = useState<string | null>(null);
  const [thinkingSummary, setThinkingSummary] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<AvailableChatModelOption[]>([]);
  const [availableModelsError, setAvailableModelsError] = useState<string | null>(null);
  const [availableProviders, setAvailableProviders] = useState<AvailableChatProviderOption[]>([]);
  const [availableReasoningEfforts, setAvailableReasoningEfforts] = useState<
    AvailableChatReasoningEffortOption[]
  >([]);
  const [selectedProviderValue, setSelectedProviderValue] = useState<string | null>(null);
  const [selectedModelValue, setSelectedModelValue] = useState<string | null>(null);
  const [selectedReasoningEffortValue, setSelectedReasoningEffortValue] = useState<string | null>(
    null,
  );
  const [directLaunchSessionId, setDirectLaunchSessionId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [hasVisibleAssistantOutput, setHasVisibleAssistantOutput] = useState(false);
  const [hasActiveChatStream, setHasActiveChatStream] = useState(false);
  const [isLoadingAvailableModels, setIsLoadingAvailableModels] = useState(false);
  const [isLoadingLatestSessions, setIsLoadingLatestSessions] = useState(false);
  const [isCancellingSession, setIsCancellingSession] = useState(false);
  // ADR 087: messages written while the agent works, per session. Nothing
  // here exists on the platform until a row is sent as an ordinary turn.
  const [queuedMessagesBySessionId, setQueuedMessagesBySessionId] = useState<
    Record<string, MessageQueue>
  >({});
  const queuedMessagesRef = useRef<Record<string, MessageQueue>>({});
  queuedMessagesRef.current = queuedMessagesBySessionId;
  // The queue drains only once the runtime reports the previous run over:
  // appending from inside onFinish would abort the run that just ended
  // (performRoundtrip aborts the previous controller) and fire onCancel.
  const [threadRunning, setThreadRunning] = useState(false);
  const [queueDrainTick, setQueueDrainTick] = useState(0);
  const queueDrainArmedSessionIdRef = useRef<string | null>(null);
  const queueSendingRef = useRef<{ position: number; total: number } | null>(null);
  const queueSentCountBySessionIdRef = useRef<Record<string, number>>({});
  const queueRestoredSessionIdsRef = useRef<Set<string>>(new Set());
  const queueOwnWorkingClearRef = useRef<string | null>(null);
  const [latestSessionsError, setLatestSessionsError] = useState<string | null>(null);
  const [hasAttemptedLatestSessionsBootstrap, setHasAttemptedLatestSessionsBootstrap] =
    useState(false);
  const [latestSessionsAgentFilterId, setLatestSessionsAgentFilterId] = useState<string | number | null>(null);
  const [latestSessionsRefreshNonce, setLatestSessionsRefreshNonce] = useState(0);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [defaultSessionError, setDefaultSessionError] = useState<string | null>(null);
  const [sessionModelSelectionRequest, setSessionModelSelectionRequest] =
    useState<SessionModelSelectionRequest | null>(null);
  const sessionModelSelectionResolversRef = useRef<{
    resolve: (choice: SessionModelChoice) => void;
    reject: (error: Error) => void;
  } | null>(null);
  const sessionModelSelectionCounterRef = useRef(0);
  const [isCreatingAgentSession, setIsCreatingAgentSession] = useState(false);
  const [isUpdatingSessionModel, setIsUpdatingSessionModel] = useState(false);
  const [sessionHistoryReadyBySessionId, setSessionHistoryReadyBySessionId] = useState<
    Record<string, boolean>
  >({});
  const [sessionHistoryErrorBySessionId, setSessionHistoryErrorBySessionId] = useState<
    Record<string, string | null>
  >({});
  const [isLoadingSessionHistoryBySessionId, setIsLoadingSessionHistoryBySessionId] = useState<
    Record<string, boolean>
  >({});
  const [sessionRuntimeAccessMetaBySessionId, setSessionRuntimeAccessMetaBySessionId] = useState<
    Record<string, SessionRuntimeAccessUiMeta>
  >({});
  // Mirror for code that runs outside the render cycle (the send path waits
  // on the interaction the shared poller keeps current).
  const sessionRuntimeAccessMetaRef = useRef<Record<string, SessionRuntimeAccessUiMeta>>({});
  sessionRuntimeAccessMetaRef.current = sessionRuntimeAccessMetaBySessionId;
  // Bumped by a manual re-check so the transient-state poller restarts even
  // when the decision it fetched is the same state as before.
  const [runtimeAccessPollerEpoch, setRuntimeAccessPollerEpoch] = useState(0);
  const [sessionSelectionMode, setSessionSelectionMode] = useState<"auto" | "explicit">("auto");
  const shouldSignalNewChatRef = useRef(true);
  const pendingNewChatRequestRef = useRef(false);
  const expectedNewSessionRef = useRef(false);
  const runtimeRef = useRef<AssistantRuntime | null>(null);
  const selectedSessionRef = useRef<AgentSessionRecord | null>(null);
  const activeSessionRef = useRef<AgentSessionRecord | null>(null);
  const activeSessionDetailRef = useRef<AgentSessionDetailSnapshot | null>(null);
  const activeSessionReadinessRef = useRef<AgentSessionInteractionReadiness>(
    createIdleAgentSessionReadiness(null),
  );
  const agentSessionsRef = useRef<AgentSessionRecord[]>([]);
  const sessionSelectionModeRef = useRef<"auto" | "explicit">("auto");
  const selectedModelValueRef = useRef<string | null>(null);
  const selectedReasoningEffortValueRef = useRef<string | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  const loadedSessionIdRef = useRef<string | null>(null);
  // Backend lookup id (runtimeSessionId ?? id) of whatever loadedSessionIdRef
  // points at, so a re-selection of the same backend session under a new client
  // id can re-anchor instead of wiping + refetching the thread.
  const loadedSessionLookupIdRef = useRef<string | null>(null);
  const activeChatStreamSessionIdRef = useRef<string | null>(null);
  const activeChatStreamLookupSessionIdRef = useRef<string | null>(null);
  const sessionPickerSyncRef = useRef<string | null>(null);
  const unavailableSessionModelNoticeRef = useRef<string | null>(null);
  const sessionHistoryRequestRef = useRef<AbortController | null>(null);
  const sessionRuntimeAccessMetaRequestRef = useRef<AbortController | null>(null);
  const shownRuntimeSuccessOperationUidsRef = useRef(new Set<string>());
  // When each session's runtime decision was last confirmed; kept out of state so a
  // confirmation that changes nothing does not re-render the chat.
  const sessionRuntimeAccessResolvedAtRef = useRef<Record<string, number>>({});
  // The session whose chat is in view, so coming back into view can be told from a re-render.
  const runtimeAccessViewedSessionIdRef = useRef<string | null>(null);
  const defaultSessionRequestRef = useRef<AbortController | null>(null);
  const defaultSessionBootstrapKeyRef = useRef<string | null>(null);
  const sessionModelPatchRequestRef = useRef<AbortController | null>(null);
  const directLaunchSessionIdRef = useRef<string | null>(null);
  const defaultSessionIdRef = useRef<string | null>(null);
  const embeddedLaunchKeyRef = useRef<number | null>(null);
  const shouldHydrateChatRuntime = isVisible;
  const isDirectLaunchSession = Boolean(directLaunchSessionId);
  const visibleSessionNotice = sessionNotice;
  const requestSessionModelSelection = useCallback(
    ({ agentLabel, agentUid }: { agentLabel?: string | null; agentUid?: string | null }) =>
      new Promise<SessionModelChoice>((resolve, reject) => {
        sessionModelSelectionResolversRef.current?.reject(new SessionModelSelectionCancelledError());
        sessionModelSelectionResolversRef.current = { resolve, reject };
        sessionModelSelectionCounterRef.current += 1;
        setSessionModelSelectionRequest({
          id: sessionModelSelectionCounterRef.current,
          agentLabel: agentLabel?.trim() || null,
          agentUid: agentUid?.trim() || null,
        });
      }),
    [],
  );
  const resolveSessionModelSelection = useCallback((choice: SessionModelChoice) => {
    const resolvers = sessionModelSelectionResolversRef.current;
    sessionModelSelectionResolversRef.current = null;
    setSessionModelSelectionRequest(null);
    resolvers?.resolve(choice);
  }, []);
  const cancelSessionModelSelection = useCallback(() => {
    const resolvers = sessionModelSelectionResolversRef.current;
    sessionModelSelectionResolversRef.current = null;
    setSessionModelSelectionRequest(null);
    resolvers?.reject(new SessionModelSelectionCancelledError());
  }, []);
  useEffect(
    () => () => {
      sessionModelSelectionResolversRef.current?.reject(new SessionModelSelectionCancelledError());
      sessionModelSelectionResolversRef.current = null;
    },
    [],
  );
  const sessionAuthRef = useRef({ token: sessionToken, tokenType: sessionTokenType });
  sessionAuthRef.current = { token: sessionToken, tokenType: sessionTokenType };
  // Every new session goes through here. The plain creation endpoint cannot carry a
  // model, so when the platform asks for one the session is created through
  // get-or-create with a fresh handle and the model the person picked.
  const startAgentSessionWithModelFallback = useCallback(
    ({ agentId, agentLabel }: { agentId: string | number; agentLabel?: string | null }) =>
      createSessionWithModelFallback({
        attempt: () =>
          startNewAgentSessionRequest({
            connection,
            agentId,
            token: sessionAuthRef.current.token,
            tokenType: sessionAuthRef.current.tokenType,
          }),
        requestModel: () => requestSessionModelSelection({ agentLabel, agentUid: String(agentId) }),
        retryWithModel: (choice) =>
          getOrCreateAgentSessionRequest({
            connection,
            agentUid: agentId,
            handleUniqueId: createFreshSessionHandleId(),
            llmModel: choice.model,
            llmProvider: choice.provider,
            llmThinking: choice.thinking ?? null,
            token: sessionAuthRef.current.token,
            tokenType: sessionAuthRef.current.tokenType,
          }),
      }),
    [requestSessionModelSelection],
  );

  const retryDefaultSession = useCallback(() => {
    defaultSessionBootstrapKeyRef.current = null;
    setDefaultSessionError(null);
    setSessionNotice(null);
    setLatestSessionsRefreshNonce((current) => current + 1);
  }, []);

  const onRequestVisibleRef = useRef(onRequestVisible);
  onRequestVisibleRef.current = onRequestVisible;
  const requestVisible = useCallback(() => {
    onRequestVisibleRef.current?.();
  }, []);
  const pendingSessionModelRequestId = sessionModelSelectionRequest?.id ?? null;
  useEffect(() => {
    // The model is chosen with the chat's own picker, so the chat has to be on screen.
    if (pendingSessionModelRequestId !== null && !shouldHydrateChatRuntime) {
      requestVisible();
    }
  }, [requestVisible, pendingSessionModelRequestId, shouldHydrateChatRuntime]);
  const scheduleRequestVisible = useCallback(() => {
    if (typeof window === "undefined") {
      requestVisible();
      return;
    }

    window.requestAnimationFrame(() => {
      requestVisible();
    });
  }, [requestVisible]);
  const markActiveChatStream = useCallback(
    ({
      lookupSessionId,
      sessionId,
    }: {
      lookupSessionId: string | null;
      sessionId: string | null;
    }) => {
      activeChatStreamSessionIdRef.current = sessionId;
      activeChatStreamLookupSessionIdRef.current = lookupSessionId;
      setHasActiveChatStream(true);
    },
    [],
  );
  const clearActiveChatStream = useCallback(() => {
    activeChatStreamSessionIdRef.current = null;
    activeChatStreamLookupSessionIdRef.current = null;
    setHasActiveChatStream(false);
  }, []);
  const clearDirectLaunchSelection = useCallback(() => {
    directLaunchSessionIdRef.current = null;
    setDirectLaunchSessionId(null);
  }, []);
  const finishDefaultSessionRequest = useCallback((controller: AbortController) => {
    if (defaultSessionRequestRef.current !== controller) {
      return;
    }

    defaultSessionRequestRef.current = null;
    setIsCreatingAgentSession(false);
  }, []);
  const cancelDefaultSessionRequest = useCallback(() => {
    const controller = defaultSessionRequestRef.current;

    if (!controller) {
      return;
    }

    defaultSessionRequestRef.current = null;
    // The aborted request never answered, so the default session may be asked for again. Without
    // this, React's StrictMode (which runs effects twice on mount) aborts the first request and
    // the key blocks the second, and the session never opens.
    defaultSessionBootstrapKeyRef.current = null;
    controller.abort();
    setIsCreatingAgentSession(false);
  }, []);
  const preserveDefaultSessionSelection = useCallback(() => {
    if (directLaunchSessionIdRef.current === currentSessionIdRef.current) {
      return;
    }

    defaultSessionIdRef.current =
      findDefaultSessionId(agentSessionsRef.current, defaultSessionHandleUniqueId, defaultSessionAgentUid) ??
      defaultSessionIdRef.current;
  }, [defaultSessionAgentUid, defaultSessionHandleUniqueId]);
  const restoreDefaultSessionSelection = useCallback(() => {
    clearDirectLaunchSelection();

    const nextSessionId =
      findDefaultSessionId(agentSessionsRef.current, defaultSessionHandleUniqueId, defaultSessionAgentUid) ??
      defaultSessionIdRef.current;

    defaultSessionIdRef.current = nextSessionId;
    if (currentSessionIdRef.current !== nextSessionId) {
      setSessionSelectionMode("auto");
      setCurrentSessionId(nextSessionId);
    }
  }, [clearDirectLaunchSelection, defaultSessionAgentUid, defaultSessionHandleUniqueId]);
  const isSessionHistoryBlockedByActiveStream = useCallback(
    ({
      lookupSessionId,
      sessionId,
    }: {
      lookupSessionId: string | null;
      sessionId: string | null;
    }) => {
      const activeStreamSessionId = activeChatStreamSessionIdRef.current;
      const activeStreamLookupSessionId = activeChatStreamLookupSessionIdRef.current;

      return (
        Boolean(sessionId && activeStreamSessionId && sessionId === activeStreamSessionId) ||
        Boolean(
          lookupSessionId &&
            activeStreamLookupSessionId &&
            lookupSessionId === activeStreamLookupSessionId,
        )
      );
    },
    [],
  );
  const updateSessionRuntimeAccessMeta = useCallback(
    ({
      runtimeInteraction,
      runtimePresence,
      sessionId,
    }: {
      runtimeInteraction: AgentRuntimeInteraction | null;
      runtimePresence: AgentRuntimePresence | null;
      sessionId: string | null;
    }) => {
      const normalizedSessionId = sessionId?.trim() || null;

      if (!normalizedSessionId) {
        return;
      }

      sessionRuntimeAccessResolvedAtRef.current[normalizedSessionId] = Date.now();
      let visibleRuntimeInteraction = runtimeInteraction;
      const successOperationUid =
        runtimeInteraction?.state === "ready" &&
        runtimeInteraction.notice?.severity === "success"
          ? runtimeInteraction.operation?.uid ?? null
          : null;
      if (successOperationUid && runtimeInteraction) {
        if (shownRuntimeSuccessOperationUidsRef.current.has(successOperationUid)) {
          visibleRuntimeInteraction = {
            ...runtimeInteraction,
            notice: null,
          };
        } else {
          shownRuntimeSuccessOperationUidsRef.current.add(successOperationUid);
        }
      }

      setSessionRuntimeAccessMetaBySessionId((current) => {
        const existing = current[normalizedSessionId];

        if (
          existing?.runtimeInteraction === visibleRuntimeInteraction &&
          existing?.runtimePresence === runtimePresence
        ) {
          return current;
        }

        return {
          ...current,
          [normalizedSessionId]: {
            runtimeInteraction: visibleRuntimeInteraction,
            runtimePresence,
          },
        };
      });
    },
    [],
  );
  const setAgentSessionWorkingState = useCallback(
    ({
      runtimeState,
      sessionId,
      working,
    }: {
      runtimeState?: string | null;
      sessionId: string | null;
      working: boolean;
    }) => {
      if (!sessionId) {
        return;
      }

      const applyWorkingState = (session: AgentSessionRecord) => ({
        ...session,
        runtimeState:
          runtimeState !== undefined
            ? runtimeState
            : session.runtimeState,
        working,
        updatedAt: new Date().toISOString(),
      });

      if (activeSessionRef.current?.id === sessionId) {
        activeSessionRef.current = applyWorkingState(activeSessionRef.current);
      }

      if (selectedSessionRef.current?.id === sessionId) {
        selectedSessionRef.current = applyWorkingState(selectedSessionRef.current);
      }

      setAgentSessions((currentSessions) =>
        currentSessions.map((session) =>
          session.id === sessionId ? applyWorkingState(session) : session,
        ),
      );
    },
    [],
  );
  const sortedAgentSessions = useMemo(
    () =>
      sortAgentSessions(agentSessions)
        .filter((session) => !session.isPlaceholder)
        .map(summarizeAgentSession),
    [agentSessions],
  );
  // What the "choose a model" state offers first: the models of the most recent sessions.
  const sessionModelLastUsed = useMemo(
    () =>
      sortedAgentSessions.map((session) => ({
        provider: session.agent?.llmProvider ?? null,
        model: session.agent?.llmModel ?? null,
      })),
    [sortedAgentSessions],
  );
  const defaultSessionId = useMemo(
    () => findDefaultSessionId(agentSessions, defaultSessionHandleUniqueId, defaultSessionAgentUid),
    [agentSessions, defaultSessionAgentUid, defaultSessionHandleUniqueId],
  );
  // A surface that shows the default session derives its selection exclusively
  // from the handle resolution in the default-session effect below: the
  // latest-sessions auto-select must never place another session in it, not
  // even transiently while the handle resolves.
  const isDefaultSessionSurface =
    Boolean(defaultSession) && showsDefaultSession && !isDirectLaunchSession;
  const shouldAvoidLatestSessionAutoSelection =
    shouldAvoidImplicitSessionSelection || isDefaultSessionSurface;
  const selectedSession = useMemo(
    () => agentSessions.find((session) => session.id === currentSessionId) ?? null,
    [agentSessions, currentSessionId],
  );
  const activeSession = useMemo(
    () => {
      if (!selectedSession) {
        return null;
      }

      return resolveAgentSessionLookupId(selectedSession) ? selectedSession : null;
    },
    [selectedSession],
  );
  const activeAgentLabel = useMemo(
    () => resolveAgentSessionLabel(selectedSession),
    [selectedSession],
  );
  const activeAgentName = useMemo(
    () => activeSession?.agent?.name?.trim() || null,
    [activeSession],
  );
  const activeAgentUid = useMemo(
    () => activeSession?.agent?.uid?.trim() || null,
    [activeSession],
  );
  const shouldSuppressDirectLaunchRuntimePrefetch =
    shouldHydrateChatRuntime &&
    sessionSelectionMode === "explicit" &&
    isDirectLaunchSession;
  // The model catalog is also needed while a session waits for the person to pick a model.
  const shouldResolveAvailableModels = shouldHydrateChatRuntime || sessionModelSelectionRequest !== null;
  const hasRequestedAvailableModels = shouldResolveAvailableModels;
  const availableRunConfigQuery = useRunConfigOptions({
    connection,
    enabled: shouldResolveAvailableModels && Boolean(sessionToken && sessionUserUid),
    token: sessionToken,
    tokenType: sessionTokenType,
    userUid: sessionUserUid,
  });
  const requestAvailableModels = useCallback(() => {
    if (shouldResolveAvailableModels) {
      void availableRunConfigQuery.refetch();
    }
  }, [availableRunConfigQuery, shouldResolveAvailableModels]);
  const {
    activeDetail: activeSessionDetail,
    refreshSessionDetail,
    refreshSessionInsights,
  } = useAgentSessionDetail({
    connection,
    session: activeSession,
    enabled: shouldHydrateChatRuntime && Boolean(activeEnvironmentUid),
    organizationEnvironmentUid: activeEnvironmentUid ?? "",
    token: sessionToken,
    tokenType: sessionTokenType,
  });
  const activeSessionDisplayId = useMemo(
    () => resolveAgentSessionDisplayId(activeSession),
    [activeSession],
  );
  const activeSessionPreview = useMemo(
    () => activeSession?.preview ?? null,
    [activeSession],
  );
  const activeSessionUpdatedAt = useMemo(
    () => activeSession?.updatedAt ?? null,
    [activeSession],
  );
  const activeRuntimeInteraction = useMemo(
    () =>
      activeSession
        ? sessionRuntimeAccessMetaBySessionId[activeSession.id]?.runtimeInteraction ?? null
        : null,
    [activeSession, sessionRuntimeAccessMetaBySessionId],
  );
  const activeRuntimePresence = useMemo(
    () =>
      activeSession
        ? sessionRuntimeAccessMetaBySessionId[activeSession.id]?.runtimePresence ?? null
        : null,
    [activeSession, sessionRuntimeAccessMetaBySessionId],
  );
  useEffect(() => {
    if (
      !activeSession?.id ||
      activeRuntimeInteraction?.state !== "ready" ||
      activeRuntimeInteraction.notice?.severity !== "success" ||
      !activeRuntimeInteraction.operation?.uid
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      updateSessionRuntimeAccessMeta({
        runtimeInteraction: activeRuntimeInteraction,
        runtimePresence:
          sessionRuntimeAccessMetaBySessionId[activeSession.id]?.runtimePresence ?? null,
        sessionId: activeSession.id,
      });
    }, 8_000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    activeRuntimeInteraction,
    activeSession?.id,
    sessionRuntimeAccessMetaBySessionId,
    updateSessionRuntimeAccessMeta,
  ]);
  // One immediate re-resolution of the active session's runtime access,
  // outside the poller's cadence: the "Check again" belt when a wake runs past
  // its deadline, and the return from a long-hidden tab, both use it.
  const refreshActiveSessionRuntimeAccess = useCallback(async () => {
    const sessionLookupId = resolveAgentSessionLookupId(activeSession);
    if (!activeSession?.id || !sessionLookupId || !sessionToken) {
      return;
    }
    sessionRuntimeAccessMetaRequestRef.current?.abort();
    sessionRuntimeAccessMetaRequestRef.current = null;
    try {
      const runtimeAccess = await fetchVerifiedAgentSessionRuntimeAccess({
        connection,
        agentName: activeSession.agent?.name,
        sessionId: sessionLookupId,
        token: sessionToken,
        tokenType: sessionTokenType,
      });
      updateSessionRuntimeAccessMeta({
        runtimeInteraction: runtimeAccess.runtimeInteraction,
        runtimePresence: runtimeAccess.runtimePresence,
        sessionId: activeSession.id,
      });
      clearMainSequenceAiResolvedRuntimeAccess();
    } catch {
      // The poller and the next send re-resolve on their own; a failed
      // manual check must not surface as a session error.
    } finally {
      setRuntimeAccessPollerEpoch((epoch) => epoch + 1);
    }
  }, [activeSession, sessionToken, sessionTokenType, updateSessionRuntimeAccessMeta]);
  const refreshActiveSessionRuntimeAccessRef = useRef(refreshActiveSessionRuntimeAccess);
  refreshActiveSessionRuntimeAccessRef.current = refreshActiveSessionRuntimeAccess;
  // An Agent that answered a while ago may have gone idle since. Going to write is the moment to
  // find out, before the message is typed rather than after it is sent (ADR 093).
  const revalidateStaleRuntimeAccess = useCallback(() => {
    const sessionId = activeSessionRef.current?.id;
    const resolvedAt = sessionId ? sessionRuntimeAccessResolvedAtRef.current[sessionId] : undefined;
    if (
      !sessionId ||
      resolvedAt === undefined ||
      Date.now() - resolvedAt < RUNTIME_ACCESS_REVALIDATE_AFTER_IDLE_MS
    ) {
      return;
    }
    // One re-check per stale period, however many times the composer is focused meanwhile.
    sessionRuntimeAccessResolvedAtRef.current[sessionId] = Date.now();
    void refreshActiveSessionRuntimeAccessRef.current();
  }, []);
  // A runtime that served fifteen minutes ago may have scaled to zero while
  // this tab was hidden. Re-resolve on return after a long absence so the
  // composer shows "waking" before the user types, not after they send.
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    let hiddenSince: number | null = document.hidden ? Date.now() : null;
    const onVisibilityChange = () => {
      if (document.hidden) {
        hiddenSince = Date.now();
        return;
      }
      const hiddenForMs = hiddenSince === null ? 0 : Date.now() - hiddenSince;
      hiddenSince = null;
      if (hiddenForMs >= RUNTIME_ACCESS_REVALIDATE_AFTER_HIDDEN_MS) {
        void refreshActiveSessionRuntimeAccessRef.current();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
  const activeSessionSummary = useMemo<ActiveSessionSummary | null>(() => {
    if (!activeSession) {
      return null;
    }

    return buildActiveSessionSummary({
      session: activeSession,
      detail: activeSessionDetail,
      fallbackAgentId: agentId,
    });
  }, [activeSession, activeSessionDetail, agentId]);
  const isDefaultSession = useMemo(() => {
    if (isDirectLaunchSession || !activeSessionSummary) {
      return false;
    }

    return isDefaultSessionRecord(activeSession, defaultSessionHandleUniqueId, defaultSessionAgentUid);
  }, [
    activeSession,
    activeSessionSummary,
    defaultSessionAgentUid,
    defaultSessionHandleUniqueId,
    isDirectLaunchSession,
  ]);
  const defaultSessionStatus = useMemo<DefaultSessionStatus>(() => {
    if (!isDefaultSessionSurface) {
      return "idle";
    }

    if (defaultSessionSourceStatus === "error") {
      return "error";
    }

    if (defaultSessionSourceStatus !== "ready" || !activeEnvironmentUid) {
      return "loading";
    }

    if (!defaultSessionAgentUid) {
      return "missing";
    }

    if (defaultSessionError) {
      return "error";
    }

    if (isCreatingAgentSession || !isDefaultSession) {
      return "opening";
    }

    return "ready";
  }, [
    activeEnvironmentUid,
    isDefaultSessionSurface,
    isDefaultSession,
    isCreatingAgentSession,
    defaultSessionAgentUid,
    defaultSessionError,
    defaultSessionSourceStatus,
  ]);
  const isAssistantRuntimeStarting = Boolean(
    activeRuntimeInteraction && isTransientRuntimeInteraction(activeRuntimeInteraction),
  );
  const activeSessionReadiness = useMemo<AgentSessionInteractionReadiness>(() => {
    if (!shouldHydrateChatRuntime) {
      return createIdleAgentSessionReadiness(activeSession?.id ?? currentSessionId);
    }

    if (!currentSessionId) {
      if (shouldAvoidImplicitSessionSelection && !isCreatingAgentSession) {
        return createIdleAgentSessionReadiness(null);
      }

      if (
        !hasAttemptedLatestSessionsBootstrap ||
        isCreatingAgentSession ||
        isLoadingLatestSessions
      ) {
        return createLoadingAgentSessionReadiness({
          sessionId: null,
        });
      }

      if (latestSessionsError) {
        return createErrorAgentSessionReadiness({
          error: latestSessionsError,
          sessionId: null,
        });
      }

      return createErrorAgentSessionReadiness({
        error: "A backend AgentSession is required before chat can accept input.",
        sessionId: null,
      });
    }

    if (!activeSession) {
      return createLoadingAgentSessionReadiness({
        sessionId: currentSessionId,
      });
    }

    const sessionId = activeSession.id;
    const detailReady = activeSessionDetail?.status === "ready";
    const detailLoading =
      activeSessionDetail === null ||
      activeSessionDetail.status === "idle" ||
      activeSessionDetail.status === "loading";
    const hasInsightsSnapshot = Boolean(activeSessionDetail?.insights);
    const insightsReady =
      detailReady &&
      hasInsightsSnapshot &&
      !activeSessionDetail?.insightsError;
    const historyReady = sessionHistoryReadyBySessionId[sessionId] === true;
    const historyLoading = isLoadingSessionHistoryBySessionId[sessionId] === true;
    const historyError = sessionHistoryErrorBySessionId[sessionId] ?? null;

    if (activeSessionDetail?.status === "not_found") {
      return createErrorAgentSessionReadiness({
        error: activeSessionDetail.detailError ?? "AgentSession not found.",
        sessionId,
        status: "not_found",
      });
    }

    if (activeSessionDetail?.status === "error") {
      return createErrorAgentSessionReadiness({
        error: activeSessionDetail.detailError ?? "Failed to load AgentSession detail.",
        sessionId,
      });
    }

    if (historyError) {
      return createErrorAgentSessionReadiness({
        detailReady,
        error: historyError,
        historyReady,
        insightsReady,
        sessionId,
      });
    }

    // Insights are analytics — they must never gate whether the user can
    // chat. A failed or slow insights fetch previously disabled the composer
    // of an otherwise healthy conversation.
    if (detailReady && historyReady) {
      return createReadyAgentSessionReadiness(sessionId);
    }

    if (detailLoading || historyLoading || !historyReady) {
      return createLoadingAgentSessionReadiness({
        detailReady,
        historyReady,
        insightsReady,
        sessionId,
      });
    }

    return createLoadingAgentSessionReadiness({
      detailReady,
      historyReady,
      insightsReady,
      sessionId,
    });
  }, [
    activeSession,
    activeSessionDetail,
    currentSessionId,
    hasAttemptedLatestSessionsBootstrap,
    isCreatingAgentSession,
    isLoadingLatestSessions,
    isLoadingSessionHistoryBySessionId,
    latestSessionsError,
    sessionHistoryErrorBySessionId,
    sessionHistoryReadyBySessionId,
    shouldHydrateChatRuntime,
  ]);
  const isActiveSessionReady = activeSessionReadiness.status === "ready";
  const isActiveSessionLoading = activeSessionReadiness.status === "loading";

  const clearThread = useCallback(() => {
    setRunStatus("idle");
    setRunStatusDetail(null);
    setThinkingSummary(null);
    setHasVisibleAssistantOutput(false);
    setSessionNotice(null);
  }, []);

  // Restore the persisted session list once per signed-in user. Navigation
  // must never re-run this: the previous version re-ran on every chat-page
  // transition and ?session= change, replacing the in-memory list from
  // localStorage, resetting hydration anchors, and re-triggering the full
  // bootstrap cascade on every session click.
  useEffect(() => {
    clearMainSequenceAiResolvedRuntimeAccess();
    const restoredSessions = sortAgentSessions(
      readAgentSessions(sessionUserId, activeEnvironmentUid),
    );

    agentSessionsRef.current = restoredSessions;
    setAgentSessions(restoredSessions);
    setSessionSelectionMode("auto");
    setCurrentSessionId(null);
    setHasAttemptedLatestSessionsBootstrap(false);
    setSessionRuntimeAccessMetaBySessionId({});
    loadedSessionIdRef.current = null;
    loadedSessionLookupIdRef.current = null;
    cancelDefaultSessionRequest();
  }, [activeEnvironmentUid, cancelDefaultSessionRequest, sessionUserId]);

  // Route changes only move the SELECTION; they never rebuild the list.
  useEffect(() => {
    if (requestedChatSessionId) {
      if (currentSessionIdRef.current !== requestedChatSessionId) {
        setSessionSelectionMode("explicit");
        setSessionNotice(null);
        setCurrentSessionId(requestedChatSessionId);
      } else if (sessionSelectionModeRef.current !== "explicit") {
        setSessionSelectionMode("explicit");
      }

      return;
    }

    if (shouldAvoidImplicitSessionSelection) {
      // Landing on the bare chat page (or an embedded launch surface) starts
      // from a clean slate instead of implicitly resuming a session.
      setSessionSelectionMode("auto");
      setCurrentSessionId(null);
    }
    // Navigating anywhere else keeps the current selection; the
    // latest-sessions effect auto-selects when nothing is selected.
  }, [requestedChatSessionId, shouldAvoidImplicitSessionSelection]);

  useEffect(() => {
    if (!sessionToken) {
      clearMainSequenceAiResolvedRuntimeAccess();
    }
  }, [sessionToken]);

  useEffect(() => {
    if (!shouldResolveAvailableModels || !sessionToken || !sessionUserUid) {
      setAvailableModels([]);
      setAvailableProviders([]);
      setAvailableReasoningEfforts([]);
      setAvailableModelsError(null);
      setIsLoadingAvailableModels(false);
      return;
    }

    if (availableRunConfigQuery.data) {
      setAvailableProviders(availableRunConfigQuery.data.providers);
      setAvailableModels(availableRunConfigQuery.data.models);
      setAvailableModelsError(null);
      setIsLoadingAvailableModels(false);
      return;
    }

    setIsLoadingAvailableModels(availableRunConfigQuery.isLoading);

    if (availableRunConfigQuery.error) {
      setAvailableProviders([]);
      setAvailableModels([]);
      setAvailableReasoningEfforts([]);
      setAvailableModelsError(
        availableRunConfigQuery.error instanceof Error
          ? availableRunConfigQuery.error.message
          : "Available models request failed.",
      );
    }
  }, [
    availableRunConfigQuery.data,
    availableRunConfigQuery.error,
    availableRunConfigQuery.isLoading,
    sessionToken,
    sessionUserUid,
    shouldResolveAvailableModels,
  ]);

  useEffect(() => {
    sessionRuntimeAccessMetaRequestRef.current?.abort();
    const activeSessionLookupId = resolveAgentSessionLookupId(activeSession);

    if (
      !shouldHydrateChatRuntime ||
      !sessionToken ||
      !activeSession?.id ||
      !activeSessionLookupId
    ) {
      runtimeAccessViewedSessionIdRef.current = null;
      return;
    }

    const cameIntoView = runtimeAccessViewedSessionIdRef.current !== activeSession.id;
    runtimeAccessViewedSessionIdRef.current = activeSession.id;
    const currentMeta = sessionRuntimeAccessMetaBySessionId[activeSession.id];
    if (currentMeta && !isTransientRuntimeInteraction(currentMeta.runtimeInteraction)) {
      const resolvedAt = sessionRuntimeAccessResolvedAtRef.current[activeSession.id];
      const isOldDecision =
        resolvedAt === undefined || Date.now() - resolvedAt >= RUNTIME_ACCESS_RECHECK_AFTER_MS;
      if (!cameIntoView || !isOldDecision || shouldSuppressDirectLaunchRuntimePrefetch) {
        return;
      }
      // The chat came back into view on a decision from a while ago. An Agent that was
      // ready then may be idle now, so it is confirmed again before the composer opens
      // (ADR 093). The decision changing re-runs this effect, which starts the checks.
      updateSessionRuntimeAccessMeta({
        runtimeInteraction: buildClientCheckingRuntimeInteraction(),
        runtimePresence: null,
        sessionId: activeSession.id,
      });
      return;
    }

    // A direct launch skips the first check, but a wake that a send started there still has
    // to be followed, or the held message would wait for a decision nobody fetches.
    if (shouldSuppressDirectLaunchRuntimePrefetch && !currentMeta) {
      return;
    }

    if (!currentMeta) {
      // Locked until the Agent has answered once for this session (ADR 093). The decision
      // changing re-runs this effect, which then starts the checks.
      updateSessionRuntimeAccessMeta({
        runtimeInteraction: buildClientCheckingRuntimeInteraction(),
        runtimePresence: null,
        sessionId: activeSession.id,
      });
      return;
    }

    const controller = new AbortController();
    sessionRuntimeAccessMetaRequestRef.current = controller;

    void (async () => {
      const waitUntilVisible = async () => {
        if (!document.hidden || controller.signal.aborted) {
          return;
        }
        await new Promise<void>((resolve) => {
          const finish = () => {
            document.removeEventListener("visibilitychange", onVisibilityChange);
            controller.signal.removeEventListener("abort", finish);
            resolve();
          };
          const onVisibilityChange = () => {
            if (!document.hidden) {
              finish();
            }
          };
          document.addEventListener("visibilitychange", onVisibilityChange);
          controller.signal.addEventListener("abort", finish, { once: true });
        });
      };
      let delayMs = currentMeta?.runtimeInteraction?.retryAfterMs ?? 0;

      while (!controller.signal.aborted) {
        await waitUntilVisible();
        if (delayMs > 0) {
          await new Promise<void>((resolve) => {
            const timeout = window.setTimeout(resolve, Math.min(30_000, Math.max(500, delayMs)));
            controller.signal.addEventListener(
              "abort",
              () => {
                window.clearTimeout(timeout);
                resolve();
              },
              { once: true },
            );
          });
        }
        if (controller.signal.aborted) {
          return;
        }
        await waitUntilVisible();
        if (controller.signal.aborted) {
          return;
        }

        try {
          const runtimeAccess = await fetchVerifiedAgentSessionRuntimeAccess({
            connection,
            agentName: activeSession.agent?.name,
            sessionId: activeSessionLookupId,
            signal: controller.signal,
            token: sessionToken,
            tokenType: sessionTokenType,
          });

          if (controller.signal.aborted) {
            return;
          }

          updateSessionRuntimeAccessMeta({
            runtimeInteraction: runtimeAccess.runtimeInteraction,
            runtimePresence: runtimeAccess.runtimePresence,
            sessionId: activeSession.id,
          });
          if (!isTransientRuntimeInteraction(runtimeAccess.runtimeInteraction)) {
            return;
          }
          delayMs = runtimeAccess.runtimeInteraction?.retryAfterMs ?? 2_000;
        } catch {
          if (controller.signal.aborted) {
            return;
          }
          // One failed poll (a redeploying API, a token refresh, a network
          // blip) must not freeze a transient state on screen for good:
          // back off and keep asking.
          delayMs = Math.min(30_000, Math.max(2_000, delayMs * 2));
          const stalledMeta = sessionRuntimeAccessMetaRef.current[activeSession.id];
          if (
            stalledMeta?.runtimeInteraction?.state === "checking" &&
            !stalledMeta.runtimeInteraction.notice
          ) {
            // The silent first check did not come back: the lock now says why.
            updateSessionRuntimeAccessMeta({
              runtimeInteraction: buildClientCheckingRuntimeInteraction({
                agentName: activeSession.agent?.name,
                retrying: true,
              }),
              runtimePresence: null,
              sessionId: activeSession.id,
            });
          }
        }
      }
    })().finally(() => {
      if (sessionRuntimeAccessMetaRequestRef.current === controller) {
        sessionRuntimeAccessMetaRequestRef.current = null;
      }
    });

    return () => {
      controller.abort();
    };
  }, [
    activeSession?.id,
    activeSession?.runtimeSessionId,
    activeRuntimeInteraction?.operation?.status,
    activeRuntimeInteraction?.state,
    runtimeAccessPollerEpoch,
    sessionToken,
    sessionTokenType,
    shouldHydrateChatRuntime,
    shouldSuppressDirectLaunchRuntimePrefetch,
    updateSessionRuntimeAccessMeta,
  ]);

  useEffect(() => {
    if (
      !shouldHydrateChatRuntime ||
      !sessionToken ||
      !activeEnvironmentUid ||
      shouldSuppressDirectLaunchRuntimePrefetch
    ) {
      setHasAttemptedLatestSessionsBootstrap(false);
      setIsLoadingLatestSessions(false);
      setLatestSessionsError(null);
      return;
    }

    const controller = new AbortController();

    void (async () => {
      try {
        setIsLoadingLatestSessions(true);
        setLatestSessionsError(null);

        const remoteRecords = await fetchLatestAgentSessions({
          connection,
          agentId: latestSessionsAgentFilterId,
          createdByUserUid: sessionUserUid,
          organizationEnvironmentUid: activeEnvironmentUid ?? "",
          signal: controller.signal,
          token: sessionToken,
          tokenType: sessionTokenType,
        });
        let resolvedRemoteRecords = remoteRecords;
        let requestedSessionUnavailableMessage: string | null = null;

        if (
          requestedChatSessionId &&
          !remoteRecords.some(
            (record) => getAgentSessionRecordSessionId(record) === requestedChatSessionId,
          )
        ) {
          // A stale bookmark (?session=<deleted-uid>) must not discard the
          // already-fetched session list — resolve the requested session
          // best-effort and fall back to the list on failure.
          try {
            const requestedRecord = await fetchAgentSessionDetail({
              connection,
              organizationEnvironmentUid: activeEnvironmentUid,
              sessionId: requestedChatSessionId,
              signal: controller.signal,
              token: sessionToken,
              tokenType: sessionTokenType,
            });

            if (controller.signal.aborted) {
              return;
            }

            resolvedRemoteRecords = [requestedRecord, ...remoteRecords];
          } catch (error) {
            if (controller.signal.aborted || isAbortLikeError(error)) {
              return;
            }

            requestedSessionUnavailableMessage =
              error instanceof Error
                ? error.message
                : "The requested session could not be loaded.";
          }
        }

        if (controller.signal.aborted) {
          return;
        }

        // Merge against the ref snapshot and dispatch plain state updates:
        // React updater functions must stay pure (StrictMode double-invokes
        // them), so the selection decisions below live OUTSIDE setAgentSessions.
        const currentSessions = agentSessionsRef.current;
        const currentById = new Map<string, AgentSessionRecord>();

        currentSessions.forEach((session) => {
          currentById.set(session.id, session);

          const lookupSessionId = resolveAgentSessionLookupId(session);

          if (lookupSessionId) {
            currentById.set(lookupSessionId, session);
          }
        });

        const remoteSessions = resolvedRemoteRecords.map((record) =>
          toAgentSessionRecordFromApi(
            record,
            currentById.get(getAgentSessionRecordSessionId(record)),
          ),
        );
        const currentSession =
          currentSessions.find((session) => session.id === currentSessionIdRef.current) ?? null;

        // Keep the session the user is actively reading anchored across this
        // rebuild. A token refresh refetches the latest-sessions list, and the
        // same logical session can return under a different uid or fall out of
        // the latest-N page entirely. Matching on every stable identity — and
        // re-anchoring the match to the existing client id — stops the
        // selection + hydration guards from treating it as a different session
        // and tearing down the live conversation ("Loading AgentSession…").
        const activeRemoteIndex =
          currentSession !== null
            ? remoteSessions.findIndex((session) =>
                agentSessionsShareIdentity(session, currentSession),
              )
            : -1;

        let nextSessionsBase: AgentSessionRecord[];

        if (currentSession && activeRemoteIndex >= 0) {
          // Re-map the matched record using the local record as `existing` so
          // origin/handle/messages survive, but pin the existing client id so
          // selection state never churns.
          const reanchoredActiveSession: AgentSessionRecord = {
            ...toAgentSessionRecordFromApi(
              resolvedRemoteRecords[activeRemoteIndex],
              currentSession,
            ),
            id: currentSession.id,
          };

          nextSessionsBase = remoteSessions.map((session, index) =>
            index === activeRemoteIndex ? reanchoredActiveSession : session,
          );
        } else if (currentSession) {
          // The active session was not in the latest-N page; keep the local
          // copy instead of dropping it and yanking the user elsewhere.
          nextSessionsBase = [
            currentSession,
            ...remoteSessions.filter(
              (session) => !agentSessionsShareIdentity(session, currentSession),
            ),
          ];
        } else {
          nextSessionsBase = remoteSessions;
        }

        // The record mapper intentionally drops `working` when the backend
        // omits it; re-apply it for the session that owns the live client
        // stream so a mid-run list refresh keeps the working indicator.
        const activeStreamSessionId = activeChatStreamSessionIdRef.current;
        const nextSessions = sortAgentSessions(
          activeStreamSessionId
            ? nextSessionsBase.map((session) =>
                session.id === activeStreamSessionId && !session.working
                  ? { ...session, working: true }
                  : session,
              )
            : nextSessionsBase,
        );
        const requestedSession = requestedChatSessionId
          ? nextSessions.find((session) => session.id === requestedChatSessionId) ?? null
          : null;

        agentSessionsRef.current = nextSessions;
        setAgentSessions(nextSessions);

        if (requestedSession) {
          setSessionSelectionMode("explicit");
          setCurrentSessionId(requestedSession.id);
        } else if (requestedChatSessionId && requestedSessionUnavailableMessage) {
          // The requested session is unreachable — keeping it selected
          // would leave the page stuck on a dangling id that never loads.
          setSessionSelectionMode("auto");
          setCurrentSessionId(nextSessions[0]?.id ?? null);
        } else if (requestedChatSessionId) {
          setSessionSelectionMode("explicit");
          setCurrentSessionId(requestedChatSessionId);
        } else if (
          !currentSession &&
          sessionSelectionModeRef.current !== "explicit" &&
          !shouldAvoidLatestSessionAutoSelection
        ) {
          setCurrentSessionId(nextSessions[0]?.id ?? null);
        } else if (
          currentSession &&
          !nextSessions.some((session) =>
            agentSessionsShareIdentity(session, currentSession),
          )
        ) {
          setCurrentSessionId(nextSessions[0]?.id ?? null);
        }

        setLatestSessionsError(null);

        if (requestedSessionUnavailableMessage) {
          setSessionNotice(
            `The session referenced by this link is unavailable. ${requestedSessionUnavailableMessage}`,
          );
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setLatestSessionsError(
          error instanceof Error
            ? error.message
            : "Latest agent sessions request failed.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setHasAttemptedLatestSessionsBootstrap(true);
          setIsLoadingLatestSessions(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [
    activeEnvironmentUid,
    latestSessionsAgentFilterId,
    latestSessionsRefreshNonce,
    sessionToken,
    sessionTokenType,
    sessionUserUid,
    shouldHydrateChatRuntime,
    shouldSuppressDirectLaunchRuntimePrefetch,
    shouldAvoidLatestSessionAutoSelection,
    requestedChatSessionId,
  ]);

  useEffect(() => {
    if (!isDefaultSessionSurface) {
      defaultSessionBootstrapKeyRef.current = null;
      setDefaultSessionError(null);
      return;
    }

    if (
      defaultSessionSourceStatus !== "ready" ||
      !activeEnvironmentUid ||
      !defaultSessionAgentUid ||
      !defaultSessionHandleUniqueId
    ) {
      cancelDefaultSessionRequest();
      defaultSessionIdRef.current = null;
      if (currentSessionId !== null) {
        setSessionSelectionMode("auto");
        setCurrentSessionId(null);
      }
      return;
    }

    // The handle is unique per Agent. Pairing the handle with the Agent UID
    // prevents a session from a previous Environment or setting from being
    // reused after it changes.
    const knownHandleSessionId =
      defaultSessionIdRef.current &&
      agentSessions.some(
        (session) =>
          session.id === defaultSessionIdRef.current &&
          isDefaultSessionRecord(session, defaultSessionHandleUniqueId, defaultSessionAgentUid),
      )
        ? defaultSessionIdRef.current
        : defaultSessionId;

    if (knownHandleSessionId) {
      defaultSessionIdRef.current = knownHandleSessionId;

      if (currentSessionId !== knownHandleSessionId) {
        setSessionSelectionMode("auto");
        setSessionNotice(null);
        setCurrentSessionId(knownHandleSessionId);
      }
    } else if (currentSessionId !== null) {
      // The default-session surface never shows a non-handle session: clear any foreign
      // selection while the handle session resolves.
      setSessionSelectionMode("auto");
      setCurrentSessionId(null);
    }

    const bootstrapKey = `${sessionUserUid ?? "anonymous"}:${activeEnvironmentUid}:${defaultSessionAgentUid}:${defaultSessionHandleUniqueId}`;

    if (
      !sessionToken ||
      !sessionUserUid ||
      isCreatingAgentSession ||
      defaultSessionRequestRef.current ||
      defaultSessionBootstrapKeyRef.current === bootstrapKey
    ) {
      return;
    }

    defaultSessionBootstrapKeyRef.current = bootstrapKey;
    const controller = new AbortController();
    defaultSessionRequestRef.current = controller;
    setIsCreatingAgentSession(true);
    setLatestSessionsError(null);
    setDefaultSessionError(null);
    setSessionNotice(null);

    void (async () => {
      try {
        const nextSession = await fetchDefaultAgentSession({
          agentUid: defaultSessionAgentUid,
          connection,
          existingSessions: agentSessionsRef.current,
          handleUniqueId: defaultSessionHandleUniqueId,
          name: defaultSessionName,
          unavailableMessage: defaultSessionUnavailableMessage,
          requestModel: () => {
            const pending = requestSessionModelSelection({ agentUid: defaultSessionAgentUid });
            controller.signal.addEventListener("abort", cancelSessionModelSelection, { once: true });
            return pending;
          },
          signal: controller.signal,
          token: sessionToken,
          tokenType: sessionTokenType,
        });

        if (controller.signal.aborted) {
          return;
        }

        const currentSessions = agentSessionsRef.current;
        const nextSessions = mergeDefaultSession(
          currentSessions,
          nextSession,
          defaultSessionHandleUniqueId,
        );

        agentSessionsRef.current = nextSessions;
        defaultSessionIdRef.current = nextSession.id;
        setAgentSessions(nextSessions);
        setSessionSelectionMode("auto");
        setCurrentSessionId(nextSession.id);
        setSessionNotice(null);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setDefaultSessionError(
          error instanceof Error && error.message.trim()
            ? error.message
            : defaultSessionUnavailableMessage,
        );
      } finally {
        finishDefaultSessionRequest(controller);
      }
    })();
  }, [
    agentSessions,
    activeEnvironmentUid,
    cancelDefaultSessionRequest,
    defaultSessionId,
    currentSessionId,
    finishDefaultSessionRequest,
    isDefaultSessionSurface,
    isCreatingAgentSession,
    connection,
    defaultSessionAgentUid,
    defaultSessionHandleUniqueId,
    defaultSessionName,
    defaultSessionSourceStatus,
    defaultSessionUnavailableMessage,
    sessionToken,
    sessionTokenType,
    sessionUserUid,
  ]);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    agentSessionsRef.current = agentSessions;
  }, [agentSessions]);

  useEffect(
    () => () => {
      defaultSessionRequestRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    directLaunchSessionIdRef.current = directLaunchSessionId;

    if (
      directLaunchSessionId &&
      (!currentSessionId || currentSessionId !== directLaunchSessionId)
    ) {
      directLaunchSessionIdRef.current = null;
      setDirectLaunchSessionId(null);
    }
  }, [currentSessionId, directLaunchSessionId]);

  useEffect(() => {
    if (directLaunchSessionId) {
      return;
    }

    defaultSessionIdRef.current = defaultSessionId;
  }, [defaultSessionId, directLaunchSessionId]);

  useEffect(() => {
    selectedSessionRef.current = selectedSession;
  }, [selectedSession]);

  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  useEffect(() => {
    activeSessionDetailRef.current = activeSessionDetail;
  }, [activeSessionDetail]);

  useEffect(() => {
    activeSessionReadinessRef.current = activeSessionReadiness;
  }, [activeSessionReadiness]);

  useEffect(() => {
    sessionSelectionModeRef.current = sessionSelectionMode;
  }, [sessionSelectionMode]);

  useEffect(() => {
    selectedModelValueRef.current = selectedModelValue;
  }, [selectedModelValue]);

  useEffect(() => {
    selectedReasoningEffortValueRef.current = selectedReasoningEffortValue;
  }, [selectedReasoningEffortValue]);

  useEffect(() => {
    const sessionId = activeSessionDetail?.sessionId ?? null;
    const serializedRecord = activeSessionDetail?.serializedRecord ?? null;

    if (!sessionId || !serializedRecord) {
      return;
    }

    setAgentSessions((currentSessions) =>
      currentSessions.map((session) =>
        session.id === sessionId
          ? attachSerializedSessionToSession(session, serializedRecord)
          : session,
      ),
    );

    if (activeSessionRef.current?.id === sessionId) {
      activeSessionRef.current = attachSerializedSessionToSession(
        activeSessionRef.current,
        serializedRecord,
      );
    }

    if (selectedSessionRef.current?.id === sessionId) {
      selectedSessionRef.current = attachSerializedSessionToSession(
        selectedSessionRef.current,
        serializedRecord,
      );
    }
  }, [activeSessionDetail?.serializedRecord, activeSessionDetail?.sessionId]);

  const persistSelectedSessionModelConfig = useCallback(
    ({
      model,
      persistToBackend = true,
      provider,
      thinking = "",
    }: {
      model: string | null;
      persistToBackend?: boolean;
      provider: string | null;
      thinking?: string | null;
    }) => {
      const normalizedProvider = provider?.trim();
      const normalizedModel = model?.trim();
      const normalizedThinking = typeof thinking === "string" ? thinking : "";
      const activeSession = activeSessionRef.current;
      const sessionId = resolveAgentSessionLookupId(activeSession);

      if (!activeSession || !sessionId || !normalizedProvider || !normalizedModel) {
        return;
      }

      const normalizedConfig = {
        provider: normalizedProvider,
        model: normalizedModel,
        thinking: normalizedThinking,
      };
      const previousActiveSession = activeSession;
      const nextActiveSession = activeSession.agent
        ? applyModelConfigToSession(activeSession, normalizedConfig)
        : activeSession;

      // Keep the optimistic picker/session snapshot coherent while the platform validates the change.
      // The composer remains blocked until the canonical AgentSession response is applied.
      activeSessionRef.current = nextActiveSession;
      if (selectedSessionRef.current?.id === nextActiveSession.id) {
        selectedSessionRef.current = nextActiveSession;
      }

      setAgentSessions((currentSessions) =>
        currentSessions.map((session) => {
          if (session.id !== activeSession.id || !session.agent) {
            return session;
          }

          return applyModelConfigToSession(session, normalizedConfig);
        }),
      );

      if (!persistToBackend) {
        return;
      }

      sessionModelPatchRequestRef.current?.abort();
      const controller = new AbortController();
      sessionModelPatchRequestRef.current = controller;
      setIsUpdatingSessionModel(true);

      void (async () => {
        try {
          const canonicalRecord = await patchAgentSessionModelConfig({
            connection,
            llmModel: normalizedModel,
            llmProvider: normalizedProvider,
            llmThinking: normalizedThinking,
            sessionId,
            signal: controller.signal,
            token: sessionToken,
            tokenType: sessionTokenType,
          });

          if (controller.signal.aborted) {
            return;
          }

          const canonicalConfig = {
            provider: canonicalRecord.llm_provider?.trim() || normalizedProvider,
            model: canonicalRecord.llm_model?.trim() || normalizedModel,
            thinking:
              typeof canonicalRecord.llm_thinking === "string"
                ? canonicalRecord.llm_thinking
                : normalizedThinking,
          };
          const currentActiveSession = activeSessionRef.current;

          if (currentActiveSession?.id === previousActiveSession.id) {
            activeSessionRef.current = applyModelConfigToSession(
              currentActiveSession,
              canonicalConfig,
            );
          }

          if (selectedSessionRef.current?.id === previousActiveSession.id) {
            selectedSessionRef.current = applyModelConfigToSession(
              selectedSessionRef.current,
              canonicalConfig,
            );
          }

          setAgentSessions((currentSessions) =>
            currentSessions.map((session) =>
              session.id === previousActiveSession.id && session.agent
                ? applyModelConfigToSession(session, canonicalConfig)
                : session,
            ),
          );
        } catch (error) {
          if (controller.signal.aborted) {
            return;
          }

          if (activeSessionRef.current?.id === previousActiveSession.id) {
            activeSessionRef.current = previousActiveSession;
          }

          if (selectedSessionRef.current?.id === previousActiveSession.id) {
            selectedSessionRef.current = previousActiveSession;
          }

          setAgentSessions((currentSessions) =>
            currentSessions.map((session) =>
              session.id === previousActiveSession.id ? previousActiveSession : session,
            ),
          );

          setSessionNotice(
            error instanceof Error
              ? `Failed to update session model: ${error.message}`
              : "Failed to update session model.",
          );
        } finally {
          if (sessionModelPatchRequestRef.current === controller) {
            sessionModelPatchRequestRef.current = null;
            setIsUpdatingSessionModel(false);
          }
        }
      })();
    },
    [sessionToken, sessionTokenType],
  );

  const handleSelectedProviderChange = useCallback(
    (provider: string | null) => {
      if (activeSessionReadinessRef.current.status !== "ready") {
        return;
      }

      setSelectedProviderValue(provider);

      if (!provider) {
        setSelectedModelValue(null);
        selectedModelValueRef.current = null;
        return;
      }

      const currentModel =
        availableModels.find((model) => model.id === selectedModelValue) ?? null;
      const nextModel =
        currentModel?.provider === provider
          ? currentModel
          : availableModels.find((model) => model.provider === provider) ?? null;

      if (nextModel) {
        setSelectedModelValue(nextModel.id);
        selectedModelValueRef.current = nextModel.id;
      }

      // Provider changes persist like model changes: with persistToBackend
      // false the picker silently reverted to the old provider after reload.
      persistSelectedSessionModelConfig({
        provider,
        model: nextModel?.value ?? currentModel?.value ?? null,
        thinking: selectedReasoningEffortValueRef.current ?? "",
      });
    },
    [availableModels, persistSelectedSessionModelConfig, selectedModelValue],
  );

  const handleSelectedModelChange = useCallback(
    (modelId: string | null) => {
      if (activeSessionReadinessRef.current.status !== "ready") {
        return;
      }

      setSelectedModelValue(modelId);
      selectedModelValueRef.current = modelId;

      const selectedModel = availableModels.find((model) => model.id === modelId) ?? null;

      if (selectedModel?.provider && selectedModel.provider !== selectedProviderValue) {
        setSelectedProviderValue(selectedModel.provider);
      }

      persistSelectedSessionModelConfig({
        provider: selectedModel?.provider ?? selectedProviderValue,
        model: selectedModel?.value ?? null,
        thinking: selectedReasoningEffortValueRef.current ?? "",
      });
    },
    [availableModels, persistSelectedSessionModelConfig, selectedProviderValue],
  );
  const handleSelectedReasoningEffortChange = useCallback((value: string | null) => {
    if (activeSessionReadinessRef.current.status !== "ready") {
      return;
    }

    setSelectedReasoningEffortValue(value);
    const selectedModel =
      availableModels.find((model) => model.id === selectedModelValueRef.current) ?? null;

    persistSelectedSessionModelConfig({
      provider: selectedModel?.provider ?? selectedProviderValue,
      model: selectedModel?.value ?? null,
      thinking: value ?? "",
    });
  }, [availableModels, persistSelectedSessionModelConfig, selectedProviderValue]);

  useEffect(() => {
    writeAgentSessions(sessionUserId, activeEnvironmentUid, agentSessions);
  }, [activeEnvironmentUid, agentSessions, sessionUserId]);

  // Single model-picker reconciliation. This replaces five interlocking
  // effects that negotiated provider/model/effort through guard refs. One
  // pass derives the whole selection — apply the session's stored
  // preference once per (session, preference, catalog) signature, validate
  // the current selection against the catalog, fall back deterministically,
  // and derive the reasoning-effort list from the chosen model — writing
  // each piece of state only when it actually changes, so the pass reaches
  // a fixed point in a single follow-up run.
  useEffect(() => {
    if (availableModels.length === 0) {
      if (selectedProviderValue !== null) {
        setSelectedProviderValue(null);
      }
      if (selectedModelValue !== null) {
        setSelectedModelValue(null);
        selectedModelValueRef.current = null;
      }
      if (selectedReasoningEffortValue !== null) {
        setSelectedReasoningEffortValue(null);
      }
      if (availableReasoningEfforts.length !== 0) {
        setAvailableReasoningEfforts([]);
      }
      unavailableSessionModelNoticeRef.current = null;
      sessionPickerSyncRef.current = null;
      return;
    }

    let nextProvider = selectedProviderValue;
    let nextModelId = selectedModelValue;

    const { model: sessionModel, provider: sessionProvider } =
      resolveSessionModelPreference(selectedSession);
    const sessionRequestedModel = Boolean(
      normalizeCatalogKey(sessionProvider) || normalizeCatalogKey(sessionModel),
    );

    if (currentSessionId && sessionRequestedModel && availableProviders.length > 0) {
      const catalogSignature = buildModelCatalogSignature({
        models: availableModels,
        providers: availableProviders,
      });
      const syncSignature = [
        currentSessionId,
        normalizeCatalogKey(sessionProvider) ?? "",
        normalizeCatalogKey(sessionModel) ?? "",
        catalogSignature,
      ].join("::");

      if (sessionPickerSyncRef.current !== syncSignature) {
        const matchedProviderValue = findProviderValueBySessionProvider(
          availableProviders,
          sessionProvider,
        );
        const matchedModelId = findModelIdBySessionModel(availableModels, {
          model: sessionModel,
          provider: matchedProviderValue ?? sessionProvider,
        });
        const matchedModel =
          availableModels.find((model) => model.id === matchedModelId) ?? null;

        if (matchedModel) {
          nextProvider = matchedProviderValue ?? matchedModel.provider ?? null;
          nextModelId = matchedModel.id;
          unavailableSessionModelNoticeRef.current = null;
        } else {
          const fallbackProvider =
            matchedProviderValue ?? availableProviders[0]?.value ?? null;
          const fallbackModels = fallbackProvider
            ? availableModels.filter((model) => model.provider === fallbackProvider)
            : availableModels;

          nextProvider = fallbackProvider;
          nextModelId = fallbackModels[0]?.id ?? availableModels[0]?.id ?? null;

          if (unavailableSessionModelNoticeRef.current !== syncSignature) {
            unavailableSessionModelNoticeRef.current = syncSignature;
            notify({
              title: "Session model is not available",
              description: [
                sessionProvider ? `Provider: ${sessionProvider}` : null,
                sessionModel ? `Model: ${sessionModel}` : null,
                "Using the first available model from the picker instead.",
              ]
                .filter(Boolean)
                .join(" · "),
              variant: "info",
            });
          }
        }

        sessionPickerSyncRef.current = syncSignature;
      }
    }

    if (
      nextProvider &&
      !availableProviders.some((provider) => provider.value === nextProvider)
    ) {
      nextProvider = null;
    }

    if (!nextProvider && availableProviders.length > 0) {
      const modelForSelection =
        availableModels.find((model) => model.id === nextModelId) ?? null;
      nextProvider =
        modelForSelection?.provider ?? availableProviders[0]?.value ?? null;
    }

    const scopedModels = nextProvider
      ? availableModels.filter((model) => model.provider === nextProvider)
      : availableModels;

    if (!nextModelId || !scopedModels.some((model) => model.id === nextModelId)) {
      nextModelId = scopedModels[0]?.id ?? availableModels[0]?.id ?? null;
    }

    const nextModel = availableModels.find((model) => model.id === nextModelId) ?? null;
    const nextReasoningEfforts = nextModel?.reasoningEfforts.length
      ? nextModel.reasoningEfforts
      : [];
    let nextReasoningEffort = selectedReasoningEffortValue;

    if (nextReasoningEfforts.length === 0) {
      nextReasoningEffort = null;
    } else if (
      !nextReasoningEffort ||
      !nextReasoningEfforts.some((effort) => effort.value === nextReasoningEffort)
    ) {
      nextReasoningEffort =
        nextModel?.defaultReasoningEffort ?? nextReasoningEfforts[0]?.value ?? null;
    }

    if (nextProvider !== selectedProviderValue) {
      setSelectedProviderValue(nextProvider);
    }

    if (nextModelId !== selectedModelValue) {
      setSelectedModelValue(nextModelId);
      selectedModelValueRef.current = nextModelId;
    }

    if (nextReasoningEffort !== selectedReasoningEffortValue) {
      setSelectedReasoningEffortValue(nextReasoningEffort);
    }

    const effortsUnchanged =
      availableReasoningEfforts.length === nextReasoningEfforts.length &&
      availableReasoningEfforts.every((effort, index) => effort === nextReasoningEfforts[index]);

    if (!effortsUnchanged) {
      setAvailableReasoningEfforts(nextReasoningEfforts);
    }
  }, [
    availableModels,
    availableProviders,
    availableReasoningEfforts,
    currentSessionId,
    selectedModelValue,
    selectedProviderValue,
    selectedReasoningEffortValue,
    selectedSession,
    notify,
  ]);

  const persistSessionMessages = useCallback((nextMessages?: readonly ThreadMessageLike[]) => {
    const sessionId = currentSessionIdRef.current;

    if (!sessionId) {
      return;
    }

    const sourceMessages =
      nextMessages ??
      ((runtimeRef.current?.thread.getState().messages as readonly ThreadMessageLike[] | undefined) ??
        []);

    setAgentSessions((currentSessions) =>
      sortAgentSessions(
        currentSessions.map((session) =>
          session.id === sessionId
            ? updateAgentSessionSnapshot({
                session,
                messages: sourceMessages,
              })
            : session,
        ),
      ),
    );
  }, []);

  const promoteCurrentSessionFromStream = useCallback((streamSession: StreamCreatedAgentSession) => {
    const currentId = currentSessionIdRef.current;

    if (!currentId) {
      return;
    }

    const sourceMessages =
      ((runtimeRef.current?.thread.getState().messages as readonly ThreadMessageLike[] | undefined) ??
        []);
    const nextSessionId = streamSession.agentSessionId;

    setAgentSessions((currentSessions) => {
      const currentSession = currentSessions.find((session) => session.id === currentId);

      if (!currentSession) {
        return currentSessions;
      }

      const existingTarget =
        nextSessionId === currentId
          ? currentSession
          : currentSessions.find((session) => session.id === nextSessionId) ?? null;
      const promotedSession = promoteAgentSessionFromStream({
        session: existingTarget ?? currentSession,
        stream: streamSession,
        messages: sourceMessages.length > 0 ? sourceMessages : currentSession.messages,
      });

      return sortAgentSessions([
        promotedSession,
        ...currentSessions.filter(
          (session) => session.id !== currentId && session.id !== nextSessionId,
        ),
      ]);
    });

    if (nextSessionId !== currentId) {
      loadedSessionIdRef.current = nextSessionId;
      loadedSessionLookupIdRef.current = null;
      currentSessionIdRef.current = nextSessionId;
      setCurrentSessionId(nextSessionId);
      setQueuedMessagesBySessionId((current) => {
        const queue = current[currentId];
        if (!queue) {
          return current;
        }
        const next = { ...current };
        delete next[currentId];
        next[nextSessionId] = queue;
        return next;
      });
      rekeyMessageQueue(currentId, nextSessionId);
    }
  }, []);

  const createAgentSession = useCallback(async () => {
    if (isCreatingAgentSession) {
      return;
    }

    persistSessionMessages();
    clearDirectLaunchSelection();
    setSessionSelectionMode("explicit");

    const current = agentSessions.find((session) => session.id === currentSessionIdRef.current);
    const launchAgent = current?.agent ?? createDefaultAgentSessionAgent();
    // History hydration only recovers the agent's uid (agentUniqueId), never
    // a numeric id — accept either when launching a new session.
    const launchAgentId = launchAgent.id ?? (launchAgent.agentUniqueId.trim() || null);

    if (launchAgentId === null || launchAgentId === undefined) {
      notify({
        title: "Agent session not created",
        description: "The current agent does not include a backend agent id.",
        variant: "error",
      });
      return;
    }

    setIsCreatingAgentSession(true);
    setSessionNotice(null);

    try {
      const { record, sessionId } = await startAgentSessionWithModelFallback({
        agentId: launchAgentId,
        agentLabel: launchTarget?.label ?? null,
      });
      const fallbackSession = createEmptyAgentSession(launchAgent);
      const nextSession = createStartedAgentSessionRecord({
        fallbackSession,
        record,
        sessionId,
      });

      setAgentSessions((currentSessions) =>
        sortAgentSessions([
          nextSession,
          ...currentSessions.filter((session) => session.id !== nextSession.id),
        ]),
      );
      setCurrentSessionId(nextSession.id);
    } catch (error) {
      // Closing the model dialog is a choice, not a failure.
      if (error instanceof SessionModelSelectionCancelledError) {
        return;
      }
      notify({
        title: "Agent session not created",
        description:
          error instanceof Error ? error.message : "Unable to create a new agent session.",
        variant: "error",
      });
    } finally {
      setIsCreatingAgentSession(false);
    }
  }, [
    agentSessions,
    clearDirectLaunchSelection,
    isCreatingAgentSession,
    persistSessionMessages,
    sessionToken,
    sessionTokenType,
    sessionUserId,
    notify,
  ]);

  const deleteAgentSession = useCallback(
    async (sessionId: string) => {
      const session = agentSessions.find((entry) => entry.id === sessionId);
      if (!session) {
        return;
      }

      const backendSessionId = resolveAgentSessionLookupId(session);

      try {
        if (backendSessionId) {
          await deleteAgentSessionRequest({
            connection,
            sessionId: backendSessionId,
            token: sessionToken,
            tokenType: sessionTokenType,
          });
        }

        setLatestSessionsError(null);

        if (currentSessionIdRef.current === sessionId) {
          sessionHistoryRequestRef.current?.abort();
          loadedSessionIdRef.current = null;
          loadedSessionLookupIdRef.current = null;
        }

        const remainingSessions = sortAgentSessions(
          agentSessionsRef.current.filter((candidate) => candidate.id !== sessionId),
        );

        agentSessionsRef.current = remainingSessions;
        setAgentSessions(remainingSessions);

        if (remainingSessions.length === 0) {
          setSessionSelectionMode("auto");
          setCurrentSessionId(null);
        } else if (currentSessionIdRef.current === sessionId) {
          setSessionSelectionMode("auto");
          setCurrentSessionId(remainingSessions[0]?.id ?? null);
        }
      } catch (error) {
        setLatestSessionsError(
          error instanceof Error ? error.message : "Delete session failed.",
        );
      }
    },
    [agentSessions, sessionToken, sessionTokenType],
  );

  const archiveAgentSession = useCallback(
    async (sessionId: string) => {
      const session = agentSessions.find((entry) => entry.id === sessionId);
      if (!session) {
        return false;
      }

      const backendSessionId = resolveAgentSessionLookupId(session);
      if (!backendSessionId) {
        notify({
          title: "Session not archived",
          description: "This session does not expose a backend session uid.",
          variant: "error",
        });
        return false;
      }

      try {
        await archiveAgentSessionRequest({
          connection,
          sessionId: backendSessionId,
          token: sessionToken,
          tokenType: sessionTokenType,
        });

        if (currentSessionIdRef.current === sessionId) {
          sessionHistoryRequestRef.current?.abort();
          loadedSessionIdRef.current = null;
          loadedSessionLookupIdRef.current = null;
        }

        const remainingSessions = sortAgentSessions(
          agentSessionsRef.current.filter((candidate) => candidate.id !== sessionId),
        );

        agentSessionsRef.current = remainingSessions;
        setAgentSessions(remainingSessions);

        if (remainingSessions.length === 0) {
          setSessionSelectionMode("auto");
          setCurrentSessionId(null);
        } else if (currentSessionIdRef.current === sessionId) {
          setSessionSelectionMode("auto");
          setCurrentSessionId(remainingSessions[0]?.id ?? null);
        }

        if (backendSessionId && requestedChatSessionId === backendSessionId) {
          onRequestedSessionRemoved?.(backendSessionId);
        }

        return true;
      } catch (error) {
        notify({
          title: "Session not archived",
          description:
            error instanceof Error ? error.message : "Unable to archive this session.",
          variant: "error",
        });
        return false;
      }
    },
    [
      agentSessions,
      onRequestedSessionRemoved,
      requestedChatSessionId,
      sessionToken,
      sessionTokenType,
      notify,
    ],
  );

  const unarchiveAgentSession = useCallback(
    async (sessionId: string) => {
      try {
        const record = await unarchiveAgentSessionRequest({
          connection,
          sessionId,
          token: sessionToken,
          tokenType: sessionTokenType,
        });
        const restoredSession = toAgentSessionRecordFromApi(record);

        setAgentSessions((currentSessions) =>
          sortAgentSessions([
            restoredSession,
            ...currentSessions.filter(
              (session) => !agentSessionsShareIdentity(session, restoredSession),
            ),
          ]),
        );

        return true;
      } catch (error) {
        notify({
          title: "Session not restored",
          description:
            error instanceof Error ? error.message : "Unable to restore this session.",
          variant: "error",
        });
        return false;
      }
    },
    [sessionToken, sessionTokenType, notify],
  );

  const startAgentSession = useCallback(
    async (agent: AgentSessionAgentSource) => {
      if (isCreatingAgentSession) {
        return;
      }

      const lookupKey = getAgentLookupKey(agent);

      if (!lookupKey) {
        notify({
          title: "Agent session not created",
          description: "The selected agent does not expose a valid backend agent uid.",
          variant: "error",
        });
        return;
      }

      persistSessionMessages();
      clearDirectLaunchSelection();
      setSessionSelectionMode("explicit");
      setLatestSessionsAgentFilterId(lookupKey);

      setIsCreatingAgentSession(true);
      setSessionNotice(null);

      try {
        const { record, sessionId } = await startAgentSessionWithModelFallback({
          agentId: lookupKey,
          agentLabel: agent.name ?? null,
        });
        const fallbackSession = attachAgentToSession(createEmptyAgentSession(), agent);
        const nextSession = createStartedAgentSessionRecord({
          fallbackSession,
          record,
          sessionId,
        });

        setAgentSessions((currentSessions) =>
          sortAgentSessions([
            nextSession,
            ...currentSessions.filter((session) => session.id !== nextSession.id),
          ]),
        );
        setCurrentSessionId(nextSession.id);
      } catch (error) {
        // Closing the model dialog is a choice, not a failure.
        if (error instanceof SessionModelSelectionCancelledError) {
          return;
        }
        notify({
          title: "Agent session not created",
          description:
            error instanceof Error ? error.message : "Unable to create a new agent session.",
          variant: "error",
        });
      } finally {
        setIsCreatingAgentSession(false);
      }
    },
    [
      clearDirectLaunchSelection,
      isCreatingAgentSession,
      persistSessionMessages,
      sessionToken,
      sessionTokenType,
      notify,
    ],
  );

  const startAgentSessionById = useCallback(
    async ({
      agentId,
      label,
    }: {
      agentId: string | number;
      label?: string | null;
    }) => {
      if (isCreatingAgentSession) {
        return;
      }

      const normalizedAgentId = `${agentId}`.trim();

      if (!normalizedAgentId) {
        notify({
          title: "Agent session not created",
          description: "The selected code repository agent does not expose a valid backend agent id.",
          variant: "error",
        });
        return;
      }

      persistSessionMessages();
      setSessionSelectionMode("explicit");
      setLatestSessionsAgentFilterId(null);
      setSessionNotice(null);
      setIsCreatingAgentSession(true);
      preserveDefaultSessionSelection();

      try {
        const { record, sessionId } = await startAgentSessionWithModelFallback({
          agentId: normalizedAgentId,
          agentLabel: label ?? null,
        });
        const fallbackSession = createEmptyAgentSession(
          createFallbackAgentSessionAgentFromId({
            agentId: normalizedAgentId,
            label,
          }),
        );
        const nextSession = createStartedAgentSessionRecord({
          fallbackSession,
          record,
          sessionId,
        });

        setAgentSessions((currentSessions) =>
          sortAgentSessions([
            nextSession,
            ...currentSessions.filter((session) => session.id !== nextSession.id),
          ]),
        );
        directLaunchSessionIdRef.current = nextSession.id;
        setDirectLaunchSessionId(nextSession.id);
        setCurrentSessionId(nextSession.id);
        scheduleRequestVisible();
      } catch (error) {
        // Closing the model dialog is a choice, not a failure.
        if (error instanceof SessionModelSelectionCancelledError) {
          return;
        }
        notify({
          title: "Agent session not created",
          description:
            error instanceof Error ? error.message : "Unable to create a new agent session.",
          variant: "error",
        });
      } finally {
        setIsCreatingAgentSession(false);
      }
    },
    [
      isCreatingAgentSession,
      persistSessionMessages,
      preserveDefaultSessionSelection,
      scheduleRequestVisible,
      sessionToken,
      sessionTokenType,
      notify,
    ],
  );

  const openLatestOrStartAgentSessionById = useCallback(
    async ({
      agentId,
      label,
    }: {
      agentId: string | number;
      label?: string | null;
    }) => {
      if (isCreatingAgentSession) {
        return;
      }

      const normalizedAgentId = `${agentId}`.trim();

      if (!normalizedAgentId) {
        notify({
          title: "Agent session not opened",
          description: "The selected code repository agent does not expose a valid backend agent id.",
          variant: "error",
        });
        return;
      }

      persistSessionMessages();
      setSessionSelectionMode("explicit");
      setLatestSessionsAgentFilterId(null);
      setSessionNotice(null);
      setIsCreatingAgentSession(true);
      preserveDefaultSessionSelection();

      try {
        const latestAgentSessions = await fetchLatestAgentSessions({
          connection,
          agentId: normalizedAgentId,
          createdByUserUid: sessionUserUid ?? "",
          organizationEnvironmentUid: activeEnvironmentUid ?? "",
          token: sessionToken,
          tokenType: sessionTokenType,
        });
        const latestSessionRecord = latestAgentSessions[0] ?? null;

        if (latestSessionRecord) {
          const fallbackSession = createEmptyAgentSession(
            createFallbackAgentSessionAgentFromId({
              agentId: normalizedAgentId,
              label,
            }),
          );
          const latestSessionId = getAgentSessionRecordSessionId(latestSessionRecord);
          const existingSession =
            agentSessions.find(
              (session) => session.id === latestSessionId,
            ) ?? fallbackSession;
          const nextSession = attachSerializedSessionToSession(
            existingSession,
            latestSessionRecord as AgentSessionSerializedRecord,
          );

          setAgentSessions((currentSessions) =>
            sortAgentSessions([
              nextSession,
              ...currentSessions.filter((session) => session.id !== nextSession.id),
            ]),
          );
          directLaunchSessionIdRef.current = nextSession.id;
          setDirectLaunchSessionId(nextSession.id);
          setCurrentSessionId(nextSession.id);
          scheduleRequestVisible();
          return;
        }

        const { record, sessionId } = await startAgentSessionWithModelFallback({
          agentId: normalizedAgentId,
          agentLabel: label ?? null,
        });
        const fallbackSession = createEmptyAgentSession(
          createFallbackAgentSessionAgentFromId({
            agentId: normalizedAgentId,
            label,
          }),
        );
        const nextSession = createStartedAgentSessionRecord({
          fallbackSession,
          record,
          sessionId,
        });

        setAgentSessions((currentSessions) =>
          sortAgentSessions([
            nextSession,
            ...currentSessions.filter((session) => session.id !== nextSession.id),
          ]),
        );
        directLaunchSessionIdRef.current = nextSession.id;
        setDirectLaunchSessionId(nextSession.id);
        setCurrentSessionId(nextSession.id);
        scheduleRequestVisible();
      } catch (error) {
        // Closing the model dialog is a choice, not a failure.
        if (error instanceof SessionModelSelectionCancelledError) {
          return;
        }
        notify({
          title: "Agent session not opened",
          description:
            error instanceof Error ? error.message : "Unable to open the code repository agent session.",
          variant: "error",
        });
      } finally {
        setIsCreatingAgentSession(false);
      }
    },
    [
      agentSessions,
      isCreatingAgentSession,
      persistSessionMessages,
      preserveDefaultSessionSelection,
      scheduleRequestVisible,
      sessionToken,
      sessionTokenType,
      sessionUserUid,
      notify,
    ],
  );

  useEffect(() => {
    if (!isVisible || !launchTarget?.agentId) {
      return;
    }

    if (embeddedLaunchKeyRef.current === launchTarget.launchKey) {
      return;
    }

    embeddedLaunchKeyRef.current = launchTarget.launchKey;

    void openLatestOrStartAgentSessionById({
      agentId: launchTarget.agentId,
      label: launchTarget.label,
    });
  }, [
    isVisible,
    launchTarget?.agentId,
    launchTarget?.label,
    launchTarget?.launchKey,
    openLatestOrStartAgentSessionById,
  ]);

  const loadCurrentSession = useCallback(
    (sessionId: string | null) => {
      if (!sessionId || loadedSessionIdRef.current === sessionId) {
        return;
      }

      const session = agentSessions.find((entry) => entry.id === sessionId);
      if (!session) {
        return;
      }

      const lookupSessionId = resolveAgentSessionLookupId(session);

      // Defense-in-depth: the list rebuild keeps client ids stable, but if any
      // other path re-selects the *same* backend session under a new client id,
      // re-anchor the loaded id instead of tearing down and refetching the
      // thread (which flashes "Loading AgentSession…" over a live conversation).
      if (
        lookupSessionId &&
        loadedSessionLookupIdRef.current !== null &&
        loadedSessionLookupIdRef.current === lookupSessionId
      ) {
        loadedSessionIdRef.current = sessionId;
        setSessionHistoryReadyBySessionId((current) => ({
          ...current,
          [sessionId]: true,
        }));
        setIsLoadingSessionHistoryBySessionId((current) => ({
          ...current,
          [sessionId]: false,
        }));
        return;
      }

      sessionHistoryRequestRef.current?.abort();

      if (isSessionHistoryBlockedByActiveStream({ lookupSessionId, sessionId })) {
        return;
      }

      setSessionHistoryReadyBySessionId((current) => ({
        ...current,
        [sessionId]: false,
      }));
      setSessionHistoryErrorBySessionId((current) => ({
        ...current,
        [sessionId]: null,
      }));
      setIsLoadingSessionHistoryBySessionId((current) => ({
        ...current,
        [sessionId]: Boolean(lookupSessionId),
      }));

      // reset() does not abort an in-flight run: the still-streaming run would
      // keep writing into the cleared message repository and crash with
      // "Parent message not found". Cancel first; onCancel cleans up the
      // owning session's working/stream flags.
      try {
        runtimeRef.current?.thread.cancelRun();
      } catch {
        // No active run to cancel.
      }

      runtimeRef.current?.thread.reset([]);
      shouldSignalNewChatRef.current = !lookupSessionId;
      pendingNewChatRequestRef.current = false;
      expectedNewSessionRef.current = false;
      setAgentId(null);
      clearThread();
      loadedSessionIdRef.current = sessionId;
      loadedSessionLookupIdRef.current = lookupSessionId;

      if (!lookupSessionId) {
        setIsLoadingSessionHistoryBySessionId((current) => ({
          ...current,
          [sessionId]: false,
        }));
        return;
      }

      const controller = new AbortController();
      sessionHistoryRequestRef.current = controller;

      void (async () => {
        try {
          const snapshot = await fetchSessionHistory({
            connection,
            sessionId: lookupSessionId,
            signal: controller.signal,
            token: sessionToken,
            tokenType: sessionTokenType,
          });

          if (controller.signal.aborted || currentSessionIdRef.current !== sessionId) {
            return;
          }

          if (isSessionHistoryBlockedByActiveStream({ lookupSessionId, sessionId })) {
            return;
          }

          runtimeRef.current?.thread.reset(snapshot.messages);
          setAgentId(snapshot.session.agentUid);
          setSessionNotice(null);
          setHasVisibleAssistantOutput(
            snapshot.messages.some((message) => message.role === "assistant"),
          );
          setThinkingSummary(null);

          const latestSession =
            activeSessionRef.current?.id === sessionId ? activeSessionRef.current : session;

          if (snapshot.messages.length === 0 && snapshot.session.status !== "running") {
            setRunStatus("idle");
            setRunStatusDetail(null);
          } else if (snapshot.session.status === "running" && latestSession.working) {
            setRunStatus("responding");
            setRunStatusDetail("Restored live session.");
          } else if (snapshot.session.status === "error") {
            setRunStatus("error");
            setRunStatusDetail(snapshot.session.error || "The previous run failed.");
          } else {
            setRunStatus("complete");
            setRunStatusDetail("Run completed.");
          }

          setAgentSessions((currentSessions) =>
            sortAgentSessions(
              currentSessions.map((candidate) => {
                if (candidate.id !== sessionId) {
                  return candidate;
                }

                const nextAgent =
                  candidate.agent ?? createDefaultAgentSessionAgent();
                const updatedSessionBase = {
                  ...candidate,
                  runtimeSessionId:
                    snapshot.session.sessionId || candidate.runtimeSessionId,
                  threadId: snapshot.session.threadId || candidate.threadId,
                  updatedAt: snapshot.session.updatedAt || candidate.updatedAt,
                  isPlaceholder: false,
                  // A fresh history snapshot is authoritative: when the
                  // backend says the session is not running, clear any stale
                  // working flag left behind by an interrupted stream.
                  working:
                    snapshot.session.status === "running" ? candidate.working : false,
                  agent: {
                    ...nextAgent,
                    agentUniqueId:
                      nextAgent.agentUniqueId || snapshot.session.agentUid || "",
                    displayLabel: nextAgent.displayLabel,
                  },
                };

                return updateAgentSessionSnapshot({
                  session: updatedSessionBase,
                  messages: snapshot.messages,
                  updatedAt: snapshot.session.updatedAt || updatedSessionBase.updatedAt,
                });
              }),
            ),
          );
          setSessionHistoryReadyBySessionId((current) => ({
            ...current,
            [sessionId]: true,
          }));
          setSessionHistoryErrorBySessionId((current) => ({
            ...current,
            [sessionId]: null,
          }));
        } catch (error) {
          if (controller.signal.aborted) {
            return;
          }

          const errorMessage =
            error instanceof Error ? error.message : "Session history request failed.";

          setRunStatus("error");
          setRunStatusDetail(errorMessage);
          setSessionNotice(
            "Failed to rehydrate the selected AgentSession. Interaction is disabled until session history loads.",
          );
          setSessionHistoryReadyBySessionId((current) => ({
            ...current,
            [sessionId]: false,
          }));
          setSessionHistoryErrorBySessionId((current) => ({
            ...current,
            [sessionId]: errorMessage,
          }));
        } finally {
          if (!controller.signal.aborted) {
            setIsLoadingSessionHistoryBySessionId((current) => ({
              ...current,
              [sessionId]: false,
            }));
          }
        }
      })();
    },
    [
      agentSessions,
      clearThread,
      isSessionHistoryBlockedByActiveStream,
      sessionToken,
      sessionTokenType,
    ],
  );

  const updateSessionMessageQueue = useCallback(
    (sessionId: string, update: (queue: MessageQueue) => MessageQueue) => {
      setQueuedMessagesBySessionId((current) => {
        const existing = current[sessionId] ?? EMPTY_MESSAGE_QUEUE;
        const next = update(existing);
        if (next === existing) {
          return current;
        }
        const nextState = { ...current };
        if (next.length === 0) {
          delete nextState[sessionId];
        } else {
          nextState[sessionId] = next;
        }
        // Idempotent, so a repeated updater (StrictMode) writes the same value.
        writeMessageQueue(sessionId, next);
        return nextState;
      });
    },
    [],
  );
  const holdSessionMessageQueue = useCallback(
    (sessionId: string | null, reason: QueuedMessageHoldReason, message?: string) => {
      if (!sessionId) {
        return;
      }
      queueSendingRef.current = null;
      updateSessionMessageQueue(sessionId, (queue) => holdMessageQueue(queue, reason, message));
    },
    [updateSessionMessageQueue],
  );
  const liveRuntime = useLatestMessageDataStreamRuntime({
    api: "/api/chat",
    fetch: async (_input, init) => {
      const activeSession = activeSessionRef.current;
      const currentSessionId = resolveAgentSessionLookupId(activeSession);
      const runtimeGateSignal = init?.signal ?? null;
      const requestAssistantResponse = () => {
        clearMainSequenceAiResolvedRuntimeAccess();
        return fetchMainSequenceAiAssistantResponse({
          connection,
          agentName: activeSession?.agent?.name,
          currentSessionId,
          organizationEnvironmentUid: activeEnvironmentUid,
          requestPath: "/api/chat",
          runtimeTarget: "agent-runtime",
          ...init,
          sessionToken,
          sessionTokenType,
        });
      };
      const metaSessionKey = activeSession?.id ?? currentSessionId ?? "";
      let assistantResponse: Awaited<ReturnType<typeof fetchMainSequenceAiAssistantResponse>>;
      try {
        // The composer opens on the last decision the client saw; an Agent that went idle
        // since then answers the send with "starting". The message is held while the shared
        // poller follows the start and goes out once the Agent can take it. A terminal
        // decision, an aborted run, or a start past its deadline still fails the send.
        assistantResponse = await requestThroughRuntimeWake({
          onBlocked: (error) => {
            // The ref first: the wait reads it at once and must not see the older "ready".
            sessionRuntimeAccessMetaRef.current = {
              ...sessionRuntimeAccessMetaRef.current,
              [metaSessionKey]: {
                runtimeInteraction: error.runtimeInteraction,
                runtimePresence: error.runtimePresence,
              },
            };
            updateSessionRuntimeAccessMeta({
              runtimeInteraction: error.runtimeInteraction,
              runtimePresence: error.runtimePresence,
              sessionId: activeSession?.id ?? currentSessionId,
            });
          },
          readInteraction: () =>
            sessionRuntimeAccessMetaRef.current[metaSessionKey]?.runtimeInteraction,
          request: requestAssistantResponse,
          signal: runtimeGateSignal,
        });
      } catch (error) {
        if (error instanceof MainSequenceAiError && error.code === "agent_unreachable") {
          // The Agent answered the check and then the message could not reach it. It is not
          // sent again (it may have arrived); the surface re-checks and shows what is true.
          void refreshActiveSessionRuntimeAccessRef.current();
        }
        throw error;
      }
      const { resolvedAccess, response, url } = assistantResponse;
      updateSessionRuntimeAccessMeta({
        runtimeInteraction: resolvedAccess.runtimeInteraction,
        runtimePresence: resolvedAccess.runtimePresence,
        sessionId: activeSession?.id ?? currentSessionId,
      });
      if (!response.ok) {
        throw new MainSequenceAiError(
          await buildRuntimeHttpErrorMessage({
            fallbackMessage: `Chat stream failed with status ${response.status}.`,
            method: "POST",
            operation: "Agent chat stream request failed",
            response,
            url,
          }),
          {
            source: "assistant_backend_http",
            status: response.status,
          },
        );
      }
      return response;
    },
    protocol: "ui-message-stream",
    headers: async () => {
      const headers = new Headers();

      if (sessionToken) {
        headers.set("Authorization", `${sessionTokenType} ${sessionToken}`);
      }

      return headers;
    },
    body: async () => {
      const selectedSession = selectedSessionRef.current;
      const activeSession = activeSessionRef.current;
      const activeSessionDetail = activeSessionDetailRef.current;
      const activeSessionReadiness = activeSessionReadinessRef.current;

      if (activeSessionReadiness.status !== "ready") {
        throw new MainSequenceAiError(
          activeSessionReadiness.error ??
            "AgentSession is still loading. Wait for session detail and history before sending.",
          {
            source: "frontend_runtime_guard",
          },
        );
      }

      const selectedSessionId = resolveAgentSessionLookupId(activeSession);
      const isNewChatRequest = !activeSession || !selectedSessionId;
      const serializedSession =
        activeSession?.serializedSession ?? activeSessionDetail?.serializedRecord ?? null;
      const selectedReasoningEffort =
        selectedReasoningEffortValueRef.current ?? availableReasoningEfforts[0]?.value ?? null;

      if (!isNewChatRequest && !serializedSession) {
        throw new MainSequenceAiError(
          "AgentSession detail payload is unavailable. Wait for the session serializer to finish loading before sending.",
          {
            source: "frontend_runtime_guard",
          },
        );
      }

      pendingNewChatRequestRef.current = isNewChatRequest;
      expectedNewSessionRef.current = isNewChatRequest;
      markActiveChatStream({
        lookupSessionId: !isNewChatRequest ? selectedSessionId : null,
        sessionId: activeSession?.id ?? currentSessionIdRef.current,
      });
      setAgentSessionWorkingState({
        sessionId: activeSession?.id ?? currentSessionIdRef.current,
        working: true,
      });
      sessionHistoryRequestRef.current?.abort();

      return {
        ...buildAgentSessionRequestBodyFragment({
          context: viewContext,
          newChat: isNewChatRequest,
          runConfig: selectedReasoningEffort
            ? {
                reasoning_effort: selectedReasoningEffort,
              }
            : undefined,
          session: !isNewChatRequest ? serializedSession : null,
          runtimeSessionUid: !isNewChatRequest ? selectedSessionId : null,
          threadId:
            !isNewChatRequest ? activeSession?.threadId ?? currentSessionIdRef.current : null,
          userUid: sessionUserUid,
        }),
      };
    },
    onRequestStart: async () => {
      const queuedSend = queueSendingRef.current;
      setRunStatus("queued");
      setRunStatusDetail(
        queuedSend
          ? `Sending queued message ${queuedSend.position} of ${queuedSend.total}`
          : "Working on your request.",
      );
      setThinkingSummary(null);
      setHasVisibleAssistantOutput(false);
      setSessionNotice(null);
    },
    onResponse: async () => {
      queueSendingRef.current = null;
      setRunStatus("queued");
      setRunStatusDetail("Thinking...");
      setThinkingSummary(null);
    },
    onChunk: ({ type, data }) => {
      const streamSession = extractNewSessionChunk(data);

      if (streamSession) {
        expectedNewSessionRef.current = false;
        const chunkAgentId =
          streamSession.agentId !== null ? String(streamSession.agentId) : extractAgentId(data);
        const activeSession = activeSessionRef.current;
        const currentChatAgentId =
          agentId ??
          (activeSession?.agent?.id !== null && activeSession?.agent?.id !== undefined
            ? String(activeSession.agent.id)
            : null);
        const belongsToCurrentAgent =
          !currentChatAgentId || !chunkAgentId || chunkAgentId === currentChatAgentId;

        if (belongsToCurrentAgent) {
          promoteCurrentSessionFromStream(streamSession);
          markActiveChatStream({
            lookupSessionId: streamSession.agentSessionId,
            sessionId: streamSession.agentSessionId,
          });
          setAgentSessionWorkingState({
            sessionId: streamSession.agentSessionId,
            working: true,
          });
          shouldSignalNewChatRef.current = false;
          pendingNewChatRequestRef.current = false;
          setSessionNotice(null);
        }

        return;
      }

      if (type === "error") {
        const streamError =
          withMainSequenceAiErrorSource({
            message:
              typeof data.error === "string" && data.error.trim()
                ? data.error.trim()
                : typeof data.message === "string" && data.message.trim()
                  ? data.message.trim()
                  : typeof data.error_detail === "string" && data.error_detail.trim()
                    ? data.error_detail.trim()
                    : "The assistant runtime reported an error.",
            source:
              typeof data.error_source === "string" && data.error_source.trim()
                ? data.error_source.trim()
                : typeof data.source === "string" && data.source.trim()
                  ? data.source.trim()
                  : "assistant_runtime_stream",
          });

        setRunStatus("error");
        setRunStatusDetail(streamError);

        const nextAgentId = extractAgentId(data);

        if (nextAgentId) {
          setAgentId(nextAgentId);
        }

        return;
      }

      if (type === "reasoning-delta") {
        setRunStatus("thinking");
        setRunStatusDetail("Thinking...");
        setHasVisibleAssistantOutput(true);

        if (typeof data.delta === "string" && data.delta.trim()) {
          setThinkingSummary(data.delta.trim());
        }

        return;
      }

      if (type === "text-delta") {
        setRunStatus("responding");
        setRunStatusDetail("Writing a response...");
        setThinkingSummary(null);
        setHasVisibleAssistantOutput(true);
        return;
      }
      if (type === "tool-call-start") {
        // The tool card streams into the thread; the status mirrors it so
        // every surface can say which tool, and that it is an MCP tool.
        const status = describeToolStatus(describeToolActivity(data.toolName), "running");
        setRunStatus("thinking");
        setRunStatusDetail(status);
        setThinkingSummary(status);
        setHasVisibleAssistantOutput(true);
        return;
      }
      if (type === "tool-result") {
        setRunStatus("thinking");
        setRunStatusDetail("Thinking...");
        setThinkingSummary(null);
      }
    },
    onData: (data) => {
      const nextAgentId = extractAgentId(data.data);

      if (nextAgentId) {
        setAgentId(nextAgentId);
      }
    },
    // Completion handlers must clean up the session that OWNS the run — bound
    // in body() via markActiveChatStream and re-bound on stream promotion —
    // not whatever session the user happens to be viewing when the run ends.
    // Global run-status banners and thread snapshots only apply when the
    // owning session is still the one on screen.
    onFinish: () => {
      const runSessionId = activeChatStreamSessionIdRef.current ?? currentSessionIdRef.current;
      const runSessionIsCurrent = runSessionId === currentSessionIdRef.current;

      if (expectedNewSessionRef.current) {
        if (runSessionIsCurrent) {
          setRunStatus("error");
          setRunStatusDetail("The assistant did not assign a runtime session.");
          setSessionNotice(
            "This new conversation did not receive the required session assignment. Retry the message before continuing.",
          );
        }
        shouldSignalNewChatRef.current = true;
        pendingNewChatRequestRef.current = false;
        expectedNewSessionRef.current = false;
        clearActiveChatStream();
        queueOwnWorkingClearRef.current = runSessionId;
        setAgentSessionWorkingState({
          sessionId: runSessionId,
          working: false,
        });
        holdSessionMessageQueue(runSessionId, "failed");
        if (runSessionIsCurrent) {
          persistSessionMessages();
        }
        return;
      }

      if (runSessionIsCurrent) {
        setRunStatus("complete");
        setRunStatusDetail("Run completed.");
        setThinkingSummary(null);
      }
      clearActiveChatStream();
      queueOwnWorkingClearRef.current = runSessionId;
      setAgentSessionWorkingState({
        sessionId: runSessionId,
        working: false,
      });
      pendingNewChatRequestRef.current = false;
      if (runSessionIsCurrent) {
        persistSessionMessages();
      }
      // ADR 087: a clean finish sends the next queued message once the
      // runtime reports this run over (see the drain effect).
      if (runSessionId) {
        queueDrainArmedSessionIdRef.current = runSessionId;
        setQueueDrainTick((tick) => tick + 1);
      }
    },
    onError: (error) => {
      const runSessionId = activeChatStreamSessionIdRef.current ?? currentSessionIdRef.current;
      const runSessionIsCurrent = runSessionId === currentSessionIdRef.current;

      if (runSessionIsCurrent) {
        setRunStatus("error");
        setRunStatusDetail(error.message);
        setThinkingSummary(null);
      }
      clearActiveChatStream();
      queueOwnWorkingClearRef.current = runSessionId;
      setAgentSessionWorkingState({
        sessionId: runSessionId,
        working: false,
      });
      holdSessionMessageQueue(runSessionId, "failed");
      pendingNewChatRequestRef.current = false;
      expectedNewSessionRef.current = false;
      if (runSessionIsCurrent) {
        persistSessionMessages();
      }
    },
    onCancel: () => {
      const runSessionId = activeChatStreamSessionIdRef.current ?? currentSessionIdRef.current;
      const runSessionIsCurrent = runSessionId === currentSessionIdRef.current;

      if (runSessionIsCurrent) {
        setRunStatus("idle");
        setRunStatusDetail("Run cancelled.");
        setThinkingSummary(null);
      }
      clearActiveChatStream();
      queueOwnWorkingClearRef.current = runSessionId;
      setAgentSessionWorkingState({
        sessionId: runSessionId,
        working: false,
      });
      holdSessionMessageQueue(runSessionId, runSessionIsCurrent ? "stopped" : "away");
      pendingNewChatRequestRef.current = false;
      expectedNewSessionRef.current = false;
      if (runSessionIsCurrent) {
        persistSessionMessages();
      }
    },
  });

  const runtime: AssistantRuntime = liveRuntime;

  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);
  useEffect(() => {
    const syncThreadRunning = () => {
      setThreadRunning(runtime.thread.getState().isRunning);
    };
    syncThreadRunning();
    return runtime.thread.subscribe(syncThreadRunning);
  }, [runtime]);
  const appendQueuedMessage = useCallback(
    (sessionId: string, item: QueuedMessage, position: number, total: number) => {
      const liveThread = runtimeRef.current?.thread;
      if (!liveThread || currentSessionIdRef.current !== sessionId) {
        updateSessionMessageQueue(sessionId, (queue) => returnQueuedMessage(queue, item, "away"));
        return;
      }
      queueSendingRef.current = { position, total };
      try {
        // The same append the composer uses: the body builder, provenance,
        // readiness and wake gates all apply; the runtime sees one turn.
        liveThread.append({ role: "user", content: [{ type: "text", text: item.text }] });
      } catch (error) {
        queueSendingRef.current = null;
        updateSessionMessageQueue(sessionId, (queue) =>
          returnQueuedMessage(
            queue,
            item,
            "unavailable",
            error instanceof Error ? error.message : undefined,
          ),
        );
      }
    },
    [updateSessionMessageQueue],
  );
  // ADR 087 drain: armed by a clean finish (or by Send next), consumed
  // once the thread is idle. Only the session on screen sends.
  useEffect(() => {
    if (threadRunning) {
      return;
    }
    const armedSessionId = queueDrainArmedSessionIdRef.current;
    if (!armedSessionId) {
      return;
    }
    queueDrainArmedSessionIdRef.current = null;
    if (currentSessionIdRef.current !== armedSessionId) {
      holdSessionMessageQueue(armedSessionId, "away");
      return;
    }
    const queue = queuedMessagesRef.current[armedSessionId] ?? EMPTY_MESSAGE_QUEUE;
    if (queue.length === 0) {
      delete queueSentCountBySessionIdRef.current[armedSessionId];
      return;
    }
    if (isMessageQueueHeld(queue) || activeSessionRef.current?.working) {
      // Held queues wait for the user; another writer's turn is not ours.
      return;
    }
    const taken = takeNextQueuedMessage(queue);
    if (!taken.item) {
      return;
    }
    const sent = (queueSentCountBySessionIdRef.current[armedSessionId] ?? 0) + 1;
    const total = sent + taken.queue.length;
    queueSentCountBySessionIdRef.current[armedSessionId] = taken.queue.length === 0 ? 0 : sent;
    updateSessionMessageQueue(armedSessionId, () => taken.queue);
    appendQueuedMessage(armedSessionId, taken.item, sent, total);
  }, [
    appendQueuedMessage,
    holdSessionMessageQueue,
    queueDrainTick,
    threadRunning,
    updateSessionMessageQueue,
  ]);
  // Switching sessions holds the queue left behind and restores the one
  // stored for the session coming on screen (a reload also lands here).
  const queueSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    const previousSessionId = queueSessionIdRef.current;
    queueSessionIdRef.current = currentSessionId;
    if (previousSessionId && previousSessionId !== currentSessionId) {
      queueSentCountBySessionIdRef.current[previousSessionId] = 0;
      updateSessionMessageQueue(previousSessionId, (queue) =>
        queue.length > 0 && !isMessageQueueHeld(queue) ? holdMessageQueue(queue, "away") : queue,
      );
    }
    if (
      currentSessionId &&
      !(currentSessionId in queuedMessagesRef.current) &&
      !queueRestoredSessionIdsRef.current.has(currentSessionId)
    ) {
      queueRestoredSessionIdsRef.current.add(currentSessionId);
      const restored = readMessageQueue(currentSessionId);
      if (restored.length > 0) {
        updateSessionMessageQueue(currentSessionId, () => restored);
      }
    }
  }, [currentSessionId, updateSessionMessageQueue]);
  // Busy because of another writer: watch the working flag while a queue
  // waits, and send once the session is free. Best-effort across tabs.
  const activeSessionWorking = Boolean(activeSession?.working);
  const currentMessageQueue = currentSessionId
    ? queuedMessagesBySessionId[currentSessionId] ?? EMPTY_MESSAGE_QUEUE
    : EMPTY_MESSAGE_QUEUE;
  const currentQueueWaiting =
    currentMessageQueue.length > 0 && !isMessageQueueHeld(currentMessageQueue);
  useEffect(() => {
    if (
      !currentSessionId ||
      !currentQueueWaiting ||
      threadRunning ||
      !activeSessionWorking ||
      !sessionToken ||
      !activeEnvironmentUid
    ) {
      return;
    }
    const lookupSessionId = resolveAgentSessionLookupId(activeSessionRef.current);
    if (!lookupSessionId) {
      return;
    }
    const controller = new AbortController();
    const interval = window.setInterval(() => {
      void (async () => {
        try {
          const record = await fetchAgentSessionDetail({
            connection,
            organizationEnvironmentUid: activeEnvironmentUid,
            sessionId: lookupSessionId,
            signal: controller.signal,
            token: sessionToken,
            tokenType: sessionTokenType,
          });
          if (!controller.signal.aborted && record.working === false) {
            setAgentSessionWorkingState({ sessionId: currentSessionId, working: false });
          }
        } catch {
          // Try again on the next tick.
        }
      })();
    }, 10_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [
    activeEnvironmentUid,
    activeSessionWorking,
    currentQueueWaiting,
    currentSessionId,
    sessionToken,
    sessionTokenType,
    setAgentSessionWorkingState,
    threadRunning,
  ]);
  const previousSessionWorkingRef = useRef(activeSessionWorking);
  useEffect(() => {
    const wasWorking = previousSessionWorkingRef.current;
    previousSessionWorkingRef.current = activeSessionWorking;
    if (!wasWorking || activeSessionWorking || !currentSessionId) {
      return;
    }
    if (queueOwnWorkingClearRef.current === currentSessionId) {
      // Our own run ended; onFinish, onError or onCancel already decided.
      queueOwnWorkingClearRef.current = null;
      return;
    }
    if (!currentQueueWaiting || threadRunning) {
      return;
    }
    queueDrainArmedSessionIdRef.current = currentSessionId;
    setQueueDrainTick((tick) => tick + 1);
  }, [activeSessionWorking, currentQueueWaiting, currentSessionId, threadRunning]);

  useEffect(() => {
    return () => {
      sessionHistoryRequestRef.current?.abort();
      clearActiveChatStream();
    };
  }, [clearActiveChatStream]);

  useEffect(() => {
    if (!shouldHydrateChatRuntime) {
      sessionHistoryRequestRef.current?.abort();
      return;
    }

    loadCurrentSession(currentSessionId);
  }, [currentSessionId, loadCurrentSession, shouldHydrateChatRuntime]);

  const cancelActiveSession = useCallback(async () => {
    const activeSession = activeSessionRef.current;
    const runtimeSessionId =
      activeSession?.runtimeSessionId?.trim() || resolveAgentSessionLookupId(activeSession);
    const threadId = activeSession?.threadId?.trim() || runtimeSessionId;

    if (!activeSession || !runtimeSessionId || !threadId) {
      notify({
        title: "Unable to stop session",
        description: "No active runtime session is available to cancel.",
        variant: "error",
      });
      return;
    }

    setIsCancellingSession(true);
    setRunStatus("queued");
    setRunStatusDetail("Cancelling session...");

    try {
      runtimeRef.current?.thread.cancelRun();
    } catch {
      // If assistant-ui has no active local run, the backend cancellation is still valid.
    }

    // Local cleanup must not depend on the backend cancel resolving: users
    // press Stop exactly when the runtime is wedged, and gating this on the
    // await left "Cancelling session..." and the working flag stuck forever.
    setAgentSessionWorkingState({
      sessionId: activeSession.id,
      working: false,
    });
    clearActiveChatStream();
    pendingNewChatRequestRef.current = false;
    expectedNewSessionRef.current = false;

    try {
      await cancelChatSession({
        connection,
        body: {
          runtimeSessionUid: runtimeSessionId,
          threadId,
          userUid: sessionUserUid,
          reason: "user_requested",
          message: "User pressed stop.",
        },
        organizationEnvironmentUid: activeEnvironmentUid ?? "",
        runtimeTarget: "agent-runtime",
        token: sessionToken,
        tokenType: sessionTokenType,
      });

      setRunStatus("idle");
      setRunStatusDetail("Run cancellation requested.");
      setThinkingSummary(null);
      setSessionNotice(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Session cancellation request failed.";
      setRunStatus("error");
      setRunStatusDetail(message);
      setSessionNotice(message);
    } finally {
      setIsCancellingSession(false);
    }
  }, [
    activeEnvironmentUid,
    clearActiveChatStream,
    sessionToken,
    sessionTokenType,
    sessionUserUid,
    setAgentSessionWorkingState,
    notify,
  ]);

  const enqueueMessage = useCallback(
    (text: string) => {
      const sessionId = currentSessionIdRef.current;
      if (!sessionId) {
        return false;
      }
      const result = enqueueQueuedMessage(
        queuedMessagesRef.current[sessionId] ?? EMPTY_MESSAGE_QUEUE,
        text,
      );
      if (!result.item) {
        if (result.refusal === "full") {
          notify({
            title: MESSAGE_QUEUE_FULL_TITLE,
            description: MESSAGE_QUEUE_FULL_MESSAGE,
            variant: "info",
          });
        }
        return false;
      }
      updateSessionMessageQueue(sessionId, () => result.queue);
      return true;
    },
    [notify, updateSessionMessageQueue],
  );
  const removeQueuedMessageAction = useCallback(
    (id: string) => {
      const sessionId = currentSessionIdRef.current;
      if (!sessionId) {
        return;
      }
      updateSessionMessageQueue(sessionId, (queue) => removeQueuedMessage(queue, id));
    },
    [updateSessionMessageQueue],
  );
  const editQueuedMessageAction = useCallback(
    (id: string) => {
      const sessionId = currentSessionIdRef.current;
      if (!sessionId) {
        return null;
      }
      const edited = editQueuedMessage(
        queuedMessagesRef.current[sessionId] ?? EMPTY_MESSAGE_QUEUE,
        id,
      );
      if (edited.text === null) {
        return null;
      }
      updateSessionMessageQueue(sessionId, () => edited.queue);
      return edited.text;
    },
    [updateSessionMessageQueue],
  );
  const reorderQueuedMessageAction = useCallback(
    (id: string, toIndex: number) => {
      const sessionId = currentSessionIdRef.current;
      if (!sessionId) {
        return;
      }
      updateSessionMessageQueue(sessionId, (queue) => reorderQueuedMessage(queue, id, toIndex));
    },
    [updateSessionMessageQueue],
  );
  const clearMessageQueueAction = useCallback(() => {
    const sessionId = currentSessionIdRef.current;
    if (!sessionId) {
      return;
    }
    queueSentCountBySessionIdRef.current[sessionId] = 0;
    updateSessionMessageQueue(sessionId, () => clearMessageQueue());
  }, [updateSessionMessageQueue]);
  const sendNextQueuedMessage = useCallback(() => {
    const sessionId = currentSessionIdRef.current;
    if (!sessionId) {
      return;
    }
    updateSessionMessageQueue(sessionId, (queue) => releaseMessageQueue(queue));
    queueDrainArmedSessionIdRef.current = sessionId;
    setQueueDrainTick((tick) => tick + 1);
  }, [updateSessionMessageQueue]);
  const queuedMessageCountBySessionId = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(queuedMessagesBySessionId).map(([sessionId, queue]) => [
          sessionId,
          queue.length,
        ]),
      ),
    [queuedMessagesBySessionId],
  );

  const clearRuntimeThread = useCallback(() => {
    // Cancel before reset — reset() alone leaves an in-flight run streaming
    // into a cleared message repository ("Parent message not found").
    try {
      runtime.thread.cancelRun();
    } catch {
      // No active run to cancel.
    }

    runtime.thread.reset();
    clearActiveChatStream();
    shouldSignalNewChatRef.current = true;
    pendingNewChatRequestRef.current = false;
    expectedNewSessionRef.current = false;
    setAgentId(null);
    loadedSessionIdRef.current = currentSessionIdRef.current;
    loadedSessionLookupIdRef.current = null;

    setAgentSessions((currentSessions) =>
      sortAgentSessions(
        currentSessions.map((session) => {
          if (session.id !== currentSessionIdRef.current) {
            return session;
          }

          return {
            ...session,
            messages: [],
            preview: null,
            runtimeSessionId: null,
            sessionKey: null,
            threadId: null,
            codeRepositoryBranchId: null,
            cwd: null,
            runtimeState: null,
            working: false,
            title: buildAgentSessionTitle({
              agent: session.agent,
              messages: [],
            }),
            updatedAt: new Date().toISOString(),
          };
        }),
      ),
    );

    clearThread();
  }, [clearActiveChatStream, clearThread, runtime]);

  const hasDirectLaunchSelection = useCallback(
    () => Boolean(directLaunchSessionIdRef.current),
    [],
  );

  const value = useMemo<ChatEngineValue>(
    () => ({
      activeAgentLabel,
      activeAgentName,
      activeAgentUid,
      activeSessionDetail,
      activeSessionSummary,
      activeSessionReadiness,
      activeSessionDisplayId,
      activeSessionPreview,
      activeSessionUpdatedAt,
      activeRuntimeInteraction,
      activeRuntimePresence,
      availableModels,
      availableModelsError,
      availableProviders,
      availableReasoningEfforts,
      agentId,
      agentSessions: sortedAgentSessions,
      archiveAgentSession,
      cancelActiveSession,
      clearThread: clearRuntimeThread,
      connection,
      createAgentSession,
      currentSessionId,
      deleteAgentSession,
      hasActiveChatStream,
      hasRequestedAvailableModels,
      isLoadingAvailableModels,
      isActiveSessionReady,
      isActiveSessionLoading,
      isCreatingAgentSession,
      isUpdatingSessionModel,
      isCancellingSession,
      isLoadingLatestSessions,
      isAssistantRuntimeStarting,
      isDefaultSession,
      isDirectLaunchSession,
      latestSessionsError,
      messageQueue: currentMessageQueue,
      queuedMessageCountBySessionId,
      enqueueMessage,
      removeQueuedMessage: removeQueuedMessageAction,
      editQueuedMessage: editQueuedMessageAction,
      reorderQueuedMessage: reorderQueuedMessageAction,
      clearMessageQueue: clearMessageQueueAction,
      sendNextQueuedMessage,
      refreshActiveSessionRuntimeAccess,
      revalidateStaleRuntimeAccess,
      refreshSessionDetail,
      retryDefaultSession,
      restoreDefaultSessionSelection,
      hasDirectLaunchSelection,
      viewContext,
      refreshSessionInsights,
      requestAvailableModels,
      sessionNotice: visibleSessionNotice,
      defaultSessionError,
      defaultSessionStatus,
      sessionModelSelectionRequest,
      sessionModelLastUsed,
      resolveSessionModelSelection,
      cancelSessionModelSelection,
      selectedModelValue,
      selectedProviderValue,
      selectedReasoningEffortValue,
      setSelectedModelValue: handleSelectedModelChange,
      openLatestOrStartAgentSessionById,
      setSelectedProviderValue: handleSelectedProviderChange,
      setSelectedReasoningEffortValue: handleSelectedReasoningEffortChange,
      startAgentSession,
      startAgentSessionById,
      unarchiveAgentSession,
    }),
    [
      activeAgentLabel,
      activeAgentName,
      activeAgentUid,
      activeSessionDetail,
      activeSessionSummary,
      activeSessionReadiness,
      activeSessionDisplayId,
      activeSessionPreview,
      activeSessionUpdatedAt,
      activeRuntimeInteraction,
      activeRuntimePresence,
      availableModels,
      availableModelsError,
      availableProviders,
      availableReasoningEfforts,
      agentId,
      archiveAgentSession,
      cancelActiveSession,
      currentSessionId,
      clearRuntimeThread,
      connection,
      createAgentSession,
      deleteAgentSession,
      hasActiveChatStream,
      hasRequestedAvailableModels,
      handleSelectedModelChange,
      handleSelectedProviderChange,
      handleSelectedReasoningEffortChange,
      isLoadingAvailableModels,
      isActiveSessionReady,
      isActiveSessionLoading,
      isCreatingAgentSession,
      isUpdatingSessionModel,
      isCancellingSession,
      isLoadingLatestSessions,
      isAssistantRuntimeStarting,
      isDefaultSession,
      isDirectLaunchSession,
      latestSessionsError,
      currentMessageQueue,
      queuedMessageCountBySessionId,
      enqueueMessage,
      removeQueuedMessageAction,
      editQueuedMessageAction,
      reorderQueuedMessageAction,
      clearMessageQueueAction,
      sendNextQueuedMessage,
      refreshActiveSessionRuntimeAccess,
      revalidateStaleRuntimeAccess,
      refreshSessionDetail,
      retryDefaultSession,
      restoreDefaultSessionSelection,
      hasDirectLaunchSelection,
      viewContext,
      refreshSessionInsights,
      requestAvailableModels,
      visibleSessionNotice,
      selectedModelValue,
      selectedProviderValue,
      selectedReasoningEffortValue,
      defaultSessionError,
      defaultSessionStatus,
      sessionModelSelectionRequest,
      sessionModelLastUsed,
      resolveSessionModelSelection,
      cancelSessionModelSelection,
      sortedAgentSessions,
      openLatestOrStartAgentSessionById,
      startAgentSession,
      startAgentSessionById,
      unarchiveAgentSession,
    ],
  );
  const runStatusValue = useMemo<ChatRunStatusValue>(
    () => ({
      hasVisibleAssistantOutput,
      runStatus,
      runStatusDetail,
      thinkingSummary,
    }),
    [hasVisibleAssistantOutput, runStatus, runStatusDetail, thinkingSummary],
  );

  return (
    <AgentIconsProvider
      connection={connection}
      environmentUid={activeEnvironmentUid}
      token={sessionToken}
      tokenType={sessionTokenType}
    >
      <ChatEngineContext.Provider value={value}>
        <ChatRunStatusContext.Provider value={runStatusValue}>
          <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
        </ChatRunStatusContext.Provider>
      </ChatEngineContext.Provider>
    </AgentIconsProvider>
  );
}

export function useChatEngine() {
  const context = useContext(ChatEngineContext);

  if (!context) {
    throw new Error("useChatEngine must be used inside ChatEngineProvider.");
  }

  return context;
}

export function useOptionalChatEngine() {
  return useContext(ChatEngineContext);
}

export function useChatRunStatus() {
  const context = useContext(ChatRunStatusContext);

  if (!context) {
    throw new Error("useChatRunStatus must be used inside ChatEngineProvider.");
  }

  return context;
}
