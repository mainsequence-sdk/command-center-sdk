import type { AssistantRuntime, ChatModelAdapter, ChatModelRunOptions, ThreadMessage } from "@assistant-ui/core";
import { splitLocalRuntimeOptions, type LocalRuntimeOptions, useLocalRuntime } from "@assistant-ui/core/react";
import {
  AssistantMessageAccumulator,
  DataStreamDecoder,
  toGenericMessages,
  toToolsJSONSchema,
  UIMessageStreamDecoder,
  unstable_toolResultStream,
} from "assistant-stream";
import { asAsyncIterableStream } from "assistant-stream/utils";

import {
  MainSequenceAiError,
  toMainSequenceAiError,
  withMainSequenceAiErrorSource,
} from "../backend/error-source.js";

type HeadersValue = Record<string, string> | Headers;

export type LatestMessageDataStreamProtocol = "ui-message-stream" | "data-stream";

export type UseLatestMessageDataStreamRuntimeOptions = {
  api: string;
  fetch?: (input: string, init: RequestInit) => Promise<Response>;
  protocol?: LatestMessageDataStreamProtocol;
  onRequestStart?: () => void | Promise<void>;
  onData?: (data: {
    type: string;
    name: string;
    data: unknown;
    transient?: boolean;
  }) => void;
  onChunk?: (chunk: { type: string; data: Record<string, unknown> }) => void;
  onResponse?: (response: Response) => void | Promise<void>;
  onFinish?: (message: ThreadMessage) => void;
  onError?: (error: Error) => void;
  onCancel?: () => void;
  credentials?: RequestCredentials;
  headers?: HeadersValue | (() => Promise<HeadersValue>);
  body?: object | (() => Promise<object | undefined>);
  sendExtraMessageFields?: boolean;
} & LocalRuntimeOptions;

type DataStreamRuntimeRequestOptions = {
  messages: unknown[];
  tools: unknown;
  system?: string | undefined;
  runConfig?: unknown;
  unstable_assistantMessageId?: string;
  threadId?: string;
  parentId?: string | null;
  state?: unknown;
};

function extractAgentMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return "agent_id" in value ? value : null;
}

function extractUiMessageStreamChunk(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const chunk = value as Record<string, unknown>;
  return typeof chunk.type === "string" ? { type: chunk.type, data: chunk } : null;
}

function normalizeErrorField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function extractUiMessageStreamError(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const chunk = value as Record<string, unknown>;

  if (chunk.type !== "error") {
    return null;
  }

  const message =
    normalizeErrorField(chunk.errorText) ??
    normalizeErrorField(chunk.error) ??
    normalizeErrorField(chunk.message) ??
    normalizeErrorField(chunk.error_detail) ??
    "The assistant runtime reported an error.";
  const status =
    typeof chunk.status === "number" && Number.isFinite(chunk.status)
      ? chunk.status
      : null;
  const errorCode = normalizeErrorField(chunk.error_code);
  const detail = normalizeErrorField(chunk.error_detail);
  const errorSource =
    normalizeErrorField(chunk.error_source) ??
    normalizeErrorField(chunk.source) ??
    "assistant_runtime_stream";
  const error = new MainSequenceAiError(message, {
    code: errorCode,
    detail,
    source: errorSource,
    status,
  }) as MainSequenceAiError & {
    agentId?: unknown;
    errorCode?: string | null;
    errorDetail?: string | null;
    errorSource?: string | null;
    status?: number | null;
  };

  error.name = "AssistantRuntimeStreamError";
  error.status = status;
  error.errorCode = errorCode;
  error.errorDetail = detail;
  error.errorSource = errorSource;
  error.agentId = chunk.agent_id ?? chunk.agentId;

  return error;
}

/**
 * Rewrites the tool chunks of older Agent runtimes (`tool-input-available`,
 * `tool-output-delta`, `tool-output-available`, the AI SDK v5 names) into the
 * names assistant-stream's decoder understands (`tool-call-start` +
 * `tool-call-delta` + `tool-call-end`, `tool-result`). Without it those
 * runtimes' tool calls never become message parts. Frames of any other type
 * pass through byte for byte.
 */
export function createLegacyToolChunkTranslator(): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let eventLines: string[] = [];
  let dataLines: string[] = [];

  const rewriteFrames = (rawData: string): Record<string, unknown>[] | null => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawData) as unknown;
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const chunk = parsed as Record<string, unknown>;
    const toolCallId = typeof chunk.toolCallId === "string" ? chunk.toolCallId : "";
    if (chunk.type === "tool-input-available" && toolCallId) {
      const toolName = typeof chunk.toolName === "string" ? chunk.toolName : "unknown";
      const input =
        chunk.input && typeof chunk.input === "object" && !Array.isArray(chunk.input)
          ? chunk.input
          : {};
      return [
        { type: "tool-call-start", toolCallId, toolName },
        { type: "tool-call-delta", toolCallId, argsText: JSON.stringify(input) },
        { type: "tool-call-end", toolCallId },
      ];
    }
    if (chunk.type === "tool-output-available" && toolCallId) {
      return [
        {
          type: "tool-result",
          toolCallId,
          result: chunk.output,
          isError: chunk.isError === true,
        },
      ];
    }
    if (chunk.type === "tool-output-delta") {
      return [];
    }
    return null;
  };

  const flushEvent = (controller: TransformStreamDefaultController<Uint8Array>) => {
    const rewritten = dataLines.length > 0 ? rewriteFrames(dataLines.join("\n")) : null;
    if (rewritten === null) {
      if (eventLines.length > 0) {
        controller.enqueue(encoder.encode(`${eventLines.join("\n")}\n\n`));
      }
    } else {
      for (const frame of rewritten) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
      }
    }
    eventLines = [];
    dataLines = [];
  };

  const processBufferedLines = (controller: TransformStreamDefaultController<Uint8Array>) => {
    while (true) {
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex === -1) {
        break;
      }
      const rawLine = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      if (line === "") {
        flushEvent(controller);
        continue;
      }
      eventLines.push(line);
      if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trimStart());
      }
    }
  };

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      processBufferedLines(controller);
    },
    flush(controller) {
      buffer += decoder.decode();
      if (buffer) {
        const trailingLine = buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer;
        buffer = "";
        if (trailingLine) {
          eventLines.push(trailingLine);
          if (trailingLine.startsWith("data:")) {
            dataLines.push(trailingLine.slice("data:".length).trimStart());
          }
        }
      }
      flushEvent(controller);
    },
  });
}

function createUiMessageStreamMetadataTap(
  options: Pick<UseLatestMessageDataStreamRuntimeOptions, "onChunk" | "onData">,
): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";
  let dataLines: string[] = [];

  const flushEvent = () => {
    if (eventName !== "message" || dataLines.length === 0) {
      eventName = "message";
      dataLines = [];
      return;
    }

    const rawData = dataLines.join("\n");

    if (rawData === "[DONE]") {
      eventName = "message";
      dataLines = [];
      return;
    }

    try {
      const parsed = JSON.parse(rawData) as unknown;
      const chunk = extractUiMessageStreamChunk(parsed);
      const streamError = extractUiMessageStreamError(parsed);

      if (chunk) {
        options.onChunk?.(chunk);
      }

      if (streamError) {
        throw streamError;
      }

      const metadata = extractAgentMetadata(parsed);

      if (metadata) {
        options.onData?.({
          type: "metadata",
          name: "agent_id",
          data: metadata,
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AssistantRuntimeStreamError") {
        throw error;
      }

      // Ignore malformed metadata frames and let the main decoder own protocol validation.
    }

    eventName = "message";
    dataLines = [];
  };

  const processBufferedLines = () => {
    while (true) {
      const newlineIndex = buffer.indexOf("\n");

      if (newlineIndex === -1) {
        break;
      }

      const rawLine = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;

      if (line.startsWith(":")) {
        continue;
      }

      if (line === "") {
        flushEvent();
        continue;
      }

      const [field, ...rest] = line.split(":");
      const fieldValue = rest.join(":").trimStart();

      switch (field) {
        case "event":
          eventName = fieldValue || "message";
          break;
        case "data":
          dataLines.push(fieldValue);
          break;
        default:
          break;
      }
    }
  };

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk);
      buffer += decoder.decode(chunk, { stream: true });
      processBufferedLines();
    },
    flush() {
      buffer += decoder.decode();

      if (buffer) {
        const trailingLine = buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer;
        if (trailingLine) {
          const [field, ...rest] = trailingLine.split(":");
          if (field === "data") {
            dataLines.push(rest.join(":").trimStart());
          } else if (field === "event") {
            eventName = rest.join(":").trimStart() || "message";
          }
        }
      }

      flushEvent();
    },
  });
}

function toUrl(value: string | URL): URL {
  if (value instanceof URL) return value;

  try {
    return new URL(value);
  } catch {
    return new URL(value, "file://");
  }
}

function convertGenericToLanguageModel(generic: ReturnType<typeof toGenericMessages>[number]) {
  switch (generic.role) {
    case "system":
      return { role: "system", content: generic.content };
    case "user":
      return {
        role: "user",
        content: generic.content.map((part) =>
          part.type === "text"
            ? part
            : {
                type: "file",
                data: toUrl(part.data),
                mediaType: part.mediaType,
              },
        ),
      };
    case "assistant":
      return {
        role: "assistant",
        content: generic.content.map((part) =>
          part.type === "text"
            ? part
            : {
                type: "tool-call",
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                input: part.args,
              },
        ),
      };
    case "tool":
      return {
        role: "tool",
        content: generic.content.map((part) => ({
          type: "tool-result",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          output: part.isError
            ? { type: "error-json", value: part.result }
            : { type: "json", value: part.result },
        })),
      };
  }
}

function toLatestLanguageModelMessages(
  messages: readonly ThreadMessage[],
  options: { unstable_includeId?: boolean | undefined } = {},
) {
  const includeId = options.unstable_includeId ?? false;
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");

  if (!latestUserMessage) {
    return [];
  }

  const genericMessages = toGenericMessages([latestUserMessage] as never);

  if (!includeId) {
    return genericMessages.map(convertGenericToLanguageModel);
  }

  return genericMessages.map((generic) => {
    const converted = convertGenericToLanguageModel(generic) as Record<string, unknown>;

    if (generic.role !== "tool") {
      converted.unstable_id = latestUserMessage.id;
    }

    return converted;
  });
}

function isAbortError(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  return error instanceof Error && error.name === "AbortError";
}

async function formatResponseError(response: Response) {
  const rawBody = await response.text().catch(() => "");

  if (rawBody.trim()) {
    try {
      const payload = JSON.parse(rawBody) as unknown;

      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        const candidate = payload as Record<string, unknown>;
        const message =
          normalizeErrorField(candidate.error) ??
          normalizeErrorField(candidate.message) ??
          normalizeErrorField(candidate.detail) ??
          normalizeErrorField(candidate.error_detail);
        const errorSource =
          normalizeErrorField(candidate.error_source) ??
          normalizeErrorField(candidate.source);

        if (message) {
          return errorSource
            ? withMainSequenceAiErrorSource({
                message,
                source: errorSource,
              })
            : message;
        }
      }
    } catch {
      return rawBody;
    }

    return rawBody;
  }

  return response.statusText || `Status ${response.status}`;
}

class LatestMessageDataStreamRuntimeAdapter implements ChatModelAdapter {
  constructor(
    private options: Omit<UseLatestMessageDataStreamRuntimeOptions, keyof LocalRuntimeOptions>,
  ) {}

  async *run({
    messages,
    runConfig,
    abortSignal,
    context,
    unstable_assistantMessageId,
    unstable_threadId,
    unstable_parentId,
    unstable_getMessage,
  }: ChatModelRunOptions) {
    abortSignal.addEventListener(
      "abort",
      () => {
        if (!abortSignal.reason?.detach) this.options.onCancel?.();
      },
      { once: true },
    );

    // Every await below stays inside this try block: a failure anywhere in the
    // request lifecycle (body/header resolution, endpoint resolution inside a
    // custom fetch, network errors) must reach onError so the provider can
    // clear the working/stream flags it set optimistically.
    try {
      const headersValue =
        typeof this.options.headers === "function"
          ? await this.options.headers()
          : this.options.headers;

      const bodyValue =
        typeof this.options.body === "function"
          ? await this.options.body()
          : this.options.body;

      const headers = new Headers(headersValue);
      headers.set("Content-Type", "application/json");

      await this.options.onRequestStart?.();

      const requestBody = {
        system: context.system,
        messages: toLatestLanguageModelMessages(messages, {
          unstable_includeId: this.options.sendExtraMessageFields,
        }) as DataStreamRuntimeRequestOptions["messages"],
        tools: toToolsJSONSchema(
          context.tools ?? {},
        ) as unknown as DataStreamRuntimeRequestOptions["tools"],
        ...(unstable_assistantMessageId ? { unstable_assistantMessageId } : {}),
        ...(unstable_threadId ? { threadId: unstable_threadId } : {}),
        ...(unstable_parentId !== undefined ? { parentId: unstable_parentId } : {}),
        runConfig,
        state: unstable_getMessage().metadata.unstable_state || undefined,
        ...context.callSettings,
        ...context.config,
        ...(bodyValue ?? {}),
      } satisfies DataStreamRuntimeRequestOptions;

      const executeFetch = this.options.fetch ?? fetch;
      const result = await executeFetch(this.options.api, {
        method: "POST",
        headers,
        credentials: this.options.credentials ?? "same-origin",
        body: JSON.stringify(requestBody),
        signal: abortSignal,
      });

      if (!result.ok) {
        throw new MainSequenceAiError(await formatResponseError(result), {
          source: "assistant_backend_http",
          status: result.status,
        });
      }

      if (!result.body) {
        throw new MainSequenceAiError("Response body is null", {
          source: "assistant_backend_http",
          status: result.status,
        });
      }

      await this.options.onResponse?.(result);

      const protocol = this.options.protocol ?? "ui-message-stream";
      const decoder =
        protocol === "ui-message-stream"
          ? new UIMessageStreamDecoder(
              this.options.onData ? { onData: this.options.onData } : {},
            )
          : new DataStreamDecoder();

      const stream = result.body
        .pipeThrough(
          protocol === "ui-message-stream"
            ? createLegacyToolChunkTranslator()
            : new TransformStream<Uint8Array, Uint8Array>(),
        )
        .pipeThrough(
          protocol === "ui-message-stream" && (this.options.onData || this.options.onChunk)
            ? createUiMessageStreamMetadataTap({
                onChunk: this.options.onChunk,
                onData: this.options.onData,
              })
            : new TransformStream<Uint8Array, Uint8Array>(),
        )
        .pipeThrough(decoder)
        .pipeThrough(
          unstable_toolResultStream(context.tools, abortSignal, () => {
            throw new Error("Tool interrupt is not supported in data stream runtime");
          }),
        )
        .pipeThrough(new AssistantMessageAccumulator());

      yield* asAsyncIterableStream(stream);

      this.options.onFinish?.(unstable_getMessage());
    } catch (error: unknown) {
      // Abort-driven failures are reported through onCancel (via the abort
      // listener above); rethrow them untouched so assistant-ui marks the run
      // cancelled instead of errored.
      if (abortSignal.aborted || isAbortError(error)) {
        throw error;
      }

      const normalizedError = toMainSequenceAiError(error, {
        fallbackMessage: "Assistant request failed unexpectedly.",
        source: "frontend_request_not_sent",
      });
      this.options.onError?.(normalizedError);
      throw normalizedError;
    }
  }
}

export const useLatestMessageDataStreamRuntime = (
  options: UseLatestMessageDataStreamRuntimeOptions,
): AssistantRuntime => {
  const { localRuntimeOptions, otherOptions } = splitLocalRuntimeOptions(options);

  return useLocalRuntime(new LatestMessageDataStreamRuntimeAdapter(otherOptions), localRuntimeOptions);
};
