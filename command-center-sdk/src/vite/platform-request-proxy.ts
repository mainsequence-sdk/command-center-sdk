/**
 * Platform requests for a static site opened as a top-level page in local development, where no
 * Command Center host sends them. The page sends each platform request to its own Vite dev server
 * under `/__mainsequence__`; the dev server sends it to `MAINSEQUENCE_ENDPOINT` with the
 * developer's `MAINSEQUENCE_ACCESS_TOKEN`, both read from the dev server's environment, the same
 * variables the SDK's CLI reads. The page never holds the token, and a build never contains it.
 */

const DEFAULT_PLATFORM_REQUEST_PROXY_PATH = "/__mainsequence__";

// The request shape matches what the host bridge carries (SDK ADR 013), so a request that works
// locally also crosses the bridge when the site is embedded.
const PROXIED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const FORWARDED_REQUEST_HEADERS = ["accept", "content-type"] as const;
const MAX_REQUEST_BODY_BYTES = 1024 * 1024;

const LOOPBACK_IPV4 = /^127(?:\.\d{1,3}){3}$/u;

export interface PlatformRequestProxyOptions {
  /** Where the page sends platform requests on its dev server. Defaults to `/__mainsequence__`. */
  path?: string;
}

/** The request as Vite's dev server passes it to a middleware; only what the proxy reads. */
interface ProxyIncomingMessage extends AsyncIterable<Uint8Array | string> {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  socket: { remoteAddress?: string };
}

/** The response as Vite's dev server passes it to a middleware; only what the proxy writes. */
interface ProxyServerResponse {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(body?: Uint8Array | string): unknown;
  on(event: "close", listener: () => void): unknown;
}

type ProxyMiddleware = (
  request: ProxyIncomingMessage,
  response: ProxyServerResponse,
  next: (error?: unknown) => void,
) => void;

/** The parts of Vite's dev server the plugin uses. */
interface ProxyDevServer {
  middlewares: { use(middleware: ProxyMiddleware): unknown };
  config: { logger: { warn(message: string): void } };
}

/** A Vite plugin; pass it in `plugins`. It runs only under `vite serve`. */
export interface PlatformRequestProxyPlugin {
  name: string;
  apply: "serve";
  configureServer(server: ProxyDevServer): void;
}

type PlatformConfiguration = { endpoint: string; token: string } | { problem: string };

/**
 * A Vite plugin that sends a local page's platform requests as the developer. The page sends
 * `/__mainsequence__/api/...` to its own dev server, which forwards it to `MAINSEQUENCE_ENDPOINT`
 * with `Authorization: Bearer $MAINSEQUENCE_ACCESS_TOKEN`. It serves only same-origin requests
 * from this machine, so no other site or computer can act as the developer through it.
 */
export function platformRequestProxy(
  options: PlatformRequestProxyOptions = {},
): PlatformRequestProxyPlugin {
  const mountPath = readMountPath(options.path);

  return {
    name: "command-center-sdk:platform-request-proxy",
    apply: "serve",
    configureServer(server) {
      const logger = server.config.logger;
      const configuration = readPlatformConfiguration();
      if ("problem" in configuration) {
        logger.warn(`[command-center-sdk] ${mountPath} cannot reach the platform: ${configuration.problem}`);
      }
      let warnedAboutRefusedToken = false;

      // Added directly, so it runs before Vite serves files: its SPA fallback would otherwise answer
      // an `Accept: */*` request, such as an image, with the page. The checks below do not rely on
      // Vite's own, which depend on its version and configuration.
      server.middlewares.use((request, response, next) => {
        const url = request.url ?? "";
        if (!url.startsWith(`${mountPath}/`)) {
          next();
          return;
        }

        void proxyPlatformRequest(request, response, url.slice(mountPath.length), () => {
          if (warnedAboutRefusedToken) return;
          warnedAboutRefusedToken = true;
          logger.warn(
            "[command-center-sdk] The platform refused MAINSEQUENCE_ACCESS_TOKEN (401). Refresh it and restart the dev server.",
          );
        });
      });
    },
  };
}

async function proxyPlatformRequest(
  request: ProxyIncomingMessage,
  response: ProxyServerResponse,
  pathAndQuery: string,
  onRefusedToken: () => void,
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

  const configuration = readPlatformConfiguration();
  if ("problem" in configuration) {
    sendError(response, 503, "platform_not_configured", configuration.problem);
    return;
  }

  // Parsing resolves dot segments, so the check sees the path the request will travel.
  let target: URL;
  try {
    target = new URL(`${configuration.endpoint}${pathAndQuery}`);
  } catch {
    target = new URL(configuration.endpoint);
  }
  if (!target.href.startsWith(`${configuration.endpoint}/api/`)) {
    sendError(response, 404, "not_a_platform_api_path", "Only the platform's /api/ routes are forwarded.");
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
  headers.set("authorization", `Bearer ${configuration.token}`);

  const abort = new AbortController();
  response.on("close", () => abort.abort());

  try {
    const platformResponse = await fetch(target, {
      method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
      signal: abort.signal,
    });
    if (platformResponse.status === 401) onRefusedToken();

    const bytes = new Uint8Array(await platformResponse.arrayBuffer());
    response.statusCode = platformResponse.status;
    const contentType = platformResponse.headers.get("content-type");
    if (contentType) response.setHeader("content-type", contentType);
    response.setHeader("cache-control", "no-store");
    response.end(bytes);
  } catch {
    if (abort.signal.aborted) return;
    sendError(response, 502, "platform_unreachable", "The platform at MAINSEQUENCE_ENDPOINT did not answer.");
  }
}

function readMountPath(path = DEFAULT_PLATFORM_REQUEST_PROXY_PATH) {
  if (!/^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/u.test(path)) {
    throw new TypeError(
      `platformRequestProxy path must start with "/" and must not end with "/": ${JSON.stringify(path)}`,
    );
  }
  return path;
}

/** Read on every request, so the variables are the dev server's current ones. */
function readPlatformConfiguration(): PlatformConfiguration {
  const environment =
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const endpoint = environment.MAINSEQUENCE_ENDPOINT?.trim() ?? "";
  const token = environment.MAINSEQUENCE_ACCESS_TOKEN?.trim() ?? "";

  const missing = [
    endpoint ? null : "MAINSEQUENCE_ENDPOINT",
    token ? null : "MAINSEQUENCE_ACCESS_TOKEN",
  ].filter((name): name is string => name !== null);
  if (missing.length > 0) {
    return { problem: `Set ${missing.join(" and ")} in the dev server's environment.` };
  }
  if (/[\r\n]/u.test(token)) {
    return { problem: "MAINSEQUENCE_ACCESS_TOKEN must be a single line." };
  }

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
  return { endpoint: url.toString().replace(/\/+$/u, ""), token };
}

function readHeader(request: ProxyIncomingMessage, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function isLoopbackAddress(address: string | undefined) {
  if (!address) return false;
  const ipv4 = address.startsWith("::ffff:") ? address.slice("::ffff:".length) : address;
  return address === "::1" || LOOPBACK_IPV4.test(ipv4);
}

/** A name that resolves to this machine. Another name here means DNS rebinding. */
function isLoopbackHost(host: string | undefined) {
  if (!host) return false;
  let hostname: string;
  try {
    hostname = new URL(`http://${host}`).hostname;
  } catch {
    return false;
  }
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "[::1]" ||
    LOOPBACK_IPV4.test(hostname)
  );
}

/** Browsers mark requests another site makes; those never reach the platform. */
function isSameOriginRequest(request: ProxyIncomingMessage) {
  const site = readHeader(request, "sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;

  const origin = readHeader(request, "origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === readHeader(request, "host");
  } catch {
    return false;
  }
}

/** The body, or null when it exceeds the limit. */
async function readBody(request: ProxyIncomingMessage): Promise<Uint8Array<ArrayBuffer> | null> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
    size += bytes.byteLength;
    if (size > MAX_REQUEST_BODY_BYTES) return null;
    chunks.push(bytes);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function sendError(response: ProxyServerResponse, status: number, code: string, detail: string) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify({ code, detail }));
}
