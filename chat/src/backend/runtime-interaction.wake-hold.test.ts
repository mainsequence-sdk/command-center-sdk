import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RuntimeInteractionBlockedError,
  requestThroughRuntimeWake,
  type AgentRuntimeInteraction,
  type AgentRuntimePresence,
} from "./runtime-interaction.js";

function interaction(
  state: AgentRuntimeInteraction["state"],
  message: string | null = null,
): AgentRuntimeInteraction {
  return {
    state,
    canSubmit: state === "ready",
    notice: message
      ? { code: `runtime_${state}`, severity: "info", title: "Starting", message }
      : null,
    operation: null,
    retryAfterMs: state === "waking" ? 2_000 : null,
  };
}

function presence(deadlineInMs = 600_000): AgentRuntimePresence {
  return {
    phase: "observing",
    replicas: { desired: 0, actual: 0 },
    detail: "Checking that Research Planner is ready.",
    observedAt: null,
    wake: {
      operationUid: "op-1",
      state: "in_progress",
      requestedAt: new Date(Date.now()).toISOString(),
      deadlineAt: new Date(Date.now() + deadlineInMs).toISOString(),
    },
  };
}

const waking = () =>
  new RuntimeInteractionBlockedError(
    interaction("waking", "Checking that Research Planner is ready."),
    presence(),
  );

describe("holding a message while the Agent starts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not take the older ready decision the composer was opened on for the end of the wait", async () => {
    // What the surface believed before the send: ready, from a while ago.
    let decision: AgentRuntimeInteraction | null = interaction("ready");
    const request = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(waking())
      .mockResolvedValue("delivered");

    const result = requestThroughRuntimeWake({
      onBlocked: (error) => {
        decision = error.runtimeInteraction;
      },
      readInteraction: () => decision,
      request,
    });
    await vi.advanceTimersByTimeAsync(3_000);
    // Still held: the Agent has not been confirmed since the block.
    expect(request).toHaveBeenCalledTimes(1);

    decision = interaction("ready");
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(result).resolves.toBe("delivered");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("keeps holding when the platform says starting a second time", async () => {
    let decision: AgentRuntimeInteraction | null = null;
    const request = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(waking())
      .mockRejectedValueOnce(waking())
      .mockResolvedValue("delivered");
    const blocked: string[] = [];

    const result = requestThroughRuntimeWake({
      onBlocked: (error) => {
        blocked.push(error.runtimeInteraction.state);
        decision = error.runtimeInteraction;
      },
      readInteraction: () => decision,
      request,
    });
    await vi.advanceTimersByTimeAsync(1_000);
    decision = interaction("ready");
    await vi.advanceTimersByTimeAsync(1_000);
    // The retry was blocked again; nothing surfaced, the message is still held.
    expect(request).toHaveBeenCalledTimes(2);
    expect(blocked).toEqual(["waking", "waking"]);

    decision = interaction("ready");
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(result).resolves.toBe("delivered");
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("fails as not sent, in the notice's words, when the Agent ends up unavailable", async () => {
    let decision: AgentRuntimeInteraction | null = null;
    const request = vi.fn<() => Promise<string>>().mockRejectedValue(waking());

    const result = requestThroughRuntimeWake({
      onBlocked: (error) => {
        decision = error.runtimeInteraction;
      },
      readInteraction: () => decision,
      request,
    });
    const assertion = expect(result).rejects.toMatchObject({
      code: "runtime_request_not_sent",
      source: "frontend_request_not_sent",
      rawMessage:
        "Research Planner could not be started. Your message was not sent; send it again when the agent is ready.",
    });
    await vi.advanceTimersByTimeAsync(1_000);
    decision = interaction("unavailable", "Research Planner could not be started.");
    await vi.advanceTimersByTimeAsync(1_000);

    await assertion;
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("gives up as not sent once the start outlives its deadline", async () => {
    let decision: AgentRuntimeInteraction | null = null;
    const blockedWithShortDeadline = new RuntimeInteractionBlockedError(
      interaction("waking", "Checking that Research Planner is ready."),
      presence(60_000),
    );
    const request = vi.fn<() => Promise<string>>().mockRejectedValue(blockedWithShortDeadline);

    const result = requestThroughRuntimeWake({
      onBlocked: (error) => {
        decision = error.runtimeInteraction;
      },
      readInteraction: () => decision,
      request,
    });
    const assertion = expect(result).rejects.toMatchObject({ code: "runtime_request_not_sent" });
    // Deadline plus the client's grace.
    await vi.advanceTimersByTimeAsync(60_000 + 31_000);

    await assertion;
  });

  it("surfaces a terminal first answer as it is and never holds for it", async () => {
    const terminal = new RuntimeInteractionBlockedError(
      interaction("unavailable", "Research Planner is not available."),
      presence(),
    );
    const request = vi.fn<() => Promise<string>>().mockRejectedValue(terminal);
    const onBlocked = vi.fn();

    await expect(
      requestThroughRuntimeWake({ onBlocked, readInteraction: () => null, request }),
    ).rejects.toBe(terminal);
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("passes every other failure through untouched", async () => {
    const failure = new Error("network unavailable");
    const request = vi.fn<() => Promise<string>>().mockRejectedValue(failure);

    await expect(
      requestThroughRuntimeWake({
        onBlocked: vi.fn(),
        readInteraction: () => null,
        request,
      }),
    ).rejects.toBe(failure);
  });
});
