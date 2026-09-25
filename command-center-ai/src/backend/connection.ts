/**
 * The connection to the backend: the same platform Command Center talks to.
 *
 * The package reads no environment variable and no configuration file. Whoever mounts the chat
 * builds one connection and every client receives it.
 */

/** Where a request is going. */
export type ChatBackendRequestTarget =
  /** The platform API, under `apiBaseUrl`. */
  | "platform"
  /** The Agent's runtime, at the `rpc_url` that `resolve-runtime-access` returned. */
  | "agent-runtime";

/**
 * Returns the address the browser should request instead of `url`.
 *
 * The platform API and the Agent's runtime answer browser requests only from the origins on
 * their allow-lists. An application served from another origin reaches them through an address
 * of its own, and this is where it says which one. Every request the package makes passes
 * through it, so an application never has to patch a client.
 */
export type ChatBackendRequestUrlRewrite = (
  url: URL,
  target: ChatBackendRequestTarget,
) => string;

/**
 * Sends a platform request for the package.
 *
 * The application owns authentication: it adds the person's credential, or has its host send the
 * request, renews the credential when the platform refuses it, and returns the platform's
 * response. The package hands it every platform request without any credential and uses the
 * response as it comes. Requests to the Agent's runtime never go through it: they carry the
 * session's runtime token, which the platform issues, and stream straight from the runtime.
 */
export type ChatPlatformRequestSender = (request: Request) => Promise<Response>;

export interface ChatBackendConnectionInput {
  /** The platform API base URL, absolute, for example `https://api.example.com`. */
  apiBaseUrl: string;
  rewriteRequestUrl?: ChatBackendRequestUrlRewrite | null;
  /**
   * Sends the package's platform requests, with the application's authentication. Without it,
   * clients send the requests themselves with the `token` their callers pass, which the package
   * cannot renew.
   */
  sendPlatformRequest?: ChatPlatformRequestSender | null;
}

export interface ChatBackendConnection {
  readonly apiBaseUrl: string;
  readonly rewriteRequestUrl: ChatBackendRequestUrlRewrite | null;
  readonly sendPlatformRequest: ChatPlatformRequestSender | null;
}

export function createChatBackendConnection({
  apiBaseUrl,
  rewriteRequestUrl = null,
  sendPlatformRequest = null,
}: ChatBackendConnectionInput): ChatBackendConnection {
  const trimmed = typeof apiBaseUrl === "string" ? apiBaseUrl.trim() : "";
  let parsed: URL | null = null;

  try {
    parsed = trimmed ? new URL(trimmed) : null;
  } catch {
    parsed = null;
  }

  if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
    throw new Error(
      "The chat backend connection requires an absolute http(s) platform API base URL.",
    );
  }

  return Object.freeze({
    apiBaseUrl: trimmed,
    rewriteRequestUrl: rewriteRequestUrl ?? null,
    sendPlatformRequest: sendPlatformRequest ?? null,
  });
}

/** A platform API URL. Add search parameters to it, then pass it to `resolveRequestUrl`. */
export function buildPlatformApiUrl(connection: ChatBackendConnection, path: string) {
  return new URL(path, connection.apiBaseUrl);
}

/** The address to request for `url`, after the application's rewrite when it has one. */
export function resolveRequestUrl(
  connection: ChatBackendConnection,
  url: URL | string,
  target: ChatBackendRequestTarget,
) {
  if (!connection.rewriteRequestUrl) {
    return url.toString();
  }

  // A root-relative address is already on the application's own origin.
  if (typeof url === "string" && url.startsWith("/")) {
    return url;
  }

  return connection.rewriteRequestUrl(new URL(url.toString()), target);
}

/** Whether the application sends the package's platform requests, with its own authentication. */
export function hasPlatformRequestSender(connection: ChatBackendConnection) {
  return Boolean(connection.sendPlatformRequest);
}

/** The address to request for a platform API path. */
export function resolvePlatformApiUrl(connection: ChatBackendConnection, path: string) {
  return resolveRequestUrl(connection, buildPlatformApiUrl(connection, path), "platform");
}
