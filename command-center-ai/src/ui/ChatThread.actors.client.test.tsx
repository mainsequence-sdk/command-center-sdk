// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildMessageProvenanceMetadata, normalizeMessageProvenance } from "../backend/message-provenance.js";

const VIEWER_UID = "6e0d0d6c-4b8a-4a4a-9f3e-1c2d3e4f5a6b";
const SESSION_AGENT_UID = "e49e23e5-d7a6-4ebc-912e-d5257252945f";
const EXECUTOR_UID = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const TEAMMATE_UID = "0f3f6b2a-1d2e-4c3b-8a9f-0b1c2d3e4f5a";

// The signed-in person, as the application passes them to the thread.
const VIEWER = {
          uid: VIEWER_UID,
          name: "Ada Lovelace",
          avatarUrl: "https://example.test/jose.png",
        };

vi.mock("./MarkdownContent.js", () => ({
  MarkdownContent: ({ content }: { content: string }) => <div>{content}</div>,
}));

const chatFeature = {
  activeSessionReadiness: {
    status: "ready",
    detailReady: true,
    historyReady: true,
    sessionId: "session-1",
    error: null,
  },
  activeAgentLabel: "research-orchestrator",
  activeAgentName: "Research Orchestrator",
  activeSessionSummary: {
    sessionId: "session-1",
    displayLabel: null,
    working: false,
  },
  availableModels: [],
  availableModelsError: null,
  availableProviders: [],
  availableReasoningEfforts: [],
  cancelActiveSession: vi.fn(),
  clearMessageQueue: vi.fn(),
  editQueuedMessage: vi.fn(() => null),
  enqueueMessage: vi.fn(() => true),
  messageQueue: [] as { id: string; text: string; createdAt: string; status: "queued" | "sending" | "held"; holdReason?: "stopped" | "failed" | "away" | "blocked" | "unavailable"; holdMessage?: string }[],
  reorderQueuedMessage: vi.fn(),
  queuedMessageCountBySessionId: {} as Record<string, number>,
  removeQueuedMessage: vi.fn(),
  sendNextQueuedMessage: vi.fn(),
  hasRequestedAvailableModels: true,
  isActiveSessionLoading: false,
  isActiveSessionReady: true,
  isAssistantRuntimeStarting: false,
  connection: { apiBaseUrl: "https://platform.test", rewriteRequestUrl: null },
  isDefaultSession: true,
  isCancellingSession: false,
  isCreatingAgentSession: false,
  isLoadingAvailableModels: false,
  isUpdatingSessionModel: false,
  isDirectLaunchSession: false,
  requestAvailableModels: vi.fn(),
  revalidateStaleRuntimeAccess: vi.fn(),
  retryDefaultSession: vi.fn(),
  selectedModelValue: null,
  selectedProviderValue: null,
  selectedReasoningEffortValue: null,
  sessionNotice: null,
  setSelectedModelValue: vi.fn(),
  setSelectedProviderValue: vi.fn(),
  setSelectedReasoningEffortValue: vi.fn(),
};

vi.mock("../engine/ChatEngineProvider.js", () => ({
  useChatEngine: () => chatFeature,
}));

const { ChatThread } = await import("./ChatThread.js");

function withProvenance(
  message: Omit<ThreadMessageLike, "metadata">,
  provenance: Record<string, unknown> | null,
): ThreadMessageLike {
  const normalized = provenance ? normalizeMessageProvenance(provenance) : null;
  return {
    ...message,
    ...(normalized ? { metadata: buildMessageProvenanceMetadata(normalized) } : {}),
  } as ThreadMessageLike;
}

function text(value: string) {
  return [{ type: "text" as const, text: value }];
}

const multiPartyHistory: ThreadMessageLike[] = [
  withProvenance(
    { id: "u_1", role: "user", content: text("Inspect the repository and report.") },
    {
      origin: "agent",
      channel: "a2a",
      actorKind: "agent",
      actorUid: EXECUTOR_UID,
      actorName: "Code Repository Executor",
      targetAgentUid: SESSION_AGENT_UID,
    },
  ),
  withProvenance(
    { id: "a_1", role: "assistant", content: text("Report ready."), status: { type: "complete", reason: "stop" } },
    { origin: "agent", channel: "a2a", targetAgentUid: SESSION_AGENT_UID },
  ),
  withProvenance(
    { id: "u_2", role: "user", content: text("Can you double check the tests?") },
    {
      origin: "user",
      channel: "command-center",
      actorKind: "user",
      actorUid: TEAMMATE_UID,
      actorName: "grace@example.com",
      targetAgentUid: SESSION_AGENT_UID,
    },
  ),
  withProvenance(
    { id: "u_3", role: "user", content: text("I will take it from here.") },
    {
      origin: "user",
      channel: "command-center",
      actorKind: "user",
      actorUid: VIEWER_UID,
      actorName: "ada@example.com",
      targetAgentUid: SESSION_AGENT_UID,
    },
  ),
  withProvenance(
    { id: "u_4", role: "user", content: text("Start with the failing suite.") },
    {
      origin: "user",
      channel: "command-center",
      actorKind: "user",
      actorUid: VIEWER_UID,
      actorName: "ada@example.com",
      targetAgentUid: SESSION_AGENT_UID,
    },
  ),
];

const oneToOneHistory: ThreadMessageLike[] = [
  withProvenance({ id: "u_1", role: "user", content: text("Hello") }, null),
  withProvenance(
    { id: "a_1", role: "assistant", content: text("Hi"), status: { type: "complete", reason: "stop" } },
    { origin: "user", channel: "command-center", targetAgentUid: SESSION_AGENT_UID },
  ),
];

function Harness({ messages }: { messages: ThreadMessageLike[] }) {
  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages,
    isRunning: false,
    onNew: async () => {},
    convertMessage: (message) => message,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatThread viewer={VIEWER} surface="page" />
    </AssistantRuntimeProvider>
  );
}

function messageRoots(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-actor-key]"));
}

describe("ChatThread actors", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    if (!("ResizeObserver" in globalThis)) {
      class ResizeObserverStub {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
      (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
    }
    if (!window.matchMedia) {
      window.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent() {
          return false;
        },
      })) as typeof window.matchMedia;
    }
    Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
    Element.prototype.scrollTo = Element.prototype.scrollTo ?? (() => {});
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders faces, names, grouping and the participants strip for a multi-party thread", () => {
    act(() => {
      root.render(<Harness messages={multiPartyHistory} />);
    });

    const strip = container.querySelector("[data-thread-participants]");
    expect(strip).not.toBeNull();
    expect(strip?.textContent).toContain("Code Repository Executor");
    expect(strip?.textContent).toContain("Research Orchestrator");
    expect(strip?.textContent).toContain("grace");
    expect(strip?.textContent).toContain("You");

    const roots = messageRoots(container);
    expect(roots.map((element) => element.dataset.actorKey)).toEqual([
      `agent:${EXECUTOR_UID}`,
      `agent:${SESSION_AGENT_UID}`,
      `user:${TEAMMATE_UID}`,
      `user:${VIEWER_UID}`,
      `user:${VIEWER_UID}`,
    ]);

    const [executorTurn, assistantTurn, teammateTurn, viewerTurn, viewerFollowUp] = roots;

    // Calling agent: monogram from the projected name, labelled.
    expect(executorTurn?.querySelector("[data-actor-name]")?.textContent).toBe(
      "Code Repository Executor",
    );
    expect(
      executorTurn?.querySelector('[data-actor-kind="agent"] [data-actor-icon="robot"]'),
    ).not.toBeNull();

    // Session agent: monogram from the session label, labelled.
    expect(assistantTurn?.querySelector("[data-actor-name]")?.textContent).toBe(
      "Research Orchestrator",
    );
    expect(
      assistantTurn?.querySelector('[data-actor-kind="agent"] [data-actor-icon="robot"]'),
    ).not.toBeNull();
    expect(assistantTurn?.querySelector('[data-actor-kind="agent"]')?.getAttribute("title")).toBe(
      "Research Orchestrator",
    );

    // Another human: mailbox part of their email address, initials monogram.
    expect(teammateTurn?.querySelector("[data-actor-name]")?.textContent).toBe("grace");
    expect(teammateTurn?.querySelector('[data-actor-kind="user"]')?.textContent).toBe("GR");
    expect(teammateTurn?.querySelector('[data-actor-kind="user"]')?.getAttribute("title")).toBe(
      "grace",
    );

    // The viewer: "You", profile picture.
    expect(viewerTurn?.querySelector("[data-actor-name]")?.textContent).toBe("You");
    expect(
      viewerTurn?.querySelector('[data-actor-kind="viewer"] img')?.getAttribute("src"),
    ).toBe("https://example.test/jose.png");

    // Second consecutive viewer message collapses into the run: no label, no avatar.
    expect(viewerFollowUp?.querySelector("[data-actor-name]")).toBeNull();
    expect(viewerFollowUp?.querySelector("[data-actor-kind]")).toBeNull();
    expect(viewerFollowUp?.textContent).toContain("Start with the failing suite.");
  });

  it("keeps a one-to-one thread plain: no strip, no labels, no avatar on the viewer's bubble", () => {
    act(() => {
      root.render(<Harness messages={oneToOneHistory} />);
    });

    expect(container.querySelector("[data-thread-participants]")).toBeNull();
    expect(container.querySelector("[data-actor-name]")).toBeNull();

    const [viewerTurn, assistantTurn] = messageRoots(container);
    expect(viewerTurn?.dataset.actorKey).toBe(`user:${VIEWER_UID}`);
    expect(viewerTurn?.querySelector("[data-actor-kind]")).toBeNull();
    // The assistant is drawn as the robot, named after the session's agent.
    expect(
      assistantTurn?.querySelector('[data-actor-kind="agent"] [data-actor-icon="robot"]'),
    ).not.toBeNull();
    expect(assistantTurn?.querySelector('[data-actor-kind="agent"]')?.getAttribute("title")).toBe(
      "Research Orchestrator",
    );
  });
});
