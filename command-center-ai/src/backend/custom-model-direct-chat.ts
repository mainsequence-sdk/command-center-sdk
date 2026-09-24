import type {
  CustomModelProviderApi,
  CustomModelProviderHeaderInput,
  CustomModelThinkingLevel,
} from "./custom-model-provider-api.js";

export interface CustomModelDirectChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CustomModelDirectChatAuth {
  apiKey?: string | null;
  headers?: CustomModelProviderHeaderInput[];
}

export interface CustomModelDirectChatPayloadInput {
  api: CustomModelProviderApi;
  model: string;
  messages: CustomModelDirectChatMessage[];
  system?: string | null;
  maxTokens?: number | null;
  thinking?: CustomModelThinkingLevel | null;
}

export interface CustomModelDirectChatRequest extends CustomModelDirectChatPayloadInput {
  baseUrl: string;
  auth?: CustomModelDirectChatAuth;
  signal?: AbortSignal;
  onTextDelta?: (delta: string) => void;
  onReasoningDelta?: (delta: string) => void;
}

export interface CustomModelDirectChatUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface CustomModelDirectChatResult {
  text: string;
  reasoning: string;
  finishReason: string | null;
  usage: CustomModelDirectChatUsage | null;
  status: number;
  latencyMs: number;
  firstTokenMs: number | null;
}

export type CustomModelDirectChatErrorStage =
  | "blocked"
  | "network"
  | "auth"
  | "not_found"
  | "http"
  | "protocol"
  | "aborted";

export class CustomModelDirectChatError extends Error {
  readonly stage: CustomModelDirectChatErrorStage;
  readonly status: number | null;

  constructor(
    stage: CustomModelDirectChatErrorStage,
    message: string,
    status: number | null = null,
  ) {
    super(message);
    this.name = "CustomModelDirectChatError";
    this.stage = stage;
    this.status = status;
  }
}

const maxErrorBodyCharacters = 4000;
const maxErrorMessageCharacters = 600;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "::1" ||
    /^127(\.\d{1,3}){3}$/.test(normalized)
  );
}

function currentPageProtocol() {
  return typeof globalThis.location?.protocol === "string" ? globalThis.location.protocol : "";
}

function currentPageOrigin() {
  return typeof globalThis.location?.origin === "string" ? globalThis.location.origin : "this page";
}

/**
 * Explains why the browser cannot call this base URL, or returns null when it can try.
 * Browsers refuse plain-HTTP requests from an HTTPS page (mixed content) except to loopback.
 */
export function getCustomModelDirectChatBlockReason(
  baseUrl: string,
  pageProtocol = currentPageProtocol(),
) {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return "The base URL is not a valid absolute URL.";
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return "The base URL must use HTTPS.";
  }

  if (url.protocol === "http:" && pageProtocol === "https:" && !isLoopbackHostname(url.hostname)) {
    return "This endpoint uses plain HTTP. Browsers refuse HTTP requests from an HTTPS page, so serve the endpoint over HTTPS to test it here.";
  }

  return null;
}

export function buildCustomModelDirectChatUrl(baseUrl: string, api: CustomModelProviderApi) {
  const endpoint = api === "openai-responses" ? "/responses" : "/chat/completions";
  return `${baseUrl.trim().replace(/\/+$/, "")}${endpoint}`;
}

/**
 * Mirrors the request an Agent sends a custom provider, without tools, so a passing test predicts
 * agent execution.
 */
export function buildCustomModelDirectChatPayload(input: CustomModelDirectChatPayloadInput) {
  const system = input.system?.trim() ?? "";
  const effort = input.thinking && input.thinking !== "off" ? input.thinking : null;
  const messages = input.messages.map(({ role, content }) => ({ role, content }));

  if (input.api === "openai-responses") {
    const payload: Record<string, unknown> = {
      model: input.model,
      stream: true,
      store: false,
      input: messages,
    };
    if (system) payload.instructions = system;
    if (input.maxTokens != null) payload.max_output_tokens = input.maxTokens;
    if (effort) payload.reasoning = { effort, summary: "auto" };
    return payload;
  }

  const payload: Record<string, unknown> = {
    model: input.model,
    stream: true,
    messages: system ? [{ role: "system", content: system }, ...messages] : messages,
    stream_options: { include_usage: true },
    store: false,
  };
  if (input.maxTokens != null) payload.max_completion_tokens = input.maxTokens;
  if (effort) payload.reasoning_effort = effort;
  return payload;
}

/**
 * The API key becomes the bearer credential; an explicit Authorization header wins over it, and
 * no Authorization header is synthesized when neither is configured.
 */
export function buildCustomModelDirectChatHeaders(auth: CustomModelDirectChatAuth = {}) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (auth.apiKey) {
    headers.set("Authorization", `Bearer ${auth.apiKey}`);
  }

  for (const header of auth.headers ?? []) {
    const name = header.name.trim();
    if (!name) continue;
    try {
      headers.set(name, header.value);
    } catch {
      throw new CustomModelDirectChatError(
        "blocked",
        `Header ${name} is not a valid HTTP header name or value.`,
      );
    }
  }

  return headers;
}

function truncate(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

function extractUpstreamErrorMessage(payload: unknown): string | null {
  if (typeof payload === "string") return payload.trim() || null;
  if (!isRecord(payload)) return null;

  for (const field of ["error", "message", "detail"]) {
    const value = payload[field];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (isRecord(value)) {
      const nested = extractUpstreamErrorMessage(value);
      if (nested) return nested;
    }
  }

  return null;
}

async function readUpstreamErrorMessage(response: Response) {
  const body = truncate(await response.text().catch(() => ""), maxErrorBodyCharacters).trim();
  if (!body) return null;

  try {
    const message = extractUpstreamErrorMessage(JSON.parse(body));
    if (message) return truncate(message, maxErrorMessageCharacters);
  } catch {
    // Not JSON: fall through to the raw body excerpt.
  }

  return truncate(body.replace(/\s+/g, " "), maxErrorMessageCharacters);
}

async function buildHttpError(response: Response) {
  const detail = await readUpstreamErrorMessage(response);
  const suffix = detail ? `: ${detail}` : ".";

  if (response.status === 401 || response.status === 403) {
    return new CustomModelDirectChatError(
      "auth",
      `The endpoint rejected the credentials (HTTP ${response.status})${suffix}`,
      response.status,
    );
  }

  if (response.status === 404) {
    return new CustomModelDirectChatError(
      "not_found",
      `The endpoint returned HTTP 404${suffix} Check the base URL path and the upstream model ID.`,
      response.status,
    );
  }

  return new CustomModelDirectChatError(
    "http",
    `The endpoint returned HTTP ${response.status}${suffix}`,
    response.status,
  );
}

async function* readSseData(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let dataLines: string[] = [];

  function* consume(lines: string[]) {
    for (const rawLine of lines) {
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      if (line === "") {
        if (dataLines.length > 0) {
          yield dataLines.join("\n");
          dataLines = [];
        }
        continue;
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).replace(/^ /, ""));
      }
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      yield* consume(lines);
    }
    buffer += decoder.decode();
    yield* consume([buffer, ""]);
  } finally {
    reader.releaseLock();
  }
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeUsage(value: unknown): CustomModelDirectChatUsage | null {
  if (!isRecord(value)) return null;
  const inputTokens = numberOrNull(value.prompt_tokens) ?? numberOrNull(value.input_tokens);
  const outputTokens = numberOrNull(value.completion_tokens) ?? numberOrNull(value.output_tokens);
  const totalTokens =
    numberOrNull(value.total_tokens) ??
    (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null);
  if (inputTokens === null && outputTokens === null && totalTokens === null) return null;
  return { inputTokens, outputTokens, totalTokens };
}

function textFromContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
    .join("");
}

interface Accumulator {
  text: string;
  reasoning: string;
  finishReason: string | null;
  usage: CustomModelDirectChatUsage | null;
  firstTokenMs: number | null;
}

function throwUpstreamStreamError(value: unknown): never {
  throw new CustomModelDirectChatError(
    "protocol",
    `The endpoint reported an error while responding: ${truncate(
      extractUpstreamErrorMessage(value) ?? "unknown error",
      maxErrorMessageCharacters,
    )}`,
  );
}

function reasoningDelta(delta: Record<string, unknown>) {
  for (const field of ["reasoning_content", "reasoning", "thinking"]) {
    const value = delta[field];
    if (typeof value === "string" && value) return value;
  }
  return "";
}

function applyResponsesOutput(output: unknown, emit: Emitters) {
  if (!Array.isArray(output)) return;
  for (const item of output) {
    if (!isRecord(item)) continue;
    if (item.type === "message") emit.text(textFromContent(item.content));
    if (item.type === "reasoning") {
      emit.reasoning(textFromContent(item.summary) || textFromContent(item.content));
    }
  }
}

interface Emitters {
  text: (delta: string) => void;
  reasoning: (delta: string) => void;
}

function applyChatPayload(payload: Record<string, unknown>, state: Accumulator, emit: Emitters) {
  if (payload.error) throwUpstreamStreamError(payload);

  const choice = Array.isArray(payload.choices) && isRecord(payload.choices[0])
    ? payload.choices[0]
    : null;
  state.usage = normalizeUsage(payload.usage) ?? normalizeUsage(choice?.usage) ?? state.usage;
  if (!choice) return;

  if (typeof choice.finish_reason === "string" && choice.finish_reason) {
    state.finishReason = choice.finish_reason;
  }

  // Streaming chunks carry `delta`; a server that ignored `stream` returns one `message`.
  const body = isRecord(choice.delta) ? choice.delta : isRecord(choice.message) ? choice.message : null;
  if (!body) return;
  emit.reasoning(reasoningDelta(body));
  emit.text(textFromContent(body.content));
}

function applyResponsesPayload(
  payload: Record<string, unknown>,
  state: Accumulator,
  emit: Emitters,
) {
  const type = typeof payload.type === "string" ? payload.type : "";

  if (type === "error" || type === "response.failed") {
    throwUpstreamStreamError(isRecord(payload.response) ? payload.response : payload);
  }

  if (type === "response.output_text.delta" && typeof payload.delta === "string") {
    emit.text(payload.delta);
    return;
  }

  if (
    (type === "response.reasoning_summary_text.delta" || type === "response.reasoning_text.delta") &&
    typeof payload.delta === "string"
  ) {
    emit.reasoning(payload.delta);
    return;
  }

  // Terminal stream events wrap the response; a non-streamed reply is the response itself.
  const response =
    type === "response.completed" || type === "response.incomplete"
      ? payload.response
      : type === "" && Array.isArray(payload.output)
        ? payload
        : null;
  if (!isRecord(response)) return;
  if (response.error) throwUpstreamStreamError(response);

  state.usage = normalizeUsage(response.usage) ?? state.usage;
  const incompleteReason = isRecord(response.incomplete_details)
    ? response.incomplete_details.reason
    : null;
  state.finishReason =
    typeof incompleteReason === "string" && incompleteReason
      ? incompleteReason
      : typeof response.status === "string"
        ? response.status
        : state.finishReason;
  if (!state.text) applyResponsesOutput(response.output, emit);
}

function parseJsonObject(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Sends one stateless turn straight from the browser to an OpenAI-compatible endpoint.
 * The caller owns the transcript and resends it every turn; nothing is persisted and no
 * Agent, AgentSession, or platform route participates.
 */
export async function streamCustomModelDirectChat(
  request: CustomModelDirectChatRequest,
): Promise<CustomModelDirectChatResult> {
  const blockReason = getCustomModelDirectChatBlockReason(request.baseUrl);
  if (blockReason) throw new CustomModelDirectChatError("blocked", blockReason);

  const url = buildCustomModelDirectChatUrl(request.baseUrl, request.api);
  const headers = buildCustomModelDirectChatHeaders(request.auth);
  const startedAt = performance.now();
  const state: Accumulator = {
    text: "",
    reasoning: "",
    finishReason: null,
    usage: null,
    firstTokenMs: null,
  };
  const markFirstToken = () => {
    if (state.firstTokenMs === null) state.firstTokenMs = performance.now() - startedAt;
  };
  const emit: Emitters = {
    text: (delta) => {
      if (!delta) return;
      markFirstToken();
      state.text += delta;
      request.onTextDelta?.(delta);
    },
    reasoning: (delta) => {
      if (!delta) return;
      markFirstToken();
      state.reasoning += delta;
      request.onReasoningDelta?.(delta);
    },
  };
  const applyPayload = request.api === "openai-responses" ? applyResponsesPayload : applyChatPayload;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(buildCustomModelDirectChatPayload(request)),
      signal: request.signal,
      // Organization credentials travel only in the explicit headers above.
      credentials: "omit",
    });

    if (!response.ok) throw await buildHttpError(response);

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream") && response.body) {
      for await (const data of readSseData(response.body)) {
        if (data === "[DONE]") break;
        const payload = parseJsonObject(data);
        if (!payload) {
          throw new CustomModelDirectChatError(
            "protocol",
            "The endpoint streamed a chunk that is not valid JSON.",
            response.status,
          );
        }
        applyPayload(payload, state, emit);
      }
    } else {
      const payload = parseJsonObject(await response.text());
      if (!payload) {
        throw new CustomModelDirectChatError(
          "protocol",
          `The endpoint answered HTTP ${response.status} with a body that is neither an event stream nor a JSON object.`,
          response.status,
        );
      }
      applyPayload(payload, state, emit);
    }

    if (!state.text && !state.reasoning) {
      throw new CustomModelDirectChatError(
        "protocol",
        "The endpoint completed the request without returning any text. Check that the API protocol matches this endpoint.",
        response.status,
      );
    }

    return {
      text: state.text,
      reasoning: state.reasoning,
      finishReason: state.finishReason,
      usage: state.usage,
      status: response.status,
      latencyMs: performance.now() - startedAt,
      firstTokenMs: state.firstTokenMs,
    };
  } catch (error) {
    if (request.signal?.aborted) {
      throw new CustomModelDirectChatError("aborted", "The request was stopped.");
    }
    if (error instanceof CustomModelDirectChatError) throw error;
    throw new CustomModelDirectChatError(
      "network",
      `The browser could not complete the request to ${new URL(url).origin}. The endpoint may be unreachable, its TLS certificate may be untrusted, or it may not allow cross-origin (CORS) requests from ${currentPageOrigin()}.`,
    );
  }
}
