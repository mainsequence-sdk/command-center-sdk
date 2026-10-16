import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildCommandCenterAgentIconsUrl,
  fetchCommandCenterAgentIconBytes,
  normalizeCommandCenterAgentIcons,
} from "./command-center-agent-icons-api.js";
import { createChatBackendConnection } from "./connection.js";

const connection = createChatBackendConnection({ apiBaseUrl: "http://localhost:8000" });

describe("command center agent icons api", () => {
  it("builds the environment-scoped projection url", () => {
    const url = new URL(buildCommandCenterAgentIconsUrl(connection, "env-1"));
    expect(url.pathname).toBe("/api/v1/command-center/agents/");
    expect(url.searchParams.get("organization_environment_uid")).toBe("env-1");
  });

  it("keeps only agents with a usable icon, keyed by uid", () => {
    const icons = normalizeCommandCenterAgentIcons([
      {
        agentUid: "a1",
        commandCenterIcon: { rendering: "mask", url: "https://api.test/icon/a1/" },
      },
      { agentUid: "a2", commandCenterIcon: null },
      { agentUid: "a3", commandCenterIcon: { rendering: "sparkle", url: "https://api.test/x/" } },
      { agentUid: "a4", commandCenterIcon: { rendering: "color", url: "  " } },
      { agentUid: "", commandCenterIcon: { rendering: "color", url: "https://api.test/x/" } },
      { agent_uid: "a5", command_center_icon: { rendering: "color", url: "https://api.test/a5/" } },
      "junk",
    ]);
    expect(Array.from(icons.keys())).toEqual(["a1", "a5"]);
    expect(icons.get("a1")).toEqual({
      agentUid: "a1",
      rendering: "mask",
      imageRendering: "auto",
      url: "https://api.test/icon/a1/",
      poses: {},
      toolPoses: {},
    });
    expect(icons.get("a5")?.rendering).toBe("color");
    expect(normalizeCommandCenterAgentIcons({ not: "an array" }).size).toBe(0);
  });

  it("reads pose urls and keeps only tool rules whose pose exists", () => {
    const icon = normalizeCommandCenterAgentIcons([
      {
        agentUid: "a1",
        commandCenterIcon: {
          rendering: "color",
          url: "https://api.test/icon/",
          poses: { reading: "https://api.test/icon/reading/", broken: 7 },
          toolPoses: { tutorial_api: "reading", orders: "missing" },
        },
      },
    ]).get("a1");
    expect(icon?.poses).toEqual({ reading: "https://api.test/icon/reading/" });
    expect(icon?.toolPoses).toEqual({ tutorial_api: "reading" });
  });

  it("keeps pixelated scaling only for colour icons", () => {
    const icons = normalizeCommandCenterAgentIcons([
      { agentUid: "pixel", commandCenterIcon: { rendering: "color", imageRendering: "pixelated", url: "https://api.test/p/" } },
      { agentUid: "mask", commandCenterIcon: { rendering: "mask", imageRendering: "pixelated", url: "https://api.test/m/" } },
      { agentUid: "odd", commandCenterIcon: { rendering: "color", imageRendering: "crisp", url: "https://api.test/o/" } },
    ]);
    expect(icons.get("pixel")?.imageRendering).toBe("pixelated");
    expect(icons.get("mask")?.imageRendering).toBe("auto");
    expect(icons.get("odd")?.imageRendering).toBe("auto");
  });
});

describe("command center agent icon bytes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks with the bearer token and accepts any type, because the delivery route answers 406 to an image-only Accept", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () =>
        new Response(new Blob(["<svg/>"], { type: "image/svg+xml" }), {
          status: 200,
          headers: { ETag: '"one"', "Content-Type": "image/svg+xml" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchCommandCenterAgentIconBytes({
      connection,
      url: "https://api.test/api/v1/command-center/agents/a1/icon/",
      token: "jwt",
    });
    expect(result.etag).toBe('"one"');
    expect(result.blob.type).toBe("image/svg+xml");
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("Accept")).toBe("*/*");
    expect(headers.get("Authorization")).toBe("Bearer jwt");
  });
});
