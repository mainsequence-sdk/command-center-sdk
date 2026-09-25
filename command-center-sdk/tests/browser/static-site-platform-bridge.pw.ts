import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

const sdkModulePath = fileURLToPath(
  new URL("../../dist/embed/static-site.js", import.meta.url),
);
const hostCredential = "Bearer host-held-browser-credential";
const pngBytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff];

type PlatformRequest = {
  method: string;
  path: string;
  authorization: string | undefined;
  origin: string | undefined;
  contentType: string | undefined;
  body: string;
};

type BrowserResult = {
  projects: unknown;
  created: { status: number; body: unknown };
  image: { contentType: string | null; bytes: number[] };
  refused: { name: string; code?: string };
  cancelled: { name: string; code?: number };
  localStorage: number;
  sessionStorage: number;
  bodyText: string;
  location: string;
};

function listen(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = createServer(handler);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}

function sendHtml(response: ServerResponse, html: string) {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function hostHtml(childOrigin: string, platformOrigin: string) {
  return `<!doctype html>
<html><body><main id="host">Host fixture</main><script type="module">
import {
  createStaticSiteIframeHost,
  StaticSitePlatformRequestError,
} from "/sdk/static-site.js";
const childOrigin = ${JSON.stringify(childOrigin)};
const iframe = document.createElement("iframe");
iframe.src = childOrigin + "/child";
iframe.sandbox = "allow-scripts allow-same-origin";
document.body.append(iframe);
const host = createStaticSiteIframeHost({
  targetOrigin: childOrigin,
  targetWindow: iframe.contentWindow,
  context: { themeId: "graphite", themeMode: "dark", userUid: "public-user-uid" },
  // The host's own authenticated fetch, restricted to the paths it serves.
  sendPlatformRequest: async (request, { signal }) => {
    if (!request.path.startsWith("/api/projects/")) {
      throw new StaticSitePlatformRequestError("not_allowed");
    }
    return fetch(${JSON.stringify(platformOrigin)} + request.path, {
      method: request.method,
      headers: { ...request.headers, authorization: ${JSON.stringify(hostCredential)} },
      body: request.body,
      signal,
    });
  },
});
window.addEventListener("message", (event) => {
  if (event.origin === childOrigin && event.data?.type === "browser-fixture-result") {
    window.__bridgeResult = event.data.payload;
    return;
  }
  host.handleMessage(event);
});
</script></body></html>`;
}

function childHtml(hostOrigin: string) {
  return `<!doctype html>
<html><body><main id="child">Child fixture</main><script type="module">
import { createStaticSiteIframeClient } from "/sdk/static-site.js";
const hostOrigin = ${JSON.stringify(hostOrigin)};
let started = false;
const failure = (error) => ({ name: error?.name ?? "UnknownError", code: error?.code });
const client = createStaticSiteIframeClient({
  channel: "mainsequence.browser-platform-fixture",
  hostOrigin,
  parentWindow: window.parent,
  async onContext() {
    if (started) return;
    started = true;
    const projectsResponse = await client.sendPlatformRequest(
      new Request("/api/projects/?limit=2", { headers: { accept: "application/json" } }),
    );
    const createdResponse = await client.sendPlatformRequest(
      new Request("/api/projects/", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer child-supplied" },
        body: JSON.stringify({ name: "Q3 review" }),
      }),
    );
    const imageResponse = await client.sendPlatformRequest(new Request("/api/projects/logo.png"));
    let refused;
    try {
      await client.sendPlatformRequest(new Request("/api/users/"));
    } catch (error) {
      refused = failure(error);
    }
    let cancelled;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 300);
    try {
      await client.sendPlatformRequest(new Request("/api/projects/slow", { signal: controller.signal }));
    } catch (error) {
      cancelled = failure(error);
    }
    window.parent.postMessage({
      type: "browser-fixture-result",
      payload: {
        projects: await projectsResponse.json(),
        created: { status: createdResponse.status, body: await createdResponse.json() },
        image: {
          contentType: imageResponse.headers.get("content-type"),
          bytes: [...new Uint8Array(await imageResponse.arrayBuffer())],
        },
        refused,
        cancelled,
        localStorage: localStorage.length,
        sessionStorage: sessionStorage.length,
        bodyText: document.body.innerText,
        location: window.location.href,
      },
    }, hostOrigin);
  },
});
window.addEventListener("message", (event) => client.handleMessage(event));
client.announceReady();
</script></body></html>`;
}

test.describe("static-site platform request browser bridge", () => {
  let hostOrigin = "";
  let childOrigin = "";
  let platformRequests: PlatformRequest[] = [];
  let slowRequestClosed = false;
  let closeServers: Array<() => Promise<void>> = [];

  test.beforeAll(async () => {
    const sdkModule = await readFile(sdkModulePath, "utf8");
    const serveSdk = (response: ServerResponse) => {
      response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
      response.end(sdkModule);
    };

    const platform = await listen(async (request, response) => {
      // The host sends every platform request, so CORS names the host's origin, not the child's.
      response.setHeader("Access-Control-Allow-Origin", hostOrigin);
      response.setHeader("Vary", "Origin");
      if (request.method === "OPTIONS") {
        response.writeHead(204, {
          "Access-Control-Allow-Headers": "Accept, Authorization, Content-Type",
          "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE",
          "Access-Control-Max-Age": "60",
        });
        response.end();
        return;
      }
      platformRequests.push({
        method: request.method ?? "",
        path: request.url ?? "",
        authorization: request.headers.authorization,
        origin: request.headers.origin,
        contentType: request.headers["content-type"],
        body: await readBody(request),
      });
      if (request.url === "/api/projects/slow") {
        response.on("close", () => {
          slowRequestClosed = true;
        });
        return;
      }
      if (request.url === "/api/projects/logo.png") {
        response.writeHead(200, { "Content-Type": "image/png" });
        response.end(Buffer.from(pngBytes));
        return;
      }
      if (request.method === "POST") {
        response.writeHead(201, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ id: "project-1", received: platformRequests.at(-1)?.body }));
        return;
      }
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Set-Cookie": "platform-session=must-not-cross",
      });
      response.end(JSON.stringify({ results: [{ id: "project-1" }], query: request.url }));
    });

    const child = await listen((request, response) => {
      if (request.url === "/sdk/static-site.js") return serveSdk(response);
      sendHtml(response, childHtml(hostOrigin));
    });
    childOrigin = child.origin;

    const host = await listen((request, response) => {
      if (request.url === "/sdk/static-site.js") return serveSdk(response);
      sendHtml(response, hostHtml(childOrigin, platform.origin));
    });
    hostOrigin = host.origin;
    closeServers = [host.close, child.close, platform.close];
  });

  test.afterAll(async () => {
    await Promise.all(closeServers.map((close) => close()));
  });

  test("sends the child's requests as the host's person and returns JSON, images, refusals, and cancellations", async ({
    page,
  }) => {
    const consoleMessages: string[] = [];
    page.on("console", (message: { text(): string }) => consoleMessages.push(message.text()));
    await page.goto(`${hostOrigin}/host`);
    await page.waitForFunction(
      () => Boolean((window as Window & { __bridgeResult?: unknown }).__bridgeResult),
      undefined,
      { timeout: 15_000 },
    );
    const result = await page.evaluate(
      () => (window as Window & { __bridgeResult: BrowserResult }).__bridgeResult,
    );

    expect(result.projects).toEqual({
      results: [{ id: "project-1" }],
      query: "/api/projects/?limit=2",
    });
    expect(result.created).toEqual({
      status: 201,
      body: { id: "project-1", received: '{"name":"Q3 review"}' },
    });
    expect(result.image).toEqual({ contentType: "image/png", bytes: pngBytes });
    expect(result.refused).toEqual({ name: "StaticSitePlatformRequestError", code: "not_allowed" });
    expect(result.cancelled).toMatchObject({ name: "AbortError" });
    await expect.poll(() => slowRequestClosed).toBe(true);

    // The platform saw only the host: its origin and its credential, never the child's header.
    expect(platformRequests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /api/projects/?limit=2",
      "POST /api/projects/",
      "GET /api/projects/logo.png",
      "GET /api/projects/slow",
    ]);
    for (const request of platformRequests) {
      expect(request.authorization).toBe(hostCredential);
      expect(request.origin).toBe(hostOrigin);
    }
    expect(platformRequests[1]).toMatchObject({
      contentType: "application/json",
      body: '{"name":"Q3 review"}',
    });

    // The child never holds the host's credential or a platform cookie.
    const childView = JSON.stringify({ result, consoleMessages });
    expect(childView).not.toContain("host-held-browser-credential");
    expect(childView).not.toContain("must-not-cross");
    expect(result.localStorage).toBe(0);
    expect(result.sessionStorage).toBe(0);
    expect(result.location).toBe(`${childOrigin}/child`);
  });
});
