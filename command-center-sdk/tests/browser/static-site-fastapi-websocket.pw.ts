import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { fileURLToPath } from "node:url";

const targetUid = "11111111-1111-4111-8111-111111111111";
const ticketPrefix = "mainsequence.ws-ticket.";
const acknowledgement = "mainsequence.ws-bridge.v1";
const sdkModulePath = fileURLToPath(new URL("../../dist/embed/static-site.js", import.meta.url));

type WebSocketObservation = {
  path: string;
  origin?: string;
  offered: string[];
  upstreamProtocols: string[];
  ticket: string;
};

type BrowserWebSocketResult = {
  scenario: string;
  protocols: string[];
  messages: string[];
  errors: number;
  resolverCalls: number;
  localStorage: number;
  sessionStorage: number;
  location: string;
  bodyText: string;
};

function listen(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{
  origin: string;
  server: ReturnType<typeof createServer>;
  close: () => Promise<void>;
}> {
  const server = createServer(handler);
  const sockets = new Set<Socket>();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        server,
        close: () =>
          new Promise<void>((done) => {
            for (const socket of sockets) socket.destroy();
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

function encodeServerFrame(text: string): Buffer {
  const payload = Buffer.from(text, "utf8");
  if (payload.length >= 126) throw new Error("Browser fixture frame is unexpectedly large.");
  return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
}

function readClientTextFrame(chunk: Buffer): string | null {
  if (chunk.length < 6 || (chunk[0]! & 0x0f) !== 1) return null;
  const length = chunk[1]! & 0x7f;
  if ((chunk[1]! & 0x80) === 0 || length >= 126 || chunk.length < 6 + length) return null;
  const mask = chunk.subarray(2, 6);
  const payload = chunk.subarray(6, 6 + length);
  const unmasked = Buffer.alloc(length);
  for (let index = 0; index < length; index += 1) {
    unmasked[index] = payload[index]! ^ mask[index % 4]!;
  }
  return unmasked.toString("utf8");
}

function acceptWebSocket(
  request: IncomingMessage,
  socket: Socket,
  observations: WebSocketObservation[],
  consumedTickets: Set<string>,
) {
  socket.on("error", () => {
    // Browser handshake rejection may reset this fixture socket.
  });
  const offered = String(request.headers["sec-websocket-protocol"] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const [ticket, bridge, ...upstreamProtocols] = offered;
  const key = request.headers["sec-websocket-key"];
  if (
    !key ||
    !ticket?.startsWith(ticketPrefix) ||
    bridge !== acknowledgement ||
    consumedTickets.has(ticket)
  ) {
    socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    return;
  }
  consumedTickets.add(ticket);
  observations.push({
    path: request.url ?? "",
    origin: request.headers.origin,
    offered,
    upstreamProtocols,
    ticket,
  });

  const accept = createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
  const selected =
    request.url === "/ws/application"
      ? upstreamProtocols[0]
      : request.url === "/ws/missing-selection"
        ? undefined
        : request.url === "/ws/duplicate-selection"
          ? `${acknowledgement}, ${acknowledgement}`
          : acknowledgement;
  const responseHeaders = [
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    ...(selected ? [`Sec-WebSocket-Protocol: ${selected}`] : []),
    "",
    "",
  ];
  socket.write(responseHeaders.join("\r\n"));
  socket.write(encodeServerFrame("server-ready"));
  socket.on("data", (chunk: Buffer) => {
    if ((chunk[0]! & 0x0f) === 8) {
      socket.end(Buffer.from([0x88, 0x00]));
      return;
    }
    const message = readClientTextFrame(chunk);
    if (message) socket.write(encodeServerFrame(`echo:${message}`));
  });
}

function hostHtml(childOrigin: string, webSocketOrigin: string, scenario: string) {
  return `<!doctype html><html><body><main>Host fixture</main><script type="module">
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
  resolveFastApiWebSocketTicket: async ({ resourceReleaseUid, path }, { signal }) => {
    if (signal.aborted) throw new DOMException("cancelled", "AbortError");
    resolverCalls += 1;
    return {
      resourceReleaseUid,
      origin: childOrigin,
      path,
      websocketUrl: ${JSON.stringify(webSocketOrigin.replace("http:", "ws:"))} + path,
      subprotocol: ${JSON.stringify(ticketPrefix)} + crypto.randomUUID().replaceAll("-", ""),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
  },
});
window.addEventListener("message", (event) => {
  if (event.origin === childOrigin && event.data?.type === "browser-websocket-result") {
    window.__bridgeResult = { ...event.data.payload, resolverCalls };
    return;
  }
  host.handleMessage(event);
});
</script></body></html>`;
}

function childHtml(hostOrigin: string, scenario: string) {
  return `<!doctype html><html><body><main>Child fixture</main><script type="module">
import { createStaticSiteIframeClient } from "/sdk/static-site.js";
const hostOrigin = ${JSON.stringify(hostOrigin)};
const scenario = ${JSON.stringify(scenario)};
const protocols = [];
const messages = [];
let errors = 0;
let started = false;
const client = createStaticSiteIframeClient({
  channel: "mainsequence.browser-websocket-fixture",
  hostOrigin,
  parentWindow: window.parent,
  async onContext() {
    if (started) return;
    started = true;
    const path = scenario === "application" ? "/ws/application"
      : scenario === "missing-selection" ? "/ws/missing-selection"
      : scenario === "duplicate-selection" ? "/ws/duplicate-selection" : "/ws/ack";
    const attempts = scenario === "reconnect" ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const socket = await client.createFastApiWebSocket({
        resourceReleaseUid: ${JSON.stringify(targetUid)},
        path,
        protocols: scenario === "application" ? ["orders.v2", "json"] : [],
      });
      await new Promise((resolve) => {
        const timeout = setTimeout(() => { errors += 1; resolve(); }, 2_000);
        socket.addEventListener("open", () => {
          protocols.push(socket.protocol);
          socket.send("browser-ping-" + attempt);
        }, { once: true });
        socket.addEventListener("message", (event) => {
          messages.push(String(event.data));
          if (String(event.data).startsWith("echo:")) socket.close(1000, "fixture complete");
        });
        socket.addEventListener("error", () => { errors += 1; });
        socket.addEventListener("close", () => { clearTimeout(timeout); resolve(); }, { once: true });
      });
    }
    window.parent.postMessage({
      type: "browser-websocket-result",
      payload: {
        scenario,
        protocols,
        messages,
        errors,
        localStorage: localStorage.length,
        sessionStorage: sessionStorage.length,
        location: window.location.href,
        bodyText: document.body.innerText,
      },
    }, hostOrigin);
  },
});
window.addEventListener("message", (event) => client.handleMessage(event));
client.announceReady();
</script></body></html>`;
}

test.describe("static-site FastAPI native WebSocket ticket bridge", () => {
  let hostOrigin = "";
  let childOrigin = "";
  let webSocketOrigin = "";
  let closeServers: Array<() => Promise<void>> = [];
  let observations: WebSocketObservation[] = [];
  const consumedTickets = new Set<string>();

  test.beforeAll(async () => {
    const sdkModule = await readFile(sdkModulePath, "utf8");
    const gateway = await listen((_request, response) => {
      response.writeHead(404);
      response.end();
    });
    webSocketOrigin = gateway.origin;
    gateway.server.on("upgrade", (request, socket) =>
      acceptWebSocket(request, socket, observations, consumedTickets),
    );

    const child = await listen((request, response) => {
      if (request.url === "/sdk/static-site.js") {
        response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
        response.end(sdkModule);
        return;
      }
      const url = new URL(request.url ?? "/", child.origin);
      sendHtml(response, childHtml(hostOrigin, url.searchParams.get("scenario") ?? "ack"));
    });
    childOrigin = child.origin;

    const host = await listen((request, response) => {
      if (request.url === "/sdk/static-site.js") {
        response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
        response.end(sdkModule);
        return;
      }
      const url = new URL(request.url ?? "/", host.origin);
      sendHtml(
        response,
        hostHtml(childOrigin, webSocketOrigin, url.searchParams.get("scenario") ?? "ack"),
      );
    });
    hostOrigin = host.origin;
    closeServers = [host.close, child.close, gateway.close];
  });

  test.afterAll(async () => {
    await Promise.all(closeServers.map((close) => close()));
  });

  test.beforeEach(() => {
    observations = [];
  });

  async function runScenario(page: Page, scenario: string) {
    const consoleMessages: string[] = [];
    page.on("console", (message) => consoleMessages.push(message.text()));
    await page.goto(`${hostOrigin}/host?scenario=${scenario}`);
    await page.waitForFunction(
      () => Boolean((window as Window & { __bridgeResult?: unknown }).__bridgeResult),
    );
    const result = await page.evaluate(
      () =>
        (window as Window & { __bridgeResult: BrowserWebSocketResult }).__bridgeResult,
    );
    const exposed = JSON.stringify({ result, consoleMessages });
    expect(exposed).not.toContain(ticketPrefix);
    expect(result.localStorage).toBe(0);
    expect(result.sessionStorage).toBe(0);
    expect(result.location).not.toContain("ws-ticket");
    expect(result.bodyText).not.toContain("ws-ticket");
    return result;
  }

  test("uses the fixed acknowledgement when the application selects no protocol", async ({ page }) => {
    const result = await runScenario(page, "ack");
    expect(result.protocols).toEqual([acknowledgement]);
    expect(result.messages).toContain("echo:browser-ping-0");
    expect(result.errors).toBe(0);
    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      path: "/ws/ack",
      origin: childOrigin,
      upstreamProtocols: [],
    });
    expect(observations[0]?.offered[0]).toMatch(/^mainsequence\.ws-ticket\./u);
    expect(observations[0]?.offered[1]).toBe(acknowledgement);
  });

  test("preserves an application-selected protocol after stripping platform values", async ({ page }) => {
    const result = await runScenario(page, "application");
    expect(result.protocols).toEqual(["orders.v2"]);
    expect(result.messages).toContain("echo:browser-ping-0");
    expect(result.errors).toBe(0);
    expect(observations[0]?.upstreamProtocols).toEqual(["orders.v2", "json"]);
  });

  test("fails the native handshake when a protocol selection is omitted", async ({ page }) => {
    const result = await runScenario(page, "missing-selection");
    expect(result.protocols).toEqual([]);
    expect(result.errors).toBeGreaterThan(0);
    expect(observations).toHaveLength(1);
  });

  test("fails the native handshake when multiple protocols are selected", async ({ page }) => {
    const result = await runScenario(page, "duplicate-selection");
    expect(result.protocols).toEqual([]);
    expect(result.errors).toBeGreaterThan(0);
    expect(observations).toHaveLength(1);
  });

  test("reconnects only with a fresh one-time ticket", async ({ page }) => {
    const result = await runScenario(page, "reconnect");
    expect(result.protocols).toEqual([acknowledgement, acknowledgement]);
    expect(result.resolverCalls).toBe(2);
    expect(observations).toHaveLength(2);
    expect(observations[0]?.ticket).not.toBe(observations[1]?.ticket);
  });
});
