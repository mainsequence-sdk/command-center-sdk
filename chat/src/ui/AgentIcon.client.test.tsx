// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type CommandCenterAgentIcon } from "../backend/command-center-agent-icons-api.js";
import { createChatBackendConnection } from "../backend/connection.js";
import { clearAgentIconCache } from "../engine/agent-icon-cache.js";
import { AgentIconAuthContext, type AgentIconLookup, AgentIconsContext } from "../engine/agent-icons-context.js";

// What the chat engine's icon provider supplies: the platform connection and the person's token.
const auth = {
  connection: createChatBackendConnection({ apiBaseUrl: "https://api.test" }),
  token: "jwt",
  tokenType: "Bearer",
};

const { AgentIcon } = await import("./AgentIcon.js");

const icons: Record<string, CommandCenterAgentIcon> = {
  masked: { agentUid: "masked", rendering: "mask", url: "https://api.test/agents/masked/icon/" },
  colored: { agentUid: "colored", rendering: "color", url: "https://api.test/agents/colored/icon/" },
};
const lookup: AgentIconLookup = (uid) => (uid ? icons[uid] ?? null : null);

describe("AgentIcon", () => {
  let container: HTMLDivElement;
  let root: Root;
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () =>
      new Response(new Blob(["<svg/>"], { type: "image/svg+xml" }), {
        status: 200,
        headers: { ETag: '"one"', "Content-Type": "image/svg+xml" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    Object.assign(URL, { createObjectURL: () => "blob:test/icon", revokeObjectURL: () => {} });
    clearAgentIconCache();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    clearAgentIconCache();
    vi.unstubAllGlobals();
  });
  function render(agentUid: string | null, withProvider = true) {
    const element = (
      <AgentIcon agentUid={agentUid} className="h-5 w-5" fallback={<span data-fallback="robot" />} />
    );
    act(() => {
      root.render(
        withProvider ? (
          <AgentIconAuthContext.Provider value={auth}>
            <AgentIconsContext.Provider value={lookup}>{element}</AgentIconsContext.Provider>
          </AgentIconAuthContext.Provider>
        ) : (
          element
        ),
      );
    });
  }

  it("shows the fallback first, then a theme-following mask", async () => {
    render("masked");
    expect(container.querySelector("[data-fallback]")).not.toBeNull();
    await vi.waitFor(() => expect(container.querySelector('[data-agent-icon="mask"]')).not.toBeNull());
    const mask = container.querySelector<HTMLElement>('[data-agent-icon="mask"]')!;
    expect(mask.style.backgroundColor).toBe("currentcolor");
    expect(mask.style.maskImage).toContain("blob:test/icon");
    expect(mask.className).toContain("h-5 w-5");
    expect(container.querySelector("[data-fallback]")).toBeNull();
  });

  it("draws a colour icon as an untinted image", async () => {
    render("colored");
    await vi.waitFor(() => expect(container.querySelector('img[data-agent-icon="color"]')).not.toBeNull());
    expect(container.querySelector<HTMLImageElement>("img")?.src).toBe("blob:test/icon");
  });

  it("keeps the fallback for an agent without an icon, without a provider, and on failure", async () => {
    render("unknown");
    expect(container.querySelector("[data-fallback]")).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    render("masked", false);
    expect(container.querySelector("[data-fallback]")).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    render("masked");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.querySelector("[data-fallback]")).not.toBeNull();
    expect(container.querySelector("[data-agent-icon]")).toBeNull();
  });
});
