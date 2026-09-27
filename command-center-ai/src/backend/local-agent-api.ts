// The routes of an Agent the developer runs on their own machine (`ms-tau` in local mode), as
// Command Center AI's local source calls them (ADR 099). Every URL is under the source's
// same-origin `baseUrl`, which the dev server forwards to the runtime; the browser never calls
// the runtime directly and never sends it a credential.

import { MainSequenceAiError } from "./error-source.js";
import {
  normalizeModelProviderCatalog,
  projectModelProviderCatalogToRunConfigOptions,
  type AvailableChatRunConfigOptions,
} from "./model-catalog-api.js";
import { normalizeSessionHistorySnapshot, type SessionHistorySnapshot } from "./session-history.js";

const SOURCE = "local_agent_runtime";

/** A session of the local runtime, as its session list returns it. */
export interface LocalChatSessionRecord {
  sessionUid: string;
  title: string | null;
  messageCount: number;
  latestMessagePreview: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  working: boolean;
}

export interface LocalChatSessionPage {
  sessions: LocalChatSessionRecord[];
  nextCursor: string | null;
}

/** The session's provider, model, and thinking level, as the runtime holds them. */
export interface LocalSessionModel {
  sessionUid: string;
  provider: string | null;
  model: string | null;
  thinkingLevel: string | null;
}

export interface LocalAgentIdentity {
  name: string | null;
  displayName: string | null;
  description: string | null;
}

/** Joins the source's base path and a runtime route. */
export function localAgentUrl(baseUrl: string, route: string) {
  return `${baseUrl.replace(/\/+$/u, "")}${route}`;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function readErrorDetail(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return response.statusText || `Status ${response.status}`;
  }
  try {
    const payload = asRecord(JSON.parse(text));
    return readString(payload.detail) ?? readString(payload.message) ?? readString(payload.error) ?? text;
  } catch {
    return text;
  }
}

async function requestLocalAgent(
  baseUrl: string,
  route: string,
  init: RequestInit & { operation: string },
) {
  const { operation, ...requestInit } = init;
  let response: Response;
  try {
    response = await fetch(localAgentUrl(baseUrl, route), {
      credentials: "same-origin",
      ...requestInit,
      headers: { Accept: "application/json", ...(requestInit.headers ?? {}) },
    });
  } catch (error) {
    if (init.signal?.aborted) {
      throw error;
    }
    throw new MainSequenceAiError(`${operation}: the local Agent did not answer.`, {
      source: SOURCE,
    });
  }
  return response;
}

async function requireOk(response: Response, operation: string) {
  if (response.ok) {
    return;
  }
  throw new MainSequenceAiError(`${operation}: ${await readErrorDetail(response)}`, {
    source: SOURCE,
    status: response.status,
  });
}

/**
 * Whether the runtime is up and serving local mode. A runtime in managed mode is refused: it
 * expects the platform's gateway in front of it, not a browser.
 */
export async function fetchLocalAgentReadiness(baseUrl: string, signal?: AbortSignal) {
  const response = await requestLocalAgent(baseUrl, "/ready", {
    method: "GET",
    signal,
    operation: "Local Agent readiness",
  });
  const payload = asRecord(await response.json().catch(() => null));
  if (!response.ok || payload.ok !== true) {
    return { ready: false, message: readString(payload.detail) ?? "The local Agent is not ready yet." };
  }
  const health = await requestLocalAgent(baseUrl, "/health", {
    method: "GET",
    signal,
    operation: "Local Agent health",
  });
  const healthPayload = asRecord(await health.json().catch(() => null));
  if (health.ok && readString(healthPayload.mode) && healthPayload.mode !== "local") {
    return {
      ready: false,
      message: "This Agent runs in managed mode. Only a runtime started in local mode can be used directly.",
    };
  }
  return { ready: true, message: null };
}

/** ADR 093's check: the Agent answers its chat route. */
export async function probeLocalAgentChat(baseUrl: string, signal?: AbortSignal) {
  const response = await requestLocalAgent(baseUrl, "/api/chat", {
    method: "GET",
    signal,
    operation: "Local Agent chat check",
  });
  return response.ok;
}

/**
 * The runtime's chat sessions, newest first, or null when this runtime does not list them yet
 * (`ms-tau-sdk` issue #47); the local source is then live-only.
 */
export async function fetchLocalChatSessions(
  baseUrl: string,
  { cursor, limit = 50, signal }: { cursor?: string | null; limit?: number; signal?: AbortSignal } = {},
): Promise<LocalChatSessionPage | null> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) {
    query.set("cursor", cursor);
  }
  const response = await requestLocalAgent(baseUrl, `/api/local/v1/chat-sessions?${query}`, {
    method: "GET",
    signal,
    operation: "Local chat sessions",
  });
  if (response.status === 404 || response.status === 405) {
    return null;
  }
  await requireOk(response, "Local chat sessions");
  const payload = asRecord(await response.json());
  const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
  return {
    sessions: sessions.flatMap((value): LocalChatSessionRecord[] => {
      const record = asRecord(value);
      const sessionUid = readString(record.sessionUid);
      if (!sessionUid) {
        return [];
      }
      return [
        {
          sessionUid,
          title: readString(record.title),
          messageCount: typeof record.messageCount === "number" ? record.messageCount : 0,
          latestMessagePreview: readString(record.latestMessagePreview),
          createdAt: readString(record.createdAt),
          updatedAt: readString(record.updatedAt),
          working: record.working === true,
        },
      ];
    }),
    nextCursor: readString(payload.nextCursor),
  };
}

/**
 * A chat session's history in the platform's history shape, or null when this runtime cannot
 * read chat sessions back yet (`ms-tau-sdk` issue #47).
 */
export async function fetchLocalChatSessionHistory(
  baseUrl: string,
  sessionUid: string,
  signal?: AbortSignal,
): Promise<SessionHistorySnapshot | null> {
  const response = await requestLocalAgent(
    baseUrl,
    `/api/local/v1/chat-sessions/${encodeURIComponent(sessionUid)}/history`,
    { method: "GET", signal, operation: "Local chat session history" },
  );
  if (response.status === 404 || response.status === 405) {
    return null;
  }
  await requireOk(response, "Local chat session history");
  return normalizeSessionHistorySnapshot(await response.json());
}

/** The Agent's names from the runtime, or null when this runtime does not describe itself yet. */
export async function fetchLocalAgentIdentity(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<LocalAgentIdentity | null> {
  const response = await requestLocalAgent(baseUrl, "/api/local/v1/agent", {
    method: "GET",
    signal,
    operation: "Local Agent identity",
  });
  if (!response.ok) {
    return null;
  }
  const payload = asRecord(await response.json().catch(() => null));
  return {
    name: readString(payload.name),
    displayName: readString(payload.displayName),
    description: readString(payload.description),
  };
}

/** The providers and models the developer can run, from the platform through the runtime. */
export async function fetchLocalRunConfigOptions(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<AvailableChatRunConfigOptions> {
  const response = await requestLocalAgent(baseUrl, "/api/chat/model-providers", {
    method: "GET",
    signal,
    operation: "Local model catalog",
  });
  await requireOk(response, "Local model catalog");
  return projectModelProviderCatalogToRunConfigOptions(
    normalizeModelProviderCatalog(await response.json()),
  );
}

function readSessionModel(payload: unknown): LocalSessionModel {
  const record = asRecord(payload);
  const model = asRecord(record.model);
  return {
    sessionUid: readString(record.sessionUid) ?? "",
    provider: readString(model.provider),
    model: readString(model.model),
    thinkingLevel: readString(model.thinkingLevel),
  };
}

/** The session's model, or null while the session does not exist on the runtime yet. */
export async function fetchLocalSessionModel(
  baseUrl: string,
  sessionUid: string,
  signal?: AbortSignal,
): Promise<LocalSessionModel | null> {
  const response = await requestLocalAgent(
    baseUrl,
    `/api/chat/session-model?${new URLSearchParams({ sessionUid })}`,
    { method: "GET", signal, operation: "Local session model" },
  );
  if (!response.ok) {
    return null;
  }
  return readSessionModel(await response.json());
}

/** Changes an existing, idle session's model on the runtime. */
export async function updateLocalSessionModel(
  baseUrl: string,
  selection: { sessionUid: string; provider: string; model: string; thinkingLevel: string | null },
): Promise<LocalSessionModel> {
  const response = await requestLocalAgent(baseUrl, "/api/chat/session-model", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionUid: selection.sessionUid,
      provider: selection.provider,
      model: selection.model,
      thinkingLevel: selection.thinkingLevel,
    }),
    operation: "Changing the session's model",
  });
  await requireOk(response, "Changing the session's model");
  return readSessionModel(await response.json());
}

/** Stops the session's running turn. */
export async function cancelLocalChatSession(baseUrl: string, sessionUid: string) {
  const response = await requestLocalAgent(baseUrl, "/api/chat/session/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionUid, message: "user_requested" }),
    operation: "Stopping the session",
  });
  await requireOk(response, "Stopping the session");
}
