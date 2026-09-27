import { planReply, readInput, transcriptParts } from "./agent-runtime";
import { asRecord, detail, json, pause, readString, type StandInFetch } from "./http";
import { createStandInContext, standInIdentity } from "./identity";
import { createModelProviders } from "./model-providers";

// A scripted stand-in for an Agent the developer runs with `ms-tau` in local mode (ADR 099), at the
// same-origin path a dev server's `localAgentProxy()` forwards. It answers the routes Command Center
// AI's local source calls with `ms-tau-sdk`'s shapes: `/ready`, `/health`, the chat stream with the
// canonical session in `X-Agent-Session-Uid`, cancel, the session's model, the provider catalog, and
// the session list and history requested in `ms-tau-sdk` issue #47. With `listsSessions: false` it
// answers those two with 404, as a runtime without them does, so the live-only path can be tried.

export interface LocalRuntimeStandInOptions {
  /** The page path the runtime answers under. Defaults to `/__agent__`. */
  basePath?: string;
  /** The pause between two streamed frames. None by default. */
  chunkDelayMs?: number;
  /** Whether the runtime lists and replays chat sessions (`ms-tau-sdk` issue #47). Default true. */
  listsSessions?: boolean;
  /** The Agent's name the runtime reports. */
  agentName?: string;
  /** Requests outside `basePath`. Unset, they get a 404. */
  passThrough?: StandInFetch;
}

interface LocalSession {
  uid: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  working: boolean;
  provider: string;
  model: string;
  thinkingLevel: string | null;
  messages: Array<{ id: string; role: "user" | "assistant"; createdAt: string; content: unknown[] }>;
}

export interface LocalRuntimeStandIn {
  fetch: StandInFetch;
  /** Every request the runtime received: method and path with its query. */
  readonly requests: ReadonlyArray<{ method: string; path: string; body: unknown }>;
  readonly sessions: ReadonlyArray<LocalSession>;
}

const DEFAULT_PROVIDER = "stand-in-cloud";
const DEFAULT_MODEL = "swift-1";

/** `ms-tau`'s `local_session_uid`: a prefixed id passes, anything else maps to one, none to default. */
function canonicalSessionUid(value: string | null) {
  if (!value) return "local-standin-default";
  if (value.startsWith("local-")) return value;
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `local-standin-${hash.toString(16).padStart(8, "0")}`;
}

export function createLocalRuntimeStandIn(options: LocalRuntimeStandInOptions = {}): LocalRuntimeStandIn {
  const basePath = (options.basePath ?? "/__agent__").replace(/\/+$/u, "");
  const chunkDelayMs = options.chunkDelayMs ?? 0;
  const listsSessions = options.listsSessions ?? true;
  const agentName = options.agentName ?? "Stand-in Local Agent";
  const context = createStandInContext(standInIdentity);
  const providers = createModelProviders(context);
  const catalogRoute = providers.routes.find(
    (route) => route.method === "GET" && route.path === "/api/v1/model-providers/",
  );
  const sessions = new Map<string, LocalSession>();
  const stops = new Map<string, () => void>();
  const requests: Array<{ method: string; path: string; body: unknown }> = [];
  let turnNumber = 0;

  function ensureSession(uid: string) {
    let session = sessions.get(uid);
    if (!session) {
      const now = new Date().toISOString();
      session = {
        uid,
        title: null,
        createdAt: now,
        updatedAt: now,
        working: false,
        provider: DEFAULT_PROVIDER,
        model: DEFAULT_MODEL,
        thinkingLevel: null,
        messages: [],
      };
      sessions.set(uid, session);
    }
    return session;
  }

  function streamReply(session: LocalSession, input: string, signal: AbortSignal | null) {
    turnNumber += 1;
    const number = turnNumber;
    const described = providers.describeModel(session.provider, session.model);
    const label = described ? `${described.modelLabel} (${described.providerLabel})` : session.model;
    const frames = planReply(number, input, label).filter(
      (frame): frame is Record<string, unknown> => typeof frame !== "string",
    );
    const streamed: Array<Record<string, unknown>> = [];
    const encoder = new TextEncoder();
    let finished = false;

    const settle = () => {
      if (!session.working) return;
      session.working = false;
      stops.delete(session.uid);
      session.updatedAt = new Date().toISOString();
      session.messages.push({
        id: `assistant-${number}`,
        role: "assistant",
        createdAt: session.updatedAt,
        content: transcriptParts(streamed),
      });
    };

    return new ReadableStream<Uint8Array>({
      start(controller) {
        const stop = () => {
          if (finished) return;
          finished = true;
          settle();
          try {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch {
            // The page stopped reading.
          }
        };
        stops.set(session.uid, stop);
        // `ms-tau` cancels the turn when the caller disconnects.
        signal?.addEventListener("abort", stop, { once: true });

        void (async () => {
          for (const frame of frames) {
            if (finished) return;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
            streamed.push(frame);
            if (chunkDelayMs > 0) await pause(chunkDelayMs);
          }
          if (finished) return;
          finished = true;
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          settle();
        })();
      },
      cancel() {
        finished = true;
        settle();
      },
    });
  }

  async function handle(method: string, url: URL, body: unknown, signal: AbortSignal | null): Promise<Response> {
    const route = url.pathname.slice(basePath.length) || "/";
    requests.push({ method, path: `${route}${url.search}`, body });

    if (method === "GET" && route === "/ready") return json(200, { ok: true, runtime: "tau", startup_ready: true });
    if (method === "GET" && route === "/health") return json(200, { ok: true, runtime: "tau", mode: "local" });
    if (method === "GET" && route === "/api/chat") return json(200, { runtime: "tau", protocol: "ui-message-stream" });

    if (method === "POST" && route === "/api/chat") {
      const record = asRecord(body);
      const uid = canonicalSessionUid(
        readString(record.sessionUid) ?? readString(record.runtime_session_uid) ?? readString(record.agent_session_uid),
      );
      const input = readInput(record);
      if (!input) return detail(422, "The chat request carries no message.");
      const session = ensureSession(uid);
      if (session.working) return detail(409, "The Agent is already answering in this session.");
      session.working = true;
      session.title ??= input.slice(0, 60);
      session.updatedAt = new Date().toISOString();
      session.messages.push({
        id: `user-${session.messages.length + 1}`,
        role: "user",
        createdAt: session.updatedAt,
        content: [{ type: "text", text: input }],
      });
      return new Response(streamReply(session, input, signal), {
        status: 200,
        headers: {
          "Cache-Control": "no-cache",
          "Content-Type": "text/event-stream; charset=utf-8",
          "x-vercel-ai-ui-message-stream": "v1",
          "X-Agent-Session-Uid": uid,
        },
      });
    }

    if (method === "POST" && route === "/api/chat/session/cancel") {
      const uid = canonicalSessionUid(readString(asRecord(body).sessionUid));
      const stop = stops.get(uid);
      stop?.();
      return json(200, { ok: true, sessionUid: uid, agentSessionUid: uid, state: stop ? "cancelled" : "not_running", working: false });
    }

    if (route === "/api/chat/session-model") {
      if (method === "GET") {
        const session = sessions.get(canonicalSessionUid(url.searchParams.get("sessionUid")));
        if (!session) return detail(404, "Local session not found.");
        return json(200, {
          sessionUid: session.uid,
          model: { provider: session.provider, model: session.model, thinkingLevel: session.thinkingLevel },
        });
      }
      if (method === "PUT") {
        const record = asRecord(body);
        const session = sessions.get(canonicalSessionUid(readString(record.sessionUid)));
        if (!session) return detail(404, "Local session not found.");
        if (session.working) return detail(409, "Cannot change a model while the session is working");
        session.provider = readString(record.provider) ?? session.provider;
        session.model = readString(record.model) ?? session.model;
        session.thinkingLevel = readString(record.thinkingLevel);
        return json(200, {
          sessionUid: session.uid,
          model: { provider: session.provider, model: session.model, thinkingLevel: session.thinkingLevel },
        });
      }
    }

    if (method === "GET" && route === "/api/chat/model-providers" && catalogRoute) {
      return catalogRoute.handle(
        {
          method: "GET",
          url: "/api/v1/model-providers/",
          target: "platform",
          path: "/api/v1/model-providers/",
          base: "",
          query: new URLSearchParams(),
          headers: new Headers(),
          body: null,
        },
        {},
        signal,
      );
    }

    if (method === "GET" && route === "/api/local/v1/agent") {
      return json(200, { name: "stand_in_local_agent", displayName: agentName, description: "A scripted local Agent." });
    }

    if (listsSessions && method === "GET" && route === "/api/local/v1/chat-sessions") {
      const list = [...sessions.values()]
        .filter((session) => session.messages.length > 0)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map((session) => ({
          sessionUid: session.uid,
          title: session.title,
          messageCount: session.messages.length,
          latestMessagePreview: session.title,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          working: session.working,
        }));
      return json(200, { sessions: list, nextCursor: null });
    }

    const history = /^\/api\/local\/v1\/chat-sessions\/([^/]+)\/history$/u.exec(route);
    if (listsSessions && method === "GET" && history) {
      const session = sessions.get(canonicalSessionUid(decodeURIComponent(history[1]!)));
      return json(200, {
        version: 1,
        session: {
          sessionId: session?.uid ?? decodeURIComponent(history[1]!),
          agentSessionUid: session?.uid ?? null,
          status: session?.working ? "running" : "completed",
          startedAt: session?.createdAt ?? null,
          updatedAt: session?.updatedAt ?? null,
          error: null,
        },
        messages: session?.messages ?? [],
        inProgressMessage: null,
      });
    }

    return detail(404, `The local runtime has no route for ${method} ${route}.`);
  }

  const standInFetch: StandInFetch = async (input, init) => {
    const pageUrl = typeof location !== "undefined" && location.href ? location.href : "http://stand-in.local/";
    const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(requestUrl, pageUrl);
    if (url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`)) {
      return options.passThrough ? options.passThrough(input, init) : detail(404, `Not a local runtime path: ${url.pathname}.`);
    }
    const text = typeof init?.body === "string" ? init.body : null;
    let body: unknown = null;
    try {
      body = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      body = text;
    }
    return handle((init?.method ?? "GET").toUpperCase(), url, body, init?.signal ?? null);
  };

  return {
    fetch: standInFetch,
    requests,
    get sessions() {
      return [...sessions.values()];
    },
  };
}
