import type { ThreadMessageLike } from "@assistant-ui/react";
import type { ReadonlyJSONObject } from "assistant-stream/utils";
import {
  buildMessageProvenanceDataPart,
  buildMessageProvenanceMetadata,
  normalizeMessageProvenance,
} from "./message-provenance.js";

type HistoryMessageStatus = "running" | "completed" | "error";

type HistoryMessagePart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "reasoning";
      text: string;
    }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      args: ReadonlyJSONObject;
      result?: unknown;
      isError?: boolean;
    };

export interface SessionHistoryApiSession {
  sessionId: string;
  threadId: string | null;
  agentUid: string | null;
  agentSessionUid: string | null;
  status: HistoryMessageStatus;
  startedAt: string | null;
  updatedAt: string | null;
  error: string | null;
}

export interface SessionHistorySnapshot {
  version: number;
  session: SessionHistoryApiSession;
  messages: ThreadMessageLike[];
  inProgressMessage: ThreadMessageLike | null;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function pushTextPart(parts: HistoryMessagePart[], text: string) {
  if (text.length === 0) {
    return;
  }

  parts.push({
    type: "text",
    text,
  });
}

function pushReasoningPart(parts: HistoryMessagePart[], text: string) {
  if (!text.trim()) {
    return;
  }

  parts.push({
    type: "reasoning",
    text,
  });
}

type ThinkTagParserState = {
  thinkingText: string | null;
};

function appendAssistantTextPart(
  parts: HistoryMessagePart[],
  state: ThinkTagParserState,
  text: string,
) {
  const thinkTagPattern = /<\/?think\b[^>]*>/gi;
  let lastIndex = 0;

  for (const match of text.matchAll(thinkTagPattern)) {
    const tag = match[0].toLowerCase();
    const segment = text.slice(lastIndex, match.index);

    if (state.thinkingText !== null) {
      state.thinkingText += segment;
    } else {
      pushTextPart(parts, segment);
    }

    if (tag.startsWith("</think")) {
      if (state.thinkingText !== null) {
        pushReasoningPart(parts, state.thinkingText);
        state.thinkingText = null;
      }
    } else if (state.thinkingText === null) {
      state.thinkingText = "";
    }

    lastIndex = match.index + match[0].length;
  }

  const tail = text.slice(lastIndex);

  if (state.thinkingText !== null) {
    state.thinkingText += tail;
  } else {
    pushTextPart(parts, tail);
  }
}

function normalizeHistoryParts(
  value: unknown,
  role: "assistant" | "user" | "system",
): HistoryMessagePart[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const parts: HistoryMessagePart[] = [];
  const thinkTagState: ThinkTagParserState = {
    thinkingText: null,
  };

  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    const candidate = entry as Record<string, unknown>;

    if (candidate.type === "text" && typeof candidate.text === "string") {
      if (role === "assistant") {
        appendAssistantTextPart(parts, thinkTagState, candidate.text);
      } else {
        pushTextPart(parts, candidate.text);
      }
      continue;
    }

    if (
      role === "assistant" &&
      (candidate.type === "reasoning" || candidate.type === "thinking") &&
      typeof candidate.text === "string"
    ) {
      pushReasoningPart(parts, candidate.text);
      continue;
    }

    if (
      role === "assistant" &&
      candidate.type === "thinking" &&
      typeof candidate.content === "string"
    ) {
      pushReasoningPart(parts, candidate.content);
      continue;
    }

    if (
      role === "assistant" &&
      candidate.type === "reasoning" &&
      typeof candidate.content === "string"
    ) {
      pushReasoningPart(parts, candidate.content);
      continue;
    }
    if (role === "assistant" && (candidate.type === "tool-call" || candidate.type === "tool_call")) {
      const toolCallId =
        typeof candidate.toolCallId === "string" && candidate.toolCallId.trim()
          ? candidate.toolCallId.trim()
          : null;
      const toolName =
        typeof candidate.toolName === "string" && candidate.toolName.trim()
          ? candidate.toolName.trim()
          : null;
      if (!toolCallId || !toolName) {
        continue;
      }
      parts.push({
        type: "tool-call",
        toolCallId,
        toolName,
        args: asRecord(candidate.args ?? candidate.input) as ReadonlyJSONObject,
        ...(candidate.result !== undefined ? { result: candidate.result } : {}),
        isError: candidate.isError === true,
      });
      continue;
    }
  }

  if (thinkTagState.thinkingText !== null) {
    pushReasoningPart(parts, thinkTagState.thinkingText);
  }

  return parts;
}

function hasRenderableHistoryContent(parts: HistoryMessagePart[]) {
  return parts.some((part) => part.type === "tool-call" || part.text.trim().length > 0);
}

function normalizeAssistantStatus(
  mode: "complete" | "in-progress",
  session: SessionHistoryApiSession,
) {
  if (mode === "complete") {
    return {
      type: "complete" as const,
      reason: "stop" as const,
    };
  }

  if (session.status === "error") {
    return {
      type: "incomplete" as const,
      reason: "error" as const,
      ...(session.error ? { error: session.error } : {}),
    };
  }

  return {
    type: "running" as const,
  };
}

function normalizeHistoryMessage(
  value: unknown,
  session: SessionHistoryApiSession,
  mode: "complete" | "in-progress",
): ThreadMessageLike | null {
  const candidate = asRecord(value);
  const role = candidate.role;

  if (role !== "assistant" && role !== "user" && role !== "system") {
    return null;
  }

  const content = normalizeHistoryParts(candidate.content, role);
  if (!hasRenderableHistoryContent(content)) {
    return null;
  }

  const id =
    typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim() : undefined;
  const createdAt = normalizeDate(candidate.createdAt);
  const provenance = normalizeMessageProvenance(candidate.provenance);
  const metadata = provenance ? buildMessageProvenanceMetadata(provenance) : undefined;

  return {
    role,
    ...(id ? { id } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(role === "assistant" ? { status: normalizeAssistantStatus(mode, session) } : {}),
    ...(metadata ? { metadata } : {}),
    content: provenance ? [buildMessageProvenanceDataPart(provenance), ...content] : content,
  } satisfies ThreadMessageLike;
}

function normalizeIdLikeField(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function normalizeSession(value: unknown): SessionHistoryApiSession {
  const candidate = asRecord(value);
  const rawSessionId = candidate.sessionId;
  const rawStatus = candidate.status;

  return {
    sessionId:
      typeof rawSessionId === "string" && rawSessionId.trim() ? rawSessionId.trim() : "",
    threadId:
      typeof candidate.threadId === "string" && candidate.threadId.trim()
        ? candidate.threadId.trim()
        : null,
    // The platform's history sends agentUid/agentSessionUid; the legacy
    // agentId/agentSessionId names are kept as fallbacks for older payloads
    // and fixtures.
    agentUid: normalizeIdLikeField(candidate.agentUid) ?? normalizeIdLikeField(candidate.agentId),
    agentSessionUid:
      normalizeIdLikeField(candidate.agentSessionUid) ??
      normalizeIdLikeField(candidate.agentSessionId),
    status:
      rawStatus === "running" || rawStatus === "completed" || rawStatus === "error"
        ? rawStatus
        : "completed",
    startedAt:
      typeof candidate.startedAt === "string" && candidate.startedAt.trim()
        ? candidate.startedAt.trim()
        : null,
    updatedAt:
      typeof candidate.updatedAt === "string" && candidate.updatedAt.trim()
        ? candidate.updatedAt.trim()
        : null,
    error:
      typeof candidate.error === "string" && candidate.error.trim() ? candidate.error.trim() : null,
  };
}

export function normalizeSessionHistorySnapshot(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Session history response is not an object.");
  }

  const candidate = payload as Record<string, unknown>;
  const session = normalizeSession(candidate.session);
  const version =
    typeof candidate.version === "number" && Number.isFinite(candidate.version)
      ? candidate.version
      : 1;

  const completedMessages = Array.isArray(candidate.messages)
    ? candidate.messages.flatMap((message) => {
        const normalized = normalizeHistoryMessage(message, session, "complete");
        return normalized ? [normalized] : [];
      })
    : [];

  const inProgressMessage = normalizeHistoryMessage(
    candidate.inProgressMessage,
    session,
    "in-progress",
  );

  return {
    version,
    session,
    messages: inProgressMessage ? [...completedMessages, inProgressMessage] : completedMessages,
    inProgressMessage,
  } satisfies SessionHistorySnapshot;
}
