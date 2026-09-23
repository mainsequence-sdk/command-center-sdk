import { describe, expect, it, vi } from "vitest";

import { AgentSessionModelRequiredError } from "../backend/agent-sessions-api.js";
import {
  SessionModelSelectionCancelledError,
  createFreshSessionHandleId,
  createSessionWithModelFallback,
} from "./session-model-fallback.js";

const modelRequired = () =>
  new AgentSessionModelRequiredError("llm_provider: This field is required.", {
    agentLookupId: "agent-1",
    missing: { provider: true, model: true },
  });

describe("createSessionWithModelFallback", () => {
  it("does not ask for a model when creation succeeds", async () => {
    const requestModel = vi.fn();
    const retryWithModel = vi.fn();
    const result = await createSessionWithModelFallback({
      attempt: async () => "session-1",
      requestModel,
      retryWithModel,
    });
    expect(result).toBe("session-1");
    expect(requestModel).not.toHaveBeenCalled();
    expect(retryWithModel).not.toHaveBeenCalled();
  });

  it("asks for a model on the model-required refusal and creates again with it", async () => {
    const requestModel = vi.fn(async () => ({ provider: "openai-codex", model: "gpt-5.5" }));
    const retryWithModel = vi.fn(async () => "session-2");
    const result = await createSessionWithModelFallback({
      attempt: async () => {
        throw modelRequired();
      },
      requestModel,
      retryWithModel,
    });
    expect(result).toBe("session-2");
    expect(requestModel).toHaveBeenCalledTimes(1);
    expect(retryWithModel).toHaveBeenCalledWith({ provider: "openai-codex", model: "gpt-5.5" });
  });

  it("passes every other failure through without asking", async () => {
    const requestModel = vi.fn();
    await expect(
      createSessionWithModelFallback({
        attempt: async () => {
          throw new Error("Not found");
        },
        requestModel,
        retryWithModel: vi.fn(),
      }),
    ).rejects.toThrow("Not found");
    expect(requestModel).not.toHaveBeenCalled();
  });

  it("rejects when the person cancels, and does not loop when the second attempt is refused too", async () => {
    await expect(
      createSessionWithModelFallback({
        attempt: async () => {
          throw modelRequired();
        },
        requestModel: async () => {
          throw new SessionModelSelectionCancelledError();
        },
        retryWithModel: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(SessionModelSelectionCancelledError);

    const requestModel = vi.fn(async () => ({ provider: "p", model: "m" }));
    await expect(
      createSessionWithModelFallback({
        attempt: async () => {
          throw modelRequired();
        },
        requestModel,
        retryWithModel: async () => {
          throw modelRequired();
        },
      }),
    ).rejects.toBeInstanceOf(AgentSessionModelRequiredError);
    expect(requestModel).toHaveBeenCalledTimes(1);
  });
});

describe("createFreshSessionHandleId", () => {
  it("is slug-safe, short and different for different moments", () => {
    const first = createFreshSessionHandleId(1_790_000_000_000, () => 0.123456);
    const second = createFreshSessionHandleId(1_790_000_000_001, () => 0.654321);
    expect(first).toMatch(/^[-a-zA-Z0-9_]+$/);
    expect(first.length).toBeLessThan(40);
    expect(first).not.toBe(second);
    expect(first.startsWith("cc-session-")).toBe(true);
  });
});
