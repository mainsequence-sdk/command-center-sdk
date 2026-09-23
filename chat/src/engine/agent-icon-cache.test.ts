// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AGENT_ICON_REVALIDATE_MS,
  clearAgentIconCache,
  ensureAgentIcon,
  getAgentIconCacheEntry,
  isAgentIconRequestInFlight,
} from "./agent-icon-cache.js";
import { createChatBackendConnection } from "../backend/connection.js";

const connection = createChatBackendConnection({ apiBaseUrl: "http://localhost:8000" });

const url = "https://api.test/api/v1/command-center/agents/a1/icon/";

function iconResponse(body: string, etag: string | null) {
  return new Response(new Blob([body], { type: "image/svg+xml" }), {
    status: 200,
    headers: etag ? { ETag: etag, "Content-Type": "image/svg+xml" } : { "Content-Type": "image/svg+xml" },
  });
}

describe("agent icon cache", () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
  const createObjectURL = vi.fn<(blob: Blob) => string>();
  const revokeObjectURL = vi.fn<(objectUrl: string) => void>();
  let objectUrlCounter = 0;

  beforeEach(() => {
    objectUrlCounter = 0;
    fetchMock.mockReset();
    createObjectURL.mockReset();
    createObjectURL.mockImplementation(() => `blob:test/${(objectUrlCounter += 1)}`);
    revokeObjectURL.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    clearAgentIconCache();
  });
  afterEach(() => {
    clearAgentIconCache();
    vi.unstubAllGlobals();
  });

  it("fetches an icon once for every caller and exposes an object url", async () => {
    fetchMock.mockResolvedValue(iconResponse("<svg/>", '"one"'));
    ensureAgentIcon({ connection, url, token: "jwt" });
    ensureAgentIcon({ connection, url, token: "jwt" });
    expect(getAgentIconCacheEntry(url)?.status).toBe("loading");
    await vi.waitFor(() => expect(getAgentIconCacheEntry(url)?.status).toBe("ready"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(request?.headers).get("Authorization")).toBe("Bearer jwt");
    expect(getAgentIconCacheEntry(url)?.objectUrl).toBe("blob:test/1");
    // Ready and fresh: no new request.
    ensureAgentIcon({ connection, url, token: "jwt" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("revalidates after the window, keeping the object url when the bytes did not change", async () => {
    fetchMock.mockResolvedValueOnce(iconResponse("<svg/>", '"one"'));
    ensureAgentIcon({ connection, url, token: "jwt" });
    await vi.waitFor(() => expect(getAgentIconCacheEntry(url)?.status).toBe("ready"));
    fetchMock.mockResolvedValueOnce(iconResponse("<svg/>", '"one"'));
    ensureAgentIcon({ connection, url, token: "jwt", now: Date.now() + AGENT_ICON_REVALIDATE_MS + 1 });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    // The entry stays ready during a revalidation; a second ensure while it
    // runs is a no-op, so wait for it to settle before the next step.
    expect(getAgentIconCacheEntry(url)?.status).toBe("ready");
    ensureAgentIcon({ connection, url, token: "jwt", now: Date.now() + AGENT_ICON_REVALIDATE_MS + 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(isAgentIconRequestInFlight(url)).toBe(false));
    expect(getAgentIconCacheEntry(url)?.objectUrl).toBe("blob:test/1");
    expect(revokeObjectURL).not.toHaveBeenCalled();
    // Changed bytes: a new object url replaces and revokes the old one.
    fetchMock.mockResolvedValueOnce(iconResponse("<svg><path/></svg>", '"two"'));
    ensureAgentIcon({ connection, url, token: "jwt", now: Date.now() + 2 * AGENT_ICON_REVALIDATE_MS + 2 });
    await vi.waitFor(() => expect(getAgentIconCacheEntry(url)?.objectUrl).toBe("blob:test/2"));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test/1");
  });

  it("fingerprints the bytes when the browser does not expose the ETag", async () => {
    fetchMock.mockResolvedValueOnce(iconResponse("<svg/>", null));
    ensureAgentIcon({ connection, url, token: "jwt" });
    await vi.waitFor(() => expect(getAgentIconCacheEntry(url)?.status).toBe("ready"));
    fetchMock.mockResolvedValueOnce(iconResponse("<svg/>", null));
    ensureAgentIcon({ connection, url, token: "jwt", now: Date.now() + AGENT_ICON_REVALIDATE_MS + 1 });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(isAgentIconRequestInFlight(url)).toBe(false));
    expect(getAgentIconCacheEntry(url)?.objectUrl).toBe("blob:test/1");
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it("marks a failed first load as an error and keeps the icon on a failed revalidation", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    ensureAgentIcon({ connection, url, token: "jwt" });
    await vi.waitFor(() => expect(getAgentIconCacheEntry(url)?.status).toBe("error"));
    expect(getAgentIconCacheEntry(url)?.objectUrl).toBeNull();
    // Still inside the retry window: no request.
    ensureAgentIcon({ connection, url, token: "jwt" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    clearAgentIconCache();
    fetchMock.mockResolvedValueOnce(iconResponse("<svg/>", '"one"'));
    ensureAgentIcon({ connection, url, token: "jwt" });
    await vi.waitFor(() => expect(getAgentIconCacheEntry(url)?.status).toBe("ready"));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    ensureAgentIcon({ connection, url, token: "jwt", now: Date.now() + AGENT_ICON_REVALIDATE_MS + 1 });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(isAgentIconRequestInFlight(url)).toBe(false));
    expect(getAgentIconCacheEntry(url)?.status).toBe("ready");
    expect(getAgentIconCacheEntry(url)?.objectUrl).toBe("blob:test/1");
  });

  it("does nothing without a token and revokes everything on clear", async () => {
    ensureAgentIcon({ connection, url, token: null });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getAgentIconCacheEntry(url)).toBeUndefined();
    fetchMock.mockResolvedValueOnce(iconResponse("<svg/>", '"one"'));
    ensureAgentIcon({ connection, url, token: "jwt" });
    await vi.waitFor(() => expect(getAgentIconCacheEntry(url)?.status).toBe("ready"));
    clearAgentIconCache();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test/1");
    expect(getAgentIconCacheEntry(url)).toBeUndefined();
  });
});
