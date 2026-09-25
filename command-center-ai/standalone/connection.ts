import { createChatBackendConnection } from "../src";
import { platformProxyPrefix } from "./platform-proxy";

function readOrigin(value: string | undefined) {
  try {
    return value?.trim() ? new URL(value.trim()).origin : null;
  } catch {
    return null;
  }
}

/**
 * This application's connection to the backend.
 *
 * Its origin is not on the platform's allow-list, so under its own dev server it asks for the
 * platform through `platformProxyPrefix`, which `vite.config.ts` forwards to
 * `VITE_CHAT_API_BASE_URL`. Whether to do that is the application's decision: the package only
 * calls the rewrite it is given. The Agent's runtime is requested directly here.
 *
 * The application owns authentication, so it sends the package's platform requests itself, with
 * the person's token. This one holds the token the person typed and cannot renew it; an
 * application with a sign-in would refresh the token here and send the request again.
 */
export function createStandaloneConnection(apiBaseUrl: string, token: string) {
  const proxiedOrigin = import.meta.env.DEV
    ? readOrigin(import.meta.env.VITE_CHAT_API_BASE_URL)
    : null;

  return createChatBackendConnection({
    apiBaseUrl,
    rewriteRequestUrl: (url, target) =>
      target === "platform" && proxiedOrigin !== null && url.origin === proxiedOrigin
        ? `${platformProxyPrefix}${url.pathname}${url.search}`
        : url.toString(),
    sendPlatformRequest: (request) => {
      const headers = new Headers(request.headers);
      headers.set("Authorization", `Bearer ${token}`);
      return fetch(new Request(request, { headers }));
    },
  });
}
