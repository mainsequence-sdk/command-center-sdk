// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  STATIC_SITE_IFRAME_DEFAULT_SANDBOX,
  StaticSiteIframe,
} from "./static-site-react";
import {
  buildStaticSiteFastApiWebSocketTicketRequestMessage,
  buildStaticSiteIframeReadyMessage,
  buildStaticSitePlatformErrorMessage,
  buildStaticSitePlatformRequestMessage,
  type SendStaticSitePlatformRequest,
} from "./static-site";

describe("StaticSiteIframe", () => {
  it("renders the reviewed default sandbox and referrer policy", () => {
    const markup = renderToStaticMarkup(
      <StaticSiteIframe
        src="https://site.example.com/.mainsequence/launch#token=one-use-token"
        themeId="main-sequence-space"
        themeMode="dark"
        userUid="user-1"
      />,
    );

    expect(markup).toContain(`sandbox="${STATIC_SITE_IFRAME_DEFAULT_SANDBOX}"`);
    expect(markup).toContain('referrerPolicy="no-referrer"');
    expect(markup).toContain('title="Static site"');
  });

  it("allows a host to narrow or expand iframe capabilities explicitly", () => {
    const markup = renderToStaticMarkup(
      <StaticSiteIframe
        src="https://site.example.com/app"
        themeId="quartz-light"
        themeMode="light"
        userUid={null}
        sandbox="allow-scripts"
        referrerPolicy="origin"
      />,
    );

    expect(markup).toContain('sandbox="allow-scripts"');
    expect(markup).toContain('referrerPolicy="origin"');
  });

  it("keeps the application resolver out of rendered iframe attributes", () => {
    const resolver = async () => ({
      resourceReleaseUid: "11111111-1111-4111-8111-111111111111",
      rpcUrl: "https://fastapi.example.com/",
      token: "delegated-token",
      expiresAt: "2099-08-18T12:05:00Z",
    });
    const markup = renderToStaticMarkup(
      <StaticSiteIframe
        src="https://site.example.com/app"
        themeId="quartz-light"
        themeMode="light"
        userUid="user-1"
        resolveFastApiCredential={resolver}
      />,
    );
    expect(markup).not.toContain("resolveFastApiCredential");
    expect(markup).not.toContain("delegated-token");
  });

  it("replaces the WebSocket resolver without replacing the initialized host", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let firstSignal: AbortSignal | undefined;
    const firstResolver = vi.fn(
      (_request, { signal }: { signal: AbortSignal }) =>
        new Promise<never>(() => {
          firstSignal = signal;
        }),
    );
    const secondResolver = vi.fn(async ({ resourceReleaseUid, path }) => ({
      resourceReleaseUid,
      origin: "https://site.example.com",
      path,
      websocketUrl: `wss://fastapi.example.com${path}`,
      subprotocol: `mainsequence.ws-ticket.${"a".repeat(32)}`,
      expiresAt: "2099-09-13T12:02:00Z",
    }));
    const render = (resolveFastApiWebSocketTicket: typeof firstResolver | typeof secondResolver) => (
      <StaticSiteIframe
        src="https://site.example.com/app"
        themeId="graphite"
        themeMode="dark"
        userUid="user-1"
        resolveFastApiWebSocketTicket={resolveFastApiWebSocketTicket}
      />
    );

    await act(async () => root.render(render(firstResolver)));
    const iframe = container.querySelector("iframe")!;
    const childWindow = iframe.contentWindow!;
    const dispatch = (data: unknown) =>
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "https://site.example.com",
          source: childWindow,
          data,
        }),
      );
    dispatch(buildStaticSiteIframeReadyMessage("mainsequence.react-test"));
    dispatch(
      buildStaticSiteFastApiWebSocketTicketRequestMessage({
        channel: "mainsequence.react-test",
        requestId: "react-request-1",
        resourceReleaseUid: "11111111-1111-4111-8111-111111111111",
        path: "/ws/orders",
      }),
    );
    await vi.waitFor(() => expect(firstResolver).toHaveBeenCalledOnce());

    await act(async () => root.render(render(secondResolver)));
    expect(container.querySelector("iframe")).toBe(iframe);
    expect(firstSignal?.aborted).toBe(true);
    dispatch(
      buildStaticSiteFastApiWebSocketTicketRequestMessage({
        channel: "mainsequence.react-test",
        requestId: "react-request-2",
        resourceReleaseUid: "11111111-1111-4111-8111-111111111111",
        path: "/ws/orders",
      }),
    );
    await vi.waitFor(() => expect(secondResolver).toHaveBeenCalledOnce());

    await act(async () => root.unmount());
    container.remove();
  });

  it("sends platform requests through the sender prop and abandons them when it is replaced", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let firstSignal: AbortSignal | undefined;
    const firstSender = vi.fn<SendStaticSitePlatformRequest>(
      (_request, { signal }) =>
        new Promise<Response>(() => {
          firstSignal = signal;
        }),
    );
    const secondSender = vi.fn<SendStaticSitePlatformRequest>(async () => new Response("{}"));
    const render = (sendPlatformRequest: SendStaticSitePlatformRequest) => (
      <StaticSiteIframe
        src="https://site.example.com/app"
        themeId="graphite"
        themeMode="dark"
        userUid="user-1"
        sendPlatformRequest={sendPlatformRequest}
      />
    );

    await act(async () => root.render(render(firstSender)));
    const iframe = container.querySelector("iframe")!;
    const childWindow = iframe.contentWindow!;
    const posted = vi.spyOn(childWindow, "postMessage");
    const dispatch = (data: unknown) =>
      window.dispatchEvent(
        new MessageEvent("message", { origin: "https://site.example.com", source: childWindow, data }),
      );
    dispatch(buildStaticSiteIframeReadyMessage("mainsequence.react-test"));
    const request = (requestId: string) =>
      buildStaticSitePlatformRequestMessage({
        channel: "mainsequence.react-test",
        requestId,
        method: "GET",
        path: "/api/items/",
      });
    dispatch(request("react-platform-1"));
    await vi.waitFor(() => expect(firstSender).toHaveBeenCalledOnce());
    expect(firstSender.mock.calls[0]![1].userUid).toBe("user-1");

    await act(async () => root.render(render(secondSender)));
    expect(container.querySelector("iframe")).toBe(iframe);
    expect(firstSignal?.aborted).toBe(true);
    expect(posted).toHaveBeenCalledWith(
      buildStaticSitePlatformErrorMessage({
        channel: "mainsequence.react-test",
        requestId: "react-platform-1",
        code: "temporarily_unavailable",
      }),
      "https://site.example.com",
    );
    dispatch(request("react-platform-2"));
    await vi.waitFor(() => expect(secondSender).toHaveBeenCalledOnce());

    await act(async () => root.unmount());
    container.remove();
  });
});
