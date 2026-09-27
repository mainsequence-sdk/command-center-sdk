/**
 * The route to an Agent the developer runs on this machine (`ms-tau` in local mode), for Command
 * Center AI's local Agent source. A local runtime has no inbound authentication: every caller acts
 * as the developer whose credential the runtime holds. So the page never calls it directly; it
 * calls its own dev server under `/__agent__`, and the dev server forwards only the chat's routes,
 * only for the page it serves, to a runtime on this machine.
 */

import {
  isLoopbackAddress,
  isLoopbackHost,
  isSameOriginRequest,
  readBody,
  readHeader,
  readMountPath,
  sendError,
  type ProxyDevServer,
  type ProxyIncomingMessage,
  type ProxyServerResponse,
} from "./proxy-guards.js";

const DEFAULT_LOCAL_AGENT_PROXY_PATH = "/__agent__";
const DEFAULT_LOCAL_AGENT_TARGET = "http://127.0.0.1:8787";
const LOCAL_AGENT_TARGET_VARIABLE = "MAINSEQUENCE_TAU_LOCAL_ORIGIN";

// Only what the page sends and the runtime needs. No credential, cookie, or caller-identity header
// goes through, so the page cannot present itself as another caller.
const FORWARDED_REQUEST_HEADERS = ["accept", "content-type"] as const;
const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "x-agent-session-uid",
  "x-vercel-ai-ui-message-stream",
] as const;

const SESSION_SEGMENT = "[A-Za-z0-9._~:-]+";

/**
 * The routes Command Center AI's local source calls (ADR 099). Everything else the runtime serves,
 * its inspection, tool-test, internal, and A2A routes included, is refused.
 */
const ALLOWED_ROUTES: ReadonlyArray<{ method: string; pattern: RegExp }> = [
  { method: "GET", pattern: /^\/ready$/u },
  { method: "GET", pattern: /^\/health$/u },
  { method: "GET", pattern: /^\/api\/chat$/u },
  { method: "POST", pattern: /^\/api\/chat$/u },
  { method: "POST", pattern: /^\/api\/chat\/session\/cancel$/u },
  { method: "GET", pattern: /^\/api\/chat\/session-model$/u },
  { method: "PUT", pattern: /^\/api\/chat\/session-model$/u },
  { method: "GET", pattern: /^\/api\/chat\/model-providers$/u },
  { method: "GET", pattern: /^\/api\/local\/v1\/agent$/u },
  { method: "GET", pattern: /^\/api\/local\/v1\/chat-sessions$/u },
  { method: "GET", pattern: new RegExp(`^/api/local/v1/chat-sessions/${SESSION_SEGMENT}/history$`, "u") },
];

export interface LocalAgentProxyOptions {
  /**
   * The local runtime's origin, an `http` URL on this machine. Defaults to
   * `MAINSEQUENCE_TAU_LOCAL_ORIGIN`, then to `http://127.0.0.1:8787`, `ms-tau`'s default.
   */
  target?: string;
  /** Where the page sends the Agent's requests on its dev server. Defaults to `/__agent__`. */
  path?: string;
}

/** A Vite plugin; pass it in `plugins`. It runs only under `vite serve`. */
export interface LocalAgentProxyPlugin {
  name: string;
  apply: "serve";
  configureServer(server: ProxyDevServer): void;
}

type TargetConfiguration = { origin: string } | { problem: string };

/**
 * A Vite plugin that lets a local page talk to an Agent running on this machine. The page sends
 * `/__agent__/api/chat` and the other routes of Command Center AI's local source to its own dev
 * server, which forwards them to the local runtime and streams the answer back. It serves only
 * same-origin requests from this machine and only the chat's routes.
 */
export function localAgentProxy(options: LocalAgentProxyOptions = {}): LocalAgentProxyPlugin {
  const mountPath = readMountPath(options.path ?? DEFAULT_LOCAL_AGENT_PROXY_PATH, "localAgentProxy");

  return {
    name: "command-center-sdk:local-agent-proxy",
    apply: "serve",
    configureServer(server) {
      const logger = server.config.logger;
      const configuration = readTargetConfiguration(options.target);
      if ("problem" in configuration) {
        logger.warn(`[command-center-sdk] ${mountPath} cannot reach the local Agent: ${configuration.problem}`);
      }

      // Added directly, so it runs before Vite serves files and before its SPA fallback.
      server.middlewares.use((request, response, next) => {
        const url = request.url ?? "";
        if (!url.startsWith(`${mountPath}/`)) {
          next();
          return;
        }

        void proxyLocalAgentRequest(request, response, url.slice(mountPath.length), options.target);
      });
    },
  };
}

async function proxyLocalAgentRequest(
  request: ProxyIncomingMessage,
  response: ProxyServerResponse,
  pathAndQuery: string,
  configuredTarget: string | undefined,
) {
  if (!isLoopbackAddress(request.socket.remoteAddress) || !isLoopbackHost(readHeader(request, "host"))) {
    sendError(response, 403, "not_local", "Only this machine, through localhost, can use this route.");
    return;
  }
  if (!isSameOriginRequest(request)) {
    sendError(response, 403, "cross_site_request", "Only the page this dev server serves can use this route.");
    return;
  }

  const configuration = readTargetConfiguration(configuredTarget);
  if ("problem" in configuration) {
    sendError(response, 503, "local_agent_not_configured", configuration.problem);
    return;
  }

  // Parsing resolves dot segments, so the allowlist sees the path the request will travel.
  let target: URL;
  try {
    target = new URL(`${configuration.origin}${pathAndQuery}`);
  } catch {
    sendError(response, 404, "not_a_local_agent_route", "Only the chat's routes are forwarded.");
    return;
  }
  const method = (request.method ?? "GET").toUpperCase();
  if (
    target.origin !== configuration.origin ||
    !ALLOWED_ROUTES.some((route) => route.method === method && route.pattern.test(target.pathname))
  ) {
    sendError(response, 404, "not_a_local_agent_route", "Only the chat's routes are forwarded.");
    return;
  }

  const body = method === "GET" ? undefined : await readBody(request);
  if (body === null) {
    sendError(response, 413, "request_too_large", "Request bodies are limited to 1 MiB.");
    return;
  }

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = readHeader(request, name);
    if (value) headers.set(name, value);
  }

  // Closing the page's request aborts the runtime's, as a direct call would.
  const abort = new AbortController();
  response.on("close", () => abort.abort());

  let agentResponse: Response;
  try {
    agentResponse = await fetch(target, {
      method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
      signal: abort.signal,
    });
  } catch {
    if (abort.signal.aborted) return;
    sendError(
      response,
      502,
      "local_agent_unreachable",
      `The local Agent at ${configuration.origin} did not answer. Start it with \`ms-tau\` in local mode.`,
    );
    return;
  }

  response.statusCode = agentResponse.status;
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = agentResponse.headers.get(name);
    if (value) response.setHeader(name, value);
  }
  response.setHeader("cache-control", "no-store");

  // The chat's answer is a server-sent event stream: pass each chunk on as it arrives.
  if (!agentResponse.body) {
    response.end();
    return;
  }
  const reader = agentResponse.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      response.write(value);
    }
    response.end();
  } catch {
    if (!abort.signal.aborted) response.end();
  }
}

/** Read on every request, so the variable is the dev server's current one. */
function readTargetConfiguration(configured: string | undefined): TargetConfiguration {
  const environment =
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const value =
    configured?.trim() || environment[LOCAL_AGENT_TARGET_VARIABLE]?.trim() || DEFAULT_LOCAL_AGENT_TARGET;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { problem: `The local Agent's origin must be an http URL on this machine: ${JSON.stringify(value)}.` };
  }
  // A local runtime answers anyone as the developer, so the proxy only ever reaches this machine.
  if (
    url.protocol !== "http:" ||
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    !isLoopbackHost(url.host)
  ) {
    return {
      problem: `The local Agent's origin must be an http URL on this machine, such as ${DEFAULT_LOCAL_AGENT_TARGET}: ${JSON.stringify(value)}.`,
    };
  }
  return { origin: url.origin };
}
