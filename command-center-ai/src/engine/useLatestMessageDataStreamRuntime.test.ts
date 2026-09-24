import { describe, expect, it } from "vitest";

import {
  createLegacyToolChunkTranslator,
  extractUiMessageStreamError,
} from "./useLatestMessageDataStreamRuntime.js";

describe("assistant ui-message-stream errors", () => {
  it.each([401, 402, 429, 503])(
    "preserves the standard provider errorText for HTTP %i without status-specific mapping",
    (statusCode) => {
      const providerMessage =
        `provider-under-test request failed with status ${statusCode} for model example/model: ` +
        "Provider supplied failure message";

      const error = extractUiMessageStreamError({
        type: "error",
        errorText: providerMessage,
      });

      expect(error).not.toBeNull();
      expect(error?.rawMessage).toBe(providerMessage);
      expect(error?.message).toContain(providerMessage);
      expect(error?.name).toBe("AssistantRuntimeStreamError");
    },
  );

  it("prefers the protocol errorText while retaining legacy fallbacks", () => {
    expect(
      extractUiMessageStreamError({
        type: "error",
        errorText: "Canonical provider message",
        error: "Legacy message",
      })?.rawMessage,
    ).toBe("Canonical provider message");
    expect(
      extractUiMessageStreamError({ type: "error", message: "Legacy provider message" })
        ?.rawMessage,
    ).toBe("Legacy provider message");
  });
});

async function translate(chunks: string[]): Promise<string> {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).pipeThrough(createLegacyToolChunkTranslator());
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    output += decoder.decode(value, { stream: true });
  }
  return output + decoder.decode();
}

function frames(sse: string) {
  return sse
    .split("\n\n")
    .filter(Boolean)
    .map((frame) =>
      frame.startsWith("data: {") ? (JSON.parse(frame.slice("data: ".length)) as unknown) : frame,
    );
}

describe("legacy tool chunk translator", () => {
  it("rewrites the AI SDK v5 tool chunks into the names the decoder understands", async () => {
    const input =
      [
        'data: {"type":"text-start","id":"text-0"}',
        'data: {"type":"tool-input-available","toolCallId":"call-1","toolName":"mainsequence__code_repository_list","input":{"limit":5}}',
        'data: {"type":"tool-output-delta","toolCallId":"call-1","output":{"content":[]}}',
        'data: {"type":"tool-output-available","toolCallId":"call-1","output":{"content":[],"details":{"mcp_tool":"code_repository_list"}},"isError":false}',
        "data: [DONE]",
      ].join("\n\n") + "\n\n";

    expect(frames(await translate([input]))).toEqual([
      { type: "text-start", id: "text-0" },
      { type: "tool-call-start", toolCallId: "call-1", toolName: "mainsequence__code_repository_list" },
      { type: "tool-call-delta", toolCallId: "call-1", argsText: '{"limit":5}' },
      { type: "tool-call-end", toolCallId: "call-1" },
      {
        type: "tool-result",
        toolCallId: "call-1",
        result: { content: [], details: { mcp_tool: "code_repository_list" } },
        isError: false,
      },
      "data: [DONE]",
    ]);
  });

  it("passes native frames, comments and split chunks through byte for byte", async () => {
    const input =
      [
        ": keep-alive",
        'data: {"type":"tool-call-start","toolCallId":"call-2","toolName":"bash"}',
        'event: meta\ndata: {"agent_id":"7"}',
        'data: {"type":"text-delta","id":"text-0","textDelta":"hello"}',
        "data: [DONE]",
      ].join("\n\n") + "\n\n";
    const splitAt = input.indexOf("textDelta") + 12;

    expect(await translate([input.slice(0, splitAt), input.slice(splitAt)])).toBe(input);
  });
});
