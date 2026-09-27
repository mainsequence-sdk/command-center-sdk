import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type Server,
} from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { localAgentProxy, type LocalAgentProxyPlugin } from "./index.js";

type DevServer = Parameters<LocalAgentProxyPlugin["configureServer"]>[0];
type Middleware = Parameters<DevServer["middlewares"]["use"]>[0];

interface AgentRequest {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: string;
}

const received: AgentRequest[] = [];
let agent: Server;
let agentUrl: string;
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

async function startDevServer(options?: Parameters<typeof localAgentProxy>[0]) {
  warn = vi.fn<(message: string) => void>();
  localAgentProxy({ target: agentUrl, ...options }).configureServer({
    middlewares: { use: (handler) => void (middleware = handler) },
    config: { logger: { warn } },
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
    onFirstChunk,
  }: {
    method?: string;
    headers?: Record<string, string | null>;
    body?: string;
    onFirstChunk?: () => void;
  } = {},
) {
  const outgoing: OutgoingHttpHeaders = { "sec-fetch-site": "same-origin" };
  for (const [name, value] of Object.entries(headers)) {
    if (value === null) delete outgoing[name];
    else outgoing[name] = value;
  }
  const url = new URL(devUrl);
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const request = httpRequest(
      { host: url.hostname, port: url.port, path: requestPath, method, headers: outgoing },
      (response: IncomingMessage) => {
        let text = "";
        let first = true;
        response.on("data", (chunk: Buffer) => {
          if (first) {
            first = false;
            onFirstChunk?.();
          }
          text += chunk.toString();
        });
        response.on("end", () => {
          resolve({ status: response.statusCode ?? 0, headers: response.headers, body: text });
        });
      },
    );
    request.on("error", reject);
    if (body !== undefined) request.write(body);
    request.end();
  });
}

function readError(response: { body: string }) {
  return JSON.parse(response.body) as { code: string; detail: string };
}

// Released by a test to let the stand-in finish its stream, so the test can see the first chunk
// arrive before the answer ends.
let releaseStream: (() => void) | null = null;

beforeAll(async () => {
  agent = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    received.push({ method: request.method ?? "", url: request.url ?? "", headers: request.headers, body });

    if (request.url === "/api/chat" && request.method === "POST") {
      response.setHeader("content-type", "text/event-stream");
      response.setHeader("x-vercel-ai-ui-message-stream", "v1");
      response.setHeader("x-agent-session-uid", "local-abc-default");
      response.setHeader("set-cookie", "runtime=secret");
      response.write('data: {"type":"text-delta","textDelta":"Hel"}\n\n');
      await new Promise<void>((resolve) => {
        releaseStream = resolve;
      });
      response.end('data: {"type":"text-delta","textDelta":"lo"}\n\ndata: [DONE]\n\n');
      return;
    }
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ ok: true, url: request.url }));
  });
  agentUrl = await listen(agent);
});

afterAll(async () => {
  await close(agent);
});

beforeEach(() => {
  received.length = 0;
});

afterEach(async () => {
  if (devServer) await close(devServer);
  devServer = null;
});

describe("localAgentProxy", () => {
  it("streams the chat's answer as it arrives, with the session id", async () => {
    await startDevServer();
    const response = await send("/__agent__/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runtime_session_uid: "abc", messages: [] }),
      onFirstChunk: () => releaseStream?.(),
    });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/event-stream");
    expect(response.headers["x-agent-session-uid"]).toBe("local-abc-default");
    expect(response.headers["x-vercel-ai-ui-message-stream"]).toBe("v1");
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.body).toContain('"textDelta":"Hel"');
    expect(response.body).toContain("[DONE]");
    expect(received[0]).toMatchObject({ method: "POST", url: "/api/chat" });
    expect(JSON.parse(received[0]!.body)).toEqual({ runtime_session_uid: "abc", messages: [] });
  });

  it("forwards the chat's routes with their query and strips credentials and caller headers", async () => {
    await startDevServer();
    const response = await send("/__agent__/api/chat/session-model?sessionUid=local-abc-1", {
      headers: {
        accept: "application/json",
        authorization: "Bearer page-token",
        cookie: "session=1",
        "x-caller-kind": "agent",
        "x-user-uid": "someone-else",
      },
    });

    expect(response.status).toBe(200);
    expect(received[0]!.url).toBe("/api/chat/session-model?sessionUid=local-abc-1");
    expect(received[0]!.headers.accept).toBe("application/json");
    expect(received[0]!.headers.authorization).toBeUndefined();
    expect(received[0]!.headers.cookie).toBeUndefined();
    expect(received[0]!.headers["x-caller-kind"]).toBeUndefined();
    expect(received[0]!.headers["x-user-uid"]).toBeUndefined();

    const history = await send("/__agent__/api/local/v1/chat-sessions/local-abc-1/history?limit=50");
    expect(history.status).toBe(200);
    expect(received[1]!.url).toBe("/api/local/v1/chat-sessions/local-abc-1/history?limit=50");
  });

  it.each([
    ["an inspection route", "GET", "/__agent__/api/local/v1/sessions/local-abc/agent-inspection"],
    ["a tool test", "POST", "/__agent__/api/local/v1/sessions/local-abc/tools/crm:test"],
    ["A2A", "POST", "/__agent__/api/a2a/v1/message:send"],
    ["an internal route", "POST", "/__agent__/internal/a2a/task-dispatch"],
    ["a route escaping with dot segments", "GET", "/__agent__/api/chat/../local/v1/sessions/x/agent-inspection"],
    ["a chat route with the wrong method", "DELETE", "/__agent__/api/chat"],
    ["cancel through GET", "GET", "/__agent__/api/chat/session/cancel"],
  ])("refuses %s", async (_name, method, requestPath) => {
    await startDevServer();
    const response = await send(requestPath, { method });

    expect(response.status).toBe(404);
    expect(readError(response).code).toBe("not_a_local_agent_route");
    expect(received).toHaveLength(0);
  });

  it("refuses another site and another host name", async () => {
    await startDevServer();
    const crossSite = await send("/__agent__/api/chat", {
      method: "POST",
      headers: { "sec-fetch-site": "cross-site", origin: "https://evil.example" },
      body: "{}",
    });
    expect(crossSite.status).toBe(403);
    expect(readError(crossSite).code).toBe("cross_site_request");

    const rebound = await send("/__agent__/ready", { headers: { host: "evil.example" } });
    expect(rebound.status).toBe(403);
    expect(readError(rebound).code).toBe("not_local");
    expect(received).toHaveLength(0);
  });

  it("leaves other paths to the dev server", async () => {
    await startDevServer();
    const response = await send("/index.html");

    expect(response.status).toBe(404);
    expect(response.body).toBe("left to the dev server");
  });

  it("refuses a target that is not on this machine", async () => {
    await startDevServer({ target: "https://agent.example.com" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("must be an http URL on this machine"));

    const response = await send("/__agent__/ready");
    expect(response.status).toBe(503);
    expect(readError(response).code).toBe("local_agent_not_configured");
  });

  it("answers 502 when the local Agent is not running", async () => {
    await startDevServer({ target: "http://127.0.0.1:1" });
    const response = await send("/__agent__/ready");

    expect(response.status).toBe(502);
    expect(readError(response).code).toBe("local_agent_unreachable");
  });

  it("takes its route from options.path", async () => {
    await startDevServer({ path: "/tau" });
    const response = await send("/tau/ready");

    expect(response.status).toBe(200);
    expect(received[0]!.url).toBe("/ready");
    expect(() => localAgentProxy({ path: "tau/" })).toThrow(TypeError);
  });
});
