import { describe, expect, it, vi } from "vitest";

import {
  buildStaticSiteFastApiCredentialErrorMessage,
  buildStaticSiteFastApiCredentialRequestMessage,
  buildStaticSiteFastApiCredentialResponseMessage,
  buildStaticSiteFastApiWebSocketTicketCancelMessage,
  buildStaticSiteFastApiWebSocketTicketErrorMessage,
  buildStaticSiteFastApiWebSocketTicketRequestMessage,
  buildStaticSiteFastApiWebSocketTicketResponseMessage,
  buildStaticSiteIframeInitializeMessage,
  buildStaticSiteIframeReadyMessage,
  createStaticSiteIframeClient,
  createStaticSiteIframeHost,
  StaticSiteFastApiCredentialError,
  StaticSiteFastApiWebSocketError,
  STATIC_SITE_FAST_API_WEBSOCKET_ACK_PROTOCOL,
  readStaticSiteIframeContext,
  readStaticSiteFastApiCredentialRequestMessage,
  readStaticSiteFastApiCredentialErrorMessage,
  readStaticSiteFastApiCredentialResponseMessage,
  readStaticSiteFastApiWebSocketTicketCancelMessage,
  readStaticSiteFastApiWebSocketTicketErrorMessage,
  readStaticSiteFastApiWebSocketTicketRequestMessage,
  readStaticSiteFastApiWebSocketTicketResponseMessage,
  readStaticSiteIframeInitializeMessage,
  readStaticSiteIframeReadyMessage,
  resolveStaticSiteIframeOrigin,
} from "./static-site";

const channel = "mainsequence.fund-competition" as const;
const targetUid = "11111111-1111-4111-8111-111111111111";
const credential = {
  resourceReleaseUid: targetUid,
  rpcUrl: "https://fastapi.example.com/",
  token: "delegated-token",
  expiresAt: "2099-08-18T12:05:00Z",
};
const webSocketTicket = {
  resourceReleaseUid: targetUid,
  origin: "https://site.example.com",
  path: "/ws/orders",
  websocketUrl: "wss://fastapi.example.com/ws/orders",
  subprotocol: `mainsequence.ws-ticket.${"a".repeat(32)}`,
  expiresAt: "2099-09-13T12:02:00Z",
};

describe("static-site iframe protocol", () => {
  it("preserves the version-one ready and initialize message shapes", () => {
    expect(buildStaticSiteIframeReadyMessage(channel)).toEqual({
      channel,
      version: 1,
      type: "ready",
      payload: {},
    });

    const initialized = buildStaticSiteIframeInitializeMessage({
      channel,
      context: {
        themeId: "main-sequence-space",
        themeMode: "dark",
        userUid: "user-public-uid",
      },
    });
    expect(initialized).toEqual({
      channel,
      version: 1,
      type: "initialize",
      payload: {
        theme: "dark",
        themeId: "main-sequence-space",
        user: {
          id: "user-public-uid",
          uid: "user-public-uid",
          user_uid: "user-public-uid",
        },
      },
    });
    expect(readStaticSiteIframeContext(initialized)).toEqual({
      themeId: "main-sequence-space",
      themeMode: "dark",
      userUid: "user-public-uid",
    });
  });

  it("accepts legacy ready messages without a payload and rejects invalid channels and versions", () => {
    expect(
      readStaticSiteIframeReadyMessage({ channel, version: 1, type: "ready" }),
    ).toEqual({ channel, version: 1, type: "ready", payload: {} });
    expect(readStaticSiteIframeReadyMessage({ channel: "mainsequence.", version: 1, type: "ready" }))
      .toBeNull();
    expect(readStaticSiteIframeReadyMessage({ channel, version: 2, type: "ready" })).toBeNull();
  });

  it("validates and normalizes initialize messages", () => {
    const message = readStaticSiteIframeInitializeMessage(
      {
        channel,
        version: 1,
        type: "initialize",
        payload: {
          theme: "light",
          themeId: " quartz-light ",
          user: { user_uid: " user-1 " },
        },
      },
      channel,
    );
    expect(message?.payload).toEqual({
      theme: "light",
      themeId: "quartz-light",
      user: { id: "user-1", uid: "user-1", user_uid: "user-1" },
    });
    expect(
      readStaticSiteIframeInitializeMessage(
        {
          channel,
          version: 1,
          type: "initialize",
          payload: { theme: "auto", themeId: "quartz-light", user: null },
        },
        channel,
      ),
    ).toBeNull();
  });

  it("resolves only HTTP and HTTPS iframe origins", () => {
    expect(
      resolveStaticSiteIframeOrigin(
        "https://site.example.com/.mainsequence/launch#token=one-use-token",
      ),
    ).toBe("https://site.example.com");
    expect(resolveStaticSiteIframeOrigin("http://localhost:4173/app")).toBe(
      "http://localhost:4173",
    );
    expect(() => resolveStaticSiteIframeOrigin("javascript:alert(1)")).toThrow("HTTP or HTTPS");
  });

  it("strictly parses the additive credential message shapes", () => {
    const request = buildStaticSiteFastApiCredentialRequestMessage({
      channel,
      requestId: "request-1",
      resourceReleaseUid: targetUid,
    });
    expect(readStaticSiteFastApiCredentialRequestMessage(request, channel)).toEqual(request);

    const response = buildStaticSiteFastApiCredentialResponseMessage({
      channel,
      requestId: "request-1",
      credential,
    });
    expect(readStaticSiteFastApiCredentialResponseMessage(response, channel)).toEqual(response);
    expect(
      readStaticSiteFastApiCredentialResponseMessage(
        {
          ...response,
          payload: { ...response.payload, expiresAt: "2000-01-01T00:00:00Z" },
        },
        channel,
      ),
    ).toBeNull();
    expect(
      readStaticSiteFastApiCredentialRequestMessage(
        { ...request, payload: { ...request.payload, userCredential: "forbidden" } },
        channel,
      ),
    ).toBeNull();
    expect(() =>
      buildStaticSiteFastApiCredentialRequestMessage({
        channel,
        requestId: "request-1",
        resourceReleaseUid: "not-a-uuid",
      }),
    ).toThrow("canonical lowercase UUID");
    expect(
      buildStaticSiteFastApiCredentialErrorMessage({
        channel,
        requestId: "request-runtime-starting",
        resourceReleaseUid: targetUid,
        code: "runtime_starting",
      }).payload.code,
    ).toBe("runtime_starting");
    expect(
      readStaticSiteFastApiCredentialErrorMessage(
        {
          channel,
          version: 1,
          type: "fastapi-credential-error",
          payload: {
            requestId: "request-unknown",
            resourceReleaseUid: targetUid,
            code: "cold_start",
          },
        },
        channel,
      ),
    ).toBeNull();
  });
});

describe("static-site iframe host", () => {
  it("validates the child window and origin, initializes on ready, and republishes context updates", () => {
    const targetWindow = { postMessage: vi.fn() };
    const onReady = vi.fn();
    const host = createStaticSiteIframeHost({
      targetOrigin: "https://site.example.com",
      targetWindow,
      context: { themeId: "main-sequence-space", themeMode: "dark", userUid: "user-1" },
      onReady,
    });
    const ready = buildStaticSiteIframeReadyMessage(channel);

    expect(
      host.handleMessage({
        origin: "https://wrong.example.com",
        source: targetWindow as unknown as MessageEventSource,
        data: ready,
      }),
    ).toBe(false);
    expect(
      host.handleMessage({
        origin: "https://site.example.com",
        source: {} as MessageEventSource,
        data: ready,
      }),
    ).toBe(false);
    expect(
      host.handleMessage({
        origin: "https://site.example.com",
        source: targetWindow as unknown as MessageEventSource,
        data: ready,
      }),
    ).toBe(true);
    expect(host.ready).toBe(true);
    expect(host.channel).toBe(channel);
    expect(onReady).toHaveBeenCalledWith(ready);
    expect(targetWindow.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "initialize",
        payload: expect.objectContaining({ theme: "dark", themeId: "main-sequence-space" }),
      }),
      "https://site.example.com",
    );

    host.updateContext({ themeId: "quartz-light", themeMode: "light", userUid: null });
    expect(targetWindow.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        payload: { theme: "light", themeId: "quartz-light", user: null },
      }),
      "https://site.example.com",
    );
    expect(targetWindow.postMessage).toHaveBeenCalledTimes(2);

    host.dispose();
    expect(host.ready).toBe(false);
    expect(() =>
      host.updateContext({ themeId: "graphite", themeMode: "dark", userUid: null }),
    ).toThrow("disposed");
  });

  it("reports malformed and oversized messages from the expected frame", () => {
    const targetWindow = { postMessage: vi.fn() };
    const onProtocolError = vi.fn();
    const host = createStaticSiteIframeHost({
      targetOrigin: "https://site.example.com",
      targetWindow,
      context: { themeId: "graphite", themeMode: "dark", userUid: null },
      maxPayloadBytes: 128,
      onProtocolError,
    });
    const source = targetWindow as unknown as MessageEventSource;

    expect(
      host.handleMessage({
        origin: "https://site.example.com",
        source,
        data: { type: "unknown" },
      }),
    ).toBe(false);
    expect(onProtocolError).toHaveBeenLastCalledWith(
      "Rejected malformed static-site iframe ready message.",
    );

    expect(
      host.handleMessage({
        origin: "https://site.example.com",
        source,
        data: { value: "x".repeat(256) },
      }),
    ).toBe(false);
    expect(onProtocolError).toHaveBeenLastCalledWith(
      "Static-site iframe payload exceeds the configured limit.",
    );
    host.dispose();
  });

  it("reports handshake timeouts and rejects channel changes after readiness", () => {
    vi.useFakeTimers();
    try {
      const targetWindow = { postMessage: vi.fn() };
      const onProtocolError = vi.fn();
      const timedOutHost = createStaticSiteIframeHost({
        targetOrigin: "https://site.example.com",
        targetWindow,
        context: { themeId: "graphite", themeMode: "dark", userUid: null },
        handshakeTimeoutMs: 50,
        onProtocolError,
      });
      vi.advanceTimersByTime(50);
      expect(onProtocolError).toHaveBeenCalledWith("Static-site iframe handshake timed out.");
      timedOutHost.dispose();

      const connectedHost = createStaticSiteIframeHost({
        targetOrigin: "https://site.example.com",
        targetWindow,
        context: { themeId: "graphite", themeMode: "dark", userUid: null },
        onProtocolError,
      });
      const source = targetWindow as unknown as MessageEventSource;
      expect(
        connectedHost.handleMessage({
          origin: "https://site.example.com",
          source,
          data: buildStaticSiteIframeReadyMessage(channel),
        }),
      ).toBe(true);
      expect(
        connectedHost.handleMessage({
          origin: "https://site.example.com",
          source,
          data: buildStaticSiteIframeReadyMessage("mainsequence.other-app"),
        }),
      ).toBe(false);
      expect(onProtocolError).toHaveBeenLastCalledWith(
        "Rejected static-site iframe channel change after handshake.",
      );
      connectedHost.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("resolves credential requests and sanitizes unavailable hosts", async () => {
    const targetWindow = { postMessage: vi.fn() };
    const resolver = vi.fn().mockResolvedValue(credential);
    const host = createStaticSiteIframeHost({
      targetOrigin: "https://site.example.com",
      targetWindow,
      context: { themeId: "graphite", themeMode: "dark", userUid: "user-1" },
      resolveFastApiCredential: resolver,
    });
    const source = targetWindow as unknown as MessageEventSource;
    host.handleMessage({
      origin: "https://site.example.com",
      source,
      data: buildStaticSiteIframeReadyMessage(channel),
    });
    const request = buildStaticSiteFastApiCredentialRequestMessage({
      channel,
      requestId: "request-1",
      resourceReleaseUid: targetUid,
    });
    expect(host.handleMessage({ origin: "https://site.example.com", source, data: request })).toBe(
      true,
    );
    await vi.waitFor(() => expect(resolver).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(targetWindow.postMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: "fastapi-credential-response" }),
        "https://site.example.com",
      ),
    );
    host.dispose();

    targetWindow.postMessage.mockClear();
    const unsupportedHost = createStaticSiteIframeHost({
      targetOrigin: "https://site.example.com",
      targetWindow,
      context: { themeId: "graphite", themeMode: "dark", userUid: "user-1" },
    });
    unsupportedHost.handleMessage({
      origin: "https://site.example.com",
      source,
      data: buildStaticSiteIframeReadyMessage(channel),
    });
    unsupportedHost.handleMessage({ origin: "https://site.example.com", source, data: request });
    expect(targetWindow.postMessage).toHaveBeenLastCalledWith(
      buildStaticSiteFastApiCredentialErrorMessage({
        channel,
        requestId: "request-1",
        resourceReleaseUid: targetUid,
        code: "unsupported",
      }),
      "https://site.example.com",
    );
    unsupportedHost.dispose();
  });

  it("aborts application resolver work when the authenticated user changes", async () => {
    const targetWindow = { postMessage: vi.fn() };
    let resolverSignal: AbortSignal | undefined;
    const host = createStaticSiteIframeHost({
      targetOrigin: "https://site.example.com",
      targetWindow,
      context: { themeId: "graphite", themeMode: "dark", userUid: "user-1" },
      resolveFastApiCredential: (_request, context) => {
        resolverSignal = context.signal;
        return new Promise(() => undefined);
      },
    });
    const source = targetWindow as unknown as MessageEventSource;
    host.handleMessage({
      origin: "https://site.example.com",
      source,
      data: buildStaticSiteIframeReadyMessage(channel),
    });
    host.handleMessage({
      origin: "https://site.example.com",
      source,
      data: buildStaticSiteFastApiCredentialRequestMessage({
        channel,
        requestId: "request-2",
        resourceReleaseUid: targetUid,
      }),
    });
    await vi.waitFor(() => expect(resolverSignal).toBeDefined());
    host.updateContext({ themeId: "graphite", themeMode: "dark", userUid: "user-2" });
    expect(resolverSignal?.aborted).toBe(true);
    host.dispose();
  });
});

describe("static-site iframe client", () => {
  it("announces readiness and accepts every valid context update from the configured parent", () => {
    const parentWindow = { postMessage: vi.fn() };
    const onContext = vi.fn();
    const client = createStaticSiteIframeClient({
      channel,
      hostOrigin: "https://command-center.example.com",
      parentWindow,
      onContext,
    });

    client.announceReady();
    expect(parentWindow.postMessage).toHaveBeenCalledWith(
      buildStaticSiteIframeReadyMessage(channel),
      "https://command-center.example.com",
    );

    const first = buildStaticSiteIframeInitializeMessage({
      channel,
      context: { themeId: "main-sequence-space", themeMode: "dark", userUid: "user-1" },
    });
    const second = buildStaticSiteIframeInitializeMessage({
      channel,
      context: { themeId: "quartz-light", themeMode: "light", userUid: null },
    });
    const source = parentWindow as unknown as MessageEventSource;

    expect(
      client.handleMessage({
        origin: "https://command-center.example.com",
        source,
        data: first,
      }),
    ).toBe(true);
    expect(
      client.handleMessage({
        origin: "https://command-center.example.com",
        source,
        data: second,
      }),
    ).toBe(true);
    expect(onContext).toHaveBeenNthCalledWith(1, {
      themeId: "main-sequence-space",
      themeMode: "dark",
      userUid: "user-1",
    });
    expect(onContext).toHaveBeenNthCalledWith(2, {
      themeId: "quartz-light",
      themeMode: "light",
      userUid: null,
    });

    expect(
      client.handleMessage({
        origin: "https://wrong.example.com",
        source,
        data: second,
      }),
    ).toBe(false);
    expect(
      client.handleMessage({
        origin: "https://command-center.example.com",
        source: {} as MessageEventSource,
        data: second,
      }),
    ).toBe(false);

    client.dispose();
    expect(() => client.announceReady()).toThrow("disposed");
  });

  it("single-flights, caches, and hides credentials behind authenticated fetch", async () => {
    const parentWindow = { postMessage: vi.fn() };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("ok"));
    const client = createStaticSiteIframeClient({
      channel,
      hostOrigin: "https://command-center.example.com",
      parentWindow,
      onContext: vi.fn(),
      fetcher,
    });
    const source = parentWindow as unknown as MessageEventSource;
    client.handleMessage({
      origin: "https://command-center.example.com",
      source,
      data: buildStaticSiteIframeInitializeMessage({
        channel,
        context: { themeId: "graphite", themeMode: "dark", userUid: "user-1" },
      }),
    });

    const first = client.requestFastApiCredential({ resourceReleaseUid: targetUid });
    const second = client.requestFastApiCredential({ resourceReleaseUid: targetUid });
    expect(first).toBe(second);
    const request = parentWindow.postMessage.mock.calls.at(-1)?.[0];
    const parsedRequest = readStaticSiteFastApiCredentialRequestMessage(request, channel);
    expect(parsedRequest).not.toBeNull();
    expect(
      client.handleMessage({
        origin: "https://command-center.example.com",
        source,
        data: buildStaticSiteFastApiCredentialResponseMessage({
          channel,
          requestId: parsedRequest!.payload.requestId,
          credential,
        }),
      }),
    ).toBe(true);
    await expect(first).resolves.toEqual(credential);
    await expect(second).resolves.toEqual(credential);

    const callsAfterCredential = parentWindow.postMessage.mock.calls.length;
    const response = await client.fetchFastApi(
      { resourceReleaseUid: targetUid, path: "api/me?view=summary" },
      { headers: { "X-Application-Header": "one" } },
    );
    expect(await response.text()).toBe("ok");
    expect(parentWindow.postMessage).toHaveBeenCalledTimes(callsAfterCredential);
    const [requestUrl, requestInit] = fetcher.mock.calls[0] ?? [];
    expect(String(requestUrl)).toBe("https://fastapi.example.com/api/me?view=summary");
    const headers = new Headers(requestInit?.headers);
    expect(headers.get("Authorization")).toBe("Bearer delegated-token");
    expect(headers.get("X-Resource-Release-UID")).toBe(targetUid);
    expect(headers.has("X-FastAPI-ID")).toBe(false);
    expect(headers.get("X-Application-Header")).toBe("one");
    await expect(
      client.fetchFastApi({ resourceReleaseUid: targetUid, path: "https://evil.example.com/" }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    client.dispose();
  });

  it("reports cold-start lifecycle and retries only a bounded number of times", async () => {
    const parentWindow = { postMessage: vi.fn() };
    const onFastApiStateChange = vi.fn();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("starting", { status: 503 }))
      .mockResolvedValueOnce(new Response("starting", { status: 502 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const client = createStaticSiteIframeClient({
      channel,
      hostOrigin: "https://command-center.example.com",
      parentWindow,
      onContext: vi.fn(),
      onFastApiStateChange,
      fastApiRetryPolicy: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 },
      fetcher,
    });
    const source = parentWindow as unknown as MessageEventSource;
    client.handleMessage({
      origin: "https://command-center.example.com",
      source,
      data: buildStaticSiteIframeInitializeMessage({
        channel,
        context: { themeId: "graphite", themeMode: "dark", userUid: "user-1" },
      }),
    });

    const pending = client.fetchFastApi({ resourceReleaseUid: targetUid, path: "/health" });
    const request = readStaticSiteFastApiCredentialRequestMessage(
      parentWindow.postMessage.mock.calls.at(-1)?.[0],
      channel,
    )!;
    client.handleMessage({
      origin: "https://command-center.example.com",
      source,
      data: buildStaticSiteFastApiCredentialResponseMessage({
        channel,
        requestId: request.payload.requestId,
        credential,
      }),
    });

    await expect(pending).resolves.toMatchObject({ status: 200 });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(onFastApiStateChange.mock.calls.map(([state]) => state.status)).toEqual([
      "authorizing",
      "runtime-starting",
      "runtime-starting",
      "ready",
    ]);
    expect(client.getFastApiState(targetUid)).toMatchObject({
      status: "ready",
      attempt: 3,
      responseStatus: 200,
    });
    client.dispose();
  });

  it("refreshes once after a 401 and distinguishes forbidden and missing-route responses", async () => {
    const parentWindow = { postMessage: vi.fn() };
    const onFastApiStateChange = vi.fn();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("expired", { status: 401 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockResolvedValueOnce(new Response("forbidden", { status: 403 }))
      .mockResolvedValueOnce(new Response("missing", { status: 404 }));
    const client = createStaticSiteIframeClient({
      channel,
      hostOrigin: "https://command-center.example.com",
      parentWindow,
      onContext: vi.fn(),
      onFastApiStateChange,
      fastApiRetryPolicy: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 },
      fetcher,
    });
    const source = parentWindow as unknown as MessageEventSource;
    client.handleMessage({
      origin: "https://command-center.example.com",
      source,
      data: buildStaticSiteIframeInitializeMessage({
        channel,
        context: { themeId: "graphite", themeMode: "dark", userUid: "user-1" },
      }),
    });

    const pending = client.fetchFastApi(
      { resourceReleaseUid: targetUid, path: "/api/me" },
      { headers: { "X-FastAPI-ID": "legacy-value" } },
    );
    const firstRequest = readStaticSiteFastApiCredentialRequestMessage(
      parentWindow.postMessage.mock.calls.at(-1)?.[0],
      channel,
    )!;
    client.handleMessage({
      origin: "https://command-center.example.com",
      source,
      data: buildStaticSiteFastApiCredentialResponseMessage({
        channel,
        requestId: firstRequest.payload.requestId,
        credential,
      }),
    });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => {
      const next = readStaticSiteFastApiCredentialRequestMessage(
        parentWindow.postMessage.mock.calls.at(-1)?.[0],
        channel,
      );
      expect(next?.payload.requestId).not.toBe(firstRequest.payload.requestId);
    });
    const refreshRequest = readStaticSiteFastApiCredentialRequestMessage(
      parentWindow.postMessage.mock.calls.at(-1)?.[0],
      channel,
    )!;
    client.handleMessage({
      origin: "https://command-center.example.com",
      source,
      data: buildStaticSiteFastApiCredentialResponseMessage({
        channel,
        requestId: refreshRequest.payload.requestId,
        credential: { ...credential, token: "refreshed-token" },
      }),
    });

    await expect(pending).resolves.toMatchObject({ status: 200 });
    const refreshedHeaders = new Headers(fetcher.mock.calls[1]?.[1]?.headers);
    expect(refreshedHeaders.get("Authorization")).toBe("Bearer refreshed-token");
    expect(refreshedHeaders.has("X-FastAPI-ID")).toBe(false);
    expect(onFastApiStateChange.mock.calls.map(([state]) => state.status)).toContain("expired");

    await expect(
      client.fetchFastApi({ resourceReleaseUid: targetUid, path: "/forbidden" }),
    ).resolves.toMatchObject({ status: 403 });
    expect(client.getFastApiState(targetUid).status).toBe("forbidden");
    await expect(
      client.fetchFastApi({ resourceReleaseUid: targetUid, path: "/missing" }),
    ).resolves.toMatchObject({ status: 404 });
    expect(client.getFastApiState(targetUid).status).toBe("missing-route");
    client.dispose();
  });

  it("bounds transport retries, avoids automatic POST replay, and supports cancellation", async () => {
    const parentWindow = { postMessage: vi.fn() };
    let abortOnRuntimeStarting: AbortController | null = null;
    const onFastApiStateChange = vi.fn((state: { status: string }) => {
      if (state.status === "runtime-starting") abortOnRuntimeStarting?.abort();
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const client = createStaticSiteIframeClient({
      channel,
      hostOrigin: "https://command-center.example.com",
      parentWindow,
      onContext: vi.fn(),
      onFastApiStateChange,
      fastApiRetryPolicy: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 },
      fetcher,
    });
    const source = parentWindow as unknown as MessageEventSource;
    client.handleMessage({
      origin: "https://command-center.example.com",
      source,
      data: buildStaticSiteIframeInitializeMessage({
        channel,
        context: { themeId: "graphite", themeMode: "dark", userUid: "user-1" },
      }),
    });
    const credentialRequest = client.requestFastApiCredential({ resourceReleaseUid: targetUid });
    const request = readStaticSiteFastApiCredentialRequestMessage(
      parentWindow.postMessage.mock.calls.at(-1)?.[0],
      channel,
    )!;
    client.handleMessage({
      origin: "https://command-center.example.com",
      source,
      data: buildStaticSiteFastApiCredentialResponseMessage({
        channel,
        requestId: request.payload.requestId,
        credential,
      }),
    });
    await credentialRequest;

    await expect(
      client.fetchFastApi({ resourceReleaseUid: targetUid, path: "/network" }),
    ).rejects.toThrow("Failed to fetch");
    expect(fetcher).toHaveBeenCalledTimes(3);

    fetcher.mockReset();
    fetcher.mockResolvedValue(new Response("starting", { status: 503 }));
    await expect(
      client.fetchFastApi(
        {
          resourceReleaseUid: targetUid,
          path: "/write",
          retry: { maxAttempts: 3, baseDelayMs: 1_000, maxDelayMs: 1_000 },
        },
        { method: "POST" },
      ),
    ).resolves.toMatchObject({ status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(1);

    fetcher.mockClear();
    const controller = new AbortController();
    abortOnRuntimeStarting = controller;
    await expect(
      client.fetchFastApi(
        {
          resourceReleaseUid: targetUid,
          path: "/health",
          retry: { maxAttempts: 3, baseDelayMs: 1_000, maxDelayMs: 1_000 },
        },
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(client.getFastApiState(targetUid).status).toBe("cancelled");
    client.dispose();
  });

  it("surfaces only sanitized credential errors", async () => {
    const parentWindow = { postMessage: vi.fn() };
    const client = createStaticSiteIframeClient({
      channel,
      hostOrigin: "https://command-center.example.com",
      parentWindow,
      onContext: vi.fn(),
    });
    const source = parentWindow as unknown as MessageEventSource;
    client.handleMessage({
      origin: "https://command-center.example.com",
      source,
      data: buildStaticSiteIframeInitializeMessage({
        channel,
        context: { themeId: "graphite", themeMode: "dark", userUid: "user-1" },
      }),
    });
    const promise = client.requestFastApiCredential({ resourceReleaseUid: targetUid });
    const request = readStaticSiteFastApiCredentialRequestMessage(
      parentWindow.postMessage.mock.calls.at(-1)?.[0],
      channel,
    )!;
    client.handleMessage({
      origin: "https://command-center.example.com",
      source,
      data: buildStaticSiteFastApiCredentialErrorMessage({
        channel,
        requestId: request.payload.requestId,
        resourceReleaseUid: targetUid,
        code: "origin_not_allowed",
      }),
    });
    await expect(promise).rejects.toEqual(
      expect.objectContaining<Partial<StaticSiteFastApiCredentialError>>({
        name: "StaticSiteFastApiCredentialError",
        code: "origin_not_allowed",
      }),
    );
    client.dispose();
  });

  it("reacquires credentials inside the refresh window and clears pending work on user change", async () => {
    const parentWindow = { postMessage: vi.fn() };
    const client = createStaticSiteIframeClient({
      channel,
      hostOrigin: "https://command-center.example.com",
      parentWindow,
      onContext: vi.fn(),
      credentialRefreshSkewMs: 30_000,
    });
    const source = parentWindow as unknown as MessageEventSource;
    const initialize = (userUid: string) =>
      client.handleMessage({
        origin: "https://command-center.example.com",
        source,
        data: buildStaticSiteIframeInitializeMessage({
          channel,
          context: { themeId: "graphite", themeMode: "dark", userUid },
        }),
      });
    initialize("user-1");

    const first = client.requestFastApiCredential({ resourceReleaseUid: targetUid });
    const firstRequest = readStaticSiteFastApiCredentialRequestMessage(
      parentWindow.postMessage.mock.calls.at(-1)?.[0],
      channel,
    )!;
    client.handleMessage({
      origin: "https://command-center.example.com",
      source,
      data: buildStaticSiteFastApiCredentialResponseMessage({
        channel,
        requestId: firstRequest.payload.requestId,
        credential: {
          ...credential,
          expiresAt: new Date(Date.now() + 10_000).toISOString(),
        },
      }),
    });
    await first;

    const refresh = client.requestFastApiCredential({ resourceReleaseUid: targetUid });
    const refreshRequest = readStaticSiteFastApiCredentialRequestMessage(
      parentWindow.postMessage.mock.calls.at(-1)?.[0],
      channel,
    )!;
    expect(refreshRequest.payload.requestId).not.toBe(firstRequest.payload.requestId);
    initialize("user-2");
    await expect(refresh).rejects.toMatchObject({ code: "access_denied" });

    client.dispose();
  });

  it("rejects replayed responses after the pending target has resolved", async () => {
    const parentWindow = { postMessage: vi.fn() };
    const onProtocolError = vi.fn();
    const client = createStaticSiteIframeClient({
      channel,
      hostOrigin: "https://command-center.example.com",
      parentWindow,
      onContext: vi.fn(),
      onProtocolError,
    });
    const source = parentWindow as unknown as MessageEventSource;
    client.handleMessage({
      origin: "https://command-center.example.com",
      source,
      data: buildStaticSiteIframeInitializeMessage({
        channel,
        context: { themeId: "graphite", themeMode: "dark", userUid: "user-1" },
      }),
    });
    const pending = client.requestFastApiCredential({ resourceReleaseUid: targetUid });
    const request = readStaticSiteFastApiCredentialRequestMessage(
      parentWindow.postMessage.mock.calls.at(-1)?.[0],
      channel,
    )!;
    const response = buildStaticSiteFastApiCredentialResponseMessage({
      channel,
      requestId: request.payload.requestId,
      credential,
    });
    expect(client.handleMessage({ origin: "https://command-center.example.com", source, data: response }))
      .toBe(true);
    await pending;
    expect(client.handleMessage({ origin: "https://command-center.example.com", source, data: response }))
      .toBe(false);
    expect(onProtocolError).toHaveBeenLastCalledWith(
      "Rejected unmatched static-site FastAPI credential response.",
    );
    client.dispose();
  });
});

describe("static-site FastAPI WebSocket protocol", () => {
  it("builds and strictly parses all four additive version-one messages", () => {
    const binding = {
      channel,
      requestId: "ws-request-1",
      resourceReleaseUid: targetUid,
      path: "/ws/orders",
    };
    const request = buildStaticSiteFastApiWebSocketTicketRequestMessage(binding);
    const cancel = buildStaticSiteFastApiWebSocketTicketCancelMessage(binding);
    const response = buildStaticSiteFastApiWebSocketTicketResponseMessage({
      channel,
      requestId: binding.requestId,
      ticket: webSocketTicket,
    });
    const error = buildStaticSiteFastApiWebSocketTicketErrorMessage({
      ...binding,
      code: "origin_not_allowed",
    });

    expect(readStaticSiteFastApiWebSocketTicketRequestMessage(request, channel)).toEqual(request);
    expect(readStaticSiteFastApiWebSocketTicketCancelMessage(cancel, channel)).toEqual(cancel);
    expect(readStaticSiteFastApiWebSocketTicketResponseMessage(response, channel)).toEqual(response);
    expect(
      readStaticSiteFastApiWebSocketTicketResponseMessage(
        { ...response, payload: { ...response.payload, expiresAt: "2000-01-01T00:00:00Z" } },
        channel,
      ),
    ).toBeNull();
    expect(readStaticSiteFastApiWebSocketTicketErrorMessage(error, channel)).toEqual(error);
    expect(
      buildStaticSiteFastApiWebSocketTicketRequestMessage({ ...binding, path: "/" }).payload.path,
    ).toBe("/");
    expect(
      buildStaticSiteFastApiWebSocketTicketRequestMessage({
        ...binding,
        path: "/ws/orders/",
      }).payload.path,
    ).toBe("/ws/orders/");
    expect(
      readStaticSiteFastApiWebSocketTicketRequestMessage(
        { ...request, payload: { ...request.payload, origin: "https://site.example.com" } },
        channel,
      ),
    ).toBeNull();
    for (const path of [
      "ws/orders",
      "/ws//orders",
      "/ws/../orders",
      "/ws?ticket=value",
      "/_healthz",
      "/logos/app.svg",
      "/ws/%6frders",
      "/ws\\orders",
      "/ws/[orders]",
      `/${"a".repeat(2_048)}`,
    ]) {
      expect(() => buildStaticSiteFastApiWebSocketTicketRequestMessage({ ...binding, path })).toThrow();
    }
  });

  it("validates the resolver result binding and sanitizes resolver failures", async () => {
    const targetWindow = { postMessage: vi.fn() };
    const source = targetWindow as unknown as MessageEventSource;
    const resolver = vi.fn(async () => webSocketTicket);
    const host = createStaticSiteIframeHost({
      targetOrigin: "https://site.example.com",
      targetWindow,
      context: { themeId: "graphite", themeMode: "dark", userUid: "user-1" },
      resolveFastApiWebSocketTicket: resolver,
    });
    host.handleMessage({
      origin: "https://site.example.com",
      source,
      data: buildStaticSiteIframeReadyMessage(channel),
    });
    const request = buildStaticSiteFastApiWebSocketTicketRequestMessage({
      channel,
      requestId: "ws-host-1",
      resourceReleaseUid: targetUid,
      path: "/ws/orders",
    });
    expect(host.handleMessage({ origin: "https://site.example.com", source, data: request })).toBe(true);
    await vi.waitFor(() => expect(resolver).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(
        readStaticSiteFastApiWebSocketTicketResponseMessage(
          targetWindow.postMessage.mock.calls.at(-1)?.[0],
          channel,
        ),
      ).not.toBeNull(),
    );
    expect(resolver).toHaveBeenCalledWith(
      { resourceReleaseUid: targetUid, path: "/ws/orders" },
      { signal: expect.any(AbortSignal) },
    );

    host.updateFastApiWebSocketTicketResolver(async () => ({
      ...webSocketTicket,
      origin: "https://attacker.example.com",
    }));
    host.handleMessage({
      origin: "https://site.example.com",
      source,
      data: buildStaticSiteFastApiWebSocketTicketRequestMessage({
        channel,
        requestId: "ws-host-2",
        resourceReleaseUid: targetUid,
        path: "/ws/orders",
      }),
    });
    await vi.waitFor(() =>
      expect(
        readStaticSiteFastApiWebSocketTicketErrorMessage(
          targetWindow.postMessage.mock.calls.at(-1)?.[0],
          channel,
        )?.payload.code,
      ).toBe("invalid_request"),
    );

    host.updateFastApiWebSocketTicketResolver(async () => {
      throw new Error("secret backend response");
    });
    host.handleMessage({
      origin: "https://site.example.com",
      source,
      data: buildStaticSiteFastApiWebSocketTicketRequestMessage({
        channel,
        requestId: "ws-host-3",
        resourceReleaseUid: targetUid,
        path: "/ws/orders",
      }),
    });
    await vi.waitFor(() =>
      expect(
        readStaticSiteFastApiWebSocketTicketErrorMessage(
          targetWindow.postMessage.mock.calls.at(-1)?.[0],
          channel,
        )?.payload.code,
      ).toBe("temporarily_unavailable"),
    );
    expect(JSON.stringify(targetWindow.postMessage.mock.calls)).not.toContain("secret backend response");

    host.updateFastApiWebSocketTicketResolver(async () => {
      throw new StaticSiteFastApiWebSocketError("access_denied", "sensitive adapter detail");
    });
    host.handleMessage({
      origin: "https://site.example.com",
      source,
      data: buildStaticSiteFastApiWebSocketTicketRequestMessage({
        channel,
        requestId: "ws-host-4",
        resourceReleaseUid: targetUid,
        path: "/ws/orders",
      }),
    });
    await vi.waitFor(() =>
      expect(
        readStaticSiteFastApiWebSocketTicketErrorMessage(
          targetWindow.postMessage.mock.calls.at(-1)?.[0],
          channel,
        )?.payload.code,
      ).toBe("access_denied"),
    );
    expect(JSON.stringify(targetWindow.postMessage.mock.calls)).not.toContain("sensitive adapter detail");
    host.dispose();
  });

  it("correlates cancellation and aborts prior-document and replaced-resolver work", async () => {
    const targetWindow = { postMessage: vi.fn() };
    const source = targetWindow as unknown as MessageEventSource;
    const signals: AbortSignal[] = [];
    const resolver = vi.fn(
      (_request, { signal }: { signal: AbortSignal }) =>
        new Promise<typeof webSocketTicket>(() => signals.push(signal)),
    );
    const host = createStaticSiteIframeHost({
      targetOrigin: "https://site.example.com",
      targetWindow,
      context: { themeId: "graphite", themeMode: "dark", userUid: "user-1" },
      resolveFastApiWebSocketTicket: resolver,
    });
    host.handleMessage({
      origin: "https://site.example.com",
      source,
      data: buildStaticSiteIframeReadyMessage(channel),
    });
    const binding = {
      channel,
      requestId: "ws-cancel-1",
      resourceReleaseUid: targetUid,
      path: "/ws/orders",
    };
    host.handleMessage({
      origin: "https://site.example.com",
      source,
      data: buildStaticSiteFastApiWebSocketTicketRequestMessage(binding),
    });
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    host.handleMessage({
      origin: "https://site.example.com",
      source,
      data: buildStaticSiteFastApiWebSocketTicketCancelMessage(binding),
    });
    expect(signals[0]?.aborted).toBe(true);

    host.handleMessage({
      origin: "https://site.example.com",
      source,
      data: buildStaticSiteFastApiWebSocketTicketRequestMessage({
        ...binding,
        requestId: "ws-generation-1",
      }),
    });
    await vi.waitFor(() => expect(signals).toHaveLength(2));
    host.handleMessage({
      origin: "https://site.example.com",
      source,
      data: buildStaticSiteIframeReadyMessage(channel),
    });
    expect(signals[1]?.aborted).toBe(true);
    expect(host.ready).toBe(true);

    host.handleMessage({
      origin: "https://site.example.com",
      source,
      data: buildStaticSiteFastApiWebSocketTicketRequestMessage({
        ...binding,
        requestId: "ws-resolver-replacement-1",
      }),
    });
    await vi.waitFor(() => expect(signals).toHaveLength(3));
    host.updateFastApiWebSocketTicketResolver(async () => webSocketTicket);
    expect(signals[2]?.aborted).toBe(true);
    expect(host.ready).toBe(true);
    host.dispose();
  });
});

describe("static-site FastAPI WebSocket client", () => {
  class MockWebSocket {
    static calls: Array<{ url: string; protocols: string[]; socket: MockWebSocket }> = [];
    readyState = 0;
    private closeListener?: () => void;
    readonly close = vi.fn(() => {
      this.readyState = 3;
      this.closeListener?.();
    });

    constructor(readonly url: string, readonly protocols: string[]) {
      MockWebSocket.calls.push({ url, protocols, socket: this });
    }

    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (type !== "close") return;
      this.closeListener = () => {
        if (typeof listener === "function") listener(new Event("close"));
        else listener.handleEvent(new Event("close"));
      };
    }
  }

  function createInitializedWebSocketClient(parentWindow: { postMessage: ReturnType<typeof vi.fn> }) {
    const client = createStaticSiteIframeClient({
      channel,
      hostOrigin: "https://command-center.example.com",
      parentWindow,
      onContext: vi.fn(),
      webSocketTicketRequestTimeoutMs: 100,
    });
    const source = parentWindow as unknown as MessageEventSource;
    client.handleMessage({
      origin: "https://command-center.example.com",
      source,
      data: buildStaticSiteIframeInitializeMessage({
        channel,
        context: { themeId: "graphite", themeMode: "dark", userUid: "user-1" },
      }),
    });
    return { client, source };
  }

  it("constructs one native socket with ticket first and acknowledgement second", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    MockWebSocket.calls = [];
    const parentWindow = { postMessage: vi.fn() };
    const { client, source } = createInitializedWebSocketClient(parentWindow);
    try {
      const connection = client.createFastApiWebSocket({
        resourceReleaseUid: targetUid,
        path: "/ws/orders",
        protocols: ["orders.v2", "json"],
      });
      const request = readStaticSiteFastApiWebSocketTicketRequestMessage(
        parentWindow.postMessage.mock.calls.at(-1)?.[0],
        channel,
      )!;
      expect(request.payload).toMatchObject({ resourceReleaseUid: targetUid, path: "/ws/orders" });
      client.handleMessage({
        origin: "https://command-center.example.com",
        source,
        data: buildStaticSiteFastApiWebSocketTicketResponseMessage({
          channel,
          requestId: request.payload.requestId,
          ticket: webSocketTicket,
        }),
      });
      const socket = await connection;
      expect(socket).toBe(MockWebSocket.calls[0]?.socket);
      expect(MockWebSocket.calls[0]).toMatchObject({
        url: webSocketTicket.websocketUrl,
        protocols: [
          webSocketTicket.subprotocol,
          STATIC_SITE_FAST_API_WEBSOCKET_ACK_PROTOCOL,
          "orders.v2",
          "json",
        ],
      });
      expect("requestFastApiWebSocketTicket" in client).toBe(false);
    } finally {
      client.dispose();
      vi.unstubAllGlobals();
    }
  });

  it("posts correlated cancellation and never constructs after abort", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    MockWebSocket.calls = [];
    const parentWindow = { postMessage: vi.fn() };
    const { client } = createInitializedWebSocketClient(parentWindow);
    const controller = new AbortController();
    try {
      const connection = client.createFastApiWebSocket(
        { resourceReleaseUid: targetUid, path: "/ws/orders" },
        { signal: controller.signal },
      );
      const request = readStaticSiteFastApiWebSocketTicketRequestMessage(
        parentWindow.postMessage.mock.calls.at(-1)?.[0],
        channel,
      )!;
      controller.abort();
      await expect(connection).rejects.toMatchObject({ name: "AbortError" });
      expect(
        readStaticSiteFastApiWebSocketTicketCancelMessage(
          parentWindow.postMessage.mock.calls.at(-1)?.[0],
          channel,
        )?.payload,
      ).toEqual(request.payload);
      expect(MockWebSocket.calls).toHaveLength(0);
    } finally {
      client.dispose();
      vi.unstubAllGlobals();
    }
  });

  it("maps an initialized old-host timeout to unsupported without a fallback", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    MockWebSocket.calls = [];
    const parentWindow = { postMessage: vi.fn() };
    const client = createStaticSiteIframeClient({
      channel,
      hostOrigin: "https://command-center.example.com",
      parentWindow,
      onContext: vi.fn(),
      webSocketTicketRequestTimeoutMs: 5,
    });
    const source = parentWindow as unknown as MessageEventSource;
    client.handleMessage({
      origin: "https://command-center.example.com",
      source,
      data: buildStaticSiteIframeInitializeMessage({
        channel,
        context: { themeId: "graphite", themeMode: "dark", userUid: "user-1" },
      }),
    });
    try {
      await expect(
        client.createFastApiWebSocket({ resourceReleaseUid: targetUid, path: "/ws/orders" }),
      ).rejects.toMatchObject({ code: "unsupported" });
      expect(MockWebSocket.calls).toHaveLength(0);
      expect(
        parentWindow.postMessage.mock.calls.some(
          ([message]) =>
            readStaticSiteFastApiWebSocketTicketRequestMessage(message, channel) !== null,
        ),
      ).toBe(true);
    } finally {
      client.dispose();
      vi.unstubAllGlobals();
    }
  });

  it("rejects invalid application protocols before requesting a ticket", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    const parentWindow = { postMessage: vi.fn() };
    const { client } = createInitializedWebSocketClient(parentWindow);
    const initialCalls = parentWindow.postMessage.mock.calls.length;
    try {
      for (const protocols of [
        ["json", "json"],
        [STATIC_SITE_FAST_API_WEBSOCKET_ACK_PROTOCOL],
        ["mainsequence.ws-bridge.v2"],
        [`MAINSEQUENCE.WS-TICKET.${"a".repeat(32)}`],
        ["contains space"],
        ["x".repeat(129)],
        Array.from({ length: 17 }, (_, index) => `protocol-${index}`),
      ]) {
        await expect(
          client.createFastApiWebSocket({
            resourceReleaseUid: targetUid,
            path: "/ws/orders",
            protocols,
          }),
        ).rejects.toBeInstanceOf(StaticSiteFastApiWebSocketError);
      }
      expect(parentWindow.postMessage).toHaveBeenCalledTimes(initialCalls);
    } finally {
      client.dispose();
      vi.unstubAllGlobals();
    }
  });

  it("gets a fresh ticket per connection and closes owned sockets on user change", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    MockWebSocket.calls = [];
    const parentWindow = { postMessage: vi.fn() };
    const { client, source } = createInitializedWebSocketClient(parentWindow);
    try {
      for (let index = 0; index < 2; index += 1) {
        const connection = client.createFastApiWebSocket({
          resourceReleaseUid: targetUid,
          path: "/ws/orders",
        });
        const request = readStaticSiteFastApiWebSocketTicketRequestMessage(
          parentWindow.postMessage.mock.calls.at(-1)?.[0],
          channel,
        )!;
        client.handleMessage({
          origin: "https://command-center.example.com",
          source,
          data: buildStaticSiteFastApiWebSocketTicketResponseMessage({
            channel,
            requestId: request.payload.requestId,
            ticket: {
              ...webSocketTicket,
              subprotocol: `mainsequence.ws-ticket.${String(index).repeat(32)}`,
            },
          }),
        });
        await connection;
      }
      expect(MockWebSocket.calls).toHaveLength(2);
      expect(MockWebSocket.calls[0]?.protocols[0]).not.toBe(MockWebSocket.calls[1]?.protocols[0]);
      client.handleMessage({
        origin: "https://command-center.example.com",
        source,
        data: buildStaticSiteIframeInitializeMessage({
          channel,
          context: { themeId: "graphite", themeMode: "dark", userUid: "user-2" },
        }),
      });
      expect(MockWebSocket.calls.every(({ socket }) => socket.close.mock.calls.length === 1)).toBe(true);
    } finally {
      client.dispose();
      vi.unstubAllGlobals();
    }
  });
});
