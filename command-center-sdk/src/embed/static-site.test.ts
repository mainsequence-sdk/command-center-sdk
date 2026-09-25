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
  buildStaticSitePlatformCancelMessage,
  buildStaticSitePlatformErrorMessage,
  buildStaticSitePlatformRequestMessage,
  buildStaticSitePlatformResponseMessage,
  createStaticSiteIframeClient,
  createStaticSiteIframeHost,
  readStaticSiteIframeMessage,
  readStaticSitePlatformCancelMessage,
  readStaticSitePlatformErrorMessage,
  readStaticSitePlatformRequestMessage,
  readStaticSitePlatformResponseMessage,
  StaticSiteFastApiCredentialError,
  StaticSiteFastApiWebSocketError,
  StaticSitePlatformRequestError,
  STATIC_SITE_FAST_API_WEBSOCKET_ACK_PROTOCOL,
  type SendStaticSitePlatformRequest,
  type StaticSiteIframeMessage,
  type StaticSitePlatformRequestErrorCode,
  type StaticSitePlatformRequestMessage,
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

const channel = "mainsequence.reports" as const;
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
            code: "not_a_known_code",
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

  it("reports the runtime-starting lifecycle and retries only a bounded number of times", async () => {
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

const platformHostOrigin = "https://command-center.example.com";
const platformSiteOrigin = "https://site.example.com";
const platformErrorCodes: StaticSitePlatformRequestErrorCode[] = [
  "invalid_request",
  "access_denied",
  "not_allowed",
  "temporarily_unavailable",
  "unsupported",
];
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff]);

function platformRequest(
  requestId: string,
  fields: Partial<Omit<StaticSitePlatformRequestMessage["payload"], "requestId">> = {},
) {
  return buildStaticSitePlatformRequestMessage({
    channel,
    requestId,
    userUid: "user-1",
    method: "GET",
    path: "/api/items/",
    ...fields,
  });
}

function createPlatformHost({
  sendPlatformRequest,
  userUid = "user-1",
  platformRequestTimeoutMs,
}: {
  sendPlatformRequest?: SendStaticSitePlatformRequest;
  userUid?: string | null;
  platformRequestTimeoutMs?: number;
} = {}) {
  const targetWindow = { postMessage: vi.fn() };
  const onProtocolError = vi.fn();
  const host = createStaticSiteIframeHost({
    targetOrigin: platformSiteOrigin,
    targetWindow,
    context: { themeId: "graphite", themeMode: "dark", userUid },
    sendPlatformRequest,
    platformRequestTimeoutMs,
    onProtocolError,
  });
  const source = targetWindow as unknown as MessageEventSource;
  const deliver = (data: unknown) =>
    host.handleMessage({ origin: platformSiteOrigin, source, data });
  deliver(buildStaticSiteIframeReadyMessage(channel));
  const answers = () =>
    targetWindow.postMessage.mock.calls
      .map(([message]) => message as StaticSiteIframeMessage)
      .filter((message) => message.type === "platform-response" || message.type === "platform-error");
  const answerFor = (requestId: string) =>
    answers().find((message) => (message.payload as { requestId: string }).requestId === requestId);
  const waitForAnswer = (requestId: string) =>
    vi.waitFor(() => {
      const answer = answerFor(requestId);
      if (!answer) throw new Error(`The host has not answered ${requestId}.`);
      return answer;
    });
  return { host, targetWindow, onProtocolError, deliver, answers, answerFor, waitForAnswer };
}

function createPlatformClient({
  userUid = "user-1",
  platformRequestTimeoutMs,
}: { userUid?: string | null; platformRequestTimeoutMs?: number } = {}) {
  const parentWindow = { postMessage: vi.fn() };
  const onProtocolError = vi.fn();
  const client = createStaticSiteIframeClient({
    channel,
    hostOrigin: platformHostOrigin,
    parentWindow,
    onContext: vi.fn(),
    onProtocolError,
    platformRequestTimeoutMs,
  });
  const source = parentWindow as unknown as MessageEventSource;
  const deliver = (data: unknown) =>
    client.handleMessage({ origin: platformHostOrigin, source, data });
  const initialize = (nextUserUid: string | null) =>
    deliver(
      buildStaticSiteIframeInitializeMessage({
        channel,
        context: { themeId: "graphite", themeMode: "dark", userUid: nextUserUid },
      }),
    );
  initialize(userUid);
  const posted = () =>
    parentWindow.postMessage.mock.calls.map(([message]) => message as StaticSiteIframeMessage);
  const sent = () =>
    posted().filter(
      (message): message is StaticSitePlatformRequestMessage => message.type === "platform-request",
    );
  const cancelled = () =>
    posted()
      .filter((message) => message.type === "platform-cancel")
      .map((message) => (message.payload as { requestId: string }).requestId);
  const respond = (
    requestId: string,
    answer: Partial<Parameters<typeof buildStaticSitePlatformResponseMessage>[0]> = {},
  ) =>
    deliver(
      buildStaticSitePlatformResponseMessage({
        channel,
        requestId,
        status: 200,
        headers: { "content-type": "application/json" },
        body: '{"ok":true}',
        bodyEncoding: "text",
        ...answer,
      }),
    );
  return { client, parentWindow, onProtocolError, deliver, initialize, sent, cancelled, respond };
}

describe("static-site platform request protocol", () => {
  it("builds and strictly parses the four additive version-one messages", () => {
    const request = platformRequest("platform-1", {
      method: "POST",
      path: "/api/items/?limit=20",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: '{"name":"a"}',
    });
    expect(request).toEqual({
      channel,
      version: 1,
      type: "platform-request",
      payload: {
        requestId: "platform-1",
        userUid: "user-1",
        method: "POST",
        path: "/api/items/?limit=20",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: '{"name":"a"}',
      },
    });
    expect(readStaticSitePlatformRequestMessage(request, channel)).toEqual(request);
    expect(readStaticSiteIframeMessage(request, channel)).toEqual(request);
    expect(platformRequest("platform-2").payload).toEqual({
      requestId: "platform-2",
      userUid: "user-1",
      method: "GET",
      path: "/api/items/",
    });
    const { userUid: _userUid, ...withoutPerson } = request.payload;
    for (const userUid of ["x".repeat(1_024), "😀".repeat(1_024), "user public uid"]) {
      expect(
        readStaticSitePlatformRequestMessage({ ...request, payload: { ...request.payload, userUid } }, channel)
          ?.payload.userUid,
      ).toBe(userUid);
    }
    for (const payload of [
      withoutPerson,
      { ...request.payload, userUid: null },
      { ...request.payload, userUid: "" },
      { ...request.payload, userUid: 42 },
      { ...request.payload, userUid: { user_uid: "user-1" } },
      { ...request.payload, userUid: "x".repeat(1_025) },
      { ...request.payload, userUid: "😀".repeat(1_025) },
      { ...request.payload, token: "must-not-cross" },
      { ...request.payload, headers: { authorization: "Bearer must-not-cross" } },
      { ...request.payload, headers: { cookie: "session=must-not-cross" } },
      { ...request.payload, headers: { accept: "" } },
      { ...request.payload, headers: { accept: " application/json" } },
      { ...request.payload, headers: { accept: "x".repeat(1_025) } },
      { ...request.payload, headers: { accept: "application/json\r\nx-injected: 1" } },
      { ...request.payload, method: "HEAD" },
      { ...request.payload, method: "post" },
      { ...request.payload, method: "GET" },
      { ...request.payload, body: 42 },
      { ...request.payload, requestId: "request id" },
      { method: "GET", path: "/api/items/" },
    ]) {
      expect(readStaticSitePlatformRequestMessage({ ...request, payload }, channel)).toBeNull();
    }
    expect(readStaticSitePlatformRequestMessage({ ...request, extra: true }, channel)).toBeNull();
    expect(readStaticSitePlatformRequestMessage(request, "mainsequence.other")).toBeNull();
    expect(() => platformRequest("platform-3", { body: "x" })).toThrow("no body");
    expect(() => platformRequest("platform-4", { userUid: "" })).toThrow("userUid");

    const response = buildStaticSitePlatformResponseMessage({
      channel,
      requestId: "platform-1",
      status: 201,
      headers: { "content-type": "application/json" },
      body: '{"id":1}',
      bodyEncoding: "text",
    });
    expect(readStaticSitePlatformResponseMessage(response, channel)).toEqual(response);
    expect(readStaticSiteIframeMessage(response, channel)).toEqual(response);
    for (const payload of [
      { ...response.payload, status: 99 },
      { ...response.payload, status: 600 },
      { ...response.payload, status: 200.5 },
      { ...response.payload, status: "200" },
      { ...response.payload, headers: { "set-cookie": "session=must-not-cross" } },
      { ...response.payload, headers: undefined },
      { ...response.payload, bodyEncoding: "binary" },
      { ...response.payload, bodyEncoding: "base64", body: "not base64!" },
      { ...response.payload, bodyEncoding: "base64", body: "abc" },
      { ...response.payload, bodyEncoding: "base64", body: "====" },
      { ...response.payload, token: "must-not-cross" },
    ]) {
      expect(readStaticSitePlatformResponseMessage({ ...response, payload }, channel)).toBeNull();
    }

    for (const code of platformErrorCodes) {
      const error = buildStaticSitePlatformErrorMessage({ channel, requestId: "platform-1", code });
      expect(error.payload).toEqual({ requestId: "platform-1", code });
      expect(readStaticSitePlatformErrorMessage(error, channel)).toEqual(error);
      expect(readStaticSiteIframeMessage(error, channel)).toEqual(error);
    }
    const unknownError = {
      channel,
      version: 1,
      type: "platform-error",
      payload: { requestId: "platform-1", code: "origin_not_allowed" },
    };
    expect(readStaticSitePlatformErrorMessage(unknownError, channel)).toBeNull();
    expect(() =>
      buildStaticSitePlatformErrorMessage({ channel, requestId: "p", code: "unknown" as never }),
    ).toThrow();

    const cancel = buildStaticSitePlatformCancelMessage({ channel, requestId: "platform-1" });
    expect(cancel).toEqual({
      channel,
      version: 1,
      type: "platform-cancel",
      payload: { requestId: "platform-1" },
    });
    expect(readStaticSitePlatformCancelMessage(cancel, channel)).toEqual(cancel);
    expect(readStaticSiteIframeMessage(cancel, channel)).toEqual(cancel);
    expect(
      readStaticSitePlatformCancelMessage(
        { ...cancel, payload: { requestId: "platform-1", path: "/api/items/" } },
        channel,
      ),
    ).toBeNull();
  });

  it("accepts only an absolute path with an optional query, and nothing that escapes it", () => {
    const readPath = (path: unknown) =>
      readStaticSitePlatformRequestMessage(
        {
          channel,
          version: 1,
          type: "platform-request",
          payload: { requestId: "platform-path", userUid: "user-1", method: "GET", path },
        },
        channel,
      )?.payload.path ?? null;
    for (const path of [
      "/",
      "/api/items/",
      "/api/items/?limit=20&search=a%20b",
      "/api/items/.../",
      "/api/agents/a1b2c3/icon.png",
      "/api/items/?next=//elsewhere/../x",
      "/api/items/?filter[name]=a|b^{c}`d",
      "/api/%E2%9C%93/",
      `/${"a".repeat(4_095)}`,
    ]) {
      expect(readPath(path)).toBe(path);
    }
    for (const path of [
      "",
      "api/items/",
      "https://platform.example.com/api/items/",
      "//platform.example.com/api/items/",
      "/api//items/",
      "/api/items/#top",
      "/api\\items/",
      "/api/items/?q=a\\b",
      "/api/../admin/",
      "/api/./items/",
      "/api/..",
      "/api/%2e%2e/admin/",
      "/api/%2E/items/",
      "/api/.%2e/admin/",
      "/api/items%2Fadmin/",
      "/api/items%5cadmin/",
      "/api/items/%zz",
      "/api/items/?discount=50%",
      "/api/items/ with space",
      "/api/items/é",
      "/api/items/\n",
      '/api/items/?q="x"',
      `/${"a".repeat(4_096)}`,
      42,
    ]) {
      expect(readPath(path)).toBeNull();
    }
    expect(() => platformRequest("platform-path", { path: "/api/../admin/" })).toThrow();
  });

  it("caps request bodies at 1 MiB and response bodies at 8 MiB", () => {
    const readBody = (body: string) =>
      readStaticSitePlatformRequestMessage(
        {
          channel,
          version: 1,
          type: "platform-request",
          payload: {
            requestId: "platform-body",
            userUid: "user-1",
            method: "POST",
            path: "/api/items/",
            body,
          },
        },
        channel,
      );
    expect(readBody("a".repeat(1_048_576))).not.toBeNull();
    expect(readBody("a".repeat(1_048_577))).toBeNull();
    expect(readBody("é".repeat(524_288))).not.toBeNull();
    expect(readBody(`${"é".repeat(524_288)}a`)).toBeNull();
    expect(readBody("😀".repeat(262_144))).not.toBeNull();
    expect(readBody(`${"😀".repeat(262_144)}a`)).toBeNull();

    const readResponse = (body: string, bodyEncoding: string) =>
      readStaticSitePlatformResponseMessage(
        {
          channel,
          version: 1,
          type: "platform-response",
          payload: { requestId: "platform-body", status: 200, headers: {}, body, bodyEncoding },
        },
        channel,
      );
    expect(readResponse("a".repeat(8_388_608), "text")).not.toBeNull();
    expect(readResponse("a".repeat(8_388_609), "text")).toBeNull();
    expect(readResponse(Buffer.alloc(8_388_608).toString("base64"), "base64")).not.toBeNull();
    expect(readResponse(Buffer.alloc(8_388_609).toString("base64"), "base64")).toBeNull();
    expect(() =>
      buildStaticSitePlatformResponseMessage({
        channel,
        requestId: "platform-body",
        status: 200,
        body: "a".repeat(8_388_609),
        bodyEncoding: "text",
      }),
    ).toThrow("8 MiB");
  });
});

describe("static-site platform request host", () => {
  it("sends the request as the person in its context and relays the platform's response", async () => {
    const sender = vi.fn<SendStaticSitePlatformRequest>(
      async () =>
        new Response('{"items":[]}', {
          status: 201,
          headers: {
            "content-type": "application/json",
            "set-cookie": "session=must-not-cross",
            "x-platform-detail": "must-not-cross",
          },
        }),
    );
    const { deliver, waitForAnswer, targetWindow } = createPlatformHost({
      sendPlatformRequest: sender,
    });
    expect(
      deliver(
        platformRequest("platform-1", {
          method: "POST",
          path: "/api/items/?limit=20",
          headers: { accept: "application/json", "content-type": "application/json" },
          body: '{"name":"a"}',
        }),
      ),
    ).toBe(true);
    expect(await waitForAnswer("platform-1")).toEqual(
      buildStaticSitePlatformResponseMessage({
        channel,
        requestId: "platform-1",
        status: 201,
        headers: { "content-type": "application/json" },
        body: '{"items":[]}',
        bodyEncoding: "text",
      }),
    );
    expect(sender).toHaveBeenCalledOnce();
    const [request, context] = sender.mock.calls[0]!;
    expect(request).toEqual({
      method: "POST",
      path: "/api/items/?limit=20",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: '{"name":"a"}',
    });
    expect(context.userUid).toBe("user-1");
    expect(context.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.stringify(targetWindow.postMessage.mock.calls)).not.toContain("must-not-cross");

    deliver(platformRequest("platform-2"));
    await waitForAnswer("platform-2");
    expect(sender.mock.calls[1]![0]).toEqual({ method: "GET", path: "/api/items/", headers: {} });
  });

  it("sends JSON and UTF-8 text as text and every other body as base64", async () => {
    const cases: Array<[BodyInit | null, HeadersInit, number, Record<string, unknown>]> = [
      [pngBytes, { "content-type": "image/png" }, 200, {
        headers: { "content-type": "image/png" },
        body: Buffer.from(pngBytes).toString("base64"),
        bodyEncoding: "base64",
      }],
      [new Uint8Array([0xe9]), { "content-type": "text/plain; charset=iso-8859-1" }, 200, {
        body: "6Q==",
        bodyEncoding: "base64",
      }],
      [new Uint8Array([0x7b, 0xff, 0x7d]), { "content-type": "application/json" }, 200, {
        body: "e/99",
        bodyEncoding: "base64",
      }],
      [new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]), { "content-type": "application/json" }, 200, {
        body: "﻿{}",
        bodyEncoding: "text",
      }],
      ['{"title":"x"}', { "content-type": "application/problem+json" }, 400, {
        body: '{"title":"x"}',
        bodyEncoding: "text",
      }],
      ["a,b\n1,2", { "content-type": 'text/csv; charset="UTF-8"' }, 200, {
        body: "a,b\n1,2",
        bodyEncoding: "text",
      }],
      [new Uint8Array([0x78]), {}, 200, { headers: {}, body: "eA==", bodyEncoding: "base64" }],
      [null, {}, 204, { headers: {}, body: "", bodyEncoding: "base64" }],
    ];
    for (const [index, [body, headers, status, expected]] of cases.entries()) {
      const response = new Response(body, { status, headers });
      const { deliver, waitForAnswer, host } = createPlatformHost({
        sendPlatformRequest: async () => response,
      });
      deliver(platformRequest(`platform-encoding-${index}`));
      const answer = await waitForAnswer(`platform-encoding-${index}`);
      expect(answer.type).toBe("platform-response");
      expect(answer.payload).toMatchObject({ status, ...expected });
      host.dispose();
    }
  });

  it("answers every refusal and failure with a sanitized error code", async () => {
    const reject = (error: unknown) => vi.fn(async () => Promise.reject(error));
    const cases: Array<[SendStaticSitePlatformRequest | undefined, string | null, string]> = [
      [undefined, "user-1", "unsupported"],
      [undefined, null, "unsupported"],
      [async () => new Response("{}"), null, "access_denied"],
      ...platformErrorCodes.map(
        (code): [SendStaticSitePlatformRequest, string, string] => [
          reject(new StaticSitePlatformRequestError(code)),
          "user-1",
          code,
        ],
      ),
      [reject(new Error("platform said: token=secret-value")), "user-1", "temporarily_unavailable"],
      [reject(new TypeError("Failed to fetch secret-value")), "user-1", "temporarily_unavailable"],
      [async () => ({}) as Response, "user-1", "temporarily_unavailable"],
      [async () => Response.error(), "user-1", "temporarily_unavailable"],
      [async () => new Response(new Uint8Array(8_388_609)), "user-1", "unsupported"],
    ];
    for (const [index, [sendPlatformRequest, userUid, code]] of cases.entries()) {
      const { deliver, waitForAnswer, host, targetWindow } = createPlatformHost({
        sendPlatformRequest,
        userUid,
      });
      deliver(platformRequest(`platform-failure-${index}`));
      expect(await waitForAnswer(`platform-failure-${index}`)).toEqual(
        buildStaticSitePlatformErrorMessage({
          channel,
          requestId: `platform-failure-${index}`,
          code: code as StaticSitePlatformRequestErrorCode,
        }),
      );
      expect(JSON.stringify(targetWindow.postMessage.mock.calls)).not.toContain("secret-value");
      host.dispose();
    }

    const sender = vi.fn(async () => new Response("{}"));
    const { deliver, waitForAnswer, answers, onProtocolError } = createPlatformHost({
      sendPlatformRequest: sender,
    });
    deliver(platformRequest("platform-replayed"));
    await waitForAnswer("platform-replayed");
    deliver(platformRequest("platform-replayed"));
    await vi.waitFor(() =>
      expect(answers().at(-1)).toEqual(
        buildStaticSitePlatformErrorMessage({
          channel,
          requestId: "platform-replayed",
          code: "invalid_request",
        }),
      ),
    );
    expect(
      deliver({
        ...platformRequest("platform-malformed"),
        payload: {
          requestId: "platform-malformed",
          userUid: "user-1",
          method: "GET",
          path: "/api/../admin/",
        },
      }),
    ).toBe(false);
    expect(answers().at(-1)).toEqual(
      buildStaticSitePlatformErrorMessage({
        channel,
        requestId: "platform-malformed",
        code: "invalid_request",
      }),
    );
    expect(onProtocolError).toHaveBeenCalledWith("Rejected malformed static-site iframe message.");
    expect(sender).toHaveBeenCalledOnce();
  });

  it("sends only for the person the request names, and refuses one sent before a person change", async () => {
    const sender = vi.fn<SendStaticSitePlatformRequest>(async () => new Response("{}"));
    const { host, deliver, waitForAnswer } = createPlatformHost({ sendPlatformRequest: sender });
    const refused = (requestId: string) =>
      buildStaticSitePlatformErrorMessage({ channel, requestId, code: "access_denied" });

    deliver(platformRequest("platform-other-person", { userUid: "user-2" }));
    expect(await waitForAnswer("platform-other-person")).toEqual(refused("platform-other-person"));

    // The child sends for user-1; the host's person changes before the message arrives.
    const inTransit = platformRequest("platform-in-transit");
    host.updateContext({ themeId: "graphite", themeMode: "dark", userUid: "user-2" });
    deliver(inTransit);
    expect(await waitForAnswer("platform-in-transit")).toEqual(refused("platform-in-transit"));

    host.updateContext({ themeId: "graphite", themeMode: "dark", userUid: null });
    deliver(platformRequest("platform-signed-out", { userUid: "user-2" }));
    expect(await waitForAnswer("platform-signed-out")).toEqual(refused("platform-signed-out"));
    expect(sender).not.toHaveBeenCalled();

    host.updateContext({ themeId: "graphite", themeMode: "dark", userUid: "user-2" });
    deliver(platformRequest("platform-current-person", { userUid: "user-2" }));
    expect((await waitForAnswer("platform-current-person")).type).toBe("platform-response");
    expect(sender).toHaveBeenCalledOnce();
    expect(sender.mock.calls[0]![1].userUid).toBe("user-2");
  });

  it("refuses a request past 16 in flight for its child", async () => {
    const releases: Array<() => void> = [];
    const sender = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          releases.push(() => resolve(new Response("{}")));
        }),
    );
    const { deliver, waitForAnswer, answerFor } = createPlatformHost({ sendPlatformRequest: sender });
    for (let index = 0; index < 16; index += 1) deliver(platformRequest(`platform-cap-${index}`));
    await vi.waitFor(() => expect(sender).toHaveBeenCalledTimes(16));
    deliver(platformRequest("platform-cap-16"));
    expect(await waitForAnswer("platform-cap-16")).toEqual(
      buildStaticSitePlatformErrorMessage({
        channel,
        requestId: "platform-cap-16",
        code: "temporarily_unavailable",
      }),
    );
    releases[0]!();
    await waitForAnswer("platform-cap-0");
    deliver(platformRequest("platform-cap-17"));
    await vi.waitFor(() => expect(sender).toHaveBeenCalledTimes(17));
    expect(answerFor("platform-cap-17")).toBeUndefined();
  });

  it("aborts the sender's work on cancel, a person change, a new handshake, a new sender, and disposal", async () => {
    const signals: AbortSignal[] = [];
    const resolvers: Array<(response: Response) => void> = [];
    const sender: SendStaticSitePlatformRequest = (_request, { signal }) =>
      new Promise<Response>((resolve) => {
        signals.push(signal);
        resolvers.push(resolve);
      });
    const { host, deliver, answerFor } = createPlatformHost({ sendPlatformRequest: sender });

    deliver(platformRequest("platform-cancelled"));
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    expect(deliver(buildStaticSitePlatformCancelMessage({ channel, requestId: "platform-cancelled" })))
      .toBe(true);
    expect(signals[0]!.aborted).toBe(true);
    const unread = new Response("{}");
    resolvers[0]!(unread);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(answerFor("platform-cancelled")).toBeUndefined();
    // The host cancels the body of a response it will not relay.
    expect(unread.bodyUsed).toBe(true);

    deliver(platformRequest("platform-person"));
    await vi.waitFor(() => expect(signals).toHaveLength(2));
    host.updateContext({ themeId: "graphite", themeMode: "dark", userUid: "user-2" });
    expect(signals[1]!.aborted).toBe(true);

    deliver(platformRequest("platform-handshake", { userUid: "user-2" }));
    await vi.waitFor(() => expect(signals).toHaveLength(3));
    host.updateContext({ themeId: "quartz-light", themeMode: "light", userUid: "user-2" });
    expect(signals[2]!.aborted).toBe(false);
    deliver(buildStaticSiteIframeReadyMessage(channel));
    expect(signals[2]!.aborted).toBe(true);

    deliver(platformRequest("platform-sender", { userUid: "user-2" }));
    await vi.waitFor(() => expect(signals).toHaveLength(4));
    host.updatePlatformRequestSender(sender);
    expect(signals[3]!.aborted).toBe(false);
    host.updatePlatformRequestSender(async () => new Response("{}"));
    expect(signals[3]!.aborted).toBe(true);
    expect(answerFor("platform-sender")).toEqual(
      buildStaticSitePlatformErrorMessage({
        channel,
        requestId: "platform-sender",
        code: "temporarily_unavailable",
      }),
    );
    host.updatePlatformRequestSender(sender);

    deliver(platformRequest("platform-disposed", { userUid: "user-2" }));
    await vi.waitFor(() => expect(signals).toHaveLength(5));
    host.dispose();
    expect(signals[4]!.aborted).toBe(true);
    resolvers.forEach((resolve) => resolve(new Response("{}")));
    await new Promise((resolve) => setTimeout(resolve, 10));
    for (const requestId of ["platform-person", "platform-handshake", "platform-disposed"]) {
      expect(answerFor(requestId)).toBeUndefined();
    }
    expect(() => host.updatePlatformRequestSender(sender)).toThrow("disposed");
  });

  it("times out a silent sender as temporarily_unavailable", async () => {
    let senderSignal: AbortSignal | undefined;
    const { deliver, waitForAnswer } = createPlatformHost({
      sendPlatformRequest: (_request, { signal }) => {
        senderSignal = signal;
        return new Promise<Response>(() => undefined);
      },
      platformRequestTimeoutMs: 5,
    });
    deliver(platformRequest("platform-slow"));
    expect(await waitForAnswer("platform-slow")).toEqual(
      buildStaticSitePlatformErrorMessage({
        channel,
        requestId: "platform-slow",
        code: "temporarily_unavailable",
      }),
    );
    expect(senderSignal?.aborted).toBe(true);
  });

  it("carries request and response bodies past the default payload limit", async () => {
    const requestBody = JSON.stringify({ text: "a".repeat(200_000) });
    const responseBody = JSON.stringify({ text: "b".repeat(1_000_000) });
    const sender = vi.fn<SendStaticSitePlatformRequest>(
      async () => new Response(responseBody, { headers: { "content-type": "application/json" } }),
    );
    const { deliver, waitForAnswer, onProtocolError } = createPlatformHost({
      sendPlatformRequest: sender,
    });
    expect(
      deliver(platformRequest("platform-large", { method: "PUT", body: requestBody })),
    ).toBe(true);
    const answer = await waitForAnswer("platform-large");
    expect(sender.mock.calls[0]![0].body).toBe(requestBody);
    expect(answer.payload).toMatchObject({ body: responseBody, bodyEncoding: "text" });
    expect(onProtocolError).not.toHaveBeenCalled();
  });
});

describe("static-site platform request client", () => {
  const url = "https://site.example.com/api/items/";

  it("is unsupported before the handshake and denied without a person", async () => {
    const parentWindow = { postMessage: vi.fn() };
    const client = createStaticSiteIframeClient({
      channel,
      hostOrigin: platformHostOrigin,
      parentWindow,
      onContext: vi.fn(),
    });
    await expect(client.sendPlatformRequest(new Request(url))).rejects.toMatchObject({
      name: "StaticSitePlatformRequestError",
      code: "unsupported",
    });
    client.dispose();

    const anonymous = createPlatformClient({ userUid: null });
    await expect(anonymous.client.sendPlatformRequest(new Request(url))).rejects.toMatchObject({
      code: "access_denied",
    });
    expect(anonymous.sent()).toEqual([]);
    anonymous.client.dispose();
    await expect(anonymous.client.sendPlatformRequest(new Request(url))).rejects.toMatchObject({
      code: "unsupported",
    });
  });

  it("sends only the method, the path and query, accept, content-type, and a text body", async () => {
    const { client, sent, respond, parentWindow } = createPlatformClient();
    const pending = client.sendPlatformRequest(
      new Request("https://anywhere.example.com/api/items/?limit=20#top", {
        method: "PATCH",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          authorization: "Bearer must-not-cross",
          cookie: "session=must-not-cross",
          "x-custom": "must-not-cross",
        },
        body: '{"name":"a"}',
      }),
    );
    await vi.waitFor(() => expect(sent()).toHaveLength(1));
    expect(sent()[0]).toEqual({
      channel,
      version: 1,
      type: "platform-request",
      payload: {
        requestId: expect.stringMatching(/^[A-Za-z0-9._:-]{1,128}$/u),
        userUid: "user-1",
        method: "PATCH",
        path: "/api/items/?limit=20",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: '{"name":"a"}',
      },
    });
    expect(parentWindow.postMessage).toHaveBeenLastCalledWith(sent()[0], platformHostOrigin);
    expect(JSON.stringify(parentWindow.postMessage.mock.calls)).not.toContain("must-not-cross");
    respond(sent()[0]!.payload.requestId);
    await pending;

    const lowerCase = {
      url,
      method: "patch",
      headers: new Headers(),
      body: null,
      signal: new AbortController().signal,
    } as unknown as Request;
    void client.sendPlatformRequest(lowerCase).catch(() => undefined);
    await vi.waitFor(() => expect(sent()).toHaveLength(2));
    expect(sent()[1]!.payload).toMatchObject({ method: "PATCH", path: "/api/items/" });
    expect(sent()[1]!.payload).not.toHaveProperty("body");

    void client.sendPlatformRequest(new Request(url, { method: "DELETE" })).catch(() => undefined);
    await vi.waitFor(() => expect(sent()).toHaveLength(3));
    expect(sent()[2]!.payload).toEqual({
      requestId: expect.any(String),
      userUid: "user-1",
      method: "DELETE",
      path: "/api/items/",
    });
    client.dispose();
  });

  it("resolves a Fetch Response with the platform's status, content type, and body", async () => {
    const { client, sent, respond } = createPlatformClient();
    const json = client.sendPlatformRequest(new Request(url));
    await vi.waitFor(() => expect(sent()).toHaveLength(1));
    expect(
      respond(sent()[0]!.payload.requestId, { status: 201, body: '{"id":"é"}' }),
    ).toBe(true);
    const jsonResponse = await json;
    expect(jsonResponse).toBeInstanceOf(Response);
    expect(jsonResponse.status).toBe(201);
    expect(jsonResponse.headers.get("content-type")).toBe("application/json");
    expect(await jsonResponse.json()).toEqual({ id: "é" });

    const image = client.sendPlatformRequest(new Request(`${url}icon.png`));
    await vi.waitFor(() => expect(sent()).toHaveLength(2));
    respond(sent()[1]!.payload.requestId, {
      headers: { "content-type": "image/png" },
      body: Buffer.from(pngBytes).toString("base64"),
      bodyEncoding: "base64",
    });
    const imageResponse = await image;
    expect((await imageResponse.clone().blob()).type).toBe("image/png");
    expect(new Uint8Array(await imageResponse.arrayBuffer())).toEqual(pngBytes);

    const missing = client.sendPlatformRequest(new Request(`${url}missing/`));
    await vi.waitFor(() => expect(sent()).toHaveLength(3));
    respond(sent()[2]!.payload.requestId, { status: 404, body: '{"detail":"Not found."}' });
    expect((await missing).status).toBe(404);

    const deleted = client.sendPlatformRequest(new Request(url, { method: "DELETE" }));
    await vi.waitFor(() => expect(sent()).toHaveLength(4));
    respond(sent()[3]!.payload.requestId, { status: 204, headers: {}, body: "" });
    const deletedResponse = await deleted;
    expect(deletedResponse.status).toBe(204);
    expect(deletedResponse.body).toBeNull();
    client.dispose();
  });

  it("rejects with the host's error code", async () => {
    const { client, sent, deliver } = createPlatformClient();
    for (const [index, code] of platformErrorCodes.entries()) {
      const pending = client.sendPlatformRequest(new Request(url));
      await vi.waitFor(() => expect(sent()).toHaveLength(index + 1));
      expect(
        deliver(
          buildStaticSitePlatformErrorMessage({
            channel,
            requestId: sent()[index]!.payload.requestId,
            code,
          }),
        ),
      ).toBe(true);
      await expect(pending).rejects.toBeInstanceOf(StaticSitePlatformRequestError);
      await expect(pending).rejects.toMatchObject({ code });
    }
    client.dispose();
  });

  it("refuses an invalid request locally without sending it", async () => {
    const { client, sent } = createPlatformClient();
    const used = new Request(url, { method: "POST", body: "{}" });
    await used.text();
    const invalid: Request[] = [
      new Request(url, { method: "HEAD" }),
      new Request(url, { method: "OPTIONS" }),
      new Request("https://site.example.com/api/items%2Fadmin/"),
      new Request("https://site.example.com/api/items/?q=a\\b"),
      new Request(`https://site.example.com/${"a".repeat(4_096)}`),
      new Request("data:text/plain,hello"),
      new Request(url, { headers: { accept: "x".repeat(1_025) } }),
      new Request(url, { method: "POST", body: "a".repeat(1_048_577) }),
      new Request(url, { method: "POST", body: new Uint8Array([0xff, 0xfe]) }),
      used,
    ];
    for (const request of invalid) {
      await expect(client.sendPlatformRequest(request)).rejects.toMatchObject({
        code: "invalid_request",
      });
    }
    await expect(client.sendPlatformRequest("/api/items/" as never)).rejects.toMatchObject({
      code: "invalid_request",
    });
    expect(sent()).toEqual([]);
    client.dispose();

    const unrepresentable = createPlatformClient({ userUid: "u".repeat(1_025) });
    await expect(unrepresentable.client.sendPlatformRequest(new Request(url))).rejects.toMatchObject({
      code: "invalid_request",
    });
    expect(unrepresentable.sent()).toEqual([]);
    unrepresentable.client.dispose();
  });

  it("sends platform-cancel and rejects with an AbortError when the request's signal aborts", async () => {
    const { client, sent, cancelled, respond, onProtocolError } = createPlatformClient();
    const controller = new AbortController();
    const pending = client.sendPlatformRequest(new Request(url, { signal: controller.signal }));
    await vi.waitFor(() => expect(sent()).toHaveLength(1));
    const { requestId } = sent()[0]!.payload;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelled()).toEqual([requestId]);
    expect(respond(requestId)).toBe(false);
    expect(onProtocolError).toHaveBeenCalledWith(
      "Rejected unmatched static-site platform response.",
    );

    const aborted = new AbortController();
    aborted.abort();
    await expect(
      client.sendPlatformRequest(new Request(url, { signal: aborted.signal })),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(sent()).toHaveLength(1);
    client.dispose();
  });

  it("reports a host that never answers as unsupported after its timeout", async () => {
    const { client, sent, cancelled } = createPlatformClient({ platformRequestTimeoutMs: 5 });
    await expect(client.sendPlatformRequest(new Request(url))).rejects.toMatchObject({
      code: "unsupported",
    });
    expect(cancelled()).toEqual([sent()[0]!.payload.requestId]);
    client.dispose();
  });

  it("keeps 16 requests in flight, queues the rest, and sends them as answers arrive", async () => {
    const { client, sent, respond, cancelled } = createPlatformClient();
    const controllers = Array.from({ length: 20 }, () => new AbortController());
    const pending = controllers.map((controller, index) =>
      client.sendPlatformRequest(new Request(`${url}${index}/`, { signal: controller.signal })),
    );
    pending.forEach((request) => void request.catch(() => undefined));
    await vi.waitFor(() => expect(sent()).toHaveLength(16));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(sent()).toHaveLength(16);

    controllers[16]!.abort();
    await expect(pending[16]).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelled()).toEqual([]);

    respond(sent()[0]!.payload.requestId);
    await expect(pending[0]).resolves.toBeInstanceOf(Response);
    expect(sent()).toHaveLength(17);
    expect(sent()[16]!.payload.path).toBe("/api/items/17/");

    controllers[1]!.abort();
    await expect(pending[1]).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelled()).toEqual([sent()[1]!.payload.requestId]);
    expect(sent()).toHaveLength(18);
    expect(sent()[17]!.payload.path).toBe("/api/items/18/");
    client.dispose();
  });

  it("rejects queued and in-flight requests with access_denied when the person changes", async () => {
    const { client, sent, cancelled, respond, initialize } = createPlatformClient();
    const pending = Array.from({ length: 17 }, (_, index) =>
      client.sendPlatformRequest(new Request(`${url}${index}/`)),
    );
    await vi.waitFor(() => expect(sent()).toHaveLength(16));
    initialize("user-1");
    initialize("user-2");
    for (const request of pending) {
      await expect(request).rejects.toMatchObject({ code: "access_denied" });
    }
    expect(cancelled()).toEqual(sent().map((message) => message.payload.requestId));
    expect(respond(sent()[0]!.payload.requestId)).toBe(false);
    expect(sent()).toHaveLength(16);

    const next = client.sendPlatformRequest(new Request(url));
    await vi.waitFor(() => expect(sent()).toHaveLength(17));
    expect(sent()[16]!.payload.userUid).toBe("user-2");
    respond(sent()[16]!.payload.requestId);
    await expect(next).resolves.toBeInstanceOf(Response);
    client.dispose();
  });

  it("fails a request whose answer is malformed or cannot be a Fetch Response", async () => {
    const { client, sent, deliver, respond } = createPlatformClient();
    const malformed = client.sendPlatformRequest(new Request(url));
    await vi.waitFor(() => expect(sent()).toHaveLength(1));
    expect(
      deliver({
        channel,
        version: 1,
        type: "platform-response",
        payload: {
          requestId: sent()[0]!.payload.requestId,
          status: 200,
          headers: {},
          body: "not base64!",
          bodyEncoding: "base64",
        },
      }),
    ).toBe(false);
    await expect(malformed).rejects.toMatchObject({ code: "invalid_request" });

    const informational = client.sendPlatformRequest(new Request(url));
    await vi.waitFor(() => expect(sent()).toHaveLength(2));
    expect(respond(sent()[1]!.payload.requestId, { status: 100, headers: {}, body: "" })).toBe(true);
    await expect(informational).rejects.toMatchObject({ code: "unsupported" });
    client.dispose();
  });

  it("rejects and cancels everything on disposal", async () => {
    const { client, sent, cancelled } = createPlatformClient();
    const pending = Array.from({ length: 17 }, (_, index) =>
      client.sendPlatformRequest(new Request(`${url}${index}/`)),
    );
    await vi.waitFor(() => expect(sent()).toHaveLength(16));
    client.dispose();
    for (const request of pending) {
      await expect(request).rejects.toMatchObject({ code: "unsupported" });
    }
    expect(cancelled()).toHaveLength(16);
  });
});

describe("static-site platform request bridge", () => {
  it("carries a child's Fetch Request to the host's sender and the platform's Response back", async () => {
    const hostWindow = { postMessage: vi.fn() };
    const childWindow = { postMessage: vi.fn() };
    const platformCalls: Array<{ url: string; init: RequestInit }> = [];
    const platformFetch = async (input: URL, init: RequestInit) => {
      platformCalls.push({ url: input.toString(), init });
      if (input.pathname.endsWith("/icon.png")) {
        return new Response(pngBytes, { headers: { "content-type": "image/png" } });
      }
      return new Response(JSON.stringify({ path: input.pathname, query: input.search }), {
        headers: { "content-type": "application/json" },
      });
    };
    const host = createStaticSiteIframeHost({
      targetOrigin: platformSiteOrigin,
      targetWindow: childWindow,
      context: { themeId: "graphite", themeMode: "dark", userUid: "user-1" },
      sendPlatformRequest: async (request, { signal }) => {
        if (!request.path.startsWith("/api/agents/")) {
          throw new StaticSitePlatformRequestError("not_allowed");
        }
        return platformFetch(new URL(request.path, "https://platform.example.com"), {
          method: request.method,
          headers: { ...request.headers, authorization: "Bearer host-held-credential" },
          body: request.body,
          signal,
        });
      },
    });
    const client = createStaticSiteIframeClient({
      channel,
      hostOrigin: platformHostOrigin,
      parentWindow: hostWindow,
      onContext: vi.fn(),
    });
    // postMessage delivers a structured clone on a later task.
    childWindow.postMessage.mockImplementation((message: unknown) => {
      setTimeout(() =>
        client.handleMessage({
          origin: platformHostOrigin,
          source: hostWindow as unknown as MessageEventSource,
          data: structuredClone(message),
        }),
      );
    });
    hostWindow.postMessage.mockImplementation((message: unknown) => {
      setTimeout(() =>
        host.handleMessage({
          origin: platformSiteOrigin,
          source: childWindow as unknown as MessageEventSource,
          data: structuredClone(message),
        }),
      );
    });
    client.announceReady();
    await vi.waitFor(() => expect(host.ready).toBe(true));
    await vi.waitFor(() =>
      expect(childWindow.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "initialize" }),
        platformSiteOrigin,
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const json = await client.sendPlatformRequest(
      new Request(`${platformSiteOrigin}/api/agents/?limit=5`, {
        headers: { accept: "application/json" },
      }),
    );
    expect(await json.json()).toEqual({ path: "/api/agents/", query: "?limit=5" });
    expect(platformCalls[0]).toMatchObject({
      url: "https://platform.example.com/api/agents/?limit=5",
      init: {
        method: "GET",
        headers: { accept: "application/json", authorization: "Bearer host-held-credential" },
      },
    });

    const icon = await client.sendPlatformRequest(
      new Request(`${platformSiteOrigin}/api/agents/a1/icon.png`),
    );
    expect(icon.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await icon.arrayBuffer())).toEqual(pngBytes);

    await expect(
      client.sendPlatformRequest(
        new Request(`${platformSiteOrigin}/api/users/`, { method: "POST", body: "{}" }),
      ),
    ).rejects.toMatchObject({ code: "not_allowed" });
    expect(platformCalls).toHaveLength(2);
    expect(JSON.stringify(hostWindow.postMessage.mock.calls)).not.toContain("host-held-credential");
    expect(JSON.stringify(childWindow.postMessage.mock.calls)).not.toContain("host-held-credential");

    client.dispose();
    host.dispose();
  });

  it("refuses, and never sends, a request whose person changes while it is in transit", async () => {
    const hostWindow = { postMessage: vi.fn() };
    const childWindow = { postMessage: vi.fn() };
    const toHost: unknown[] = [];
    const toChild: unknown[] = [];
    hostWindow.postMessage.mockImplementation((message: unknown) => toHost.push(message));
    childWindow.postMessage.mockImplementation((message: unknown) => toChild.push(message));
    const sender = vi.fn<SendStaticSitePlatformRequest>(async () => new Response("{}"));
    const host = createStaticSiteIframeHost({
      targetOrigin: platformSiteOrigin,
      targetWindow: childWindow,
      context: { themeId: "graphite", themeMode: "dark", userUid: "user-1" },
      sendPlatformRequest: sender,
    });
    const onProtocolError = vi.fn();
    const client = createStaticSiteIframeClient({
      channel,
      hostOrigin: platformHostOrigin,
      parentWindow: hostWindow,
      onContext: vi.fn(),
      onProtocolError,
    });
    const deliverToHost = () =>
      toHost.splice(0).forEach((data) =>
        host.handleMessage({
          origin: platformSiteOrigin,
          source: childWindow as unknown as MessageEventSource,
          data: structuredClone(data),
        }),
      );
    const deliverToChild = () =>
      toChild.splice(0).forEach((data) =>
        client.handleMessage({
          origin: platformHostOrigin,
          source: hostWindow as unknown as MessageEventSource,
          data: structuredClone(data),
        }),
      );
    client.announceReady();
    deliverToHost();
    deliverToChild();

    const pending = client.sendPlatformRequest(new Request(`${platformSiteOrigin}/api/items/`));
    pending.catch(() => undefined);
    await vi.waitFor(() => expect(toHost).toHaveLength(1));
    expect(toHost[0]).toMatchObject({ type: "platform-request", payload: { userUid: "user-1" } });
    host.updateContext({ themeId: "graphite", themeMode: "dark", userUid: "user-2" });
    deliverToHost();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(sender).not.toHaveBeenCalled();
    expect(toChild.map((message) => (message as { type: string }).type)).toEqual([
      "initialize",
      "platform-error",
    ]);
    deliverToChild();
    await expect(pending).rejects.toMatchObject({ code: "access_denied" });

    // The child told the host to stop the refused request; its next request names the new person.
    expect(toHost).toEqual([expect.objectContaining({ type: "platform-cancel" })]);
    const next = client.sendPlatformRequest(new Request(`${platformSiteOrigin}/api/items/`));
    await vi.waitFor(() => expect(toHost).toHaveLength(2));
    expect(toHost[1]).toMatchObject({ type: "platform-request", payload: { userUid: "user-2" } });
    deliverToHost();
    await vi.waitFor(() => expect(toChild).toHaveLength(1));
    deliverToChild();
    await expect(next).resolves.toBeInstanceOf(Response);
    expect(sender).toHaveBeenCalledOnce();
    expect(sender.mock.calls[0]![1].userUid).toBe("user-2");

    client.dispose();
    host.dispose();
  });
});
