// The checks every dev-server proxy of the SDK makes, shared so the platform proxy and the local
// Agent proxy refuse exactly the same callers.

const LOOPBACK_IPV4 = /^127(?:\.\d{1,3}){3}$/u;

export const MAX_REQUEST_BODY_BYTES = 1024 * 1024;

/** The request as Vite's dev server passes it to a middleware; only what the proxy reads. */
export interface ProxyIncomingMessage extends AsyncIterable<Uint8Array | string> {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  socket: { remoteAddress?: string };
}

/** The response as Vite's dev server passes it to a middleware; only what the proxy writes. */
export interface ProxyServerResponse {
  headersSent?: boolean;
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  write(chunk: Uint8Array | string): unknown;
  end(body?: Uint8Array | string): unknown;
  on(event: "close", listener: () => void): unknown;
}

export type ProxyMiddleware = (
  request: ProxyIncomingMessage,
  response: ProxyServerResponse,
  next: (error?: unknown) => void,
) => void;

/** The parts of Vite's dev server the plugin uses. */
export interface ProxyDevServer {
  middlewares: { use(middleware: ProxyMiddleware): unknown };
  config: { logger: { warn(message: string): void } };
}

/** The route a proxy serves: it starts with `/` and does not end with one. */
export function readMountPath(path: string, pluginName: string) {
  if (!/^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/u.test(path)) {
    throw new TypeError(
      `${pluginName} path must start with "/" and must not end with "/": ${JSON.stringify(path)}`,
    );
  }
  return path;
}

export function readHeader(request: ProxyIncomingMessage, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function isLoopbackAddress(address: string | undefined) {
  if (!address) return false;
  const ipv4 = address.startsWith("::ffff:") ? address.slice("::ffff:".length) : address;
  return address === "::1" || LOOPBACK_IPV4.test(ipv4);
}

/** A name that resolves to this machine. Another name here means DNS rebinding. */
export function isLoopbackHost(host: string | undefined) {
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

/** Browsers mark requests another site makes; those never go through a proxy. */
export function isSameOriginRequest(request: ProxyIncomingMessage) {
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
export async function readBody(request: ProxyIncomingMessage): Promise<Uint8Array<ArrayBuffer> | null> {
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

export function sendError(response: ProxyServerResponse, status: number, code: string, detail: string) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify({ code, detail }));
}
