import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { AssistantRuntimeProvider, type AssistantRuntime } from "@assistant-ui/react";

import {
  createIdleAgentSessionReadiness,
  createLoadingAgentSessionReadiness,
  createReadyAgentSessionReadiness,
  type AgentSessionInteractionReadiness,
} from "../backend/agent-session-readiness.js";
import { buildAgentSessionRequestBodyFragment } from "../backend/agent-session-request.js";
import { createChatBackendConnection } from "../backend/connection.js";
import {
  cancelLocalChatSession,
  fetchLocalAgentIdentity,
  fetchLocalAgentReadiness,
  fetchLocalChatSessionHistory,
  fetchLocalChatSessions,
  fetchLocalRunConfigOptions,
  fetchLocalSessionModel,
  localAgentUrl,
  probeLocalAgentChat,
  updateLocalSessionModel,
  type LocalChatSessionRecord,
} from "../backend/local-agent-api.js";
import type {
  AvailableChatModelOption,
  AvailableChatProviderOption,
  AvailableChatReasoningEffortOption,
} from "../backend/model-catalog-api.js";
import type { AgentRuntimeInteraction } from "../backend/runtime-interaction.js";
import {
  describeStreamedToolCallStatus,
  followStreamedToolCall,
  type StreamedToolCall,
} from "../backend/tool-activity.js";
import type { ActiveSessionSummary } from "../session-detail/model.js";
import type { AgentSessionAgent, AgentSessionSummary } from "./agent-sessions.js";
import type {
  ChatEngineCapabilities,
  ChatEngineValue,
  ChatRunStatus,
  ChatRunStatusValue,
} from "./ChatEngineProvider.js";
import { ChatEngineContext, ChatRunStatusContext } from "./engine-context.js";
import type { LocalAgentSource } from "./local-agent-source.js";
import {
  EMPTY_MESSAGE_QUEUE,
  MESSAGE_QUEUE_FULL_MESSAGE,
  MESSAGE_QUEUE_FULL_TITLE,
  clearMessageQueue,
  editQueuedMessage,
  enqueueQueuedMessage,
  holdMessageQueue,
  isMessageQueueHeld,
  releaseMessageQueue,
  removeQueuedMessage,
  reorderQueuedMessage,
  returnQueuedMessage,
  takeNextQueuedMessage,
  type MessageQueue,
  type QueuedMessageHoldReason,
} from "./message-queue.js";
import type { ChatNotify } from "./types.js";
import { useLatestMessageDataStreamRuntime } from "./useLatestMessageDataStreamRuntime.js";

// The engine for an Agent on the developer's machine (ADR 099). It publishes the same
// `ChatEngineValue` as the platform engine, so the thread, the composer, the queue, the rail, the
// page, and the explorer are the same components. It calls only the local runtime, through the
// source's same-origin path, and never a platform route.

const LOCAL_CAPABILITIES: ChatEngineCapabilities = Object.freeze({
  archiveSessions: false,
  searchSessions: false,
  sessionHistory: true,
  sessionInsights: false,
  modelProviderSettings: false,
});

// Re-checked when the composer takes focus and the last check is older than this, as the platform
// engine re-confirms a runtime-access decision (ADR 093).
const READINESS_RECHECK_AFTER_MS = 60_000;
// A runtime that is not up is checked again on this cadence while the chat is on screen.
const READINESS_RETRY_MS = 5_000;
// The session the runtime opens when the page has chosen none: one continuing conversation, as
// the platform's default session behind a stable handle.
const DEFAULT_LOCAL_SESSION_ID = "default";
// The model option shown when the runtime cannot list providers: the runtime's configured model.
const RUNTIME_CONFIGURED_MODEL_ID = "local::configured";
const RUNTIME_CONFIGURED_PROVIDER: AvailableChatProviderOption = Object.freeze({
  label: "Local Agent",
  value: "local",
});

export interface LocalChatEngineProviderProps {
  children: ReactNode;
  /** The Agent on the developer's machine (`createLocalAgentSource`). */
  source: LocalAgentSource;
  /** Shows a short notice to the person (errors, confirmations). */
  notify: ChatNotify;
  /** Sent with every chat request as the request's view context; opaque to the engine. */
  viewContext?: unknown;
  /** Whether the chat is on screen. Nothing is fetched while it is not. */
  isVisible: boolean;
  /** The session the application asks to show (for example from its URL). */
  requestedSessionId?: string | null;
  /** Asks the application to put the chat on screen. */
  onRequestVisible?: () => void;
  /** Kept for parity with the platform engine; a local session is never removed. */
  onRequestedSessionRemoved?: (sessionId: string) => void;
}

type RuntimeState =
  | { status: "checking"; checkedAt: number | null }
  | { status: "ready"; checkedAt: number }
  | { status: "unavailable"; checkedAt: number; message: string };

type HistoryState =
  | { sessionId: string; status: "loading" }
  | { sessionId: string; status: "ready"; reloaded: boolean }
  | { sessionId: string; status: "error"; error: string };

interface PageSession {
  id: string;
  title: string | null;
  preview: string | null;
  updatedAt: string;
}

function selectionStorageKey(baseUrl: string) {
  return `ms.command-center-ai.local-session:${baseUrl}`;
}

function readStoredSelection(baseUrl: string) {
  try {
    return window.localStorage.getItem(selectionStorageKey(baseUrl))?.trim() || null;
  } catch {
    return null;
  }
}

function storeSelection(baseUrl: string, sessionId: string) {
  try {
    window.localStorage.setItem(selectionStorageKey(baseUrl), sessionId);
  } catch {
    // Remembering the selection is a convenience; the chat works without storage.
  }
}

function createLocalSessionId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function modelOptionId(provider: string, model: string) {
  return [provider, model].join("::");
}

function splitModelOptionId(value: string) {
  const separator = value.indexOf("::");
  return separator < 0
    ? null
    : { provider: value.slice(0, separator), model: value.slice(separator + 2) };
}

function runtimeConfiguredModel(): AvailableChatModelOption {
  return {
    auth: {
      authKind: null,
      authenticated: true,
      configuredFromEnv: true,
      required: false,
      signInAvailable: false,
    },
    id: RUNTIME_CONFIGURED_MODEL_ID,
    label: "Configured by the local Agent",
    defaultReasoningEffort: null,
    value: "configured",
    provider: "local",
    reasoningEfforts: [],
    source: "platform",
    known: true,
    enabled: true,
    selectable: true,
  };
}

function interactionFor(runtime: RuntimeState, agentName: string): AgentRuntimeInteraction {
  if (runtime.status === "ready") {
    return { state: "ready", canSubmit: true, notice: null, operation: null, retryAfterMs: null };
  }
  if (runtime.status === "checking") {
    return { state: "checking", canSubmit: false, notice: null, operation: null, retryAfterMs: null };
  }
  return {
    state: "unavailable",
    canSubmit: false,
    notice: {
      code: "local_agent_unavailable",
      severity: "error",
      title: `${agentName} is not running`,
      message: runtime.message,
    },
    operation: null,
    retryAfterMs: READINESS_RETRY_MS,
  };
}

export function LocalChatEngineProvider({
  children,
  isVisible,
  notify,
  onRequestVisible,
  requestedSessionId = null,
  source,
  viewContext,
}: LocalChatEngineProviderProps) {
  const { baseUrl } = source;
  const [agentName, setAgentName] = useState(source.displayName);
  const agent = useMemo<AgentSessionAgent>(
    () => ({
      id: null,
      uid: null,
      name: agentName,
      displayLabel: agentName,
      agentUniqueId: "local",
      description: "",
      status: "local",
      llmProvider: "",
      llmModel: "",
      engineName: "tau",
    }),
    [agentName],
  );
  const connection = useMemo(
    () =>
      createChatBackendConnection({
        apiBaseUrl:
          typeof window === "undefined"
            ? `http://localhost${baseUrl}`
            : `${window.location.origin}${baseUrl}`,
      }),
    [baseUrl],
  );
  const auth = useMemo(() => ({ userUid: source.userUid }), [source.userUid]);

  // ---- The runtime -------------------------------------------------------------------------

  const [runtimeState, setRuntimeState] = useState<RuntimeState>({ status: "checking", checkedAt: null });
  const runtimeStateRef = useRef(runtimeState);
  runtimeStateRef.current = runtimeState;
  const readinessCheckRef = useRef<AbortController | null>(null);

  const checkRuntime = useCallback(async () => {
    readinessCheckRef.current?.abort();
    const controller = new AbortController();
    readinessCheckRef.current = controller;
    try {
      const readiness = await fetchLocalAgentReadiness(baseUrl, controller.signal);
      const answers = readiness.ready ? await probeLocalAgentChat(baseUrl, controller.signal) : false;
      if (controller.signal.aborted) return;
      setRuntimeState(
        readiness.ready && answers
          ? { status: "ready", checkedAt: Date.now() }
          : {
              status: "unavailable",
              checkedAt: Date.now(),
              message:
                readiness.message ??
                `The local Agent at ${baseUrl} does not answer its chat route.`,
            },
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      setRuntimeState({
        status: "unavailable",
        checkedAt: Date.now(),
        message:
          error instanceof Error && error.message
            ? error.message
            : `The local Agent at ${baseUrl} did not answer. Start it with \`ms-tau\` in local mode.`,
      });
    }
  }, [baseUrl]);

  useEffect(() => {
    if (!isVisible) return undefined;
    void checkRuntime();
    return () => readinessCheckRef.current?.abort();
  }, [checkRuntime, isVisible]);

  // A runtime that is not up is looked for again while the chat is on screen, so starting it is
  // enough: the person does not have to reload.
  useEffect(() => {
    if (!isVisible || runtimeState.status !== "unavailable") return undefined;
    const timer = window.setTimeout(() => void checkRuntime(), READINESS_RETRY_MS);
    return () => window.clearTimeout(timer);
  }, [checkRuntime, isVisible, runtimeState]);

  useEffect(() => {
    if (!isVisible || runtimeState.status !== "ready") return undefined;
    const controller = new AbortController();
    void fetchLocalAgentIdentity(baseUrl, controller.signal)
      .then((identity) => {
        const name = identity?.displayName ?? identity?.name ?? null;
        if (name && !controller.signal.aborted) setAgentName(name);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [baseUrl, isVisible, runtimeState.status]);

  const revalidateStaleRuntimeAccess = useCallback(() => {
    const current = runtimeStateRef.current;
    if (
      current.status === "unavailable" ||
      (current.checkedAt !== null && Date.now() - current.checkedAt > READINESS_RECHECK_AFTER_MS)
    ) {
      void checkRuntime();
    }
  }, [checkRuntime]);

  // ---- Sessions ----------------------------------------------------------------------------

  const [runtimeSessions, setRuntimeSessions] = useState<LocalChatSessionRecord[]>([]);
  const [sessionsSupported, setSessionsSupported] = useState<boolean | null>(null);
  const [isLoadingLatestSessions, setIsLoadingLatestSessions] = useState(false);
  const [latestSessionsError, setLatestSessionsError] = useState<string | null>(null);
  const [sessionsRefreshTick, setSessionsRefreshTick] = useState(0);
  const [pageSessions, setPageSessions] = useState<Record<string, PageSession>>({});
  const [currentSessionId, setCurrentSessionId] = useState<string>(
    () => requestedSessionId?.trim() || readStoredSelection(baseUrl) || DEFAULT_LOCAL_SESSION_ID,
  );
  const currentSessionIdRef = useRef(currentSessionId);
  currentSessionIdRef.current = currentSessionId;
  // Sessions this page started, so no history is fetched for them.
  const freshSessionIdsRef = useRef(new Set<string>());
  // A session whose id changed to the runtime's canonical one keeps its thread.
  const rekeyedSessionIdsRef = useRef(new Set<string>());
  // Sessions the runtime knows, so their model can be changed.
  const [runtimeKnownSessionIds, setRuntimeKnownSessionIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  useEffect(() => {
    const requested = requestedSessionId?.trim();
    if (requested && requested !== currentSessionIdRef.current) {
      setCurrentSessionId(requested);
    }
  }, [requestedSessionId]);

  useEffect(() => {
    storeSelection(baseUrl, currentSessionId);
  }, [baseUrl, currentSessionId]);

  useEffect(() => {
    if (!isVisible || runtimeState.status !== "ready") return undefined;
    const controller = new AbortController();
    setIsLoadingLatestSessions(true);
    void fetchLocalChatSessions(baseUrl, { signal: controller.signal })
      .then((page) => {
        if (controller.signal.aborted) return;
        setSessionsSupported(page !== null);
        setRuntimeSessions(page?.sessions ?? []);
        setLatestSessionsError(null);
        if (page) {
          setRuntimeKnownSessionIds(
            (current) => new Set([...current, ...page.sessions.map((session) => session.sessionUid)]),
          );
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLatestSessionsError(error instanceof Error ? error.message : "The local sessions did not load.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingLatestSessions(false);
      });
    return () => controller.abort();
  }, [baseUrl, isVisible, runtimeState.status, sessionsRefreshTick]);

  // An unstarted conversation dates from when the page opened it.
  const openedAtRef = useRef(new Date().toISOString());
  const agentSessions = useMemo<AgentSessionSummary[]>(() => {
    const byId = new Map<string, AgentSessionSummary>();
    const toSummary = (
      id: string,
      title: string | null,
      preview: string | null,
      updatedAt: string | null,
      working: boolean,
    ): AgentSessionSummary => ({
      id,
      sessionName: null,
      title: title ?? preview ?? (id === DEFAULT_LOCAL_SESSION_ID ? "Conversation" : "New conversation"),
      preview,
      runtimeSessionId: id,
      sessionKey: null,
      handleUniqueId: null,
      threadId: id,
      codeRepositoryBranchId: null,
      cwd: null,
      runtimeState: null,
      working,
      updatedAt: updatedAt ?? openedAtRef.current,
      organizationEnvironmentUid: null,
      organizationEnvironmentName: null,
      agent,
      origin: null,
      isPlaceholder: false,
    });
    runtimeSessions.forEach((session) => {
      byId.set(
        session.sessionUid,
        toSummary(
          session.sessionUid,
          session.title,
          session.latestMessagePreview,
          session.updatedAt ?? session.createdAt,
          session.working,
        ),
      );
    });
    Object.values(pageSessions).forEach((session) => {
      if (!byId.has(session.id)) {
        byId.set(session.id, toSummary(session.id, session.title, session.preview, session.updatedAt, false));
      }
    });
    if (!byId.has(currentSessionId)) {
      byId.set(currentSessionId, toSummary(currentSessionId, null, null, null, false));
    }
    return [...byId.values()].sort(
      (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    );
  }, [agent, currentSessionId, pageSessions, runtimeSessions]);

  // ---- The thread --------------------------------------------------------------------------

  const runtimeRef = useRef<AssistantRuntime | null>(null);
  const [history, setHistory] = useState<HistoryState>({ sessionId: currentSessionId, status: "loading" });
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [threadRunning, setThreadRunning] = useState(false);
  const [runStatus, setRunStatus] = useState<ChatRunStatus>("idle");
  const [runStatusDetail, setRunStatusDetail] = useState<string | null>(null);
  const [thinkingSummary, setThinkingSummary] = useState<string | null>(null);
  const [hasVisibleAssistantOutput, setHasVisibleAssistantOutput] = useState(false);
  const [isCancellingSession, setIsCancellingSession] = useState(false);
  const runSessionIdRef = useRef<string | null>(null);
  const streamedToolCallRef = useRef<StreamedToolCall | null>(null);
  const viewContextRef = useRef(viewContext);
  viewContextRef.current = viewContext;
  const [queues, setQueues] = useState<Record<string, MessageQueue>>({});
  const queuesRef = useRef(queues);
  queuesRef.current = queues;
  const [queueDrainTick, setQueueDrainTick] = useState(0);
  const drainArmedSessionIdRef = useRef<string | null>(null);
  // Bumped when a run ends, so the session's model is read again once the runtime is idle.
  const [modelRefreshTick, setModelRefreshTick] = useState(0);
  // A model chosen before the session exists on the runtime, applied once it does.
  const pendingModelRef = useRef<{ sessionId: string; modelId: string; thinkingLevel: string | null } | null>(null);

  const updateQueue = useCallback((sessionId: string, update: (queue: MessageQueue) => MessageQueue) => {
    setQueues((current) => ({ ...current, [sessionId]: update(current[sessionId] ?? EMPTY_MESSAGE_QUEUE) }));
  }, []);

  const holdQueue = useCallback(
    (sessionId: string | null, reason: QueuedMessageHoldReason) => {
      if (sessionId) updateQueue(sessionId, (queue) => holdMessageQueue(queue, reason));
    },
    [updateQueue],
  );

  const rekeySession = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    rekeyedSessionIdsRef.current.add(toId);
    if (freshSessionIdsRef.current.has(fromId)) freshSessionIdsRef.current.add(toId);
    setQueues((current) => {
      if (!current[fromId]) return current;
      const { [fromId]: moved, ...rest } = current;
      return { ...rest, [toId]: moved! };
    });
    setPageSessions((current) => {
      const session = current[fromId];
      if (!session) return current;
      const { [fromId]: _removed, ...rest } = current;
      return { ...rest, [toId]: { ...session, id: toId } };
    });
    if (runSessionIdRef.current === fromId) runSessionIdRef.current = toId;
    if (pendingModelRef.current?.sessionId === fromId) {
      pendingModelRef.current = { ...pendingModelRef.current, sessionId: toId };
    }
    if (currentSessionIdRef.current === fromId) {
      currentSessionIdRef.current = toId;
      setCurrentSessionId(toId);
    }
  }, []);

  const finishRun = useCallback(
    (outcome: "complete" | "error" | "cancelled", detail: string | null) => {
      const runSessionId = runSessionIdRef.current;
      const isCurrent = runSessionId === currentSessionIdRef.current;
      if (isCurrent) {
        setRunStatus(outcome === "complete" ? "complete" : outcome === "error" ? "error" : "idle");
        setRunStatusDetail(detail);
        setThinkingSummary(null);
      }
      setIsCancellingSession(false);
      if (outcome === "complete") {
        if (runSessionId) {
          drainArmedSessionIdRef.current = runSessionId;
          setQueueDrainTick((tick) => tick + 1);
        }
      } else {
        holdQueue(runSessionId, outcome === "error" ? "failed" : isCurrent ? "stopped" : "away");
      }
      runSessionIdRef.current = null;
      setSessionsRefreshTick((tick) => tick + 1);
      setModelRefreshTick((tick) => tick + 1);
    },
    [holdQueue],
  );

  const runtime = useLatestMessageDataStreamRuntime({
    api: localAgentUrl(baseUrl, "/api/chat"),
    credentials: "same-origin",
    body: async () => {
      const sessionId = currentSessionIdRef.current;
      runSessionIdRef.current = sessionId;
      return buildAgentSessionRequestBodyFragment({
        context: viewContextRef.current,
        runtimeSessionUid: sessionId,
        threadId: sessionId,
        userUid: source.userUid,
      });
    },
    onRequestStart: async () => {
      setRunStatus("queued");
      setRunStatusDetail("Working on your request.");
      setThinkingSummary(null);
      setHasVisibleAssistantOutput(false);
      setSessionNotice(null);
      const sessionId = currentSessionIdRef.current;
      const firstMessage = runtimeRef.current?.thread
        .getState()
        .messages.find((message) => message.role === "user");
      const firstText =
        firstMessage?.content.find((part) => part.type === "text")?.text?.trim().slice(0, 80) ?? null;
      setPageSessions((current) => ({
        ...current,
        [sessionId]: {
          id: sessionId,
          title: current[sessionId]?.title ?? firstText,
          preview: current[sessionId]?.preview ?? firstText,
          updatedAt: new Date().toISOString(),
        },
      }));
    },
    onResponse: async (response) => {
      setRunStatus("queued");
      setRunStatusDetail("Thinking...");
      const sessionId = runSessionIdRef.current;
      const canonical = response.headers.get("X-Agent-Session-Uid")?.trim();
      if (canonical) {
        setRuntimeKnownSessionIds((current) => new Set([...current, canonical]));
        if (sessionId && canonical !== sessionId) rekeySession(sessionId, canonical);
      }
    },
    onChunk: ({ type, data }) => {
      if (type === "reasoning-delta") {
        setRunStatus("thinking");
        setRunStatusDetail("Thinking...");
        setHasVisibleAssistantOutput(true);
        if (typeof data.delta === "string" && data.delta.trim()) setThinkingSummary(data.delta.trim());
        return;
      }
      if (type === "text-delta") {
        setRunStatus("responding");
        setRunStatusDetail("Writing a response...");
        setThinkingSummary(null);
        setHasVisibleAssistantOutput(true);
        return;
      }
      if (type === "tool-call-start" || type === "tool-call-delta") {
        const call = followStreamedToolCall(streamedToolCallRef.current, type, data);
        streamedToolCallRef.current = call;
        if (!call) return;
        const status = describeStreamedToolCallStatus(call);
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
    onFinish: () => finishRun("complete", "Run completed."),
    onError: (error) => {
      finishRun("error", error.message);
      // A failed send may mean the runtime stopped; look again so the composer says so.
      void checkRuntime();
    },
    onCancel: () => finishRun("cancelled", "Run cancelled."),
  });

  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);

  useEffect(() => {
    const sync = () => setThreadRunning(runtime.thread.getState().isRunning);
    sync();
    return runtime.thread.subscribe(sync);
  }, [runtime]);

  // A newly selected session shows its history; a session renamed to the runtime's canonical id
  // keeps the thread on screen.
  useEffect(() => {
    if (rekeyedSessionIdsRef.current.has(currentSessionId)) {
      rekeyedSessionIdsRef.current.delete(currentSessionId);
      setHistory({ sessionId: currentSessionId, status: "ready", reloaded: false });
      return undefined;
    }
    setSessionNotice(null);
    setRunStatus("idle");
    setRunStatusDetail(null);
    if (freshSessionIdsRef.current.has(currentSessionId)) {
      runtime.thread.reset([]);
      setHistory({ sessionId: currentSessionId, status: "ready", reloaded: false });
      return undefined;
    }
    if (!isVisible || runtimeState.status !== "ready") {
      setHistory({ sessionId: currentSessionId, status: "loading" });
      return undefined;
    }
    const controller = new AbortController();
    setHistory({ sessionId: currentSessionId, status: "loading" });
    void fetchLocalChatSessionHistory(baseUrl, currentSessionId, controller.signal)
      .then((snapshot) => {
        if (controller.signal.aborted) return;
        runtime.thread.reset(snapshot?.messages ?? []);
        setHistory({ sessionId: currentSessionId, status: "ready", reloaded: snapshot !== null });
        if (snapshot === null) {
          setSessionNotice(
            "Earlier messages are not shown: this local Agent cannot reload a conversation yet.",
          );
        } else if (snapshot.messages.length > 0) {
          setRuntimeKnownSessionIds((current) => new Set([...current, currentSessionId]));
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setHistory({
          sessionId: currentSessionId,
          status: "error",
          error: error instanceof Error ? error.message : "This conversation did not load.",
        });
      });
    return () => controller.abort();
    // The runtime's readiness gates the first load only; a later check must not reload it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, currentSessionId, isVisible, runtime, runtimeState.status === "ready"]);

  // ---- Models ------------------------------------------------------------------------------

  const [availableModels, setAvailableModels] = useState<AvailableChatModelOption[]>([]);
  const [availableProviders, setAvailableProviders] = useState<AvailableChatProviderOption[]>([]);
  const [availableReasoningEfforts, setAvailableReasoningEfforts] = useState<
    AvailableChatReasoningEffortOption[]
  >([]);
  const [availableModelsError, setAvailableModelsError] = useState<string | null>(null);
  const [isLoadingAvailableModels, setIsLoadingAvailableModels] = useState(false);
  const [hasRequestedAvailableModels, setHasRequestedAvailableModels] = useState(false);
  const [selectedProviderValue, setSelectedProviderValueState] = useState<string | null>(null);
  const [selectedModelValue, setSelectedModelValueState] = useState<string | null>(null);
  const [selectedReasoningEffortValue, setSelectedReasoningEffortValueState] = useState<string | null>(null);
  const [isUpdatingSessionModel, setIsUpdatingSessionModel] = useState(false);
  const firstTurnModelNoticeRef = useRef(false);

  const requestAvailableModels = useCallback(() => {
    setHasRequestedAvailableModels(true);
    setIsLoadingAvailableModels(true);
    void fetchLocalRunConfigOptions(baseUrl)
      .then((options) => {
        // The runtime's own model leads the list: it is what a session runs until one is chosen.
        setAvailableProviders([RUNTIME_CONFIGURED_PROVIDER, ...options.providers]);
        setAvailableModels([runtimeConfiguredModel(), ...options.models]);
        setAvailableReasoningEfforts(options.reasoningEfforts);
        setAvailableModelsError(null);
      })
      .catch(() => {
        // The runtime still answers with its configured model; only the picker is lost.
        setAvailableProviders([RUNTIME_CONFIGURED_PROVIDER]);
        setAvailableModels([runtimeConfiguredModel()]);
        setAvailableReasoningEfforts([]);
        setAvailableModelsError(null);
      })
      .finally(() => setIsLoadingAvailableModels(false));
  }, [baseUrl]);

  useEffect(() => {
    if (isVisible && runtimeState.status === "ready" && !hasRequestedAvailableModels) {
      requestAvailableModels();
    }
  }, [hasRequestedAvailableModels, isVisible, requestAvailableModels, runtimeState.status]);

  const selectConfiguredModel = useCallback(() => {
    setSelectedProviderValueState(RUNTIME_CONFIGURED_PROVIDER.value);
    setSelectedModelValueState(RUNTIME_CONFIGURED_MODEL_ID);
    setSelectedReasoningEffortValueState(null);
  }, []);

  // The session's own model, read while the runtime is idle: a runtime answers only for a session
  // that has had a turn, so a new one shows the runtime's configured model.
  useEffect(() => {
    if (!isVisible || runtimeState.status !== "ready" || threadRunning) {
      return undefined;
    }
    const controller = new AbortController();
    const sessionId = currentSessionId;
    void fetchLocalSessionModel(baseUrl, sessionId, controller.signal)
      .then(async (model) => {
        if (controller.signal.aborted) return;
        const pending = pendingModelRef.current?.sessionId === sessionId ? pendingModelRef.current : null;
        if (model?.provider && model.model) {
          setRuntimeKnownSessionIds((current) => (current.has(sessionId) ? current : new Set([...current, sessionId])));
          if (pending) {
            pendingModelRef.current = null;
            const parsed = splitModelOptionId(pending.modelId);
            if (parsed) {
              try {
                const applied = await updateLocalSessionModel(baseUrl, {
                  sessionUid: sessionId,
                  provider: parsed.provider,
                  model: parsed.model,
                  thinkingLevel: pending.thinkingLevel,
                });
                if (applied.provider && applied.model) {
                  setSelectedProviderValueState(applied.provider);
                  setSelectedModelValueState(modelOptionId(applied.provider, applied.model));
                  setSelectedReasoningEffortValueState(applied.thinkingLevel);
                  return;
                }
              } catch (error) {
                notify({
                  title: "The model did not change",
                  description: error instanceof Error ? error.message : undefined,
                  variant: "error",
                });
              }
            }
          }
          setSelectedProviderValueState(model.provider);
          setSelectedModelValueState(modelOptionId(model.provider, model.model));
          setSelectedReasoningEffortValueState(model.thinkingLevel);
          return;
        }
        if (!pending) selectConfiguredModel();
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [
    baseUrl,
    currentSessionId,
    isVisible,
    modelRefreshTick,
    notify,
    runtimeState.status,
    selectConfiguredModel,
    threadRunning,
  ]);

  const applySessionModel = useCallback(
    async (modelId: string | null, thinkingLevel: string | null) => {
      const sessionId = currentSessionIdRef.current;
      const parsed = modelId ? splitModelOptionId(modelId) : null;
      if (!parsed || modelId === RUNTIME_CONFIGURED_MODEL_ID) {
        if (pendingModelRef.current?.sessionId === sessionId) pendingModelRef.current = null;
        return;
      }
      if (!runtimeKnownSessionIds.has(sessionId)) {
        // The runtime changes the model only of a session it has; this one gets it after its first answer.
        pendingModelRef.current = { sessionId, modelId: modelId!, thinkingLevel };
        if (!firstTurnModelNoticeRef.current) {
          firstTurnModelNoticeRef.current = true;
          notify({
            title: "The first message uses the local Agent's model",
            description:
              "A new local conversation starts with the model the Agent was started with. Your choice applies from the next message.",
            variant: "info",
          });
        }
        return;
      }
      setIsUpdatingSessionModel(true);
      try {
        await updateLocalSessionModel(baseUrl, {
          sessionUid: sessionId,
          provider: parsed.provider,
          model: parsed.model,
          thinkingLevel,
        });
      } catch (error) {
        notify({
          title: "The model did not change",
          description: error instanceof Error ? error.message : undefined,
          variant: "error",
        });
      } finally {
        setIsUpdatingSessionModel(false);
      }
    },
    [baseUrl, notify, runtimeKnownSessionIds],
  );

  const setSelectedProviderValue = useCallback((value: string | null) => {
    setSelectedProviderValueState(value);
  }, []);
  const setSelectedModelValue = useCallback(
    (value: string | null) => {
      setSelectedModelValueState(value);
      const parsed = value ? splitModelOptionId(value) : null;
      if (parsed) setSelectedProviderValueState(parsed.provider);
      void applySessionModel(value, selectedReasoningEffortValue);
    },
    [applySessionModel, selectedReasoningEffortValue],
  );
  const setSelectedReasoningEffortValue = useCallback(
    (value: string | null) => {
      setSelectedReasoningEffortValueState(value);
      void applySessionModel(selectedModelValue, value);
    },
    [applySessionModel, selectedModelValue],
  );

  // ---- The queue (ADR 087) -----------------------------------------------------------------

  const messageQueue = queues[currentSessionId] ?? EMPTY_MESSAGE_QUEUE;
  const queuedMessageCountBySessionId = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(queues)
          .filter(([, queue]) => queue.length > 0)
          .map(([sessionId, queue]) => [sessionId, queue.length]),
      ),
    [queues],
  );

  const enqueueMessage = useCallback(
    (text: string) => {
      const sessionId = currentSessionIdRef.current;
      const result = enqueueQueuedMessage(queuesRef.current[sessionId] ?? EMPTY_MESSAGE_QUEUE, text);
      if (result.refusal === "full") {
        notify({ title: MESSAGE_QUEUE_FULL_TITLE, description: MESSAGE_QUEUE_FULL_MESSAGE, variant: "error" });
        return false;
      }
      if (!result.item) return false;
      setQueues((current) => ({ ...current, [sessionId]: result.queue }));
      return true;
    },
    [notify],
  );

  const sendNextFromQueue = useCallback(
    (sessionId: string) => {
      const queue = queuesRef.current[sessionId] ?? EMPTY_MESSAGE_QUEUE;
      const { item, queue: rest } = takeNextQueuedMessage(queue);
      if (!item) return;
      setQueues((current) => ({ ...current, [sessionId]: rest }));
      const thread = runtimeRef.current?.thread;
      if (!thread || currentSessionIdRef.current !== sessionId) {
        updateQueue(sessionId, (current) => returnQueuedMessage(current, item, "away"));
        return;
      }
      try {
        thread.append({ role: "user", content: [{ type: "text", text: item.text }] });
      } catch (error) {
        updateQueue(sessionId, (current) =>
          returnQueuedMessage(current, item, "unavailable", error instanceof Error ? error.message : undefined),
        );
      }
    },
    [updateQueue],
  );

  // A clean finish sends the next queued message once the thread has settled.
  useEffect(() => {
    const sessionId = drainArmedSessionIdRef.current;
    if (!sessionId || threadRunning) return;
    drainArmedSessionIdRef.current = null;
    const queue = queuesRef.current[sessionId] ?? EMPTY_MESSAGE_QUEUE;
    if (queue.length === 0 || isMessageQueueHeld(queue)) return;
    sendNextFromQueue(sessionId);
  }, [queueDrainTick, sendNextFromQueue, threadRunning]);

  const sendNextQueuedMessage = useCallback(() => {
    const sessionId = currentSessionIdRef.current;
    updateQueue(sessionId, releaseMessageQueue);
    if (!runtimeRef.current?.thread.getState().isRunning) {
      drainArmedSessionIdRef.current = sessionId;
      setQueueDrainTick((tick) => tick + 1);
    }
  }, [updateQueue]);

  // ---- Actions -----------------------------------------------------------------------------

  const selectSession = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
  }, []);

  const createAgentSession = useCallback(() => {
    const sessionId = createLocalSessionId();
    freshSessionIdsRef.current.add(sessionId);
    setPageSessions((current) => ({
      ...current,
      [sessionId]: { id: sessionId, title: null, preview: null, updatedAt: new Date().toISOString() },
    }));
    selectSession(sessionId);
    onRequestVisible?.();
  }, [onRequestVisible, selectSession]);

  const cancelActiveSession = useCallback(async () => {
    const sessionId = currentSessionIdRef.current;
    setIsCancellingSession(true);
    try {
      await cancelLocalChatSession(baseUrl, sessionId);
    } catch (error) {
      notify({
        title: "Unable to stop session",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    } finally {
      // The runtime ends the stream; cancelling the run here also covers a runtime that did not.
      runtimeRef.current?.thread.cancelRun();
      setIsCancellingSession(false);
    }
  }, [baseUrl, notify]);

  const unsupported = useCallback(
    async (action: string) => {
      notify({ title: `${action} is not available for a local Agent`, variant: "info" });
      return false;
    },
    [notify],
  );

  // ---- The value ---------------------------------------------------------------------------

  const runtimeInteraction = interactionFor(runtimeState, agentName);
  const historyReady = history.sessionId === currentSessionId && history.status === "ready";
  const activeSessionReadiness: AgentSessionInteractionReadiness =
    runtimeState.status === "checking"
      ? createLoadingAgentSessionReadiness({ sessionId: currentSessionId, detailReady: true })
      : runtimeState.status === "unavailable"
        ? createReadyAgentSessionReadiness(currentSessionId)
        : history.sessionId === currentSessionId && history.status === "error"
          ? {
              ...createIdleAgentSessionReadiness(currentSessionId),
              status: "error",
              detailReady: true,
              error: history.error,
            }
          : historyReady
            ? createReadyAgentSessionReadiness(currentSessionId)
            : createLoadingAgentSessionReadiness({ sessionId: currentSessionId, detailReady: true });
  const isActiveSessionReady = activeSessionReadiness.status === "ready";
  const isActiveSessionLoading = activeSessionReadiness.status === "loading";
  const activeSession = agentSessions.find((session) => session.id === currentSessionId) ?? null;
  const selectedModel = selectedModelValue ? splitModelOptionId(selectedModelValue) : null;
  const working = threadRunning;
  const activeSessionSummary: ActiveSessionSummary = {
    displayLabel: activeSession?.title ?? null,
    agentUniqueId: "local",
    llmProvider: selectedModel?.provider ?? null,
    llmModel: selectedModel?.model ?? null,
    llmThinking: selectedReasoningEffortValue,
    handleUniqueId: null,
    isDefaultCommandCenterSession: false,
    sessionDisplayId: currentSessionId,
    sessionId: currentSessionId,
    agentId: null,
    updatedAt: activeSession?.updatedAt ?? null,
    preview: activeSession?.preview ?? null,
    codeRepositoryBranchId: null,
    cwd: null,
    runtimeState: null,
    working,
    threadId: currentSessionId,
    runtimeSessionId: currentSessionId,
    sessionKey: null,
    sessionDetailStatus: "ready",
    sessionDetailError: null,
    sessionDetail: null,
    sessionInsights: null,
    isLoadingInsights: false,
    insightsError: null,
  };

  const value: ChatEngineValue = {
    activeAgentLabel: agentName,
    activeAgentName: agentName,
    activeAgentUid: null,
    activeSessionDetail: null,
    activeSessionSummary,
    activeSessionReadiness,
    activeSessionDisplayId: currentSessionId,
    activeSessionPreview: activeSession?.preview ?? null,
    activeSessionUpdatedAt: activeSession?.updatedAt ?? null,
    activeRuntimeInteraction: runtimeInteraction,
    activeRuntimePresence: null,
    availableModels,
    availableModelsError,
    availableProviders,
    availableReasoningEfforts,
    agentId: null,
    agentSessions,
    archiveAgentSession: () => unsupported("Archiving"),
    auth,
    capabilities: {
      ...LOCAL_CAPABILITIES,
      sessionHistory: sessionsSupported !== false,
    },
    environmentUid: null,
    cancelActiveSession,
    clearThread: () => runtimeRef.current?.thread.reset([]),
    connection,
    createAgentSession,
    currentSessionId,
    deleteAgentSession: async () => {
      await unsupported("Deleting");
    },
    hasRequestedAvailableModels,
    hasActiveChatStream: threadRunning,
    isLoadingAvailableModels,
    isActiveSessionReady,
    isActiveSessionLoading,
    isCreatingAgentSession: false,
    isUpdatingSessionModel,
    isCancellingSession,
    isLoadingLatestSessions,
    isAssistantRuntimeStarting: false,
    isDefaultSession: currentSessionId === DEFAULT_LOCAL_SESSION_ID,
    isDirectLaunchSession: false,
    latestSessionsError,
    messageQueue,
    queuedMessageCountBySessionId,
    enqueueMessage,
    removeQueuedMessage: (id) => updateQueue(currentSessionIdRef.current, (queue) => removeQueuedMessage(queue, id)),
    editQueuedMessage: (id) => {
      const sessionId = currentSessionIdRef.current;
      const result = editQueuedMessage(queuesRef.current[sessionId] ?? EMPTY_MESSAGE_QUEUE, id);
      setQueues((current) => ({ ...current, [sessionId]: result.queue }));
      return result.text;
    },
    reorderQueuedMessage: (id, toIndex) =>
      updateQueue(currentSessionIdRef.current, (queue) => reorderQueuedMessage(queue, id, toIndex)),
    clearMessageQueue: () => updateQueue(currentSessionIdRef.current, () => clearMessageQueue()),
    sendNextQueuedMessage,
    refreshActiveSessionRuntimeAccess: checkRuntime,
    revalidateStaleRuntimeAccess,
    defaultSessionError: null,
    defaultSessionStatus: "idle",
    sessionModelSelectionRequest: null,
    sessionModelLastUsed: [],
    resolveSessionModelSelection: () => undefined,
    cancelSessionModelSelection: () => undefined,
    refreshSessionDetail: () => setSessionsRefreshTick((tick) => tick + 1),
    retryDefaultSession: () => void checkRuntime(),
    restoreDefaultSessionSelection: () => undefined,
    hasDirectLaunchSelection: () => false,
    viewContext,
    refreshSessionInsights: () => undefined,
    requestAvailableModels,
    sessionNotice,
    selectedModelValue,
    selectedProviderValue,
    selectedReasoningEffortValue,
    setSelectedModelValue,
    setSelectedProviderValue,
    setSelectedReasoningEffortValue,
    startAgentSession: () => createAgentSession(),
    openLatestOrStartAgentSessionById: async () => undefined,
    startAgentSessionById: async () => {
      createAgentSession();
    },
    unarchiveAgentSession: () => unsupported("Unarchiving"),
  };

  const runStatusValue = useMemo<ChatRunStatusValue>(
    () => ({ hasVisibleAssistantOutput, runStatus, runStatusDetail, thinkingSummary }),
    [hasVisibleAssistantOutput, runStatus, runStatusDetail, thinkingSummary],
  );

  return (
    <ChatEngineContext.Provider value={value}>
      <ChatRunStatusContext.Provider value={runStatusValue}>
        <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
      </ChatRunStatusContext.Provider>
    </ChatEngineContext.Provider>
  );
}
