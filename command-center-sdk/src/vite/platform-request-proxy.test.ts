import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type Server,
} from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_SERVICE, sessionEntry, type CredentialStore } from "../../cli/machine-session.mjs";
import { platformRequestProxy, type PlatformRequestProxyPlugin } from "./index.js";

// No test reads this machine's credential store: the plugin is given the one a test fills.
const machine = vi.hoisted(() => ({ store: null as unknown, opened: 0 }));
vi.mock("../../cli/machine-session.mjs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../cli/machine-session.mjs")>()),
  openCredentialStore: () => {
    machine.opened += 1;
    return machine.store;
  },
}));

type DevServer = Parameters<PlatformRequestProxyPlugin["configureServer"]>[0];
type Middleware = Parameters<DevServer["middlewares"]["use"]>[0];

interface PlatformRequest {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: string;
}

const token = "developer-token";
const REFRESH_PATH = "/auth/jwt-token/token/refresh/";
const received: PlatformRequest[] = [];
// What the stand-in platform answers a renewal with, and the one token its guarded route accepts.
let renewedAccess = "";
let acceptedToken = "";
let platform: Server;
let platformUrl: string;
let devServer: Server | null = null;
let devUrl: string;
let warn: ReturnType<typeof vi.fn<(message: string) => void>>;
let middleware: Middleware;

function listen(server: Server) {
  return new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    });
  });
}

function close(server: Server) {
  return new Promise<void>((resolve) => server.close(() => resolve()));
}

async function startDevServer(
  options?: Parameters<typeof platformRequestProxy>[0],
  config: Partial<DevServer["config"]> = {},
) {
  warn = vi.fn<(message: string) => void>();
  platformRequestProxy(options).configureServer({
    middlewares: { use: (handler) => void (middleware = handler) },
    config: { logger: { warn }, ...config },
  });
  devServer = createServer((request, response) => {
    middleware(request, response, () => {
      response.statusCode = 404;
      response.end("left to the dev server");
    });
  });
  devUrl = await listen(devServer);
}

/** A raw request, so a test controls the Host header, the path, and the browser's headers. */
function send(
  requestPath: string,
  {
    method = "GET",
    headers = {},
    body,
  }: { method?: string; headers?: Record<string, string | null>; body?: string | Buffer } = {},
) {
  const outgoing: OutgoingHttpHeaders = { "sec-fetch-site": "same-origin" };
  for (const [name, value] of Object.entries(headers)) {
    if (value === null) delete outgoing[name];
    else outgoing[name] = value;
  }
  const url = new URL(devUrl);
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }>(
    (resolve, reject) => {
      const request = httpRequest(
        { host: url.hostname, port: url.port, path: requestPath, method, headers: outgoing },
        (response: IncomingMessage) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("end", () => {
            resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) });
          });
        },
      );
      request.on("error", reject);
      if (body !== undefined) request.write(body);
      request.end();
    },
  );
}

function readError(response: { body: Buffer }) {
  return JSON.parse(response.body.toString()) as { code: string; detail: string };
}

/** An unsigned token that expires `seconds` from now. The plugin reads `exp` without verifying it. */
function sessionToken(seconds: number, label = "access") {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "none" })}.${part({ exp: Math.trunc(Date.now() / 1000) + seconds, label })}.test`;
}

/** A credential store in memory, with a count of how often the session was read. */
function memoryStore() {
  const entries = new Map<string, string>();
  const store: CredentialStore & { reads: number; entries: Map<string, string> } = {
    name: "test store",
    reads: 0,
    entries,
    read(service, account) {
      if (account !== "default") store.reads += 1;
      return entries.get(`${service}\n${account}`) ?? null;
    },
    write(service, account, secret) {
      entries.set(`${service}\n${account}`, secret);
    },
    remove(service, account) {
      return entries.delete(`${service}\n${account}`);
    },
  };
  return store;
}

/** Save a session for the stand-in platform, as either CLI would, and hand the plugin its store. */
function logIn({ access, refresh = "saved-refresh", backend = platformUrl }: { access: string; refresh?: string; backend?: string }) {
  const store = memoryStore();
  store.entries.set(
    `${SESSION_SERVICE}\n${sessionEntry(backend).account}`,
    JSON.stringify({ v: 1, backend, username: "ada", access, refresh }),
  );
  machine.store = store;
  return store;
}

function savedAccess(store: ReturnType<typeof memoryStore>, backend = platformUrl) {
  return JSON.parse(store.entries.get(`${SESSION_SERVICE}\n${sessionEntry(backend).account}`) ?? "{}").access;
}

beforeAll(async () => {
  platform = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    received.push({ method: request.method ?? "", url: request.url ?? "", headers: request.headers, body });

    if (request.url?.endsWith("/api/v1/users/me/")) {
      response.setHeader("content-type", "application/json");
      response.setHeader("set-cookie", "session=platform");
      response.setHeader("etag", '"1"');
      response.end(JSON.stringify({ uid: "user-1" }));
      return;
    }
    if (request.url === "/api/v1/refused/") {
      response.statusCode = 401;
      response.end();
      return;
    }
    if (request.url === REFRESH_PATH) {
      response.statusCode = renewedAccess ? 200 : 401;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(renewedAccess ? { access: renewedAccess } : { detail: "Token is invalid or expired" }));
      return;
    }
    if (request.url === "/api/v1/guarded/") {
      response.statusCode = request.headers.authorization === `Bearer ${acceptedToken}` ? 200 : 401;
      response.setHeader("content-type", "application/json");
      response.end("{}");
      return;
    }
    if (request.url === "/api/v1/icon/") {
      response.setHeader("content-type", "image/png");
      response.end(Buffer.from([137, 80, 78, 71, 0, 255]));
      return;
    }
    response.statusCode = 201;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ created: true }));
  });
  platformUrl = await listen(platform);
});

afterAll(async () => {
  await close(platform);
});

beforeEach(() => {
  received.length = 0;
  renewedAccess = "";
  acceptedToken = "";
  machine.store = null;
  machine.opened = 0;
  vi.stubEnv("MAINSEQUENCE_ENDPOINT", platformUrl);
  vi.stubEnv("MAINSEQUENCE_ACCESS_TOKEN", token);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  if (devServer) await close(devServer);
  devServer = null;
});

describe("platformRequestProxy", () => {
  it("sends the page's request to the platform with the developer's token", async () => {
    await startDevServer();

    const response = await send("/__mainsequence__/api/v1/agent-sessions/?limit=20", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: "Bearer from-the-page",
        cookie: "page=1",
        "x-other": "1",
      },
      body: '{"name":"report"}',
    });

    expect(response.status).toBe(201);
    expect(response.headers["content-type"]).toBe("application/json");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(JSON.parse(response.body.toString())).toEqual({ created: true });
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      method: "POST",
      url: "/api/v1/agent-sessions/?limit=20",
      body: '{"name":"report"}',
    });
    expect(received[0]?.headers.authorization).toBe(`Bearer ${token}`);
    expect(received[0]?.headers.accept).toBe("application/json");
    expect(received[0]?.headers["content-type"]).toBe("application/json");
    expect(received[0]?.headers.cookie).toBeUndefined();
    expect(received[0]?.headers["x-other"]).toBeUndefined();
  });

  it("returns only the status, the content type, and the body", async () => {
    await startDevServer();

    const response = await send("/__mainsequence__/api/v1/users/me/");

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body.toString())).toEqual({ uid: "user-1" });
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.headers.etag).toBeUndefined();
  });

  it("returns a binary body unchanged", async () => {
    await startDevServer();

    const response = await send("/__mainsequence__/api/v1/icon/", { headers: { accept: "*/*" } });

    expect(response.headers["content-type"]).toBe("image/png");
    expect([...response.body]).toEqual([137, 80, 78, 71, 0, 255]);
  });

  it("keeps a path in MAINSEQUENCE_ENDPOINT", async () => {
    vi.stubEnv("MAINSEQUENCE_ENDPOINT", `${platformUrl}/base/`);
    await startDevServer();

    await send("/__mainsequence__/api/v1/users/me/");

    expect(received[0]?.url).toBe("/base/api/v1/users/me/");
  });

  it("uses the path it is given", async () => {
    await startDevServer({ path: "/__platform__" });

    expect((await send("/__platform__/api/v1/users/me/")).status).toBe(200);
    expect((await send("/__mainsequence__/api/v1/users/me/")).status).toBe(404);
  });

  it("leaves every other path to the dev server", async () => {
    await startDevServer();

    for (const other of ["/src/main.ts", "/__mainsequence__", "/__mainsequence__x/api/v1/users/me/"]) {
      const response = await send(other);
      expect(response.body.toString()).toBe("left to the dev server");
    }
    expect(received).toHaveLength(0);
  });

  it.each([
    ["another site", { "sec-fetch-site": "cross-site" }],
    ["another port on this machine", { "sec-fetch-site": "same-site" }],
    ["another origin, from a browser without Sec-Fetch-Site", { "sec-fetch-site": null, origin: "http://evil.test" }],
  ])("refuses a request from %s", async (_, headers) => {
    await startDevServer();

    const response = await send("/__mainsequence__/api/v1/users/me/", { headers });

    expect(response.status).toBe(403);
    expect(readError(response).code).toBe("cross_site_request");
    expect(received).toHaveLength(0);
  });

  it("serves the page's own requests, with or without Sec-Fetch-Site", async () => {
    await startDevServer();
    const host = new URL(devUrl).host;

    expect((await send("/__mainsequence__/api/v1/users/me/", { headers: { origin: `http://${host}` } })).status).toBe(200);
    expect((await send("/__mainsequence__/api/v1/users/me/", { headers: { "sec-fetch-site": "none" } })).status).toBe(200);
    expect(
      (await send("/__mainsequence__/api/v1/users/me/", { headers: { "sec-fetch-site": null, origin: `http://${host}` } }))
        .status,
    ).toBe(200);
  });

  it("refuses a name other than localhost, which DNS rebinding would use", async () => {
    await startDevServer();

    const response = await send("/__mainsequence__/api/v1/users/me/", {
      headers: { host: `evil.test:${new URL(devUrl).port}` },
    });

    expect(response.status).toBe(403);
    expect(readError(response).code).toBe("not_local");
    expect(received).toHaveLength(0);
  });

  it.each(["localhost", "app.localhost", "127.0.0.1", "[::1]"])("serves the Host %s", async (hostname) => {
    await startDevServer();

    const response = await send("/__mainsequence__/api/v1/users/me/", {
      headers: { host: `${hostname}:${new URL(devUrl).port}` },
    });

    expect(response.status).toBe(200);
  });

  it("refuses another computer on the network", async () => {
    await startDevServer();
    const response = { statusCode: 0, body: "", setHeader: vi.fn(), on: vi.fn() };
    const next = vi.fn();

    middleware(
      {
        method: "GET",
        url: "/__mainsequence__/api/v1/users/me/",
        headers: { host: "localhost:5174", "sec-fetch-site": "same-origin" },
        socket: { remoteAddress: "192.168.1.20" },
        async *[Symbol.asyncIterator]() {},
      },
      { ...response, end: (body?: Uint8Array | string) => void (response.body = String(body)) },
      next,
    );
    await vi.waitFor(() => expect(response.body).not.toBe(""));

    expect(JSON.parse(response.body).code).toBe("not_local");
    expect(next).not.toHaveBeenCalled();
    expect(received).toHaveLength(0);
  });

  it("forwards only the platform's /api/ routes, after resolving dot segments", async () => {
    await startDevServer();

    for (const outside of [
      "/__mainsequence__/admin/",
      "/__mainsequence__/api/../admin/",
      "/__mainsequence__/api/%2e%2e/admin/",
      "/__mainsequence__//evil.test/api/v1/",
    ]) {
      const response = await send(outside);
      expect(response.status).toBe(404);
      expect(readError(response).code).toBe("not_a_platform_api_path");
    }
    expect(received).toHaveLength(0);
  });

  it.each(["OPTIONS", "HEAD", "TRACE"])("refuses %s", async (method) => {
    await startDevServer();

    const response = await send("/__mainsequence__/api/v1/users/me/", { method });

    expect(response.status).toBe(405);
    expect(response.headers.allow).toBe("GET, POST, PUT, PATCH, DELETE");
    expect(received).toHaveLength(0);
  });

  it("refuses a body over 1 MiB", async () => {
    await startDevServer();

    const response = await send("/__mainsequence__/api/v1/agent-sessions/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: Buffer.alloc(1024 * 1024 + 1, 97),
    });

    expect(response.status).toBe(413);
    expect(received).toHaveLength(0);
  });

  it("sends a token of the environment only to the endpoint set next to it", async () => {
    vi.stubEnv("MAINSEQUENCE_ENDPOINT", "");
    // Neither the project's .env nor a saved session supplies the endpoint of an environment token.
    const project = mkdtempSync(path.join(tmpdir(), "platform-request-proxy-"));
    writeFileSync(path.join(project, ".env"), `MAINSEQUENCE_ENDPOINT=${platformUrl}\n`);
    logIn({ access: sessionToken(600) });
    try {
      await startDevServer(undefined, { root: project });

      expect(warn).toHaveBeenCalledWith(expect.stringContaining("Set MAINSEQUENCE_ENDPOINT"));
      const response = await send("/__mainsequence__/api/v1/users/me/");
      expect(response.status).toBe(503);
      expect(readError(response)).toEqual({
        code: "platform_not_configured",
        detail: "Set MAINSEQUENCE_ENDPOINT in the dev server's environment.",
      });
      expect(received).toHaveLength(0);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it("uses the token of the environment and does not read the saved session", async () => {
    const store = logIn({ access: sessionToken(600) });
    await startDevServer();

    expect((await send("/__mainsequence__/api/v1/users/me/")).status).toBe(200);

    expect(received[0]?.headers.authorization).toBe(`Bearer ${token}`);
    expect(machine.opened).toBe(0);
    expect(store.reads).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it("refuses an endpoint with credentials in it", async () => {
    vi.stubEnv("MAINSEQUENCE_ENDPOINT", "https://user:secret@platform.test");
    await startDevServer();

    const response = await send("/__mainsequence__/api/v1/users/me/");

    expect(response.status).toBe(503);
    expect(readError(response).detail).not.toContain("secret");
  });

  it("reports a platform that does not answer", async () => {
    const closed = createServer();
    const closedUrl = await listen(closed);
    await close(closed);
    vi.stubEnv("MAINSEQUENCE_ENDPOINT", closedUrl);
    await startDevServer();

    const response = await send("/__mainsequence__/api/v1/users/me/");

    expect(response.status).toBe(502);
    expect(readError(response).code).toBe("platform_unreachable");
  });

  it("passes a refused token through and says once how to fix it", async () => {
    await startDevServer();

    expect((await send("/__mainsequence__/api/v1/refused/")).status).toBe(401);
    expect((await send("/__mainsequence__/api/v1/refused/")).status).toBe(401);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Refresh it and restart the dev server"));
    expect(warn.mock.calls.flat().join(" ")).not.toContain(token);
  });

  it.each(["__mainsequence__", "/__mainsequence__/", "/", "/with space"])("rejects the path %j", (invalid) => {
    expect(() => platformRequestProxy({ path: invalid })).toThrow(TypeError);
  });

  it("runs only under vite serve", () => {
    expect(platformRequestProxy().apply).toBe("serve");
  });
});

describe("platformRequestProxy with the session saved on this machine", () => {
  beforeEach(() => {
    vi.stubEnv("MAINSEQUENCE_ACCESS_TOKEN", "");
  });

  it("sends the page's request with the saved session when no token is set", async () => {
    const access = sessionToken(600);
    logIn({ access });
    await startDevServer();

    const response = await send("/__mainsequence__/api/v1/agent-sessions/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"name":"report"}',
    });

    expect(response.status).toBe(201);
    expect(received).toHaveLength(1);
    expect(received[0]?.headers.authorization).toBe(`Bearer ${access}`);
    expect(received[0]?.body).toBe('{"name":"report"}');
    expect(warn).not.toHaveBeenCalled();
  });

  it("takes the backend from the project's .env when the environment names none", async () => {
    vi.stubEnv("MAINSEQUENCE_ENDPOINT", "");
    const project = mkdtempSync(path.join(tmpdir(), "platform-request-proxy-"));
    writeFileSync(path.join(project, ".env"), `MAINSEQUENCE_ENDPOINT=${platformUrl}/\n`);
    const access = sessionToken(600);
    logIn({ access });
    try {
      await startDevServer(undefined, { root: project });

      expect((await send("/__mainsequence__/api/v1/users/me/")).status).toBe(200);
      expect(received[0]?.headers.authorization).toBe(`Bearer ${access}`);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it("keeps the token in memory, so the store is not read for every request", async () => {
    const store = logIn({ access: sessionToken(600) });
    await startDevServer();
    const readsAtStart = store.reads;

    await Promise.all([1, 2, 3].map(() => send("/__mainsequence__/api/v1/users/me/")));
    await send("/__mainsequence__/api/v1/users/me/");

    expect(received).toHaveLength(4);
    expect(store.reads - readsAtStart).toBe(1);
  });

  it("renews a session about to expire by itself, and saves it", async () => {
    const store = logIn({ access: sessionToken(5) });
    renewedAccess = sessionToken(600, "renewed");
    await startDevServer();

    expect((await send("/__mainsequence__/api/v1/users/me/")).status).toBe(200);

    expect(received.map((request) => request.url)).toEqual([REFRESH_PATH, "/api/v1/users/me/"]);
    expect(JSON.parse(received[0]?.body ?? "{}")).toEqual({ refresh: "saved-refresh" });
    expect(received[1]?.headers.authorization).toBe(`Bearer ${renewedAccess}`);
    expect(savedAccess(store)).toBe(renewedAccess);
    expect(warn).not.toHaveBeenCalled();
  });

  it("asks once more with a renewed session when the platform refuses the token", async () => {
    const refused = sessionToken(600);
    const store = logIn({ access: refused });
    renewedAccess = sessionToken(600, "renewed");
    acceptedToken = renewedAccess;
    await startDevServer();

    const response = await send("/__mainsequence__/api/v1/guarded/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"once":true}',
    });

    expect(response.status).toBe(200);
    expect(received.map((request) => [request.url, request.headers.authorization])).toEqual([
      ["/api/v1/guarded/", `Bearer ${refused}`],
      [REFRESH_PATH, undefined],
      ["/api/v1/guarded/", `Bearer ${renewedAccess}`],
    ]);
    expect(received[2]?.body).toBe('{"once":true}');
    expect(savedAccess(store)).toBe(renewedAccess);
    expect(warn).not.toHaveBeenCalled();

    // The next request starts with the renewed token.
    received.length = 0;
    expect((await send("/__mainsequence__/api/v1/guarded/")).status).toBe(200);
    expect(received).toHaveLength(1);
  });

  it("uses a token another process already renewed instead of renewing again", async () => {
    const refused = sessionToken(600);
    const store = logIn({ access: refused });
    await startDevServer();
    expect((await send("/__mainsequence__/api/v1/guarded/")).status).toBe(401);

    // The Python CLI, say, renewed the session in the meantime and saved it.
    acceptedToken = sessionToken(600, "renewed elsewhere");
    logIn({ access: acceptedToken }).entries.forEach((value, key) => store.entries.set(key, value));
    machine.store = store;
    received.length = 0;

    expect((await send("/__mainsequence__/api/v1/guarded/")).status).toBe(200);
    expect(received.map((request) => request.url)).toEqual(["/api/v1/guarded/", "/api/v1/guarded/"]);
  });

  it("passes a refused session through and says once how to log in", async () => {
    logIn({ access: sessionToken(600) });
    renewedAccess = sessionToken(600, "renewed");
    await startDevServer();

    expect((await send("/__mainsequence__/api/v1/refused/")).status).toBe(401);
    expect((await send("/__mainsequence__/api/v1/refused/")).status).toBe(401);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(`Run "npx command-center-sdk login --backend ${platformUrl}"`),
    );
    expect(warn.mock.calls.flat().join(" ")).not.toContain(renewedAccess);
  });

  it("names the login when there is no session, when the dev server starts and on each request", async () => {
    machine.store = memoryStore();
    await startDevServer();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("No usable Main Sequence session"));
    const response = await send("/__mainsequence__/api/v1/users/me/");
    expect(response.status).toBe(503);
    expect(readError(response)).toEqual({
      code: "platform_not_configured",
      detail: `No usable Main Sequence session for ${platformUrl} on this machine. Run "npx command-center-sdk login --backend ${platformUrl}", or set MAINSEQUENCE_ACCESS_TOKEN in the dev server's environment.`,
    });
    expect(received).toHaveLength(0);
  });

  it("says that a session the backend no longer renews needs a login", async () => {
    logIn({ access: sessionToken(-10) });
    await startDevServer();

    const response = await send("/__mainsequence__/api/v1/users/me/");

    expect(response.status).toBe(503);
    expect(readError(response).code).toBe("platform_not_configured");
    expect(readError(response).detail).toContain("npx command-center-sdk login");
    expect(received.map((request) => request.url)).toEqual([REFRESH_PATH]);
  });

  it("says when this machine has no credential store", async () => {
    machine.store = null;
    await startDevServer();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("No credential store is available"));
    const response = await send("/__mainsequence__/api/v1/users/me/");
    expect(response.status).toBe(503);
    expect(readError(response).detail).toContain("No credential store is available");
  });

  it("reads no credential for a request it refuses", async () => {
    const store = logIn({ access: sessionToken(600) });
    await startDevServer();
    const readsAtStart = store.reads;

    expect((await send("/__mainsequence__/admin/")).status).toBe(404);
    expect((await send("/__mainsequence__/api/v1/users/me/", { headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    expect((await send("/__mainsequence__/api/v1/users/me/", { method: "OPTIONS" })).status).toBe(405);

    expect(store.reads).toBe(readsAtStart);
    expect(received).toHaveLength(0);
  });

  it("reports a backend that does not answer the renewal", async () => {
    const closed = createServer();
    const closedUrl = await listen(closed);
    await close(closed);
    vi.stubEnv("MAINSEQUENCE_ENDPOINT", closedUrl);
    logIn({ access: sessionToken(5), backend: closedUrl });
    await startDevServer();

    const response = await send("/__mainsequence__/api/v1/users/me/");

    expect(response.status).toBe(502);
    expect(readError(response).code).toBe("platform_unreachable");
  });
});

describe("platformRequestProxy in a Vite dev server", () => {
  it("answers before Vite's own middlewares, so an Accept: */* request is not given the page", async () => {
    const { createServer: createViteServer } = await import("vite");
    const root = mkdtempSync(path.join(tmpdir(), "platform-request-proxy-"));
    writeFileSync(path.join(root, "index.html"), "<!doctype html><title>page</title>");
    const vite = await createViteServer({
      root,
      configFile: false,
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0, strictPort: false },
      plugins: [platformRequestProxy()],
    });
    try {
      await vite.listen();
      devUrl = vite.resolvedUrls?.local[0]?.replace(/\/$/u, "") ?? "";

      const response = await send("/__mainsequence__/api/v1/icon/", { headers: { accept: "*/*" } });

      expect(response.headers["content-type"]).toBe("image/png");
      expect(received[0]?.headers.authorization).toBe(`Bearer ${token}`);
    } finally {
      await vite.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("finds the backend in the .env of the project Vite serves, and uses the saved session", async () => {
    vi.stubEnv("MAINSEQUENCE_ENDPOINT", "");
    vi.stubEnv("MAINSEQUENCE_ACCESS_TOKEN", "");
    const access = sessionToken(600);
    logIn({ access });
    const { createServer: createViteServer } = await import("vite");
    const root = mkdtempSync(path.join(tmpdir(), "platform-request-proxy-"));
    writeFileSync(path.join(root, "index.html"), "<!doctype html><title>page</title>");
    writeFileSync(path.join(root, ".env"), `MAINSEQUENCE_ENDPOINT=${platformUrl}\n`);
    const vite = await createViteServer({
      root,
      configFile: false,
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0, strictPort: false },
      plugins: [platformRequestProxy()],
    });
    try {
      await vite.listen();
      devUrl = vite.resolvedUrls?.local[0]?.replace(/\/$/u, "") ?? "";

      const response = await send("/__mainsequence__/api/v1/users/me/");

      expect(response.status).toBe(200);
      expect(received[0]?.headers.authorization).toBe(`Bearer ${access}`);
    } finally {
      await vite.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
