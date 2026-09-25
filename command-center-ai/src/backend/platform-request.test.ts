import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createChatBackendConnection } from "./connection.js";
import { requestPlatform } from "./platform-request.js";

const apiBaseUrl = "https://api.platform.test";
const url = `${apiBaseUrl}/api/v1/agent-sessions/`;

describe("requestPlatform", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("without a sender, sends the request itself with the caller's credential", async () => {
    const connection = createChatBackendConnection({ apiBaseUrl });

    await requestPlatform(connection, url, {
      method: "GET",
      headers: { Authorization: "Bearer caller-token" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0]!;
    expect(input).toBe(url);
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer caller-token");
  });

  it("with a sender, hands it the request without any credential and uses its answer", async () => {
    const received: Request[] = [];
    const connection = createChatBackendConnection({
      apiBaseUrl,
      sendPlatformRequest: async (request) => {
        received.push(request);
        return new Response('{"ok":true}', { status: 201 });
      },
    });

    const response = await requestPlatform(connection, url, {
      method: "POST",
      headers: { Accept: "application/json", Authorization: "Bearer caller-token" },
      body: '{"name":"report"}',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(received).toHaveLength(1);
    const [request] = received;
    expect(request!.url).toBe(url);
    expect(request!.method).toBe("POST");
    expect(request!.headers.get("Accept")).toBe("application/json");
    expect(request!.headers.get("Authorization")).toBeNull();
    expect(await request!.text()).toBe('{"name":"report"}');
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("returns a refusal as it comes: renewing the credential is the application's", async () => {
    const send = vi.fn(async () => new Response(null, { status: 401 }));
    const connection = createChatBackendConnection({ apiBaseUrl, sendPlatformRequest: send });

    const response = await requestPlatform(connection, url);

    expect(response.status).toBe(401);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("passes the caller's signal with the request", async () => {
    const controller = new AbortController();
    let signal: AbortSignal | null = null;
    const connection = createChatBackendConnection({
      apiBaseUrl,
      sendPlatformRequest: async (request) => {
        signal = request.signal;
        return new Response("{}");
      },
    });

    await requestPlatform(connection, url, { signal: controller.signal });
    controller.abort();

    expect(signal).not.toBeNull();
    expect((signal as unknown as AbortSignal).aborted).toBe(true);
  });

  it("resolves an address on the page's own origin before building the request", async () => {
    vi.stubGlobal("location", { href: "https://app.test/chat" });
    const received: Request[] = [];
    const connection = createChatBackendConnection({
      apiBaseUrl,
      rewriteRequestUrl: (target) => `/__platform__${target.pathname}`,
      sendPlatformRequest: async (request) => {
        received.push(request);
        return new Response("{}");
      },
    });

    await requestPlatform(connection, "/__platform__/api/v1/agent-sessions/");

    expect(received[0]!.url).toBe("https://app.test/__platform__/api/v1/agent-sessions/");
  });
});
