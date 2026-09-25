import {
  buildClientWakingRuntimeState,
  forgetAgentRuntimeServing,
  verifyAgentRuntimeServing,
} from "./agent-runtime-serving.js";
import {
  fetchAgentSessionRuntimeAccess,
  type AgentRuntimePresence,
  type AgentSessionRuntimeAccess,
} from "./agent-session-runtime-access.js";
import { normalizeAgentSessionLookupId } from "./agent-sessions-api.js";
import { hasPlatformRequestSender, resolveRequestUrl, type ChatBackendConnection } from "./connection.js";
import { MainSequenceAiError } from "./error-source.js";
import {
  RuntimeInteractionBlockedError,
  type AgentRuntimeInteraction,
} from "./runtime-interaction.js";

export interface MainSequenceAiResolvedAssistantAccess {
  assistantEndpoint: string;
  codingAgentId: string | null;
  codingAgentServiceId: string | null;
  isReady: boolean | null;
  organizationEnvironmentUid: string;
  sessionId: string;
  serviceRuntimeId: string | null;
  runtimeAccessMode: string | null;
  runtimeInteraction: AgentRuntimeInteraction | null;
  runtimePresence: AgentRuntimePresence | null;
  token: string | null;
}

export type MainSequenceAiAssistantRuntimeTarget = "agent-runtime";

let cachedDynamicAssistantAccess: MainSequenceAiResolvedAssistantAccess | null = null;
let cachedDynamicAssistantAccessSessionId: string | null = null;
let cachedDynamicAssistantAccessEnvironmentUid: string | null = null;
let inFlightDynamicAssistantAccessRefresh: Promise<MainSequenceAiResolvedAssistantAccess> | null = null;
let inFlightDynamicAssistantAccessSessionId: string | null = null;
let inFlightDynamicAssistantAccessEnvironmentUid: string | null = null;

export function normalizeMainSequenceAiAssistantEndpoint(endpoint: string) {
  const trimmed = endpoint.trim();

  if (!trimmed) {
    throw new MainSequenceAiError("The Agent runtime endpoint is blank.", {
      source: "frontend",
    });
  }

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/")
  ) {
    return trimmed;
  }

  const protocol = window.location.protocol === "https:" ? "https://" : "http://";
  return `${protocol}${trimmed}`;
}

function toAssistantBaseUrl(endpoint: string) {
  const normalized = normalizeMainSequenceAiAssistantEndpoint(endpoint);

  if (normalized.startsWith("/")) {
    return new URL(normalized, "http://assistant.local");
  }

  return new URL(normalized);
}

export function buildMainSequenceAiAssistantUrl(assistantEndpoint: string, requestPath: string) {
  if (/^https?:\/\//i.test(requestPath)) {
    return requestPath;
  }

  const base = toAssistantBaseUrl(assistantEndpoint);
  const prefix = base.pathname.replace(/\/+$/, "");
  const requestUrl = new URL(
    requestPath.startsWith("/") ? requestPath : `/${requestPath}`,
    "http://assistant.local",
  );

  base.pathname = `${prefix}${requestUrl.pathname}`.replace(/\/{2,}/g, "/");
  base.search = requestUrl.search;
  base.hash = requestUrl.hash;

  return assistantEndpoint.trim().startsWith("/")
    ? `${base.pathname}${base.search}${base.hash}`
    : base.toString();
}

export function buildMainSequenceAiAssistantChatUrl(assistantEndpoint: string) {
  return buildMainSequenceAiAssistantUrl(assistantEndpoint, "/api/chat");
}

export function buildMainSequenceAiAssistantHeaders({
  accept,
  token,
  tokenType = "Bearer",
}: {
  accept?: string;
  token?: string | null;
  tokenType?: string;
}) {
  const headers = new Headers();

  if (accept) {
    headers.set("Accept", accept);
  }

  if (token) {
    headers.set("Authorization", `${tokenType} ${token}`);
  }

  return headers;
}

function normalizeDynamicAssistantAccess(
  payload: AgentSessionRuntimeAccess,
  {
    organizationEnvironmentUid,
  }: {
    organizationEnvironmentUid: string;
  },
): MainSequenceAiResolvedAssistantAccess {
  if (!payload.runtimeInteraction) {
    throw new MainSequenceAiError(
      "Runtime access response is missing the runtime interaction contract.",
      { source: "frontend_runtime_parser" },
    );
  }
  if (!payload.runtimeInteraction.canSubmit) {
    throw new RuntimeInteractionBlockedError(
      payload.runtimeInteraction,
      payload.runtimePresence,
    );
  }

  if (payload.mode === "unavailable") {
    const readyDetail =
      typeof payload.ready?.detail === "string" ? payload.ready.detail.trim() : "";
    const detail =
      payload.detail?.trim() ||
      readyDetail ||
      "The agent runtime is unavailable while its service is being reconciled.";

    throw new MainSequenceAiError(detail, {
      code: "runtime_unavailable",
      detail,
      source: "assistant_runtime_access",
    });
  }

  if (payload.mode !== "token") {
    throw new MainSequenceAiError(
      "resolve_runtime_access response did not include a supported mode.",
      {
        source: "frontend_runtime_parser",
      },
    );
  }

  const rpcUrl = payload.rpcUrl?.trim();
  const runtimeToken = payload.token?.trim();
  const resolvedAssistantEndpoint = rpcUrl
    ? normalizeMainSequenceAiAssistantEndpoint(rpcUrl)
    : null;
  const codingAgentServiceId = payload.codingAgentServiceId?.trim() || null;
  const normalizedEnvironmentUid = organizationEnvironmentUid.trim();

  if (!resolvedAssistantEndpoint) {
    throw new MainSequenceAiError("resolve_runtime_access response did not include rpc_url.", {
      source: "frontend_runtime_parser",
    });
  }

  if (!runtimeToken) {
    throw new MainSequenceAiError("resolve_runtime_access response did not include token.", {
      source: "frontend_runtime_parser",
    });
  }

  if (!normalizedEnvironmentUid) {
    throw new MainSequenceAiError(
      "Runtime access requires an active Organization Environment.",
      { source: "frontend_runtime_guard" },
    );
  }

  return {
    assistantEndpoint: resolvedAssistantEndpoint,
    codingAgentId: payload.codingAgentId,
    codingAgentServiceId,
    isReady: payload.isReady,
    organizationEnvironmentUid: normalizedEnvironmentUid,
    sessionId: payload.sessionId,
    serviceRuntimeId: payload.serviceRuntimeId,
    runtimeAccessMode: payload.mode,
    runtimeInteraction: payload.runtimeInteraction,
    runtimePresence: payload.runtimePresence,
    token: runtimeToken,
  };
}

function cacheDynamicAssistantAccess(
  access: MainSequenceAiResolvedAssistantAccess | null,
  currentSessionId: string | null,
  organizationEnvironmentUid: string | null,
) {
  if (!access) {
    cachedDynamicAssistantAccess = null;
    cachedDynamicAssistantAccessSessionId = null;
    cachedDynamicAssistantAccessEnvironmentUid = null;
    return;
  }

  cachedDynamicAssistantAccess = access;
  cachedDynamicAssistantAccessSessionId = currentSessionId;
  cachedDynamicAssistantAccessEnvironmentUid = organizationEnvironmentUid;
}

export function clearMainSequenceAiResolvedRuntimeAccess() {
  cachedDynamicAssistantAccess = null;
  cachedDynamicAssistantAccessSessionId = null;
  cachedDynamicAssistantAccessEnvironmentUid = null;
  inFlightDynamicAssistantAccessRefresh = null;
  inFlightDynamicAssistantAccessSessionId = null;
  inFlightDynamicAssistantAccessEnvironmentUid = null;
}

function requireOrganizationEnvironmentUid(value: string | null | undefined) {
  const normalized = value?.trim() || null;
  if (!normalized) {
    throw new MainSequenceAiError(
      "An active Organization Environment is required for Agent runtime access.",
      { source: "frontend_runtime_guard" },
    );
  }

  return normalized;
}

function createAbortReason(signal: AbortSignal) {
  return signal.reason ?? new DOMException("The runtime access request was aborted.", "AbortError");
}

// Lets a caller stop waiting on a SHARED in-flight refresh without
// cancelling the underlying work other callers may still be awaiting.
async function raceWithAbortSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise;
  }

  if (signal.aborted) {
    throw createAbortReason(signal);
  }

  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(createAbortReason(signal));
    };

    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function normalizeRuntimeSessionId(value: string | number | null | undefined) {
  return normalizeAgentSessionLookupId(value);
}

/**
 * ADR 093: the platform's "ready" only says the Agent is deployed. Before Command Center treats
 * it as ready, the Agent has to answer on the address the message will use; until it does, the
 * result carries a client-built `waking` decision and every consumer waits as for any wake.
 */
export async function fetchVerifiedAgentSessionRuntimeAccess({
  agentName,
  connection,
  sessionId,
  signal,
  token,
  tokenType = "Bearer",
}: {
  agentName?: string | null;
  connection: ChatBackendConnection;
  sessionId: string | number;
  signal?: AbortSignal;
  token?: string | null;
  tokenType?: string;
}): Promise<AgentSessionRuntimeAccess> {
  const runtimeAccess = await fetchAgentSessionRuntimeAccess({
    connection,
    sessionId,
    signal,
    token,
    tokenType,
  });
  const rpcUrl = runtimeAccess.rpcUrl?.trim();
  const runtimeToken = runtimeAccess.token?.trim();

  // Only a "ready" can be downgraded; a blocked or transient platform decision stands.
  if (
    !runtimeAccess.runtimeInteraction.canSubmit ||
    runtimeAccess.mode !== "token" ||
    !rpcUrl ||
    !runtimeToken
  ) {
    return runtimeAccess;
  }

  const verdict = await verifyAgentRuntimeServing({
    connection,
    signal,
    token: runtimeToken,
    url: buildMainSequenceAiAssistantChatUrl(normalizeMainSequenceAiAssistantEndpoint(rpcUrl)),
  });
  if (verdict.serving || verdict.wakeStartedAt === null) {
    return runtimeAccess;
  }

  return {
    ...runtimeAccess,
    isReady: false,
    ...buildClientWakingRuntimeState({ agentName, wakeStartedAt: verdict.wakeStartedAt }),
  };
}

export async function fetchMainSequenceAiAgentRuntimeHandle({
  agentName,
  connection,
  currentSessionId,
  organizationEnvironmentUid,
  signal,
  sessionToken,
  sessionTokenType = "Bearer",
}: {
  agentName?: string | null;
  connection: ChatBackendConnection;
  currentSessionId?: string | number | null;
  organizationEnvironmentUid: string;
  signal?: AbortSignal;
  sessionToken?: string | null;
  sessionTokenType?: string;
}) {
  const normalizedCurrentSessionId = normalizeRuntimeSessionId(currentSessionId);
  const normalizedEnvironmentUid = requireOrganizationEnvironmentUid(
    organizationEnvironmentUid,
  );

  if (!normalizedCurrentSessionId) {
    throw new MainSequenceAiError("AgentSession runtime access requires a concrete session id.", {
      source: "frontend_runtime_guard",
    });
  }

  if (!sessionToken && !hasPlatformRequestSender(connection)) {
    throw new MainSequenceAiError(
      "No authenticated session token is available for dynamic assistant access.",
      {
        source: "frontend",
      },
    );
  }

  const runtimeAccess = await fetchVerifiedAgentSessionRuntimeAccess({
    agentName,
    connection,
    sessionId: normalizedCurrentSessionId,
    signal,
    token: sessionToken,
    tokenType: sessionTokenType,
  });
  const access = normalizeDynamicAssistantAccess(runtimeAccess, {
    organizationEnvironmentUid: normalizedEnvironmentUid,
  });
  cacheDynamicAssistantAccess(access, normalizedCurrentSessionId, normalizedEnvironmentUid);

  return { access, runtimeAccess };
}

async function refreshDynamicAssistantAccess({
  agentName,
  connection,
  currentSessionId,
  organizationEnvironmentUid,
  signal,
  sessionToken,
  sessionTokenType = "Bearer",
}: {
  agentName?: string | null;
  connection: ChatBackendConnection;
  currentSessionId?: string | number | null;
  organizationEnvironmentUid: string;
  signal?: AbortSignal;
  sessionToken?: string | null;
  sessionTokenType?: string;
}) {
  const normalizedCurrentSessionId = normalizeRuntimeSessionId(currentSessionId);
  const normalizedEnvironmentUid = requireOrganizationEnvironmentUid(
    organizationEnvironmentUid,
  );

  if (
    inFlightDynamicAssistantAccessRefresh &&
    inFlightDynamicAssistantAccessSessionId === normalizedCurrentSessionId &&
    inFlightDynamicAssistantAccessEnvironmentUid === normalizedEnvironmentUid
  ) {
    // Joining callers stop waiting on abort; the shared refresh keeps running
    // for whoever else awaits it.
    return raceWithAbortSignal(inFlightDynamicAssistantAccessRefresh, signal);
  }

  if (!sessionToken && !hasPlatformRequestSender(connection)) {
    throw new MainSequenceAiError(
      "No authenticated session token is available for dynamic assistant access.",
      {
        source: "frontend",
      },
    );
  }

  // Cache/in-flight bookkeeping rides the refresh promise itself, not the
  // awaiting caller — a caller that aborts and detaches must not clear the
  // slot out from under a refresh that is still running.
  let refreshPromise!: Promise<MainSequenceAiResolvedAssistantAccess>;
  refreshPromise = (async () => {
    try {
      const { access } = await fetchMainSequenceAiAgentRuntimeHandle({
        agentName,
        connection,
        currentSessionId: normalizedCurrentSessionId,
        organizationEnvironmentUid: normalizedEnvironmentUid,
        signal,
        sessionToken,
        sessionTokenType,
      });
      return access;
    } catch (error) {
      cachedDynamicAssistantAccess = null;
      cachedDynamicAssistantAccessSessionId = null;
      cachedDynamicAssistantAccessEnvironmentUid = null;
      throw error;
    } finally {
      if (inFlightDynamicAssistantAccessRefresh === refreshPromise) {
        inFlightDynamicAssistantAccessRefresh = null;
        inFlightDynamicAssistantAccessSessionId = null;
        inFlightDynamicAssistantAccessEnvironmentUid = null;
      }
    }
  })();

  inFlightDynamicAssistantAccessRefresh = refreshPromise;
  inFlightDynamicAssistantAccessSessionId = normalizedCurrentSessionId;
  inFlightDynamicAssistantAccessEnvironmentUid = normalizedEnvironmentUid;
  // Detached callers leave the stored promise without an awaiter; keep its
  // rejection observed so it never surfaces as an unhandled rejection.
  refreshPromise.catch(() => undefined);

  return raceWithAbortSignal(refreshPromise, signal);
}

export async function resolveMainSequenceAiAssistantAccess({
  agentName,
  connection,
  currentSessionId,
  forceRefresh = false,
  organizationEnvironmentUid,
  signal,
  sessionToken,
  sessionTokenType = "Bearer",
}: {
  agentName?: string | null;
  connection: ChatBackendConnection;
  currentSessionId?: string | number | null;
  forceRefresh?: boolean;
  organizationEnvironmentUid?: string | null;
  runtimeTarget?: MainSequenceAiAssistantRuntimeTarget;
  signal?: AbortSignal;
  sessionToken?: string | null;
  sessionTokenType?: string;
}): Promise<MainSequenceAiResolvedAssistantAccess> {
  const normalizedEnvironmentUid = requireOrganizationEnvironmentUid(
    organizationEnvironmentUid,
  );

  const normalizedCurrentSessionId = normalizeRuntimeSessionId(currentSessionId);

  if (normalizedCurrentSessionId) {
    if (
      !forceRefresh &&
      cachedDynamicAssistantAccess &&
      cachedDynamicAssistantAccessSessionId === normalizedCurrentSessionId &&
      cachedDynamicAssistantAccessEnvironmentUid === normalizedEnvironmentUid
    ) {
      return cachedDynamicAssistantAccess;
    }

    return refreshDynamicAssistantAccess({
      agentName,
      connection,
      currentSessionId: normalizedCurrentSessionId,
      organizationEnvironmentUid: normalizedEnvironmentUid,
      signal,
      sessionToken,
      sessionTokenType,
    });
  }

  throw new MainSequenceAiError(
    "AgentSession runtime access requires a concrete session id.",
    {
      source: "frontend_runtime_guard",
    },
  );
}

function mergeAssistantHeaders({
  accept,
  headers,
  resolvedAccess,
}: {
  accept?: string;
  headers?: HeadersInit;
  resolvedAccess: MainSequenceAiResolvedAssistantAccess;
}) {
  const mergedHeaders = new Headers(headers);

  if (accept && !mergedHeaders.has("Accept")) {
    mergedHeaders.set("Accept", accept);
  }

  if (resolvedAccess.token) {
    mergedHeaders.set("Authorization", `Bearer ${resolvedAccess.token}`);
  }

  return mergedHeaders;
}

export async function fetchMainSequenceAiAssistantResponse({
  accept,
  agentName,
  connection,
  credentials = "same-origin",
  currentSessionId,
  headers,
  organizationEnvironmentUid,
  requestPath,
  retryOnAuthFailure = true,
  runtimeTarget = "agent-runtime",
  sessionToken,
  sessionTokenType = "Bearer",
  sessionUserUid,
  ...init
}: Omit<RequestInit, "headers"> & {
  accept?: string;
  /** Names the Agent in the notice shown while it starts (ADR 093). */
  agentName?: string | null;
  connection: ChatBackendConnection;
  currentSessionId?: string | number | null;
  headers?: HeadersInit;
  organizationEnvironmentUid?: string | null;
  requestPath: string;
  retryOnAuthFailure?: boolean;
  runtimeTarget?: MainSequenceAiAssistantRuntimeTarget;
  sessionToken?: string | null;
  sessionTokenType?: string;
  sessionUserUid?: string | null;
}) {
  const execute = async (forceRefresh: boolean) => {
    const resolvedAccess = await resolveMainSequenceAiAssistantAccess({
      agentName,
      connection,
      currentSessionId,
      forceRefresh,
      organizationEnvironmentUid,
      runtimeTarget,
      signal: init.signal ?? undefined,
      sessionToken,
      sessionTokenType,
    });

    const url = buildMainSequenceAiAssistantUrl(resolvedAccess.assistantEndpoint, requestPath);
    let response: Response;
    try {
      response = await fetch(resolveRequestUrl(connection, url, "agent-runtime"), {
        ...init,
        credentials,
        headers: mergeAssistantHeaders({
          accept,
          headers,
          resolvedAccess,
        }),
      });
    } catch (error) {
      // The last verification no longer holds; the next access check asks the Agent again.
      forgetAgentRuntimeServing(url);
      throw new MainSequenceAiError(
        error instanceof Error
          ? error.message
          : "Agent runtime request failed before receiving a response.",
        {
          code: init.signal?.aborted ? null : "agent_unreachable",
          source: "assistant_backend_http",
        },
      );
    }

    return {
      resolvedAccess,
      response,
      url,
    };
  };

  const firstAttempt = await execute(false);

  if (
    retryOnAuthFailure &&
    (firstAttempt.response.status === 401 || firstAttempt.response.status === 403)
  ) {
    return execute(true);
  }

  return firstAttempt;
}
