import { expect, test } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer as createViteServer, type ViteDevServer } from "vite";

import { platformRequestProxy } from "../../dist/vite/index.js";

const developerToken = "developer-token-from-the-environment";

type PlatformRequest = { method: string; path: string; authorization: string | undefined; body: string };

const received: PlatformRequest[] = [];
let platform: { origin: string; close: () => Promise<void> };
let attacker: { origin: string; close: () => Promise<void> };
let vite: ViteDevServer;
let devPort: number;
let root: string;

function listen(handler: (request: IncomingMessage, response: ServerResponse) => void) {
  const server = createServer(handler);
  return new Promise<{ origin: string; close: () => Promise<void> }>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        origin: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}

test.use({
  // rebind.test resolves to this machine, as a DNS rebinding attack makes an attacker's name do.
  launchOptions: { args: ["--host-resolver-rules=MAP rebind.test 127.0.0.1"] },
});

test.beforeAll(async () => {
  platform = await listen(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    received.push({
      method: request.method ?? "",
      path: request.url ?? "",
      authorization: request.headers.authorization,
      body,
    });
    if (request.url === "/api/v1/icon/") {
      response.writeHead(200, { "Content-Type": "image/png" });
      response.end(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]));
      return;
    }
    response.writeHead(request.method === "POST" ? 201 : 200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ uid: "developer-uid" }));
  });

  process.env.MAINSEQUENCE_ENDPOINT = platform.origin;
  process.env.MAINSEQUENCE_ACCESS_TOKEN = developerToken;

  root = mkdtempSync(path.join(tmpdir(), "local-platform-request-proxy-"));
  writeFileSync(path.join(root, "index.html"), "<!doctype html><title>Local page</title><p>page</p>");
  vite = await createViteServer({
    root,
    configFile: false,
    logLevel: "silent",
    // Vite's own host check is off, as it is for an HTTPS dev server, so the plugin's is under test.
    server: { host: "127.0.0.1", port: 0, strictPort: false, allowedHosts: true },
    plugins: [platformRequestProxy()],
  });
  await vite.listen();
  devPort = Number(new URL(vite.resolvedUrls?.local[0] ?? "").port);

  // Another site, on another host name than the page's.
  attacker = await listen((_, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end("<!doctype html><title>Another site</title>");
  });
});

test.afterAll(async () => {
  await vite.close();
  await platform.close();
  await attacker.close();
  rmSync(root, { recursive: true, force: true });
  delete process.env.MAINSEQUENCE_ENDPOINT;
  delete process.env.MAINSEQUENCE_ACCESS_TOKEN;
});

test.beforeEach(() => {
  received.length = 0;
});

test("the page's platform requests reach the platform with the developer's token", async ({ page }) => {
  await page.goto(`http://localhost:${devPort}/`);

  const result = await page.evaluate(async () => {
    const me = await fetch("/__mainsequence__/api/v1/users/me/", { headers: { accept: "application/json" } });
    const created = await fetch("/__mainsequence__/api/v1/agent-sessions/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "report" }),
    });
    const icon = await fetch("/__mainsequence__/api/v1/icon/");
    return {
      me: { status: me.status, body: await me.json() },
      created: created.status,
      icon: { type: icon.headers.get("content-type"), bytes: [...new Uint8Array(await icon.arrayBuffer())] },
      pageText: document.documentElement.outerHTML,
    };
  });

  expect(result.me).toEqual({ status: 200, body: { uid: "developer-uid" } });
  expect(result.created).toBe(201);
  expect(result.icon).toEqual({ type: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x00, 0xff] });
  expect(result.pageText).not.toContain(developerToken);
  expect(received.map((request) => [request.method, request.path, request.authorization])).toEqual([
    ["GET", "/api/v1/users/me/", `Bearer ${developerToken}`],
    ["POST", "/api/v1/agent-sessions/", `Bearer ${developerToken}`],
    ["GET", "/api/v1/icon/", `Bearer ${developerToken}`],
  ]);
  expect(received[1]?.body).toBe('{"name":"report"}');
});

test("another site cannot send or read platform requests through it", async ({ page }) => {
  await page.goto(`${attacker.origin}/`);
  const proxyUrl = `http://localhost:${devPort}/__mainsequence__/api/v1`;

  const result = await page.evaluate(async (base) => {
    // Vite's default CORS lets a localhost page read the refusal; otherwise the read fails.
    const read = await fetch(`${base}/users/me/`).then(
      async (response) => ((await response.json()) as { code: string }).code,
      (error: Error) => error.name,
    );
    await fetch(`${base}/agent-sessions/`, {
      method: "POST",
      mode: "no-cors",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "name=report",
    });
    const frame = document.createElement("iframe");
    frame.name = "sink";
    document.body.append(frame);
    const form = document.createElement("form");
    form.method = "POST";
    form.action = `${base}/agent-sessions/`;
    form.target = "sink";
    document.body.append(form);
    await new Promise<void>((resolve) => {
      frame.addEventListener("load", () => resolve(), { once: true });
      form.submit();
    });
    return { read };
  }, proxyUrl);

  expect(["cross_site_request", "TypeError"]).toContain(result.read);
  expect(received).toEqual([]);
});

test("a page reached through another name for this machine cannot use it", async ({ page }) => {
  // The page on rebind.test is what a DNS rebinding attack runs: same-origin to the dev server.
  await page.goto(`http://rebind.test:${devPort}/`);

  const result = await page.evaluate(async () => {
    const response = await fetch("/__mainsequence__/api/v1/users/me/");
    return { status: response.status, body: await response.json() };
  });

  expect(result).toEqual({
    status: 403,
    body: { code: "not_local", detail: "Only this machine, through localhost, can use this route." },
  });
  expect(received).toEqual([]);
});
