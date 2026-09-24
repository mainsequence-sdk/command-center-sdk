import { abortReason, asRecord, detail, json, pause, readString, type StandInRoute } from "./http";
import type { StandInContext } from "./identity";
import type { StandInModelProviders } from "./model-providers";
import type { StandInSession, StandInSessions } from "./sessions";

// The Agent's runtime at the `rpc_url` runtime access returns: the check that it answers
// (ADR 093), the chat turn streamed back as `ui-message-stream` (ADR 060), and cancel. Frames use
// the names the package's decoder reads (`src/engine/useLatestMessageDataStreamRuntime.ts`).

export type StandInTurnStatus = "streaming" | "held" | "completed" | "failed" | "stopped";

/** One chat turn the Agent received. */
export interface StandInTurn {
  sessionUid: string;
  /** What the person wrote. */
  input: string;
  /** The body the chat sent. */
  body: Record<string, unknown>;
  status: StandInTurnStatus;
  /** The frames streamed so far, in order. */
  frames: Array<Record<string, unknown>>;
}

export const STAND_IN_TOOL_NAME = "stand_in_search";

// Replies wait here, after the reasoning, while replies are held.
const HOLD = "hold" as const;
type PlannedFrame = Record<string, unknown> | typeof HOLD;

function planReply(number: number, input: string, modelLabel: string): PlannedFrame[] {
  const reasoningId = `reasoning-${number}`;
  const textId = `text-${number}`;
  const toolCallId = `call-${number}`;
  const argsText = JSON.stringify({ query: input });
  const half = Math.ceil(argsText.length / 2);
  const text = [
    `You wrote: "${input}".`,
    ` The scripted stand-in answered as ${modelLabel},`,
    " with reasoning, a tool call, and a data part before this text.",
  ];

  return [
    { type: "start", messageId: `message-${number}` },
    { type: "start-step" },
    { type: "reasoning-start", id: reasoningId },
    { type: "reasoning-delta", id: reasoningId, delta: `The person wrote "${input}".` },
    { type: "reasoning-delta", id: reasoningId, delta: " I will search the stand-in notes before I answer." },
    { type: "reasoning-end", id: reasoningId },
    HOLD,
    { type: "tool-call-start", id: toolCallId, toolCallId, toolName: STAND_IN_TOOL_NAME },
    { type: "tool-call-delta", toolCallId, argsText: argsText.slice(0, half) },
    { type: "tool-call-delta", toolCallId, argsText: argsText.slice(half) },
    { type: "tool-call-end", toolCallId },
    {
      type: "tool-result",
      toolCallId,
      result: {
        content: [{ type: "text", text: "One note matches: every reply here is scripted by the stand-in." }],
        details: { matches: 1 },
      },
      isError: false,
    },
    {
      type: "data-sources",
      data: { sources: [{ title: "Stand-in notes", detail: "The notes the stand-in searched." }] },
    },
    { type: "text-start", id: textId },
    ...text.map((textDelta) => ({ type: "text-delta", id: textId, textDelta })),
    { type: "text-end", id: textId },
    { type: "finish-step", finishReason: "stop", usage: { inputTokens: 0, outputTokens: 0 }, isContinued: false },
    { type: "finish", finishReason: "stop", usage: { inputTokens: 0, outputTokens: 0 } },
  ];
}

function planFailure(number: number, errorText: string): PlannedFrame[] {
  return [
    { type: "start", messageId: `message-${number}` },
    { type: "error", errorText },
  ];
}

/** The transcript parts of what was streamed: reasoning, the tool call, and the text. */
function transcriptParts(frames: ReadonlyArray<Record<string, unknown>>) {
  const parts: Array<Record<string, unknown>> = [];
  const byKind = new Map<string, Record<string, unknown>>();
  const part = (kind: string, create: () => Record<string, unknown>) => {
    let existing = byKind.get(kind);
    if (!existing) {
      existing = create();
      byKind.set(kind, existing);
      parts.push(existing);
    }
    return existing;
  };
  const argsText = new Map<string, string>();

  for (const frame of frames) {
    const toolCallId = typeof frame.toolCallId === "string" ? frame.toolCallId : "";

    if (frame.type === "reasoning-delta") {
      const reasoning = part("reasoning", () => ({ type: "reasoning", text: "" }));
      reasoning.text = `${String(reasoning.text)}${String(frame.delta ?? "")}`;
    } else if (frame.type === "text-delta") {
      const text = part("text", () => ({ type: "text", text: "" }));
      text.text = `${String(text.text)}${String(frame.textDelta ?? "")}`;
    } else if (frame.type === "tool-call-start") {
      part(`tool:${toolCallId}`, () => ({ type: "tool-call", toolCallId, toolName: frame.toolName, args: {} }));
    } else if (frame.type === "tool-call-delta") {
      argsText.set(toolCallId, `${argsText.get(toolCallId) ?? ""}${String(frame.argsText ?? "")}`);
      try {
        part(`tool:${toolCallId}`, () => ({ type: "tool-call", toolCallId })).args = JSON.parse(
          argsText.get(toolCallId) ?? "",
        ) as unknown;
      } catch {
        // The arguments are not complete yet.
      }
    } else if (frame.type === "tool-result") {
      Object.assign(part(`tool:${toolCallId}`, () => ({ type: "tool-call", toolCallId })), {
        result: frame.result,
        isError: frame.isError === true,
      });
    }
  }

  return parts;
}

function readInput(body: Record<string, unknown>) {
  const messages = Array.isArray(body.messages) ? body.messages.map(asRecord) : [];
  const latest = [...messages].reverse().find((message) => message.role === "user");
  const content = Array.isArray(latest?.content) ? latest.content.map(asRecord) : [];

  return content
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => String(part.text))
    .join("\n")
    .trim();
}

export function createAgentRuntime({
  chunkDelayMs,
  context,
  providers,
  sessions,
}: {
  chunkDelayMs: number;
  context: StandInContext;
  providers: StandInModelProviders;
  sessions: StandInSessions;
}) {
  const turns: StandInTurn[] = [];
  const stopTurnBySession = new Map<string, () => void>();
  const failures: string[] = [];
  let holding = false;
  let releases: Array<() => void> = [];

  function releaseReplies() {
    holding = false;
    const pending = releases;
    releases = [];
    pending.forEach((release) => release());
  }

  function settle(session: StandInSession, turn: StandInTurn, status: "completed" | "failed" | "stopped") {
    if (turn.status === "completed" || turn.status === "failed" || turn.status === "stopped") {
      return;
    }

    turn.status = status;
    session.working = false;
    stopTurnBySession.delete(session.uid);
    // A failed turn keeps only the message; a stopped one keeps what was streamed before it.
    sessions.appendTurn(session, turn.input, status === "failed" ? null : transcriptParts(turn.frames));
  }

  function streamTurn(
    session: StandInSession,
    turn: StandInTurn,
    planned: PlannedFrame[],
    signal: AbortSignal | null,
  ) {
    const encoder = new TextEncoder();
    const failed = planned.some((frame) => frame !== HOLD && frame.type === "error");
    let finished = false;
    let wake: (() => void) | null = null;

    return new ReadableStream<Uint8Array>({
      start(controller) {
        // The chat aborted its request, or the Agent was told to cancel the run.
        const stop = (how: "aborted" | "cancelled") => {
          if (finished) {
            return;
          }
          finished = true;
          signal?.removeEventListener("abort", onAbort);
          settle(session, turn, "stopped");
          wake?.();
          try {
            if (how === "aborted") {
              // What a fetch body does when its request is aborted.
              controller.error(abortReason(signal));
            } else {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            }
          } catch {
            // The chat already stopped reading.
          }
        };
        const onAbort = () => stop("aborted");

        signal?.addEventListener("abort", onAbort, { once: true });
        stopTurnBySession.set(session.uid, () => stop("cancelled"));

        void (async () => {
          for (const frame of planned) {
            if (finished) {
              return;
            }

            if (frame === HOLD) {
              if (holding) {
                turn.status = "held";
                // Released by `releaseReplies()`, or woken by a stop.
                await new Promise<void>((resolve) => {
                  wake = resolve;
                  releases.push(resolve);
                });
                wake = null;
                if (finished) {
                  return;
                }
                turn.status = "streaming";
              }
              continue;
            }

            controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
            turn.frames.push(frame);
            if (chunkDelayMs > 0) {
              await pause(chunkDelayMs);
            }
          }

          if (finished) {
            return;
          }
          finished = true;
          signal?.removeEventListener("abort", onAbort);
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          settle(session, turn, failed ? "failed" : "completed");
        })();
      },
      cancel() {
        if (!finished) {
          finished = true;
          settle(session, turn, "stopped");
          wake?.();
        }
      },
    });
  }

  const routes: StandInRoute[] = [
    {
      method: "GET",
      path: "/api/chat",
      // The Agent's information route: any answer but 502, 503, or 504 says it serves.
      handle: () => json(200, { status: "ready", protocol: "ui-message-stream" }),
    },
    {
      method: "POST",
      path: "/api/chat",
      handle: (request, _params, signal) => {
        const body = asRecord(request.body);
        const sessionUid = readString(body.runtime_session_uid);
        const session = sessionUid ? sessions.get(sessionUid) : null;

        if (!session) {
          return detail(404, "The chat request names no session this Agent knows.");
        }
        // ADR 060: the request carries the canonical session it belongs to.
        const sessionPayload = asRecord(body.session);
        if (readString(sessionPayload.uid) !== session.uid) {
          return detail(400, "The chat request must carry the session it belongs to.");
        }
        const input = readInput(body);
        if (!input) {
          return detail(400, "The chat request carries no message.");
        }
        if (session.working) {
          return detail(409, "The Agent is already answering in this session.");
        }

        // The runtime answers with the model of the session the request carries.
        const provider = readString(sessionPayload.llm_provider) ?? session.llmProvider;
        const modelId = readString(sessionPayload.llm_model) ?? session.llmModel;
        const model = providers.describeModel(provider, modelId);
        const number = turns.length + 1;
        const plan = (): PlannedFrame[] => {
          const scripted = failures.shift();
          if (scripted !== undefined) {
            return planFailure(number, scripted);
          }
          if (!model) {
            return planFailure(number, `The model ${provider}/${modelId} is not in the platform's model catalog.`);
          }
          return model.problem
            ? planFailure(number, model.problem)
            : planReply(number, input, `${model.modelLabel} (${model.providerLabel})`);
        };
        const turn: StandInTurn = { sessionUid: session.uid, input, body, status: "streaming", frames: [] };

        turns.push(turn);
        session.working = true;
        session.updatedAt = context.now();

        return new Response(streamTurn(session, turn, plan(), signal), {
          status: 200,
          headers: { "Cache-Control": "no-cache", "Content-Type": "text/event-stream; charset=utf-8" },
        });
      },
    },
    {
      method: "POST",
      path: "/api/chat/session/cancel",
      handle: (request) => {
        const sessionUid = readString(asRecord(request.body).runtime_session_uid);
        const session = sessionUid ? sessions.get(sessionUid) : null;

        if (!session) {
          return detail(404, "The cancel request names no session this Agent knows.");
        }

        const stop = stopTurnBySession.get(session.uid);
        stop?.();
        return json(200, { runtime_session_uid: session.uid, status: stop ? "cancelled" : "idle" });
      },
    },
  ];

  return {
    routes,
    turns: turns as readonly StandInTurn[],
    failNextTurn(errorText: string) {
      failures.push(errorText);
    },
    holdReplies() {
      holding = true;
    },
    releaseReplies,
  };
}
