import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildCustomModelDirectChatHeaders,
  buildCustomModelDirectChatPayload,
  buildCustomModelDirectChatUrl,
  CustomModelDirectChatError,
  getCustomModelDirectChatBlockReason,
  streamCustomModelDirectChat,
} from "./custom-model-direct-chat.js";

const baseUrl = "https://models.example.test/v1";

function sseResponse(chunks: string[], status = 200) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { "Content-Type": "text/event-stream" } });
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function captureError(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CustomModelDirectChatError) return error;
    throw error;
  }
  throw new Error("Expected the direct chat request to fail.");
}

describe("custom model direct chat", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("targets the protocol endpoint under the base URL", () => {
    expect(buildCustomModelDirectChatUrl(`${baseUrl}/`, "openai-completions")).toBe(
      `${baseUrl}/chat/completions`,
    );
    expect(buildCustomModelDirectChatUrl(baseUrl, "openai-responses")).toBe(`${baseUrl}/responses`);
  });

  it("mirrors the Agent runtime's chat-completions request without tools", () => {
    expect(
      buildCustomModelDirectChatPayload({
        api: "openai-completions",
        model: "alpha",
        system: "  Be brief.  ",
        maxTokens: 256,
        thinking: "high",
        messages: [{ role: "user", content: "Hello" }],
      }),
    ).toEqual({
      model: "alpha",
      stream: true,
      messages: [
        { role: "system", content: "Be brief." },
        { role: "user", content: "Hello" },
      ],
      stream_options: { include_usage: true },
      store: false,
      max_completion_tokens: 256,
      reasoning_effort: "high",
    });
  });

  it("omits optional chat fields and never sends a reasoning effort for off", () => {
    expect(
      buildCustomModelDirectChatPayload({
        api: "openai-completions",
        model: "alpha",
        thinking: "off",
        messages: [{ role: "user", content: "Hello" }],
      }),
    ).toEqual({
      model: "alpha",
      stream: true,
      messages: [{ role: "user", content: "Hello" }],
      stream_options: { include_usage: true },
      store: false,
    });
  });

  it("mirrors the Agent runtime's Responses request", () => {
    expect(
      buildCustomModelDirectChatPayload({
        api: "openai-responses",
        model: "alpha",
        system: "Be brief.",
        maxTokens: 128,
        thinking: "low",
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi" },
          { role: "user", content: "Again" },
        ],
      }),
    ).toEqual({
      model: "alpha",
      stream: true,
      store: false,
      instructions: "Be brief.",
      input: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi" },
        { role: "user", content: "Again" },
      ],
      max_output_tokens: 128,
      reasoning: { effort: "low", summary: "auto" },
    });
  });

  it("uses the API key as bearer unless an explicit Authorization header is configured", () => {
    expect(buildCustomModelDirectChatHeaders({ apiKey: "key-1" }).get("Authorization")).toBe(
      "Bearer key-1",
    );

    const explicit = buildCustomModelDirectChatHeaders({
      apiKey: "key-1",
      headers: [
        { name: "authorization", value: "Token explicit" },
        { name: "x-tenant-id", value: "acme" },
      ],
    });
    expect(explicit.get("Authorization")).toBe("Token explicit");
    expect(explicit.get("x-tenant-id")).toBe("acme");

    expect(buildCustomModelDirectChatHeaders({}).has("Authorization")).toBe(false);
  });

  it("rejects an invalid header name before any request", () => {
    expect(() =>
      buildCustomModelDirectChatHeaders({ headers: [{ name: "bad header", value: "x" }] }),
    ).toThrowError(CustomModelDirectChatError);
  });

  it("explains when the browser would block a plain-HTTP endpoint", () => {
    expect(getCustomModelDirectChatBlockReason("http://models.internal/v1", "https:")).toContain(
      "plain HTTP",
    );
    expect(getCustomModelDirectChatBlockReason("http://localhost:8000/v1", "https:")).toBeNull();
    expect(getCustomModelDirectChatBlockReason("http://models.internal/v1", "http:")).toBeNull();
    expect(getCustomModelDirectChatBlockReason(baseUrl, "https:")).toBeNull();
    expect(getCustomModelDirectChatBlockReason("not a url", "https:")).toContain("valid");
  });

  it("streams chat-completions deltas split across network chunks", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"reasoning_content":"think"}}]}\r\n\r\ndata: {"choi',
        'ces":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\n',
        'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const textDeltas: string[] = [];
    const reasoningDeltas: string[] = [];

    const result = await streamCustomModelDirectChat({
      baseUrl,
      api: "openai-completions",
      model: "alpha",
      messages: [{ role: "user", content: "Hello" }],
      auth: { apiKey: "key-1" },
      onTextDelta: (delta) => textDeltas.push(delta),
      onReasoningDelta: (delta) => reasoningDeltas.push(delta),
    });

    expect(textDeltas).toEqual(["Hel", "lo"]);
    expect(reasoningDeltas).toEqual(["think"]);
    expect(result).toMatchObject({
      text: "Hello",
      reasoning: "think",
      finishReason: "stop",
      status: 200,
      usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
    });
    expect(result.firstTokenMs).not.toBeNull();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${baseUrl}/chat/completions`);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("omit");
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer key-1");
    expect(JSON.parse(init.body as string)).toMatchObject({ model: "alpha", stream: true });
  });

  it("streams Responses events and reads usage from the terminal event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse([
          'event: response.reasoning_summary_text.delta\ndata: {"type":"response.reasoning_summary_text.delta","delta":"plan"}\n\n',
          'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Hi"}\n\n',
          'event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":3,"output_tokens":1,"total_tokens":4}}}\n\n',
        ]),
      ),
    );

    const result = await streamCustomModelDirectChat({
      baseUrl,
      api: "openai-responses",
      model: "alpha",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result).toMatchObject({
      text: "Hi",
      reasoning: "plan",
      finishReason: "completed",
      usage: { inputTokens: 3, outputTokens: 1, totalTokens: 4 },
    });
  });

  it("accepts a JSON reply from an endpoint that ignores stream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          choices: [{ message: { role: "assistant", content: "Hello" }, finish_reason: "length" }],
          usage: { prompt_tokens: 4, completion_tokens: 1 },
        }),
      ),
    );

    const result = await streamCustomModelDirectChat({
      baseUrl,
      api: "openai-completions",
      model: "alpha",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result).toMatchObject({
      text: "Hello",
      finishReason: "length",
      usage: { inputTokens: 4, outputTokens: 1, totalTokens: 5 },
    });
  });

  it("classifies rejected credentials and surfaces the upstream message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: { message: "Invalid API key" } }, 401)),
    );

    const error = await captureError(
      streamCustomModelDirectChat({
        baseUrl,
        api: "openai-completions",
        model: "alpha",
        messages: [{ role: "user", content: "Hello" }],
      }),
    );

    expect(error.stage).toBe("auth");
    expect(error.status).toBe(401);
    expect(error.message).toContain("Invalid API key");
  });

  it("classifies an unknown model or path as not found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ detail: "model alpha does not exist" }, 404)),
    );

    const error = await captureError(
      streamCustomModelDirectChat({
        baseUrl,
        api: "openai-completions",
        model: "alpha",
        messages: [{ role: "user", content: "Hello" }],
      }),
    );

    expect(error.stage).toBe("not_found");
    expect(error.message).toContain("model alpha does not exist");
    expect(error.message).toContain("upstream model ID");
  });

  it("reports an opaque fetch failure as network or CORS", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const error = await captureError(
      streamCustomModelDirectChat({
        baseUrl,
        api: "openai-completions",
        model: "alpha",
        messages: [{ role: "user", content: "Hello" }],
      }),
    );

    expect(error.stage).toBe("network");
    expect(error.message).toContain("https://models.example.test");
    expect(error.message).toContain("CORS");
  });

  it("reports an upstream error sent inside the stream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse(['data: {"error":{"message":"context length exceeded"}}\n\n']),
      ),
    );

    const error = await captureError(
      streamCustomModelDirectChat({
        baseUrl,
        api: "openai-completions",
        model: "alpha",
        messages: [{ role: "user", content: "Hello" }],
      }),
    );

    expect(error.stage).toBe("protocol");
    expect(error.message).toContain("context length exceeded");
  });

  it("flags a completed request that returned no text as a protocol mismatch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(["data: [DONE]\n\n"])));

    const error = await captureError(
      streamCustomModelDirectChat({
        baseUrl,
        api: "openai-completions",
        model: "alpha",
        messages: [{ role: "user", content: "Hello" }],
      }),
    );

    expect(error.stage).toBe("protocol");
  });

  it("reports a stopped request as aborted", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        controller.abort();
        return Promise.reject(new DOMException("Aborted", "AbortError"));
      }),
    );

    const error = await captureError(
      streamCustomModelDirectChat({
        baseUrl,
        api: "openai-completions",
        model: "alpha",
        messages: [{ role: "user", content: "Hello" }],
        signal: controller.signal,
      }),
    );

    expect(error.stage).toBe("aborted");
  });

  it("never sends a request the browser would block", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", { protocol: "https:", origin: "https://command-center.test" });

    const error = await captureError(
      streamCustomModelDirectChat({
        baseUrl: "http://models.internal/v1",
        api: "openai-completions",
        model: "alpha",
        messages: [{ role: "user", content: "Hello" }],
      }),
    );

    expect(error.stage).toBe("blocked");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
