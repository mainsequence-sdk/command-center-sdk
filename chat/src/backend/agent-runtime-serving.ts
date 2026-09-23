import { resolveRequestUrl, type ChatBackendConnection } from "./connection.js";
import type { AgentRuntimeInteraction, AgentRuntimePresence } from "./runtime-interaction.js";

// ADR 093: the platform answers "ready" for every deployed Agent, idle or not, so
// Command Center confirms that the Agent answers before it treats "ready" as ready.

export const AGENT_RUNTIME_CLIENT_WAKING_CODE = "agent_runtime_client_waking";
/** How long a wake may run before the surface says it is taking longer than expected. */
export const AGENT_RUNTIME_WAKE_DEADLINE_MS = 5 * 60_000;
/** Pause between two verifications while the Agent is starting. */
export const AGENT_RUNTIME_WAKING_RETRY_MS = 3_000;
/** A successful verification is trusted this long, so one send costs at most one check. */
export const AGENT_RUNTIME_SERVING_MEMO_MS = 15_000;
/** The first check gives up quickly so the surface can say "starting" at once. */
export const AGENT_RUNTIME_FIRST_CHECK_TIMEOUT_MS = 3_000;
/** Later checks wait, so they return the moment the Agent is up. */
export const AGENT_RUNTIME_WAKING_CHECK_TIMEOUT_MS = 20_000;

// Answers that come from in front of an Agent that is not up yet.
const NOT_SERVING_STATUSES = new Set([502, 503, 504]);

const servingVerifiedAtByUrl = new Map<string, number>();
const wakeStartedAtByUrl = new Map<string, number>();

function createAbortError() {
  return new DOMException("The readiness check was aborted.", "AbortError");
}

/**
 * One request to the Agent's information route. Resolves true when the Agent answered, false
 * when nothing did (network failure, timeout, or a gateway answer for an Agent that is not up).
 * Rejects only when the caller aborted.
 */
export async function probeAgentRuntimeServing({
  connection,
  fetchImpl = fetch,
  signal,
  timeoutMs,
  token,
  url,
}: {
  connection: ChatBackendConnection;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal | null;
  timeoutMs: number;
  token: string;
  url: string;
}): Promise<boolean> {
  if (signal?.aborted) {
    throw createAbortError();
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const onCallerAbort = () => controller.abort();
  signal?.addEventListener("abort", onCallerAbort, { once: true });

  try {
    const response = await fetchImpl(resolveRequestUrl(connection, url, "agent-runtime"), {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    return !NOT_SERVING_STATUSES.has(response.status);
  } catch {
    if (signal?.aborted) {
      throw createAbortError();
    }
    return false;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onCallerAbort);
  }
}

export interface AgentRuntimeServingVerdict {
  serving: boolean;
  /** When this client first saw the Agent not answering; null while it serves. */
  wakeStartedAt: number | null;
}

export async function verifyAgentRuntimeServing({
  connection,
  fetchImpl,
  now = () => Date.now(),
  signal,
  token,
  url,
}: {
  connection: ChatBackendConnection;
  fetchImpl?: typeof fetch;
  now?: () => number;
  signal?: AbortSignal | null;
  token: string;
  url: string;
}): Promise<AgentRuntimeServingVerdict> {
  const verifiedAt = servingVerifiedAtByUrl.get(url);
  if (verifiedAt !== undefined && now() - verifiedAt < AGENT_RUNTIME_SERVING_MEMO_MS) {
    return { serving: true, wakeStartedAt: null };
  }

  const waking = wakeStartedAtByUrl.has(url);
  const serving = await probeAgentRuntimeServing({
    connection,
    fetchImpl,
    signal,
    timeoutMs: waking
      ? AGENT_RUNTIME_WAKING_CHECK_TIMEOUT_MS
      : AGENT_RUNTIME_FIRST_CHECK_TIMEOUT_MS,
    token,
    url,
  });

  if (serving) {
    servingVerifiedAtByUrl.set(url, now());
    wakeStartedAtByUrl.delete(url);
    return { serving: true, wakeStartedAt: null };
  }

  servingVerifiedAtByUrl.delete(url);
  if (!wakeStartedAtByUrl.has(url)) {
    wakeStartedAtByUrl.set(url, now());
  }
  return { serving: false, wakeStartedAt: wakeStartedAtByUrl.get(url) ?? now() };
}

/** A request to the Agent failed at the network level: stop trusting the last verification. */
export function forgetAgentRuntimeServing(url?: string | null) {
  if (url) {
    servingVerifiedAtByUrl.delete(url);
    return;
  }
  servingVerifiedAtByUrl.clear();
}

export function resetAgentRuntimeServingState() {
  servingVerifiedAtByUrl.clear();
  wakeStartedAtByUrl.clear();
}

function resolveAgentDisplayName(agentName: string | null | undefined) {
  return agentName?.trim() || "The agent";
}

/** The decision shown while an Agent the platform calls ready does not answer yet. */
export function buildClientWakingRuntimeState({
  agentName,
  now = Date.now(),
  wakeStartedAt,
}: {
  agentName?: string | null;
  now?: number;
  wakeStartedAt: number;
}): { runtimeInteraction: AgentRuntimeInteraction; runtimePresence: AgentRuntimePresence } {
  const name = resolveAgentDisplayName(agentName);
  const message = `${name} was idle and is starting now. You can write as soon as it is ready.`;

  return {
    runtimeInteraction: {
      state: "waking",
      canSubmit: false,
      notice: {
        code: AGENT_RUNTIME_CLIENT_WAKING_CODE,
        severity: "info",
        title: `Starting ${agentName?.trim() || "the agent"}`,
        message,
      },
      operation: null,
      retryAfterMs: AGENT_RUNTIME_WAKING_RETRY_MS,
    },
    runtimePresence: {
      phase: "starting",
      replicas: { desired: null, actual: null },
      // Same text as the notice, so the status lines do not repeat it.
      detail: message,
      observedAt: new Date(now).toISOString(),
      wake: {
        operationUid: `client-wake-${wakeStartedAt}`,
        state: "in_progress",
        requestedAt: new Date(wakeStartedAt).toISOString(),
        deadlineAt: new Date(wakeStartedAt + AGENT_RUNTIME_WAKE_DEADLINE_MS).toISOString(),
      },
    },
  };
}

export const AGENT_RUNTIME_CLIENT_CHECK_RETRYING_CODE = "agent_runtime_client_check_retrying";

/**
 * The decision for a selected session whose first verification has not come back: locked, and
 * silent, so an Agent that answers at once shows nothing. Once a check has failed the lock
 * says why, so it never looks like a frozen composer.
 */
export function buildClientCheckingRuntimeInteraction({
  agentName,
  retrying = false,
}: {
  agentName?: string | null;
  retrying?: boolean;
} = {}): AgentRuntimeInteraction {
  return {
    state: "checking",
    canSubmit: false,
    notice: retrying
      ? {
          code: AGENT_RUNTIME_CLIENT_CHECK_RETRYING_CODE,
          severity: "warning",
          title: "Still checking",
          message: `Could not confirm that ${resolveAgentDisplayName(agentName).replace(/^The /, "the ")} is ready. Trying again.`,
        }
      : null,
    operation: null,
    retryAfterMs: null,
  };
}
