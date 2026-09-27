// The local Agent source (ADR 099): an Agent the developer runs on their own machine, reached
// through a same-origin route of the application's dev server (the Command Center SDK's
// `localAgentProxy()` from `/vite`). With it, `ChatEngineProvider` talks to the runtime instead of
// the platform, and every part of the chat stays the same.

export interface LocalAgentSourceOptions {
  /**
   * The same-origin path the dev server forwards to the runtime, for example `/__agent__`. An
   * absolute URL is accepted only when it is the page's own origin.
   */
  baseUrl: string;
  /** The Agent's name as the person sees it, until the runtime describes itself. */
  displayName: string;
  /** The signed-in developer, drawn on their own messages. Optional. */
  userUid?: string | null;
}

/** An Agent on the developer's machine, as `ChatEngineProvider`'s `source` takes it. */
export interface LocalAgentSource {
  readonly kind: "local";
  /** The same-origin path, without a trailing slash. */
  readonly baseUrl: string;
  readonly displayName: string;
  readonly userUid: string | null;
}

function currentOrigin() {
  return typeof window === "undefined" ? null : window.location.origin;
}

/**
 * Describes an Agent running on the developer's machine. It refuses an address on another origin:
 * a local runtime answers every caller as the developer, so the page reaches it only through its
 * own dev server.
 */
export function createLocalAgentSource({
  baseUrl,
  displayName,
  userUid = null,
}: LocalAgentSourceOptions): LocalAgentSource {
  const trimmed = baseUrl.trim();
  let path: string;

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    path = trimmed;
  } else {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new TypeError(
        `A local Agent source needs a same-origin path such as "/__agent__": ${JSON.stringify(baseUrl)}`,
      );
    }
    const origin = currentOrigin();
    if (!origin || url.origin !== origin) {
      throw new TypeError(
        `A local Agent source must be on the page's own origin; forward it with localAgentProxy(): ${JSON.stringify(baseUrl)}`,
      );
    }
    path = `${url.pathname}${url.search}`;
  }

  const name = displayName.trim();
  if (!name) {
    throw new TypeError("A local Agent source needs a displayName.");
  }

  return Object.freeze({
    kind: "local" as const,
    baseUrl: path.replace(/\/+$/u, "") || "/",
    displayName: name,
    userUid: userUid?.trim() || null,
  });
}
