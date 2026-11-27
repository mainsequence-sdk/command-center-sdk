import { describe, expect, it } from "vitest";

import {
  isTransientRuntimeInteraction,
  normalizeAgentRuntimeInteraction,
  RuntimeInteractionBlockedError,
} from "./runtime-interaction.js";

describe("runtime interaction contract", () => {
  it("normalizes the backend-owned snake_case envelope", () => {
    const interaction = normalizeAgentRuntimeInteraction({
      state: "update_required",
      can_submit: false,
      notice: {
        code: "agent_runtime_update_required",
        severity: "warning",
        title: "Agent update required",
        message: "This agent must be redeployed before it can take messages.",
      },
      operation: {
        uid: "run-uid-91",
        status: "queued",
        created_at: "2026-09-02T12:00:00Z",
        started_at: null,
        finished_at: null,
        support_reference: "runtime-update:run-uid-91",
      },
      retry_after_ms: 2_000,
    });

    expect(interaction).toEqual({
      state: "update_required",
      canSubmit: false,
      notice: {
        code: "agent_runtime_update_required",
        severity: "warning",
        title: "Agent update required",
        message: "This agent must be redeployed before it can take messages.",
      },
      operation: {
        uid: "run-uid-91",
        status: "queued",
        createdAt: "2026-09-02T12:00:00Z",
        startedAt: null,
        finishedAt: null,
        supportReference: "runtime-update:run-uid-91",
      },
      retryAfterMs: 2_000,
    });
  });

  it("rejects unknown states instead of inventing frontend policy", () => {
    expect(
      normalizeAgentRuntimeInteraction({ state: "frontend_guess", can_submit: false }),
    ).toBeNull();
  });

  it.each(["checking", "starting", "waking", "updating"])("polls %s without a retry hint", (state) => {
    expect(
      isTransientRuntimeInteraction(
        normalizeAgentRuntimeInteraction({ state, can_submit: false }),
      ),
    ).toBe(true);
  });

  it.each([
    { state: "unavailable", canSubmit: false, delay: 2_000, transient: true },
    { state: "unavailable", canSubmit: false, delay: null, transient: false },
    { state: "unavailable", canSubmit: false, delay: Infinity, transient: false },
    { state: "update_required", canSubmit: false, delay: 2_000, transient: true },
    { state: "update_required", canSubmit: false, delay: null, transient: false },
    { state: "ready", canSubmit: true, delay: 2_000, transient: false },
  ])("classifies $state with canSubmit=$canSubmit and retryAfterMs=$delay", ({ state, canSubmit, delay, transient }) => {
    expect(
      isTransientRuntimeInteraction(
        normalizeAgentRuntimeInteraction({ state, can_submit: canSubmit, retry_after_ms: delay }),
      ),
    ).toBe(transient);
  });

  it("labels runtime admission failures as requests that were never sent", () => {
    const error = new RuntimeInteractionBlockedError(
      {
        state: "waking",
        canSubmit: false,
        notice: null,
        operation: null,
        retryAfterMs: 1_000,
      },
      {
        phase: "starting",
        replicas: { desired: 1, actual: 0 },
        detail: "Runtime is starting.",
        observedAt: null,
        wake: null,
      },
    );

    expect(error.source).toBe("frontend_request_not_sent");
    expect(error.message).toContain("Request was never sent");
    expect(error.message).not.toContain("Sending to the Agent");
  });
});
