// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AGENT_ICON_REVALIDATE_MS,
  clearAgentIconCache,
  ensureAgentIcon,
  getAgentIconCacheEntry,
  isAgentIconRequestInFlight,
} from "./agent-icon-cache.js";
import { apngStill } from "./apng-still.js";
import { createChatBackendConnection } from "../backend/connection.js";

// What the platform serves: a 32 px two-frame APNG and a static PNG, both from its sanitizer.
const APNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACGFjVEwAAAACAAAAAPONk3AAAAAaZmNUTAAAAAAAAAAgAAAAIAAAAAAAAAAAAGQD6AAAcyZw9wAAAD1JREFUeJxjYBgFo2AUjHTASEjBBxGN/5RYIPDmBl47mCgxnBpg1AGjDhh1wKgDRh0w6oBRB4yCUTAKRgEAcagEIFRAp3wAAAAaZmNUTAAAAAEAAAAQAAAAEAAAAAgAAAAIAGQD6AAAmBjZzgAAACFmZEFUAAAAAnicYxTR+PCfgQLARInmUQNGDRg1YDAZAAANFwJLQfgfzgAAAABJRU5ErkJggg=="), (character) => character.charCodeAt(0));
const STATIC_PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAPElEQVR42mNgGAWjYBSMdMBISMEHEY3/lFgg8OYGXjuYBjoERh0w6oBRB4w6YNQBow4YdcAoGAWjYBQAAHGoBCArKbGwAAAAAElFTkSuQmCC"), (character) => character.charCodeAt(0));

function pngChunkTypes(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const types: string[] = [];
  for (let offset = 8; offset + 12 <= bytes.length; offset += 12 + view.getUint32(offset)) {
    types.push(String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)));
  }
  return types;
}

const connection = createChatBackendConnection({ apiBaseUrl: "http://localhost:8000" });

const url = "https://api.test/api/v1/command-center/agents/a1/icon/";

// A string body with its Content-Type: the Response of Node 22 does not take jsdom's Blob.
function iconResponse(body: string, etag: string | null) {
  return new Response(body, {
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

  it("keeps a still of frame 0 for an animated PNG and revokes it with the icon", async () => {
    fetchMock.mockResolvedValueOnce(new Response(APNG, { status: 200, headers: { "Content-Type": "image/png" } }));
    ensureAgentIcon({ connection, url, token: "jwt" });
    await vi.waitFor(() => expect(getAgentIconCacheEntry(url)?.status).toBe("ready"));
    expect(getAgentIconCacheEntry(url)).toMatchObject({ objectUrl: "blob:test/1", stillObjectUrl: "blob:test/2" });
    const still = createObjectURL.mock.calls[1]?.[0];
    expect(still?.type).toBe("image/png");
    expect(pngChunkTypes(new Uint8Array(await still!.arrayBuffer()))).toEqual(["IHDR", "IDAT", "IEND"]);

    clearAgentIconCache();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test/1");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test/2");
  });

  it("makes no still for a static icon", async () => {
    fetchMock.mockResolvedValueOnce(new Response(STATIC_PNG, { status: 200, headers: { "Content-Type": "image/png" } }));
    ensureAgentIcon({ connection, url, token: "jwt" });
    await vi.waitFor(() => expect(getAgentIconCacheEntry(url)?.status).toBe("ready"));
    expect(getAgentIconCacheEntry(url)?.stillObjectUrl).toBeNull();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });
});

describe("apngStill", () => {
  it("drops the animation chunks and keeps frame 0 byte for byte", () => {
    expect(pngChunkTypes(APNG)).toEqual(["IHDR", "acTL", "fcTL", "IDAT", "fcTL", "fdAT", "IEND"]);
    const still = apngStill(APNG)!;
    expect(pngChunkTypes(still)).toEqual(["IHDR", "IDAT", "IEND"]);
    expect(Array.from(still.subarray(0, 8))).toEqual(Array.from(APNG.subarray(0, 8)));
  });

  it("returns null for a static PNG, other bytes, and a truncated APNG", () => {
    expect(apngStill(STATIC_PNG)).toBeNull();
    expect(apngStill(new TextEncoder().encode("<svg/>"))).toBeNull();
    expect(apngStill(APNG.subarray(0, 80))).toBeNull();
  });
});
