// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createInlineStaticSiteIframeClient, launchInlineStaticSiteIframe } from "./index.js";

afterEach(() => document.body.replaceChildren());

describe("inline Static Site iframe", () => {
  it("attaches the mounted iframe before assigning the launch URL", async () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const launchUrl = "https://static.example/.mainsequence/launch#token=test";
    const adapter = {
      launch: vi.fn(async () => ({ launchId: "reference", launchUrl })),
      attach: vi.fn(async () => {
        expect(iframe.hasAttribute("src")).toBe(false);
      }),
      close: vi.fn(async () => undefined),
    };
    const close = await launchInlineStaticSiteIframe({ iframe, releaseUid: "release", adapter });

    expect(adapter.attach).toHaveBeenCalledWith("reference", 0, undefined);
    expect(iframe.src).toBe(launchUrl);
    await close();
    await close();
    expect(adapter.close).toHaveBeenCalledOnce();
    expect(iframe.hasAttribute("src")).toBe(false);
  });

  it("releases the reference when attachment fails", async () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const adapter = {
      launch: vi.fn(async () => ({ launchId: "reference", launchUrl: "https://static.example/" })),
      attach: vi.fn(async () => { throw new Error("Attachment refused"); }),
      close: vi.fn(async () => undefined),
    };
    await expect(launchInlineStaticSiteIframe({ iframe, releaseUid: "release", adapter }))
      .rejects.toThrow("Attachment refused");
    expect(adapter.close).toHaveBeenCalledWith("reference");
    expect(iframe.hasAttribute("src")).toBe(false);
  });

  it("requires exactly one intermediate parent", () => {
    const options = {
      channel: "mainsequence.inline" as const,
      hostOrigin: "https://host.example",
      onContext: vi.fn(),
    };
    const parent = document.createElement("iframe");
    document.body.append(parent);
    const child = document.createElement("iframe");
    parent.contentDocument!.body.append(child);

    expect(createInlineStaticSiteIframeClient(child.contentWindow!, options)).toBeDefined();
    expect(() => createInlineStaticSiteIframeClient(parent.contentWindow!, options)).toThrow();
    const grandchild = document.createElement("iframe");
    child.contentDocument!.body.append(grandchild);
    expect(() => createInlineStaticSiteIframeClient(grandchild.contentWindow!, options)).toThrow();
  });
});
