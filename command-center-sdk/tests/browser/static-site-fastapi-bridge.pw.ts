import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

const targetUid = "11111111-1111-4111-8111-111111111111";
const sdkModulePath = fileURLToPath(
  new URL("../../dist/embed/static-site.js", import.meta.url),
);

type BrowserResult = {
  scenario: string;
  statuses: number[];
  states: Array<{
    status: string;
    attempt: number;
    responseStatus?: number;
  }>;
  errorName?: string;
  localStorage: number;
  sessionStorage: number;
  bodyText: string;
  location: string;
};

type RuntimeRequest = {
  path: string;
  authorization: string | undefined;
  resourceReleaseUid: string | undefined;
  legacyFastApiId: string | undefined;
  origin: string | undefined;
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
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

function sendHtml(response: ServerResponse, html: string) {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
}

function hostHtml(childOrigin: string, apiOrigin: string, scenario: string) {
  const rpcUrl = scenario === "transient" ? "http://127.0.0.1:1/" : `${apiOrigin}/`;
  return `<!doctype html>
<html><body><main id="host">Host fixture</main><script type="module">
import { createStaticSiteIframeHost } from "/sdk/static-site.js";
const childOrigin = ${JSON.stringify(childOrigin)};
const iframe = document.createElement("iframe");
iframe.src = childOrigin + "/child?scenario=" + ${JSON.stringify(scenario)};
iframe.sandbox = "allow-scripts allow-same-origin";
document.body.append(iframe);
let resolverCalls = 0;
const host = createStaticSiteIframeHost({
  targetOrigin: childOrigin,
  targetWindow: iframe.contentWindow,
  context: { themeId: "graphite", themeMode: "dark", userUid: "public-user-uid" },
  resolveFastApiCredential: async ({ resourceReleaseUid }, { signal }) => {
    if (signal.aborted) throw new DOMException("cancelled", "AbortError");
    resolverCalls += 1;
    return {
      resourceReleaseUid,
      rpcUrl: ${JSON.stringify(rpcUrl)},
      token: "delegated-browser-token-" + resolverCalls,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
  },
});
window.addEventListener("message", (event) => {
  if (event.origin === childOrigin && event.data?.type === "browser-fixture-result") {
    window.__bridgeResult = { ...event.data.payload, resolverCalls };
    return;
  }
  host.handleMessage(event);
});
</script></body></html>`;
}

function childHtml(hostOrigin: string, scenario: string) {
  return `<!doctype html>
<html><body><main id="child">Child fixture</main><script type="module">
import { createStaticSiteIframeClient } from "/sdk/static-site.js";
const hostOrigin = ${JSON.stringify(hostOrigin)};
const scenario = ${JSON.stringify(scenario)};
const states = [];
const controller = new AbortController();
let started = false;
const client = createStaticSiteIframeClient({
  channel: "mainsequence.browser-fixture",
  hostOrigin,
  parentWindow: window.parent,
  fastApiRetryPolicy: { maxAttempts: 3, baseDelayMs: 25, maxDelayMs: 50 },
  onFastApiStateChange(state) {
    states.push({
      status: state.status,
      attempt: state.attempt,
      ...(state.responseStatus === undefined ? {} : { responseStatus: state.responseStatus }),
    });
    if (scenario === "cancel" && state.status === "runtime-starting") controller.abort();
  },
  async onContext() {
    if (started) return;
    started = true;
    const statuses = [];
    let errorName;
    try {
      if (scenario === "states") {
        statuses.push((await client.fetchFastApi({ resourceReleaseUid: ${JSON.stringify(targetUid)}, path: "/forbidden" })).status);
        statuses.push((await client.fetchFastApi({ resourceReleaseUid: ${JSON.stringify(targetUid)}, path: "/missing" })).status);
      } else {
        const path = scenario === "refresh" ? "/refresh" : "/cold";
        statuses.push((await client.fetchFastApi(
          { resourceReleaseUid: ${JSON.stringify(targetUid)}, path },
          { signal: scenario === "cancel" ? controller.signal : undefined },
        )).status);
      }
    } catch (error) {
      errorName = error instanceof Error ? error.name : "UnknownError";
    }
    window.parent.postMessage({
      type: "browser-fixture-result",
      payload: {
        scenario,
        statuses,
        states,
        ...(errorName ? { errorName } : {}),
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

test.describe("static-site delegated FastAPI browser bridge", () => {
  let hostOrigin = "";
  let childOrigin = "";
  let apiOrigin = "";
  let closeServers: Array<() => Promise<void>> = [];
  let runtimeRequests: RuntimeRequest[] = [];
  let coldCalls = 0;

  test.beforeAll(async () => {
    const sdkModule = await readFile(sdkModulePath, "utf8");
    let expectedChildOrigin = "";
    const api = await listen((request, response) => {
      response.setHeader("Access-Control-Allow-Origin", expectedChildOrigin);
      response.setHeader("Vary", "Origin");
      if (request.method === "OPTIONS") {
        response.writeHead(204, {
          "Access-Control-Allow-Headers": "Authorization, X-Resource-Release-UID",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Max-Age": "60",
        });
        response.end();
        return;
      }
      runtimeRequests.push({
        path: request.url ?? "",
        authorization: request.headers.authorization,
        resourceReleaseUid: request.headers["x-resource-release-uid"] as string | undefined,
        legacyFastApiId: request.headers["x-fastapi-id"] as string | undefined,
        origin: request.headers.origin,
      });
      if (request.url === "/cold") {
        coldCalls += 1;
        if (coldCalls % 3 !== 0) {
          response.writeHead(503, { "Content-Type": "application/json", "Retry-After": "0" });
          response.end('{"detail":"starting"}');
          return;
        }
      } else if (request.url === "/refresh" && request.headers.authorization?.endsWith("-1")) {
        response.writeHead(401, { "Content-Type": "application/json" });
        response.end('{"detail":"expired"}');
        return;
      } else if (request.url === "/forbidden") {
        response.writeHead(403, { "Content-Type": "application/json" });
        response.end('{"detail":"forbidden"}');
        return;
      } else if (request.url === "/missing") {
        response.writeHead(404, { "Content-Type": "application/json" });
        response.end('{"detail":"missing"}');
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end('{"ok":true}');
    });
    apiOrigin = api.origin;

    const child = await listen((request, response) => {
      if (request.url === "/sdk/static-site.js") {
        response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
        response.end(sdkModule);
        return;
      }
      const url = new URL(request.url ?? "/", child.origin);
      sendHtml(response, childHtml(hostOrigin, url.searchParams.get("scenario") ?? "cold"));
    });
    childOrigin = child.origin;
    expectedChildOrigin = childOrigin;

    const host = await listen((request, response) => {
      if (request.url === "/sdk/static-site.js") {
        response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
        response.end(sdkModule);
        return;
      }
      const url = new URL(request.url ?? "/", host.origin);
      sendHtml(
        response,
        hostHtml(childOrigin, apiOrigin, url.searchParams.get("scenario") ?? "cold"),
      );
    });
    hostOrigin = host.origin;
    closeServers = [host.close, child.close, api.close];
  });

  test.afterAll(async () => {
    await Promise.all(closeServers.map((close) => close()));
  });

  test.beforeEach(() => {
    runtimeRequests = [];
    coldCalls = 0;
  });

  async function runScenario(page: Page, scenario: string) {
    const consoleMessages: string[] = [];
    page.on("console", (message: { text(): string }) => consoleMessages.push(message.text()));
    await page.goto(`${hostOrigin}/host?scenario=${scenario}`);
    await page.waitForFunction(() => Boolean((window as Window & { __bridgeResult?: unknown }).__bridgeResult));
    const result = await page.evaluate(
      () => (window as Window & { __bridgeResult: BrowserResult & { resolverCalls: number } }).__bridgeResult,
    );
    expect(JSON.stringify({ result, consoleMessages })).not.toContain("delegated-browser-token");
    expect(result.localStorage).toBe(0);
    expect(result.sessionStorage).toBe(0);
    expect(result.bodyText).not.toContain("delegated-browser-token");
    expect(result.location).not.toContain("delegated-browser-token");
    return result;
  }

  test("retries a cold runtime with the canonical release header", async ({ page }) => {
    const result = await runScenario(page, "cold");
    expect(result.statuses).toEqual([200]);
    expect(result.states.map((state) => state.status)).toEqual([
      "authorizing",
      "runtime-starting",
      "runtime-starting",
      "ready",
    ]);
    expect(result.resolverCalls).toBe(1);
    expect(runtimeRequests).toHaveLength(3);
    for (const request of runtimeRequests) {
      expect(request.authorization).toBe("Bearer delegated-browser-token-1");
      expect(request.resourceReleaseUid).toBe(targetUid);
      expect(request.legacyFastApiId).toBeUndefined();
      expect(request.origin).toBe(childOrigin);
    }
  });

  test("reacquires once after 401 and distinguishes 403 from 404", async ({ page }) => {
    const refresh = await runScenario(page, "refresh");
    expect(refresh.statuses).toEqual([200]);
    expect(refresh.resolverCalls).toBe(2);
    expect(refresh.states.map((state) => state.status)).toEqual([
      "authorizing",
      "expired",
      "authorizing",
      "ready",
    ]);

    runtimeRequests = [];
    const states = await runScenario(page, "states");
    expect(states.statuses).toEqual([403, 404]);
    expect(states.states.map((state) => state.status)).toEqual([
      "authorizing",
      "forbidden",
      "missing-route",
    ]);
  });

  test("keeps opaque transport failure transient and cancels retry backoff", async ({ page }) => {
    const transient = await runScenario(page, "transient");
    expect(transient.errorName).toBe("TypeError");
    expect(transient.states.filter((state) => state.status === "transient")).toHaveLength(3);

    const cancelled = await runScenario(page, "cancel");
    expect(cancelled.errorName).toBe("AbortError");
    expect(cancelled.states.map((state) => state.status)).toContain("runtime-starting");
    expect(cancelled.states.at(-1)?.status).toBe("cancelled");
    expect(runtimeRequests).toHaveLength(1);
  });
});
