import { createAgentRuntime, type StandInTurn } from "./agent-runtime";
import {
  detail,
  matchRoute,
  pause,
  readBearerToken,
  readRequest,
  throwIfAborted,
  type StandInFetch,
  type StandInRequest,
} from "./http";
import { createStandInContext, standInIdentity, type StandInIdentity } from "./identity";
import { createModelProviders } from "./model-providers";
import { createSessions, type StandInSession } from "./sessions";

/**
 * A scripted stand-in for the backend the chat package calls: the platform API routes and the
 * Agent's runtime routes of ADR 096, section 3. It keeps its sessions, transcripts, and providers
 * in memory, answers with the shapes the package's clients parse, and never reaches the network
 * for either. The standalone application's tests run against it, and `?stand-in` runs the
 * application on it in development.
 */

export { STAND_IN_TOOL_NAME, type StandInTurn, type StandInTurnStatus } from "./agent-runtime";
export type { StandInRequest, StandInTarget } from "./http";
export { standInIdentity, type StandInIdentity } from "./identity";
export type { StandInSession, StandInTranscriptMessage } from "./sessions";

export interface StandInOptions {
  /** Overrides of the stand-in's identities and runtime address. */
  identity?: Partial<StandInIdentity>;
  /** How long each platform and runtime answer takes. None by default. */
  latencyMs?: number;
  /** The pause between two streamed frames, so a reply can be watched. None by default. */
  chunkDelayMs?: number;
  /** Where requests that are neither for the platform nor for the Agent's runtime go. Unset, they get a 404. */
  passThrough?: StandInFetch;
}

export interface StandIn {
  /** Answers a request as the platform API or the Agent's runtime would. */
  fetch: StandInFetch;
  readonly identity: Readonly<StandInIdentity>;
  /** Every platform and runtime request, in the order it arrived. */
  readonly requests: readonly StandInRequest[];
  /** Requests without a route, answered 404 or 405. A complete stand-in keeps this empty. */
  readonly unhandledRequests: readonly StandInRequest[];
  /** Every chat turn the Agent received, in order. */
  readonly turns: readonly StandInTurn[];
  /** The sessions the platform holds, with their transcripts, in the order they were created. */
  readonly sessions: readonly StandInSession[];
  /** The requests with this method whose route path equals `path`, or matches it. */
  findRequests: (method: string, path: string | RegExp) => StandInRequest[];
  /** The next chat turn fails: the runtime streams an error frame with this text instead of a reply. */
  failNextTurn: (errorText?: string) => void;
  /** Replies stop after their reasoning and wait until `releaseReplies()`, or until the run is stopped. */
  holdReplies: () => void;
  releaseReplies: () => void;
}

export const STAND_IN_TURN_ERROR = "The model provider refused the request.";

function currentPageUrl() {
  return typeof location !== "undefined" && location.href ? location.href : "http://stand-in.local/";
}

export function createStandIn(options: StandInOptions = {}): StandIn {
  const identity = Object.freeze({ ...standInIdentity, ...options.identity });
  const runtimeUrl = new URL(identity.runtimeUrl);
  const latencyMs = options.latencyMs ?? 0;
  const context = createStandInContext(identity);
  const providers = createModelProviders(context);
  const sessions = createSessions(context, providers);
  const runtime = createAgentRuntime({
    chunkDelayMs: options.chunkDelayMs ?? 0,
    context,
    providers,
    sessions,
  });
  const platformRoutes = [...sessions.routes, ...providers.routes];
  const requests: StandInRequest[] = [];
  const unhandledRequests: StandInRequest[] = [];

  async function standInFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const signal = init?.signal ?? null;
    throwIfAborted(signal);

    const request = await readRequest(input, init, { pageUrl: currentPageUrl(), runtimeUrl });

    if (request.target === "other") {
      if (options.passThrough) {
        return options.passThrough(input, init);
      }
      unhandledRequests.push(request);
      return detail(404, `The stand-in answers the platform API and the Agent's runtime only, not ${request.url}.`);
    }

    requests.push(request);
    await pause(latencyMs, signal);

    const match = matchRoute(request.target === "platform" ? platformRoutes : runtime.routes, request);

    if (match.kind !== "route") {
      unhandledRequests.push(request);
      return match.kind === "method-not-allowed"
        ? detail(405, `Method "${request.method}" not allowed.`)
        : detail(404, `The stand-in has no route for ${request.method} ${request.path}.`);
    }

    // The platform takes the person's token, whatever it is; the runtime takes only its own.
    const token = readBearerToken(request);
    if (request.target === "platform" ? !token : token !== identity.runtimeToken) {
      return detail(401, "Authentication credentials were not provided or are not valid.");
    }

    return match.route.handle(request, match.params, signal);
  }

  return {
    fetch: standInFetch,
    identity,
    requests,
    unhandledRequests,
    turns: runtime.turns,
    get sessions() {
      return sessions.list();
    },
    findRequests: (method, path) =>
      requests.filter(
        (request) =>
          request.method === method.toUpperCase() &&
          (typeof path === "string" ? request.path === path : path.test(request.path)),
      ),
    failNextTurn: (errorText = STAND_IN_TURN_ERROR) => runtime.failNextTurn(errorText),
    holdReplies: runtime.holdReplies,
    releaseReplies: runtime.releaseReplies,
  };
}

// `StandaloneApp.tsx` reads the connect form's fields from this key.
const settingsStorageKey = "chat-standalone.settings";

/**
 * Answers the page's platform and runtime requests from a stand-in: `window.fetch` is replaced,
 * other requests still reach the network. When the connect form has nothing stored, it is
 * prefilled with the stand-in's identities; the token stays empty and any value is accepted.
 * The stand-in is `window.chatStandIn`, so its script (`failNextTurn()`, `holdReplies()`) can be
 * driven from the console.
 */
export function installStandIn(options: StandInOptions = {}): StandIn {
  const networkFetch = window.fetch.bind(window);
  const standIn = createStandIn({ latencyMs: 150, chunkDelayMs: 40, passThrough: networkFetch, ...options });

  window.fetch = standIn.fetch;
  (window as Window & { chatStandIn?: StandIn }).chatStandIn = standIn;

  try {
    if (!window.localStorage.getItem(settingsStorageKey)) {
      window.localStorage.setItem(
        settingsStorageKey,
        JSON.stringify({
          agentUid: standIn.identity.agentUid,
          apiBaseUrl: standIn.identity.platformUrl,
          environmentUid: standIn.identity.environmentUid,
          userUid: standIn.identity.userUid,
        }),
      );
    }
  } catch {
    // Storage is optional; the form then starts empty.
  }

  console.info("The chat is answered by the scripted stand-in; window.chatStandIn drives it.");
  return standIn;
}
