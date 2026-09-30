/**
 * Platform requests for a static site opened as a top-level page in local development, where no
 * Command Center host sends them. The page sends each platform request to its own Vite dev server
 * under `/__mainsequence__`; the dev server sends it to the platform as the developer, with the
 * session `command-center-sdk login` saved on this machine, or with `MAINSEQUENCE_ACCESS_TOKEN`
 * when the dev server's environment sets one. The page never holds the token, and a build never
 * contains it.
 */

import {
  ACCESS_TOKEN_MIN_VALIDITY_SECONDS,
  CredentialStoreError,
  NoCredentialStoreError,
  NoSessionError,
  currentAccessToken,
  openCredentialStore,
  requireCredentialStore,
  resolveBackendUrl,
  sessionReport,
  type CredentialStore,
} from "../../cli/machine-session.mjs";
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

const DEFAULT_PLATFORM_REQUEST_PROXY_PATH = "/__mainsequence__";

// The request shape matches what the host bridge carries (SDK ADR 013), so a request that works
// locally also crosses the bridge when the site is embedded.
const PROXIED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const FORWARDED_REQUEST_HEADERS = ["accept", "content-type"] as const;

export interface PlatformRequestProxyOptions {
  /** Where the page sends platform requests on its dev server. Defaults to `/__mainsequence__`. */
  path?: string;
}


/** A Vite plugin; pass it in `plugins`. It runs only under `vite serve`. */
export interface PlatformRequestProxyPlugin {
  name: string;
  apply: "serve";
  configureServer(server: ProxyDevServer): void;
}

type Environment = Record<string, string | undefined>;

/** Where a request goes, and how to get the token it carries. */
interface PlatformTarget {
  endpoint: string;
  /** The backend whose saved session gives the token; absent for the environment's token. */
  sessionBackend?: string;
  /** `refusedToken` is a token of the saved session the platform just answered 401 to. */
  token(refusedToken?: string): Promise<string | PlatformProblem>;
}

interface PlatformProblem {
  status: 502 | 503;
  code: "platform_not_configured" | "platform_unreachable";
  detail: string;
}

/**
 * A Vite plugin that sends a local page's platform requests as the developer. The page sends
 * `/__mainsequence__/api/...` to its own dev server, which forwards it to the platform with the
 * developer's access token. It serves only same-origin requests from this machine, so no other
 * site or computer can act as the developer through it.
 */
export function platformRequestProxy(
  options: PlatformRequestProxyOptions = {},
): PlatformRequestProxyPlugin {
  const mountPath = readMountPath(options.path ?? DEFAULT_PLATFORM_REQUEST_PROXY_PATH, "platformRequestProxy");

  return {
    name: "command-center-sdk:platform-request-proxy",
    apply: "serve",
    configureServer(server) {
      const logger = server.config.logger;
      // The project's `.env` may name its backend; Vite reads that file from here as well.
      const { envDir, root } = server.config;
      const platform = createPlatformAccess(typeof envDir === "string" ? envDir : root);
      const problem = platform.startupProblem();
      if (problem) {
        logger.warn(`[command-center-sdk] ${mountPath} cannot reach the platform: ${problem}`);
      }
      const warned = new Set<string>();
      const warnOnce = (message: string) => {
        if (warned.has(message)) return;
        warned.add(message);
        logger.warn(`[command-center-sdk] ${message}`);
      };

      // Added directly, so it runs before Vite serves files: its SPA fallback would otherwise answer
      // an `Accept: */*` request, such as an image, with the page. The checks below do not rely on
      // Vite's own, which depend on its version and configuration.
      server.middlewares.use((request, response, next) => {
        const url = request.url ?? "";
        if (!url.startsWith(`${mountPath}/`)) {
          next();
          return;
        }

        void proxyPlatformRequest(request, response, url.slice(mountPath.length), platform, warnOnce);
      });
    },
  };
}

async function proxyPlatformRequest(
  request: ProxyIncomingMessage,
  response: ProxyServerResponse,
  pathAndQuery: string,
  platform: ReturnType<typeof createPlatformAccess>,
  warnOnce: (message: string) => void,
) {
  if (!isLoopbackAddress(request.socket.remoteAddress) || !isLoopbackHost(readHeader(request, "host"))) {
    sendError(response, 403, "not_local", "Only this machine, through localhost, can use this route.");
    return;
  }
  if (!isSameOriginRequest(request)) {
    sendError(response, 403, "cross_site_request", "Only the page this dev server serves can use this route.");
    return;
  }

  const method = (request.method ?? "GET").toUpperCase();
  if (!PROXIED_METHODS.includes(method)) {
    response.setHeader("allow", PROXIED_METHODS.join(", "));
    sendError(response, 405, "method_not_allowed", `Use ${PROXIED_METHODS.join(", ")}.`);
    return;
  }

  const platformTarget = platform.target();
  if ("detail" in platformTarget) {
    sendError(response, platformTarget.status, platformTarget.code, platformTarget.detail);
    return;
  }
  const { endpoint, sessionBackend } = platformTarget;

  // Parsing resolves dot segments, so the check sees the path the request will travel.
  let target: URL;
  try {
    target = new URL(`${endpoint}${pathAndQuery}`);
  } catch {
    target = new URL(endpoint);
  }
  if (!target.href.startsWith(`${endpoint}/api/`)) {
    sendError(response, 404, "not_a_platform_api_path", "Only the platform's /api/ routes are forwarded.");
    return;
  }

  const body = method === "GET" ? undefined : await readBody(request);
  if (body === null) {
    sendError(response, 413, "request_too_large", "Request bodies are limited to 1 MiB.");
    return;
  }

  // The token is asked for last: a request refused above reads no credential.
  let token = await platformTarget.token();
  if (typeof token !== "string") {
    sendError(response, token.status, token.code, token.detail);
    return;
  }

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = readHeader(request, name);
    if (value) headers.set(name, value);
  }

  const abort = new AbortController();
  response.on("close", () => abort.abort());
  const send = (bearer: string) => {
    headers.set("authorization", `Bearer ${bearer}`);
    return fetch(target, {
      method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
      signal: abort.signal,
    });
  };

  try {
    let platformResponse = await send(token);
    if (platformResponse.status === 401 && sessionBackend) {
      // The platform refused a token the saved session held: renew the session and ask once more.
      // A 401 is answered before the request does anything, so sending it again repeats nothing.
      const renewed = await platformTarget.token(token);
      if (typeof renewed === "string" && renewed !== token) {
        await platformResponse.body?.cancel();
        token = renewed;
        platformResponse = await send(token);
      }
    }
    if (platformResponse.status === 401) {
      warnOnce(
        sessionBackend
          ? `The platform refused the saved session (401). Run "npx command-center-sdk login --backend ${sessionBackend}".`
          : 'The platform refused MAINSEQUENCE_ACCESS_TOKEN (401). Refresh it and restart the dev server, or unset it to use the session "npx command-center-sdk login" saves.',
      );
    }

    const bytes = new Uint8Array(await platformResponse.arrayBuffer());
    response.statusCode = platformResponse.status;
    const contentType = platformResponse.headers.get("content-type");
    if (contentType) response.setHeader("content-type", contentType);
    response.setHeader("cache-control", "no-store");
    response.end(bytes);
  } catch {
    if (abort.signal.aborted) return;
    sendError(response, 502, "platform_unreachable", `The platform at ${endpoint} did not answer.`);
  }
}

function readEnvironment(): Environment {
  return (globalThis as { process?: { env?: Environment } }).process?.env ?? {};
}

/** The endpoint as requests are sent to it, or what is wrong with it. Never echoes the value. */
function readRequestEndpoint(endpoint: string): { endpoint: string } | { problem: string } {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return { problem: "MAINSEQUENCE_ENDPOINT must be an absolute HTTP(S) URL." };
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    return { problem: "MAINSEQUENCE_ENDPOINT must be an absolute HTTP(S) URL without embedded credentials." };
  }
  url.search = "";
  url.hash = "";
  return { endpoint: url.toString().replace(/\/+$/u, "") };
}

function notConfigured(detail: string): PlatformProblem {
  return { status: 503, code: "platform_not_configured", detail };
}

/** Why the saved session of `backend` gave no token. The messages never carry a token. */
function describeSessionFailure(error: unknown, backend: string): PlatformProblem {
  const login = `Run "npx command-center-sdk login --backend ${backend}"`;
  if (error instanceof NoCredentialStoreError) return notConfigured(error.message);
  if (error instanceof CredentialStoreError) {
    return notConfigured(`The saved session could not be read. ${error.message} ${login}.`);
  }
  if (error instanceof NoSessionError) {
    return notConfigured(
      `No usable Main Sequence session for ${backend} on this machine. ${login}, or set MAINSEQUENCE_ACCESS_TOKEN in the dev server's environment.`,
    );
  }
  return {
    status: 502,
    code: "platform_unreachable",
    detail: `The saved session could not be renewed. ${error instanceof Error ? error.message : ""}`.trim(),
  };
}

/**
 * Where a request goes and the token it carries, read on every request so the variables are the
 * dev server's current ones. `MAINSEQUENCE_ACCESS_TOKEN` wins, and goes only to the
 * `MAINSEQUENCE_ENDPOINT` set next to it. Without it, the token is the saved session's of the
 * backend the project names, kept in memory until it is about to expire and renewed by itself.
 */
function createPlatformAccess(projectDirectory: string | undefined) {
  let store: CredentialStore | null | undefined;
  let cached: { backend: string; token: string; expiresAt: number | null } | null = null;
  let pending: { backend: string; token: Promise<string> } | null = null;

  // Opened on first use, and kept: the store updates in place an entry this process has read.
  const credentialStore = () => (store === undefined ? (store = openCredentialStore()) : store);

  function environmentTarget(environment: Environment, token: string): PlatformTarget | PlatformProblem {
    const endpoint = environment.MAINSEQUENCE_ENDPOINT?.trim() ?? "";
    if (!endpoint) return notConfigured("Set MAINSEQUENCE_ENDPOINT in the dev server's environment.");
    if (/[\r\n]/u.test(token)) return notConfigured("MAINSEQUENCE_ACCESS_TOKEN must be a single line.");
    const target = readRequestEndpoint(endpoint);
    if ("problem" in target) return notConfigured(target.problem);
    return { endpoint: target.endpoint, token: async () => token };
  }

  async function loadSessionToken(backend: string, refusedToken: string | undefined) {
    const options = { backend, env: {}, store: credentialStore() };
    // What the store holds now: another process may have renewed the session already.
    let token = await currentAccessToken(options);
    if (token.access_token === refusedToken) {
      token = await currentAccessToken({ ...options, forceRenewal: true });
    }
    cached = { backend, token: token.access_token, expiresAt: token.expires_at };
    return token.access_token;
  }

  async function sessionToken(backend: string, refusedToken: string | undefined) {
    if (
      cached &&
      cached.backend === backend &&
      cached.token !== refusedToken &&
      cached.expiresAt !== null &&
      cached.expiresAt - ACCESS_TOKEN_MIN_VALIDITY_SECONDS > Date.now() / 1000
    ) {
      return cached.token;
    }
    // Requests that arrive together share one read of the store and one renewal.
    if (pending?.backend === backend) {
      const token = await pending.token;
      if (token !== refusedToken) return token;
    }
    const token = loadSessionToken(backend, refusedToken);
    pending = { backend, token };
    try {
      return await token;
    } finally {
      if (pending?.token === token) pending = null;
    }
  }

  function sessionTarget(environment: Environment): PlatformTarget | PlatformProblem {
    let backend: string;
    try {
      backend = resolveBackendUrl({ env: environment, cwd: projectDirectory });
    } catch {
      return notConfigured(
        "MAINSEQUENCE_ENDPOINT must be an absolute HTTP(S) URL without embedded credentials, a query, or a fragment.",
      );
    }
    const target = readRequestEndpoint(backend);
    if ("problem" in target) return notConfigured(target.problem);
    return {
      endpoint: target.endpoint,
      sessionBackend: backend,
      async token(refusedToken) {
        try {
          return await sessionToken(backend, refusedToken);
        } catch (error) {
          return describeSessionFailure(error, backend);
        }
      },
    };
  }

  function target(): PlatformTarget | PlatformProblem {
    const environment = readEnvironment();
    const token = environment.MAINSEQUENCE_ACCESS_TOKEN?.trim() ?? "";
    return token ? environmentTarget(environment, token) : sessionTarget(environment);
  }

  return {
    target,

    /** What is wrong when the dev server starts, without asking the platform; null when nothing is. */
    startupProblem(): string | null {
      const resolved = target();
      if ("detail" in resolved) return resolved.detail;
      if (!resolved.sessionBackend) return null;
      try {
        const report = sessionReport({
          backend: resolved.sessionBackend,
          env: {},
          store: requireCredentialStore(credentialStore()),
        });
        if (report.store_error) throw new CredentialStoreError(report.store_error);
        if (!report.authenticated) throw new NoSessionError();
        return null;
      } catch (error) {
        return describeSessionFailure(error, resolved.sessionBackend).detail;
      }
    },
  };
}
