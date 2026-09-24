import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AGENT_RUNTIME_FIRST_CHECK_TIMEOUT_MS,
  AGENT_RUNTIME_SERVING_MEMO_MS,
  AGENT_RUNTIME_WAKE_DEADLINE_MS,
  AGENT_RUNTIME_WAKING_CHECK_TIMEOUT_MS,
  buildClientCheckingRuntimeInteraction,
  buildClientWakingRuntimeState,
  forgetAgentRuntimeServing,
  probeAgentRuntimeServing,
  resetAgentRuntimeServingState,
  verifyAgentRuntimeServing,
} from "./agent-runtime-serving.js";
import { isTransientRuntimeInteraction } from "./runtime-interaction.js";
import { createChatBackendConnection } from "./connection.js";

const connection = createChatBackendConnection({ apiBaseUrl: "http://localhost:8000" });

const url = "https://agent-runtime.example.test/api/chat";
const token = "runtime-token";

function answering(status: number) {
  return vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));
}

describe("agent runtime serving probe", () => {
  it.each([200, 401, 403, 404, 405, 500])("counts HTTP %i as an Agent that answers", async (status) => {
    await expect(
      probeAgentRuntimeServing({ connection, fetchImpl: answering(status), timeoutMs: 1_000, token, url }),
    ).resolves.toBe(true);
  });

  it.each([502, 503, 504])("counts HTTP %i as an Agent that is not up", async (status) => {
    await expect(
      probeAgentRuntimeServing({ connection, fetchImpl: answering(status), timeoutMs: 1_000, token, url }),
    ).resolves.toBe(false);
  });

  it("counts a network failure as an Agent that is not up", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(probeAgentRuntimeServing({ connection, fetchImpl, timeoutMs: 1_000, token, url })).resolves.toBe(
      false,
    );
  });

  it("asks the Agent's own route with the runtime token", async () => {
    const fetchImpl = answering(200);

    await probeAgentRuntimeServing({ connection, fetchImpl, timeoutMs: 1_000, token, url });

    const [requestUrl, init] = fetchImpl.mock.calls[0] ?? [];
    expect(requestUrl).toBe(url);
    expect(init?.method).toBe("GET");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer runtime-token");
  });

  it("gives up after the timeout and reports the Agent as not up", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          }),
      );
      const result = probeAgentRuntimeServing({ connection, fetchImpl, timeoutMs: 3_000, token, url });
      await vi.advanceTimersByTimeAsync(3_000);

      await expect(result).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects when the caller aborts, so an abandoned check changes nothing", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const result = probeAgentRuntimeServing({
      connection,
      fetchImpl,
      signal: controller.signal,
      timeoutMs: 60_000,
      token,
      url,
    });
    controller.abort();

    await expect(result).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("agent runtime serving verification", () => {
  beforeEach(() => {
    resetAgentRuntimeServingState();
  });

  it("remembers an Agent that answered, so one send costs at most one check", async () => {
    let clock = 1_000_000;
    const fetchImpl = answering(200);
    const verify = () => verifyAgentRuntimeServing({ connection, fetchImpl, now: () => clock, token, url });

    await expect(verify()).resolves.toEqual({ serving: true, wakeStartedAt: null });
    clock += AGENT_RUNTIME_SERVING_MEMO_MS - 1;
    await verify();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    clock += 2;
    await verify();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("keeps one wake clock across failed checks and clears it when the Agent answers", async () => {
    let clock = 2_000_000;
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValue(new Response(null, { status: 200 }));
    const verify = () => verifyAgentRuntimeServing({ connection, fetchImpl, now: () => clock, token, url });

    await expect(verify()).resolves.toEqual({ serving: false, wakeStartedAt: 2_000_000 });
    clock += 30_000;
    await expect(verify()).resolves.toEqual({ serving: false, wakeStartedAt: 2_000_000 });
    clock += 30_000;
    await expect(verify()).resolves.toEqual({ serving: true, wakeStartedAt: null });

    // A later idle period starts a new clock, not the old one.
    forgetAgentRuntimeServing(url);
    fetchImpl.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    clock += 3_600_000;
    await expect(verify()).resolves.toEqual({ serving: false, wakeStartedAt: clock });
  });

  it("answers fast on the first check and waits for the Agent on the following ones", async () => {
    vi.useFakeTimers();
    try {
      const timeouts: number[] = [];
      const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
        const startedAt = Date.now();
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            timeouts.push(Date.now() - startedAt);
            reject(new DOMException("aborted", "AbortError"));
          });
        });
      });

      const first = verifyAgentRuntimeServing({ connection, fetchImpl, token, url });
      await vi.advanceTimersByTimeAsync(AGENT_RUNTIME_FIRST_CHECK_TIMEOUT_MS);
      await first;
      const second = verifyAgentRuntimeServing({ connection, fetchImpl, token, url });
      await vi.advanceTimersByTimeAsync(AGENT_RUNTIME_WAKING_CHECK_TIMEOUT_MS);
      await second;

      expect(timeouts).toEqual([
        AGENT_RUNTIME_FIRST_CHECK_TIMEOUT_MS,
        AGENT_RUNTIME_WAKING_CHECK_TIMEOUT_MS,
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops trusting the last answer after a request to the Agent failed", async () => {
    const fetchImpl = answering(200);
    await verifyAgentRuntimeServing({ connection, fetchImpl, token, url });

    forgetAgentRuntimeServing(url);
    await verifyAgentRuntimeServing({ connection, fetchImpl, token, url });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("client-built runtime decisions", () => {
  it("builds a waking decision that names the Agent and carries the wake clock", () => {
    const wakeStartedAt = Date.parse("2026-09-17T15:00:00Z");
    const { runtimeInteraction, runtimePresence } = buildClientWakingRuntimeState({
      agentName: "Research Planner",
      now: wakeStartedAt + 42_000,
      wakeStartedAt,
    });

    expect(runtimeInteraction.state).toBe("waking");
    expect(runtimeInteraction.canSubmit).toBe(false);
    expect(isTransientRuntimeInteraction(runtimeInteraction)).toBe(true);
    expect(runtimeInteraction.notice?.title).toBe("Starting Research Planner");
    expect(runtimeInteraction.notice?.message).toContain("Research Planner was idle");
    expect(runtimePresence.wake).toMatchObject({
      state: "in_progress",
      requestedAt: "2026-09-17T15:00:00.000Z",
      deadlineAt: new Date(wakeStartedAt + AGENT_RUNTIME_WAKE_DEADLINE_MS).toISOString(),
    });
    // Same text as the notice, so the status lines do not repeat it.
    expect(runtimePresence.detail).toBe(runtimeInteraction.notice?.message);
  });

  it("never names the architecture in what the person reads", () => {
    const { runtimeInteraction } = buildClientWakingRuntimeState({ wakeStartedAt: Date.now() });
    const copy = `${runtimeInteraction.notice?.title} ${runtimeInteraction.notice?.message}`;

    expect(copy).not.toMatch(/runtime|backend|server/i);
  });

  it("locks silently for the first check and says why once a check has failed", () => {
    const silent = buildClientCheckingRuntimeInteraction();
    expect(silent).toMatchObject({ state: "checking", canSubmit: false, notice: null });

    const retrying = buildClientCheckingRuntimeInteraction({
      agentName: "Research Planner",
      retrying: true,
    });
    expect(retrying.notice?.message).toBe(
      "Could not confirm that Research Planner is ready. Trying again.",
    );
  });
});
