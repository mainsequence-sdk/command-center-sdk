import type { ChatBackendConnection } from "./connection.js";

/**
 * Sends a platform request: through the application's sender when the connection has one, and
 * otherwise with `fetch` and the credential the client was given.
 *
 * With a sender, the request goes out without any credential of the package's: the application
 * owns authentication and renewal. Its response is used as it comes.
 */
export async function requestPlatform(
  connection: ChatBackendConnection,
  input: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  const send = connection.sendPlatformRequest;

  if (!send) {
    return fetch(input, init);
  }

  const headers = new Headers(init.headers);
  headers.delete("Authorization");

  return send(new Request(absoluteRequestUrl(input), { ...init, headers }));
}

/** A `Request` needs an absolute URL; a root-relative one is on the page's own origin. */
function absoluteRequestUrl(input: string | URL) {
  const value = input.toString();
  const pageUrl = typeof globalThis.location?.href === "string" ? globalThis.location.href : null;

  return value.startsWith("/") && pageUrl ? new URL(value, pageUrl).toString() : value;
}
