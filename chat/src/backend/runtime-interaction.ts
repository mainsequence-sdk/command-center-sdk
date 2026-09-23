import { MainSequenceAiError } from "./error-source.js";

export type AgentRuntimeInteractionState =
  | "ready"
  | "warning"
  | "checking"
  | "starting"
  | "waking"
  | "update_required"
  | "updating"
  | "update_failed"
  | "unavailable";

export type AgentRuntimeInteractionSeverity = "info" | "warning" | "error" | "success";

export interface AgentRuntimeInteractionNotice {
  code: string;
  severity: AgentRuntimeInteractionSeverity;
  title: string;
  message: string;
}

export interface AgentRuntimeInteractionOperation {
  uid: string;
  status:
    | "queued"
    | "running"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "skipped"
    | "blocked"
    | "superseded";
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  supportReference: string;
}

export interface AgentRuntimeInteraction {
  state: AgentRuntimeInteractionState;
  canSubmit: boolean;
  notice: AgentRuntimeInteractionNotice | null;
  operation: AgentRuntimeInteractionOperation | null;
  retryAfterMs: number | null;
}

export type AgentRuntimePresencePhase =
  | "not_deployed"
  | "observing"
  | "idle"
  | "provisioning"
  | "pulling_image"
  | "starting"
  | "serving"
  | "redeploying"
  | "failed";

export interface AgentRuntimePresence {
  phase: AgentRuntimePresencePhase;
  replicas: { desired: number | null; actual: number | null };
  detail: string;
  observedAt: string | null;
  wake: {
    operationUid: string;
    state:
      | "requested"
      | "in_progress"
      | "serving"
      | "failed"
      | "expired"
      | "superseded";
    requestedAt: string;
    deadlineAt: string;
  } | null;
}

const STATES = new Set<AgentRuntimeInteractionState>([
  "ready",
  "warning",
  "checking",
  "starting",
  "waking",
  "update_required",
  "updating",
  "update_failed",
  "unavailable",
]);
const SEVERITIES = new Set<AgentRuntimeInteractionSeverity>([
  "info",
  "warning",
  "error",
  "success",
]);
const OPERATION_STATUSES = new Set<AgentRuntimeInteractionOperation["status"]>([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "skipped",
  "blocked",
  "superseded",
]);

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizedString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeNotice(value: unknown): AgentRuntimeInteractionNotice | null {
  const candidate = asRecord(value);
  const code = normalizedString(candidate?.code);
  const severity = normalizedString(candidate?.severity) as AgentRuntimeInteractionSeverity | null;
  const title = normalizedString(candidate?.title);
  const message = normalizedString(candidate?.message);

  if (!candidate || !code || !severity || !SEVERITIES.has(severity) || !title || !message) {
    return null;
  }

  return { code, severity, title, message };
}

function normalizeOperation(value: unknown): AgentRuntimeInteractionOperation | null {
  const candidate = asRecord(value);
  const uid = normalizedString(candidate?.uid);
  const status = normalizedString(candidate?.status) as AgentRuntimeInteractionOperation["status"] | null;
  const createdAt =
    normalizedString(candidate?.created_at) ?? normalizedString(candidate?.createdAt);
  const supportReference =
    normalizedString(candidate?.support_reference) ??
    normalizedString(candidate?.supportReference);

  if (
    !candidate ||
    !uid ||
    !status ||
    !OPERATION_STATUSES.has(status) ||
    !createdAt ||
    !supportReference
  ) {
    return null;
  }

  return {
    uid,
    status,
    createdAt,
    startedAt:
      normalizedString(candidate.started_at) ?? normalizedString(candidate.startedAt),
    finishedAt:
      normalizedString(candidate.finished_at) ?? normalizedString(candidate.finishedAt),
    supportReference,
  };
}

export function normalizeAgentRuntimeInteraction(value: unknown): AgentRuntimeInteraction | null {
  const candidate = asRecord(value);
  const state = normalizedString(candidate?.state) as AgentRuntimeInteractionState | null;
  const canSubmitValue = candidate?.can_submit ?? candidate?.canSubmit;

  if (
    !candidate ||
    !state ||
    !STATES.has(state) ||
    typeof canSubmitValue !== "boolean"
  ) {
    return null;
  }
  const retryAfterValue = candidate.retry_after_ms ?? candidate.retryAfterMs;

  return {
    state,
    canSubmit: canSubmitValue,
    notice: normalizeNotice(candidate.notice),
    operation: normalizeOperation(candidate.operation),
    retryAfterMs:
      typeof retryAfterValue === "number" && Number.isFinite(retryAfterValue)
        ? Math.max(0, retryAfterValue)
        : null,
  };
}

export function isTransientRuntimeInteraction(
  interaction: AgentRuntimeInteraction | null | undefined,
) {
  return (
    interaction?.state === "checking" ||
    interaction?.state === "starting" ||
    interaction?.state === "waking" ||
    interaction?.state === "updating"
  );
}

export class RuntimeInteractionBlockedError extends MainSequenceAiError {
  readonly runtimeInteraction: AgentRuntimeInteraction;
  readonly runtimePresence: AgentRuntimePresence;

  constructor(
    runtimeInteraction: AgentRuntimeInteraction,
    runtimePresence: AgentRuntimePresence,
  ) {
    const detail =
      runtimeInteraction.notice?.message ??
      "The agent cannot take a new message right now.";
    super(detail, {
      code: "runtime_interaction_blocked",
      detail,
      source: "frontend_request_not_sent",
    });
    this.name = "RuntimeInteractionBlockedError";
    this.runtimeInteraction = runtimeInteraction;
    this.runtimePresence = runtimePresence;
  }
}

/** Grace after the backend's wake deadline before the client stops believing "waking". */
export const RUNTIME_INTERACTION_DEADLINE_GRACE_MS = 30_000;
/** Cap for a settle wait when the backend gave no deadline at all. */
export const RUNTIME_INTERACTION_SETTLE_FALLBACK_MS = 12 * 60_000;

export function resolveRuntimeInteractionWaitDeadline(
  presence: AgentRuntimePresence | null | undefined,
  now = Date.now(),
) {
  const deadlineAt = presence?.wake?.deadlineAt ? Date.parse(presence.wake.deadlineAt) : NaN;
  return Number.isFinite(deadlineAt)
    ? deadlineAt + RUNTIME_INTERACTION_DEADLINE_GRACE_MS
    : now + RUNTIME_INTERACTION_SETTLE_FALLBACK_MS;
}

export function isRuntimeInteractionOverdue(
  interaction: AgentRuntimeInteraction | null | undefined,
  presence: AgentRuntimePresence | null | undefined,
  now = Date.now(),
) {
  if (!isTransientRuntimeInteraction(interaction) || !presence?.wake?.deadlineAt) {
    return false;
  }
  return now > resolveRuntimeInteractionWaitDeadline(presence, now);
}

/**
 * Wait until the interaction the shared poller keeps up to date is no longer
 * transient. Used by a send that met a transient decision: the message is
 * held and retried once the runtime serves, instead of failing while the
 * user watches the wake. Resolves with the settled interaction, or null when
 * the wait was aborted or ran past the backend deadline plus grace.
 */
export async function waitForRuntimeInteractionSettled({
  deadlineMs,
  pollIntervalMs = 500,
  readInteraction,
  signal,
}: {
  deadlineMs: number;
  pollIntervalMs?: number;
  readInteraction: () => AgentRuntimeInteraction | null | undefined;
  signal?: AbortSignal | null;
}): Promise<AgentRuntimeInteraction | null> {
  while (!signal?.aborted) {
    const interaction = readInteraction();
    if (interaction && !isTransientRuntimeInteraction(interaction)) {
      return interaction;
    }
    if (Date.now() > deadlineMs) {
      return null;
    }
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, pollIntervalMs);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
    });
  }
  return null;
}

/** The send stopped before it reached the Agent; the wording is what the person reads. */
export function createRuntimeRequestNotSentError(
  notice: AgentRuntimeInteractionNotice | null | undefined,
) {
  return new MainSequenceAiError(
    notice?.message
      ? `${notice.message} Your message was not sent; send it again when the agent is ready.`
      : "The agent is not ready to take messages yet. Your message was not sent; send it again when it is ready.",
    {
      code: "runtime_request_not_sent",
      detail: notice?.message ?? null,
      source: "frontend_request_not_sent",
    },
  );
}

/**
 * Sends a request that the platform may answer with "the Agent is starting". The message is
 * held while the shared poller follows the start and goes out once the Agent can take it.
 *
 * Two things make the hold reliable. `onBlocked` publishes the blocking decision before the
 * wait begins, so the wait never reads the older "ready" the composer was opened on. And the
 * request is tried again after every settle, not once: a platform that answers "starting" a
 * second time keeps the message held instead of surfacing the block as an error. One deadline,
 * taken from the first block, bounds the whole hold.
 */
export async function requestThroughRuntimeWake<T>({
  onBlocked,
  pollIntervalMs,
  readInteraction,
  request,
  signal,
}: {
  onBlocked: (error: RuntimeInteractionBlockedError) => void;
  pollIntervalMs?: number;
  readInteraction: () => AgentRuntimeInteraction | null | undefined;
  request: () => Promise<T>;
  signal?: AbortSignal | null;
}): Promise<T> {
  let deadlineMs: number | null = null;

  for (;;) {
    try {
      return await request();
    } catch (error) {
      if (!(error instanceof RuntimeInteractionBlockedError)) {
        throw error;
      }
      onBlocked(error);
      if (!isTransientRuntimeInteraction(error.runtimeInteraction)) {
        // The first answer is a decision of its own; a terminal one after a hold reads as
        // "was not sent", in the notice's words.
        throw deadlineMs === null
          ? error
          : createRuntimeRequestNotSentError(error.runtimeInteraction.notice);
      }
      deadlineMs ??= resolveRuntimeInteractionWaitDeadline(error.runtimePresence);
      const settled = await waitForRuntimeInteractionSettled({
        deadlineMs,
        pollIntervalMs,
        readInteraction,
        signal,
      });
      if (!settled?.canSubmit) {
        throw createRuntimeRequestNotSentError(
          settled?.notice ?? error.runtimeInteraction.notice,
        );
      }
    }
  }
}
