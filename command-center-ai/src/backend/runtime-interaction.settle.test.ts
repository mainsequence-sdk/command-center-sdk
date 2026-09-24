import { describe, expect, it, vi } from "vitest";

import {
  RUNTIME_INTERACTION_DEADLINE_GRACE_MS,
  RUNTIME_INTERACTION_SETTLE_FALLBACK_MS,
  isRuntimeInteractionOverdue,
  resolveRuntimeInteractionWaitDeadline,
  waitForRuntimeInteractionSettled,
  type AgentRuntimeInteraction,
  type AgentRuntimePresence,
} from "./runtime-interaction.js";

function interaction(
  state: AgentRuntimeInteraction["state"],
  canSubmit = state === "ready",
): AgentRuntimeInteraction {
  return {
    state,
    canSubmit,
    notice: null,
    operation: null,
    retryAfterMs: null,
  };
}

function presence(deadlineAt: string | null): AgentRuntimePresence {
  return {
    phase: "provisioning",
    replicas: { desired: 1, actual: 0 },
    detail: "Waiting for a machine to become available.",
    observedAt: null,
    wake: deadlineAt
      ? {
          operationUid: "op-1",
          state: "in_progress",
          requestedAt: new Date(Date.parse(deadlineAt) - 600_000).toISOString(),
          deadlineAt,
        }
      : null,
  };
}

describe("resolveRuntimeInteractionWaitDeadline", () => {
  it("adds the grace to the backend wake deadline", () => {
    const deadlineAt = "2026-09-03T12:00:00.000Z";
    expect(resolveRuntimeInteractionWaitDeadline(presence(deadlineAt), 0)).toBe(
      Date.parse(deadlineAt) + RUNTIME_INTERACTION_DEADLINE_GRACE_MS,
    );
  });

  it("falls back to a bounded wait when the backend gave no deadline", () => {
    expect(resolveRuntimeInteractionWaitDeadline(presence(null), 1_000)).toBe(
      1_000 + RUNTIME_INTERACTION_SETTLE_FALLBACK_MS,
    );
    expect(resolveRuntimeInteractionWaitDeadline(null, 1_000)).toBe(
      1_000 + RUNTIME_INTERACTION_SETTLE_FALLBACK_MS,
    );
  });
});

describe("isRuntimeInteractionOverdue", () => {
  const deadlineAt = "2026-09-03T12:00:00.000Z";
  const deadline = Date.parse(deadlineAt);

  it("is false while the wake is inside its deadline plus grace", () => {
    expect(isRuntimeInteractionOverdue(interaction("waking"), presence(deadlineAt), deadline)).toBe(
      false,
    );
    expect(
      isRuntimeInteractionOverdue(
        interaction("waking"),
        presence(deadlineAt),
        deadline + RUNTIME_INTERACTION_DEADLINE_GRACE_MS,
      ),
    ).toBe(false);
  });

  it("is true once a transient decision outlives the deadline plus grace", () => {
    expect(
      isRuntimeInteractionOverdue(
        interaction("waking"),
        presence(deadlineAt),
        deadline + RUNTIME_INTERACTION_DEADLINE_GRACE_MS + 1,
      ),
    ).toBe(true);
  });

  it("never applies to a settled decision or without a wake", () => {
    expect(
      isRuntimeInteractionOverdue(interaction("ready"), presence(deadlineAt), deadline + 60_000),
    ).toBe(false);
    expect(isRuntimeInteractionOverdue(interaction("waking"), presence(null), deadline + 60_000)).toBe(
      false,
    );
  });
});

describe("waitForRuntimeInteractionSettled", () => {
  it("resolves with the settled decision once the poller sees it", async () => {
    vi.useFakeTimers();
    try {
      let current: AgentRuntimeInteraction = interaction("waking", false);
      const wait = waitForRuntimeInteractionSettled({
        deadlineMs: Date.now() + 60_000,
        pollIntervalMs: 100,
        readInteraction: () => current,
      });
      await vi.advanceTimersByTimeAsync(250);
      current = interaction("ready");
      await vi.advanceTimersByTimeAsync(100);
      await expect(wait).resolves.toEqual(interaction("ready"));
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns null past the deadline while still transient", async () => {
    vi.useFakeTimers();
    try {
      const wait = waitForRuntimeInteractionSettled({
        deadlineMs: Date.now() + 250,
        pollIntervalMs: 100,
        readInteraction: () => interaction("waking", false),
      });
      await vi.advanceTimersByTimeAsync(400);
      await expect(wait).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns null when the run is aborted", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const wait = waitForRuntimeInteractionSettled({
        deadlineMs: Date.now() + 60_000,
        pollIntervalMs: 100,
        readInteraction: () => interaction("waking", false),
        signal: controller.signal,
      });
      await vi.advanceTimersByTimeAsync(50);
      controller.abort();
      await vi.advanceTimersByTimeAsync(100);
      await expect(wait).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns a terminal blocked decision instead of waiting on it", async () => {
    const blocked = interaction("unavailable", false);
    await expect(
      waitForRuntimeInteractionSettled({
        deadlineMs: Date.now() + 60_000,
        pollIntervalMs: 10,
        readInteraction: () => blocked,
      }),
    ).resolves.toEqual(blocked);
  });
});
