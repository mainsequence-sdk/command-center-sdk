import { platformProxyPrefix } from "../platform-proxy";

// Reading the chat's requests and answering them the way the platform API and the Agent's runtime
// do: JSON bodies, `{ "detail": ... }` errors, and the fetch abort behaviour.

export type StandInTarget = "platform" | "agent-runtime" | "other";

/** A request the stand-in received. */
export interface StandInRequest {
  method: string;
  /** The address as the chat requested it: absolute, or `/__platform__/...` in development. */
  url: string;
  /** The platform API, the Agent's runtime, or anything else. */
  target: StandInTarget;
  /** The route: the platform path without `/__platform__`, or the path under the runtime URL. */
  path: string;
  /** What the route path hangs from, for addresses the stand-in hands back (icon URLs). */
  base: string;
  query: URLSearchParams;
  headers: Headers;
  /** The body, parsed when it is JSON; null when there is none. */
  body: unknown;
}

export type StandInFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface StandInRoute {
  method: string;
  /** A path template: `:name` segments become parameters. */
  path: string;
  handle: (
    request: StandInRequest,
    params: Record<string, string>,
    signal: AbortSignal | null,
  ) => Response | Promise<Response>;
}

function readUrl(input: RequestInfo | URL) {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.href : input.url;
}

async function readBody(input: RequestInfo | URL, init: RequestInit | undefined) {
  let text: string | null = null;

  if (typeof init?.body === "string") {
    text = init.body;
  } else if (init?.body instanceof URLSearchParams) {
    text = init.body.toString();
  } else if (init?.body == null && typeof Request !== "undefined" && input instanceof Request) {
    text = await input.clone().text();
  } else if (init?.body != null) {
    return "[unreadable body]";
  }

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/** Where a request goes. Platform requests are matched by path, whatever their origin. */
function classify(url: URL, runtimeUrl: URL): Pick<StandInRequest, "base" | "path" | "target"> {
  const runtimePath = runtimeUrl.pathname.replace(/\/+$/, "");

  if (
    url.origin === runtimeUrl.origin &&
    (url.pathname === runtimePath || url.pathname.startsWith(`${runtimePath}/`))
  ) {
    return {
      target: "agent-runtime",
      path: url.pathname.slice(runtimePath.length) || "/",
      base: `${url.origin}${runtimePath}`,
    };
  }

  const proxied = url.pathname.startsWith(`${platformProxyPrefix}/`);
  const path = proxied ? url.pathname.slice(platformProxyPrefix.length) : url.pathname;

  return {
    target: path.startsWith("/api/v1/") ? "platform" : "other",
    path,
    base: proxied ? `${url.origin}${platformProxyPrefix}` : url.origin,
  };
}

export async function readRequest(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  { pageUrl, runtimeUrl }: { pageUrl: string; runtimeUrl: URL },
): Promise<StandInRequest> {
  const url = readUrl(input);
  const resolved = new URL(url, pageUrl);
  const isRequest = typeof Request !== "undefined" && input instanceof Request;

  return {
    method: (init?.method ?? (isRequest ? input.method : "GET")).toUpperCase(),
    url,
    ...classify(resolved, runtimeUrl),
    query: resolved.searchParams,
    headers: new Headers(init?.headers ?? (isRequest ? input.headers : undefined)),
    body: await readBody(input, init),
  };
}

function matchPath(template: string, path: string): Record<string, string> | null {
  const expected = template.split("/");
  const actual = path.split("/");

  if (expected.length !== actual.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let index = 0; index < expected.length; index += 1) {
    const segment = expected[index] ?? "";
    const value = actual[index] ?? "";

    if (segment.startsWith(":")) {
      if (!value) {
        return null;
      }
      try {
        params[segment.slice(1)] = decodeURIComponent(value);
      } catch {
        return null;
      }
    } else if (segment !== value) {
      return null;
    }
  }

  return params;
}

export type RouteMatch =
  | { kind: "route"; route: StandInRoute; params: Record<string, string> }
  | { kind: "method-not-allowed" }
  | { kind: "none" };

export function matchRoute(routes: readonly StandInRoute[], request: StandInRequest): RouteMatch {
  let pathMatched = false;

  for (const route of routes) {
    const params = matchPath(route.path, request.path);

    if (!params) {
      continue;
    }

    if (route.method === request.method) {
      return { kind: "route", route, params };
    }

    pathMatched = true;
  }

  return pathMatched ? { kind: "method-not-allowed" } : { kind: "none" };
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function noContent() {
  return new Response(null, { status: 204 });
}

/** The platform's error shape. */
export function detail(status: number, message: string, extra: Record<string, unknown> = {}) {
  return json(status, { detail: message, ...extra });
}

/** What a fetch reports when its request is aborted: the signal's reason, an AbortError by default. */
export function abortReason(signal?: AbortSignal | null): unknown {
  return signal?.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

export function throwIfAborted(signal: AbortSignal | null | undefined) {
  if (signal?.aborted) {
    throw abortReason(signal);
  }
}

/** Waits, and rejects the way fetch does when the request is aborted meanwhile. */
export function pause(ms: number, signal?: AbortSignal | null) {
  throwIfAborted(signal);

  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** The bearer token of a request, or null. */
export function readBearerToken(request: StandInRequest) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("Authorization")?.trim() ?? "");
  return match?.[1]?.trim() || null;
}

export function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
