/**
 * Platform requests for a static site opened as a top-level page in local development, where no
 * Command Center host sends them. The page sends each platform request to its own Vite dev server
 * under `/__mainsequence__`; the dev server sends it to `MAINSEQUENCE_ENDPOINT` with the
 * developer's `MAINSEQUENCE_ACCESS_TOKEN`, both read from the dev server's environment, the same
 * variables the SDK's CLI reads. The page never holds the token, and a build never contains it.
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
  const mountPath = readMountPath(options.path ?? DEFAULT_PLATFORM_REQUEST_PROXY_PATH, "platformRequestProxy");

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
