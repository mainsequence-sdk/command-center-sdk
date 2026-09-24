/**
 * Messages written while the agent is still working (ADR 087).
 *
 * The queue lives in the Command Center only: nothing here exists on the
 * platform until a message is sent as an ordinary turn. The reducer is pure
 * so the provider's wiring stays thin and the rules are unit-tested.
 */

export const MESSAGE_QUEUE_LIMIT = 10;

export type QueuedMessageStatus = "queued" | "sending" | "held";
export type QueuedMessageHoldReason = "stopped" | "failed" | "away" | "blocked" | "unavailable";

export interface QueuedMessage {
  id: string;
  /** The composer text at enqueue time, trimmed. */
  text: string;
  /** ISO timestamp. */
  createdAt: string;
  status: QueuedMessageStatus;
  holdReason?: QueuedMessageHoldReason;
  /** Plain-language reason shown on the strip. */
  holdMessage?: string;
}

export type MessageQueue = readonly QueuedMessage[];

export type MessageQueueRefusal = "empty" | "full";

export const EMPTY_MESSAGE_QUEUE: MessageQueue = Object.freeze([]) as MessageQueue;

export function createQueuedMessageId(): string {
  const cryptoApi = typeof globalThis.crypto !== "undefined" ? globalThis.crypto : null;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return `queued-${cryptoApi.randomUUID()}`;
  }
  return `queued-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function enqueueQueuedMessage(
  queue: MessageQueue,
  text: string,
  options: { id?: string; now?: Date } = {},
): { queue: MessageQueue; item: QueuedMessage | null; refusal: MessageQueueRefusal | null } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { queue, item: null, refusal: "empty" };
  }
  if (queue.length >= MESSAGE_QUEUE_LIMIT) {
    return { queue, item: null, refusal: "full" };
  }
  const item: QueuedMessage = {
    id: options.id ?? createQueuedMessageId(),
    text: trimmed,
    createdAt: (options.now ?? new Date()).toISOString(),
    // A message added to a held queue waits with it: the hold is about the
    // session, not about one row.
    status: isMessageQueueHeld(queue) ? "held" : "queued",
  };
  return { queue: [...queue, item], item, refusal: null };
}

export function removeQueuedMessage(queue: MessageQueue, id: string): MessageQueue {
  const next = queue.filter((item) => item.id !== id);
  return next.length === queue.length ? queue : next;
}

/** Removes the row and hands its text back, so the composer can take it. */
export function editQueuedMessage(
  queue: MessageQueue,
  id: string,
): { queue: MessageQueue; text: string | null } {
  const item = queue.find((entry) => entry.id === id);
  if (!item) {
    return { queue, text: null };
  }
  return { queue: removeQueuedMessage(queue, id), text: item.text };
}

/** Drops the row at ``toIndex`` (its index after the move), for drag and keyboard reorder. */
export function reorderQueuedMessage(queue: MessageQueue, id: string, toIndex: number): MessageQueue {
  const index = queue.findIndex((item) => item.id === id);
  if (index === -1) {
    return queue;
  }
  const target = Math.max(0, Math.min(queue.length - 1, Math.trunc(toIndex)));
  if (target === index) {
    return queue;
  }
  const next = [...queue];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved!);
  return next;
}

export function clearMessageQueue(): MessageQueue {
  return EMPTY_MESSAGE_QUEUE;
}

/** The first row leaves the queue to be sent. */
export function takeNextQueuedMessage(queue: MessageQueue): {
  queue: MessageQueue;
  item: QueuedMessage | null;
} {
  const [first, ...rest] = queue;
  if (!first) {
    return { queue, item: null };
  }
  return { queue: rest, item: { ...first, status: "sending", holdReason: undefined, holdMessage: undefined } };
}

/** Puts a row back at the front, held, after a send could not start. */
export function returnQueuedMessage(
  queue: MessageQueue,
  item: QueuedMessage,
  reason: QueuedMessageHoldReason,
  message?: string,
): MessageQueue {
  return holdMessageQueue([{ ...item, status: "queued" }, ...queue], reason, message);
}

export function holdMessageQueue(
  queue: MessageQueue,
  reason: QueuedMessageHoldReason,
  message?: string,
): MessageQueue {
  if (queue.length === 0) {
    return queue;
  }
  return queue.map((item) => ({
    ...item,
    status: "held" as const,
    holdReason: reason,
    holdMessage: message,
  }));
}

export function releaseMessageQueue(queue: MessageQueue): MessageQueue {
  if (queue.length === 0) {
    return queue;
  }
  return queue.map((item) => ({
    ...item,
    status: "queued" as const,
    holdReason: undefined,
    holdMessage: undefined,
  }));
}

export function isMessageQueueHeld(queue: MessageQueue): boolean {
  return queue[0]?.status === "held";
}

export function getMessageQueueHold(queue: MessageQueue): {
  reason: QueuedMessageHoldReason;
  message: string | undefined;
} | null {
  const first = queue[0];
  if (!first || first.status !== "held" || !first.holdReason) {
    return null;
  }
  return { reason: first.holdReason, message: first.holdMessage };
}

/** The line above the rows, in the user's words (ADR 087 §3). */
export function describeMessageQueueHold(
  reason: QueuedMessageHoldReason,
  agentName: string,
  message?: string,
): string {
  switch (reason) {
    case "stopped":
      return `Held after you stopped ${agentName}.`;
    case "failed":
      return "Held because the last answer failed.";
    case "away":
      return message?.trim() ? message.trim() : "Held while you were in another session.";
    case "blocked":
    case "unavailable":
      return message?.trim() ? `Held: ${message.trim()}` : `Held until ${agentName} can take messages.`;
    default:
      return `Held until ${agentName} can take messages.`;
  }
}

export function describeMessageQueueCount(count: number, agentName: string): string {
  return `${count} queued · will send when ${agentName} finishes`;
}

export const MESSAGE_QUEUE_FULL_TITLE = "The queue is full";
export const MESSAGE_QUEUE_FULL_MESSAGE = "Send or remove a message first.";
export const MESSAGE_QUEUE_RESTORED_MESSAGE = "Held while you were away.";

// --- Storage ------------------------------------------------------------

export function messageQueueStorageKey(sessionId: string): string {
  return `main_sequence_ai.message_queue.${sessionId}`;
}

function resolveStorage(storage?: Storage | null): Storage | null {
  if (storage !== undefined) {
    return storage;
  }
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

const HOLD_REASONS: ReadonlySet<string> = new Set(["stopped", "failed", "away", "blocked", "unavailable"]);

function normalizeStoredItem(value: unknown): QueuedMessage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const id = typeof candidate.id === "string" && candidate.id.trim() ? candidate.id : null;
  const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
  if (!id || !text) {
    return null;
  }
  const createdAt =
    typeof candidate.createdAt === "string" && !Number.isNaN(new Date(candidate.createdAt).getTime())
      ? candidate.createdAt
      : new Date(0).toISOString();
  return { id, text, createdAt, status: "queued" };
}

/**
 * Reads a session's queue back after a reload. The run that was active is
 * gone, so the rows come back held, with a reason the user can act on.
 */
export function readMessageQueue(sessionId: string, storage?: Storage | null): MessageQueue {
  const store = resolveStorage(storage);
  if (!store) {
    return EMPTY_MESSAGE_QUEUE;
  }
  let raw: string | null = null;
  try {
    raw = store.getItem(messageQueueStorageKey(sessionId));
  } catch {
    return EMPTY_MESSAGE_QUEUE;
  }
  if (!raw) {
    return EMPTY_MESSAGE_QUEUE;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_MESSAGE_QUEUE;
  }
  if (!Array.isArray(parsed)) {
    return EMPTY_MESSAGE_QUEUE;
  }
  const items = parsed
    .map(normalizeStoredItem)
    .filter((item): item is QueuedMessage => item !== null)
    .slice(0, MESSAGE_QUEUE_LIMIT);
  return holdMessageQueue(items, "away", MESSAGE_QUEUE_RESTORED_MESSAGE);
}

export function writeMessageQueue(
  sessionId: string,
  queue: MessageQueue,
  storage?: Storage | null,
): void {
  const store = resolveStorage(storage);
  if (!store) {
    return;
  }
  try {
    if (queue.length === 0) {
      store.removeItem(messageQueueStorageKey(sessionId));
      return;
    }
    store.setItem(
      messageQueueStorageKey(sessionId),
      JSON.stringify(queue.map(({ id, text, createdAt }) => ({ id, text, createdAt }))),
    );
  } catch {
    // Storage can be full or blocked; the in-memory queue is the truth.
  }
}

export function rekeyMessageQueue(
  fromSessionId: string,
  toSessionId: string,
  storage?: Storage | null,
): void {
  if (fromSessionId === toSessionId) {
    return;
  }
  const store = resolveStorage(storage);
  if (!store) {
    return;
  }
  try {
    const raw = store.getItem(messageQueueStorageKey(fromSessionId));
    store.removeItem(messageQueueStorageKey(fromSessionId));
    if (raw) {
      store.setItem(messageQueueStorageKey(toSessionId), raw);
    }
  } catch {
    // Same as writeMessageQueue: best-effort persistence.
  }
}
