// @vitest-environment jsdom
import { act } from "react";
import { Ajv2020 } from "ajv/dist/2020.js";
import legacySchema from "../../tests/fixtures/static-site-iframe-v1.legacy.schema.json";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { StaticSiteIframe } from "./react.js";
import { createStaticSiteIframeHost, createStaticSiteIframeClient, buildStaticSiteIframeReadyMessage, buildStaticSiteFastApiCredentialRequestMessage, buildStaticSiteIframeInitializeMessage, readStaticSiteIframeInitializeMessage, readStaticSiteIframeContext } from "./index.js";
import { normalizeCommandCenterLocale, resolveCommandCenterLocale } from "../localization/index.js";

describe("iframe locale compatibility and lifecycle", () => {
  it("preserves a pending platform request and the last valid context through locale and untrusted messages", async () => {
    const hostWindow = { postMessage: vi.fn() };
    const childWindow = { postMessage: vi.fn() };
    const onContext = vi.fn();
    let complete!: (response: Response) => void;
    let requestSignal: AbortSignal | undefined;
    const send = vi.fn((_request, { signal }: { signal: AbortSignal }) => {
      requestSignal = signal;
      return new Promise<Response>(resolve => { complete = resolve; });
    });
    const host = createStaticSiteIframeHost({ targetOrigin: "https://site.example.com", targetWindow: childWindow,
      context: { themeId: "graphite", themeMode: "dark", userUid: "person", locale: "de" }, sendPlatformRequest: send });
    const client = createStaticSiteIframeClient({ channel: "mainsequence.test", hostOrigin: "https://host.example.com", parentWindow: hostWindow, onContext });
    const receive = (data: unknown, origin = "https://host.example.com", source = hostWindow) => client.handleMessage({ origin, source: source as unknown as MessageEventSource, data });
    childWindow.postMessage.mockImplementation(message => queueMicrotask(() => receive(structuredClone(message))));
    hostWindow.postMessage.mockImplementation(message => queueMicrotask(() => host.handleMessage({ origin: "https://site.example.com", source: childWindow as unknown as MessageEventSource, data: structuredClone(message) })));
    try {
      client.announceReady();
      await vi.waitFor(() => expect(onContext).toHaveBeenLastCalledWith(expect.objectContaining({ locale: "de" })));
      const pending = client.sendPlatformRequest(new Request("https://site.example.com/api/data"));
      await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
      host.updateContext({ themeId: "graphite", themeMode: "dark", userUid: "person", locale: "en" });
      await vi.waitFor(() => expect(onContext).toHaveBeenLastCalledWith(expect.objectContaining({ locale: "en" })));
      expect(requestSignal?.aborted).toBe(false);
      const invalid = buildStaticSiteIframeInitializeMessage({ channel: "mainsequence.test", context: { themeId: "graphite", themeMode: "dark", userUid: "person", locale: "fr" } });
      expect(receive(invalid, "https://attacker.example.com")).toBe(false);
      expect(receive(invalid, "https://host.example.com", { postMessage: vi.fn() })).toBe(false);
      expect(receive({ ...invalid, channel: "mainsequence.other" })).toBe(false);
      expect(receive({ ...invalid, payload: { ...invalid.payload, locale: "de_AT" } })).toBe(false);
      expect(onContext).toHaveBeenCalledTimes(2);
      complete(new Response("still authorized"));
      expect(await (await pending).text()).toBe("still authorized");
      expect(send).toHaveBeenCalledTimes(1);
    } finally { client.dispose(); host.dispose(); }
  });

  it("canonicalizes locale, supports exact/base fallback, and accepts old hosts", () => {
    expect(normalizeCommandCenterLocale("de-at")).toBe("de-AT");
    expect(resolveCommandCenterLocale("de-AT", ["en", "de"])).toBe("de");
    expect(resolveCommandCenterLocale("fr", ["en", "de"])).toBe("en");
    expect(normalizeCommandCenterLocale("de_AT")).toBeNull();
    const legacy = { channel: "mainsequence.test", version: 1, type: "initialize", payload: { theme: "dark", themeId: "graphite", user: null } };
    const message = readStaticSiteIframeInitializeMessage(legacy, "mainsequence.test")!;
    expect(readStaticSiteIframeContext(message).locale).toBe("en");
    expect(readStaticSiteIframeInitializeMessage({ ...legacy, payload: { ...legacy.payload, locale: "de_AT" } }, "mainsequence.test")).toBeNull();
    expect(() => buildStaticSiteIframeInitializeMessage({ channel: "mainsequence.test", context: { themeId: "graphite", themeMode: "dark", userUid: null, locale: "de_AT" } })).toThrow("locale");
  });

  it("negotiates locale and keeps actual legacy-child messages valid against the frozen released schema", () => {
    const target = { postMessage: vi.fn() };
    const host = createStaticSiteIframeHost({ targetOrigin: "https://site.example.com", targetWindow: target, context: { themeId: "graphite", themeMode: "dark", userUid: null, locale: "de" } });
    const send = (payload: unknown) => host.handleMessage({ origin: "https://site.example.com", source: target as unknown as MessageEventSource, data: { channel: "mainsequence.test", version: 1, type: "ready", payload } });
    expect(send({ capabilities: "invalid" })).toBe(false);
    expect(send({ capabilities: ["unknown"] })).toBe(true);
    const legacyMessage = target.postMessage.mock.calls.at(-1)![0];
    expect(legacyMessage.payload).not.toHaveProperty("locale");
    const validate = new Ajv2020({ strict: false }).compile(legacySchema);
    expect(validate(legacyMessage)).toBe(true);
    host.updateContext({ themeId: "graphite", themeMode: "dark", userUid: null, locale: "it" });
    expect(validate(target.postMessage.mock.calls.at(-1)![0])).toBe(true);
    expect(send({ capabilities: ["locale-context-v1"] })).toBe(true);
    expect(target.postMessage.mock.calls.at(-1)![0].payload.locale).toBe("it");
    host.dispose();
  });

  it("sends initial and live locale without replacing the iframe or aborting authorization", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let signal: AbortSignal | undefined;
    const resolver = vi.fn((_request, context: { signal: AbortSignal }) => {
      signal = context.signal;
      return new Promise<never>(() => {});
    });
    const render = (locale: string) => <StaticSiteIframe src="https://site.example.com/app" themeId="graphite" themeMode="dark" userUid="person" locale={locale} resolveFastApiCredential={resolver} />;
    await act(async () => root.render(render("de")));
    const iframe = container.querySelector("iframe")!;
    const post = vi.spyOn(iframe.contentWindow!, "postMessage");
    const dispatch = (data: unknown) => window.dispatchEvent(new MessageEvent("message", { origin: "https://site.example.com", source: iframe.contentWindow, data }));
    dispatch(buildStaticSiteIframeReadyMessage("mainsequence.test"));
    expect(post.mock.calls.at(-1)?.[0].payload.locale).toBe("de");
    dispatch(buildStaticSiteFastApiCredentialRequestMessage({ channel: "mainsequence.test", requestId: "locale-request", resourceReleaseUid: "11111111-1111-4111-8111-111111111111" }));
    await act(async () => {});
    expect(resolver).toHaveBeenCalledTimes(1);
    await act(async () => root.render(render("en")));
    expect(container.querySelector("iframe")).toBe(iframe);
    expect(iframe.src).toBe("https://site.example.com/app");
    expect(signal?.aborted).toBe(false);
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(post.mock.calls.at(-1)?.[0].payload.locale).toBe("en");
    await act(async () => root.unmount());
    container.remove();
  });
});
