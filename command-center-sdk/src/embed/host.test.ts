import { describe, expect, it, vi } from "vitest";

import {
  createIframeBridgeEmbed,
  createIframeBridgeHost,
  IFRAME_BRIDGE_PROTOCOL_VERSION,
} from "./index.js";

describe("iframe bridge host", () => {
  it("accepts only the configured origin, window, instance, and increasing sequence", () => {
    const targetWindow = { postMessage: vi.fn() };
    const onMessage = vi.fn();
    const host = createIframeBridgeHost({
      instanceId: "widget-1",
      targetOrigin: "https://widgets.example.com",
      targetWindow,
      onMessage,
    });
    const data = { protocol: IFRAME_BRIDGE_PROTOCOL_VERSION, type: "embed:ready", instanceId: "widget-1", sequence: 1 };
    expect(host.handleMessage({ origin: "https://evil.example", source: targetWindow as unknown as Window, data })).toBe(false);
    expect(host.handleMessage({ origin: "https://widgets.example.com", source: {} as Window, data })).toBe(false);
    expect(host.handleMessage({ origin: "https://widgets.example.com", source: targetWindow as unknown as Window, data })).toBe(true);
    expect(host.handleMessage({ origin: "https://widgets.example.com", source: targetWindow as unknown as Window, data })).toBe(false);
    expect(host.ready).toBe(true);
    expect(onMessage).toHaveBeenCalledTimes(1);
    host.dispose();
  });

  it("rejects wildcard origins, expired tokens, and oversized messages", () => {
    expect(() => createIframeBridgeHost({ instanceId: "x", targetOrigin: "*", targetWindow: { postMessage() {} }, onMessage() {} })).toThrow(/exact HTTPS/);
    const targetWindow = { postMessage() {} };
    const host = createIframeBridgeHost({
      instanceId: "x",
      targetOrigin: "https://widgets.example.com",
      targetWindow,
      maxPayloadBytes: 250,
      onMessage() {},
    });
    expect(() => host.post({
      type: "host:init",
      props: {},
      theme: {},
      locale: "en",
      capabilityTokens: [{ token: "scoped", capability: "data.read", audience: "widget-x", expiresAtMs: 1 }],
    })).toThrow(/unexpired/);
    expect(() => host.post({ type: "host:inputs", inputs: { huge: "x".repeat(500) } })).toThrow(/payload/);
    expect(host.handleMessage({
      origin: "https://widgets.example.com",
      source: targetWindow as unknown as Window,
      data: { invalid: 1n },
    })).toBe(false);
    host.dispose();
  });

  it("uses a newer sequence epoch when navigation recreates the host bridge", () => {
    const targetWindow = { postMessage: vi.fn() };
    const first = createIframeBridgeHost({
      instanceId: "x",
      targetOrigin: "https://widgets.example.com",
      targetWindow,
      onMessage() {},
    });
    first.post({ type: "host:inputs", inputs: { generation: 1 } });
    first.dispose();
    const second = createIframeBridgeHost({
      instanceId: "x",
      targetOrigin: "https://widgets.example.com",
      targetWindow,
      onMessage() {},
    });
    second.post({ type: "host:inputs", inputs: { generation: 2 } });

    const firstSequence = targetWindow.postMessage.mock.calls[0]?.[0].sequence;
    const secondSequence = targetWindow.postMessage.mock.calls[1]?.[0].sequence;
    expect(secondSequence).toBeGreaterThan(firstSequence);
    second.dispose();
  });
});

describe("iframe bridge embed", () => {
  it("accepts only its configured parent and emits an enveloped ready message", () => {
    const parentWindow = { postMessage: vi.fn() };
    const onMessage = vi.fn();
    const embed = createIframeBridgeEmbed({
      instanceId: "widget-1",
      hostOrigin: "https://command-center.example.com",
      parentWindow,
      onMessage,
    });

    embed.post({ type: "embed:ready" });
    expect(parentWindow.postMessage).toHaveBeenCalledWith(
      {
        protocol: IFRAME_BRIDGE_PROTOCOL_VERSION,
        type: "embed:ready",
        instanceId: "widget-1",
        sequence: 0,
      },
      "https://command-center.example.com",
    );

    const init = {
      protocol: IFRAME_BRIDGE_PROTOCOL_VERSION,
      type: "host:init",
      instanceId: "widget-1",
      sequence: 0,
      props: {},
      theme: {},
      locale: "en",
    };
    expect(
      embed.handleMessage({
        origin: "https://evil.example.com",
        source: parentWindow as unknown as Window,
        data: init,
      }),
    ).toBe(false);
    expect(
      embed.handleMessage({
        origin: "https://command-center.example.com",
        source: parentWindow as unknown as Window,
        data: init,
      }),
    ).toBe(true);
    expect(onMessage).toHaveBeenCalledWith(init);
    embed.dispose();
  });
});
