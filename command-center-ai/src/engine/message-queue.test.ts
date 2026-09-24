import { describe, expect, it } from "vitest";

import {
  MESSAGE_QUEUE_LIMIT,
  describeMessageQueueHold,
  editQueuedMessage,
  enqueueQueuedMessage,
  getMessageQueueHold,
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
} from "./message-queue.js";

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(index: number) {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

function queueOf(...texts: string[]): MessageQueue {
  let queue: MessageQueue = [];
  texts.forEach((text, index) => {
    queue = enqueueQueuedMessage(queue, text, { id: `m${index + 1}`, now: new Date(index * 1000) }).queue;
  });
  return queue;
}

describe("message queue reducer", () => {
  it("enqueues trimmed text in order and refuses empty text", () => {
    const first = enqueueQueuedMessage([], "  hello  ", { id: "a", now: new Date(0) });
    expect(first.item).toEqual({ id: "a", text: "hello", createdAt: new Date(0).toISOString(), status: "queued" });
    const second = enqueueQueuedMessage(first.queue, "world", { id: "b" });
    expect(second.queue.map((item) => item.text)).toEqual(["hello", "world"]);
    const empty = enqueueQueuedMessage(second.queue, "   ");
    expect(empty.refusal).toBe("empty");
    expect(empty.queue).toBe(second.queue);
  });

  it("refuses the eleventh message", () => {
    const queue = queueOf(...Array.from({ length: MESSAGE_QUEUE_LIMIT }, (_, index) => `m${index}`));
    const result = enqueueQueuedMessage(queue, "one more");
    expect(result.refusal).toBe("full");
    expect(result.queue).toHaveLength(MESSAGE_QUEUE_LIMIT);
  });

  it("removes, edits and clears", () => {
    const queue = queueOf("one", "two", "three");
    expect(removeQueuedMessage(queue, "m2").map((item) => item.text)).toEqual(["one", "three"]);
    expect(removeQueuedMessage(queue, "missing")).toBe(queue);
    const edited = editQueuedMessage(queue, "m3");
    expect(edited.text).toBe("three");
    expect(edited.queue.map((item) => item.id)).toEqual(["m1", "m2"]);
    expect(editQueuedMessage(queue, "missing")).toEqual({ queue, text: null });
  });

  it("reorders a row to a target index and clamps to the ends", () => {
    const queue = queueOf("one", "two", "three");
    expect(reorderQueuedMessage(queue, "m3", 0).map((item) => item.id)).toEqual(["m3", "m1", "m2"]);
    expect(reorderQueuedMessage(queue, "m1", 2).map((item) => item.id)).toEqual(["m2", "m3", "m1"]);
    expect(reorderQueuedMessage(queue, "m2", 0).map((item) => item.id)).toEqual(["m2", "m1", "m3"]);
    expect(reorderQueuedMessage(queue, "m1", 99).map((item) => item.id)).toEqual(["m2", "m3", "m1"]);
    expect(reorderQueuedMessage(queue, "m3", -5).map((item) => item.id)).toEqual(["m3", "m1", "m2"]);
    expect(reorderQueuedMessage(queue, "m2", 1)).toBe(queue);
    expect(reorderQueuedMessage(queue, "missing", 0)).toBe(queue);
  });

  it("takes the first row, marked as sending", () => {
    const queue = queueOf("one", "two");
    const next = takeNextQueuedMessage(queue);
    expect(next.item).toMatchObject({ id: "m1", status: "sending" });
    expect(next.queue.map((item) => item.id)).toEqual(["m2"]);
    expect(takeNextQueuedMessage([])).toEqual({ queue: [], item: null });
  });

  it("holds every row with the reason on each, releases them, and returns a failed send to the front", () => {
    const queue = queueOf("one", "two");
    const held = holdMessageQueue(queue, "stopped");
    expect(isMessageQueueHeld(held)).toBe(true);
    expect(held.every((item) => item.status === "held" && item.holdReason === "stopped")).toBe(true);
    expect(getMessageQueueHold(held)).toEqual({ reason: "stopped", message: undefined });
    const released = releaseMessageQueue(held);
    expect(released.every((item) => item.status === "queued" && item.holdReason === undefined)).toBe(true);
    const taken = takeNextQueuedMessage(released);
    const returned = returnQueuedMessage(taken.queue, taken.item!, "unavailable", "Session is still loading.");
    expect(returned.map((item) => item.id)).toEqual(["m1", "m2"]);
    expect(getMessageQueueHold(returned)).toEqual({ reason: "unavailable", message: "Session is still loading." });
    // A message added to a held queue waits with it.
    expect(enqueueQueuedMessage(held, "three").item?.status).toBe("held");
  });

  it("describes holds in the user's words", () => {
    expect(describeMessageQueueHold("stopped", "the Agent")).toBe("Held after you stopped the Agent.");
    expect(describeMessageQueueHold("failed", "the Agent")).toBe("Held because the last answer failed.");
    expect(describeMessageQueueHold("away", "the Agent")).toBe("Held while you were in another session.");
    expect(describeMessageQueueHold("blocked", "the Agent", "The agent cannot take a new message right now.")).toBe(
      "Held: The agent cannot take a new message right now.",
    );
    expect(describeMessageQueueHold("unavailable", "the Agent")).toBe("Held until the Agent can take messages.");
  });
});

describe("message queue storage", () => {
  it("round-trips a queue and restores it held", () => {
    const storage = new MemoryStorage();
    const queue = queueOf("one", "two");
    writeMessageQueue("s1", queue, storage);
    const restored = readMessageQueue("s1", storage);
    expect(restored.map((item) => item.text)).toEqual(["one", "two"]);
    expect(getMessageQueueHold(restored)).toEqual({ reason: "away", message: "Held while you were away." });
    writeMessageQueue("s1", [], storage);
    expect(storage.getItem("main_sequence_ai.message_queue.s1")).toBeNull();
  });

  it("ignores malformed or invalid stored values", () => {
    const storage = new MemoryStorage();
    storage.setItem("main_sequence_ai.message_queue.s1", "{not json");
    expect(readMessageQueue("s1", storage)).toEqual([]);
    storage.setItem("main_sequence_ai.message_queue.s1", JSON.stringify([{ id: "", text: "x" }, { id: "ok", text: " kept " }, 7]));
    expect(readMessageQueue("s1", storage).map((item) => item.text)).toEqual(["kept"]);
    expect(readMessageQueue("s1", null)).toEqual([]);
  });

  it("re-keys a queue when a session is promoted", () => {
    const storage = new MemoryStorage();
    writeMessageQueue("local-1", queueOf("one"), storage);
    rekeyMessageQueue("local-1", "backend-9", storage);
    expect(storage.getItem("main_sequence_ai.message_queue.local-1")).toBeNull();
    expect(readMessageQueue("backend-9", storage).map((item) => item.text)).toEqual(["one"]);
  });
});
