// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type CommandCenterAgentIcon } from "../backend/command-center-agent-icons-api.js";
import { createChatBackendConnection } from "../backend/connection.js";
import { clearAgentIconCache } from "../engine/agent-icon-cache.js";
import type { AgentIconActivity } from "../engine/agent-icon-pose.js";
import { AgentIconAuthContext, type AgentIconLookup, AgentIconsContext } from "../engine/agent-icons-context.js";

// What the chat engine's icon provider supplies: the platform connection and the person's token.
const auth = {
  connection: createChatBackendConnection({ apiBaseUrl: "https://api.test" }),
  token: "jwt",
  tokenType: "Bearer",
};

const { AgentIcon } = await import("./AgentIcon.js");

// A 32 px two-frame APNG from the platform's sanitizer.
const APNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACGFjVEwAAAACAAAAAPONk3AAAAAaZmNUTAAAAAAAAAAgAAAAIAAAAAAAAAAAAGQD6AAAcyZw9wAAAD1JREFUeJxjYBgFo2AUjHTASEjBBxGN/5RYIPDmBl47mCgxnBpg1AGjDhh1wKgDRh0w6oBRB4yCUTAKRgEAcagEIFRAp3wAAAAaZmNUTAAAAAEAAAAQAAAAEAAAAAgAAAAIAGQD6AAAmBjZzgAAACFmZEFUAAAAAnicYxTR+PCfgQLARInmUQNGDRg1YDAZAAANFwJLQfgfzgAAAABJRU5ErkJggg=="), (character) => character.charCodeAt(0));

const icons: Record<string, CommandCenterAgentIcon> = {
  masked: { agentUid: "masked", rendering: "mask", url: "https://api.test/agents/masked/icon/" },
  colored: { agentUid: "colored", rendering: "color", url: "https://api.test/agents/colored/icon/" },
  posing: {
    agentUid: "posing",
    rendering: "color",
    url: "https://api.test/agents/posing/icon/",
    poses: { reading: "https://api.test/agents/posing/icon/reading/" },
    toolPoses: { tutorial_api: "reading" },
  },
  animated: {
    agentUid: "animated",
    rendering: "color",
    imageRendering: "pixelated",
    url: "https://api.test/agents/animated/icon/",
  },
};
const lookup: AgentIconLookup = (uid) => (uid ? icons[uid] ?? null : null);

describe("AgentIcon", () => {
  let container: HTMLDivElement;
  let root: Root;
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    fetchMock.mockReset();
    // A string body with its Content-Type: the Response of Node 22 does not take jsdom's Blob.
    fetchMock.mockImplementation(async () =>
      new Response("<svg/>", {
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
  function render(
    agentUid: string | null,
    withProvider = true,
    motion?: "still" | "animate",
    activity?: AgentIconActivity | null,
  ) {
    const element = (
      <AgentIcon
        agentUid={agentUid}
        className="h-5 w-5"
        fallback={<span data-fallback="robot" />}
        motion={motion}
        activity={activity}
      />
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

  describe("an animated pixel-art icon", () => {
    let objectUrls = 0;
    beforeEach(() => {
      objectUrls = 0;
      fetchMock.mockImplementation(async () =>
        new Response(APNG, { status: 200, headers: { ETag: '"apng"', "Content-Type": "image/png" } }),
      );
      // The first object URL is the animation, the second its frame 0 still.
      Object.assign(URL, { createObjectURL: () => `blob:test/${(objectUrls += 1) === 1 ? "animated" : "still"}` });
    });

    function image() {
      return container.querySelector<HTMLImageElement>('img[data-agent-icon="color"]');
    }

    it("shows its frame 0 still by default, sharp", async () => {
      render("animated");
      await vi.waitFor(() => expect(image()).not.toBeNull());
      expect(image()?.src).toBe("blob:test/still");
      expect(image()?.dataset.agentIconMotion).toBe("still");
      expect(image()?.style.imageRendering).toBe("pixelated");
    });

    it("animates where asked", async () => {
      render("animated", true, "animate");
      await vi.waitFor(() => expect(image()).not.toBeNull());
      expect(image()?.src).toBe("blob:test/animated");
      expect(image()?.dataset.agentIconMotion).toBe("animated");
    });

    it("stays still when the person asks for reduced motion", async () => {
      vi.stubGlobal(
        "matchMedia",
        (query: string) =>
          ({
            matches: query.includes("prefers-reduced-motion"),
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {},
          }) as unknown as MediaQueryList,
      );
      render("animated", true, "animate");
      await vi.waitFor(() => expect(image()).not.toBeNull());
      expect(image()?.src).toBe("blob:test/still");
    });
  });

  it("leaves a static colour icon unmarked and smooth", async () => {
    render("colored", true, "animate");
    await vi.waitFor(() => expect(container.querySelector('img[data-agent-icon="color"]')).not.toBeNull());
    const image = container.querySelector<HTMLImageElement>("img")!;
    expect(image.dataset.agentIconMotion).toBeUndefined();
    expect(image.style.imageRendering).toBe("");
  });

  describe("poses", () => {
    const requested = () => fetchMock.mock.calls.map(([input]) => String(input));

    it("shows the pose of the application whose tool runs", async () => {
      render("posing", true, "animate", {
        thinking: true,
        tool: { application: "tutorial_api", phase: "running" },
      });
      await vi.waitFor(() =>
        expect(container.querySelector('img[data-agent-icon-pose="reading"]')).not.toBeNull(),
      );
      expect(requested()).toContain("https://api.test/agents/posing/icon/reading/");
    });

    it("loads the poses ahead where it animates, and keeps the idle icon without activity", async () => {
      render("posing", true, "animate");
      await vi.waitFor(() => expect(requested()).toContain("https://api.test/agents/posing/icon/reading/"));
      await vi.waitFor(() => expect(container.querySelector('img[data-agent-icon="color"]')).not.toBeNull());
      expect(container.querySelector("[data-agent-icon-pose]")).toBeNull();
    });

    it("loads no pose where it stays still", async () => {
      render("posing");
      await vi.waitFor(() => expect(container.querySelector('img[data-agent-icon="color"]')).not.toBeNull());
      expect(requested()).toEqual(["https://api.test/agents/posing/icon/"]);
    });
  });
});
