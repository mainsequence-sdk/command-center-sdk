// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";


import { createChatBackendConnection } from "../backend/connection.js";
import { buildMessageProvenanceMetadata, normalizeMessageProvenance } from "../backend/message-provenance.js";
import { clearAgentIconCache } from "../engine/agent-icon-cache.js";
import { AgentIconAuthContext, type AgentIconLookup, AgentIconsContext } from "../engine/agent-icons-context.js";

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
const text = (value: string) => [{ type: "text" as const, text: value }];
const thread: ThreadMessageLike[] = [
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
    { id: "u_2", role: "user", content: text("Thanks.") },
    { origin: "user", channel: "command-center", actorKind: "user", actorUid: VIEWER_UID, targetAgentUid: SESSION_AGENT_UID },
  ),
];
// Only the session agent has an icon; the calling executor keeps the robot.
const lookup: AgentIconLookup = (uid) =>
  uid === SESSION_AGENT_UID
    ? { agentUid: SESSION_AGENT_UID, rendering: "mask", url: "https://api.test/agents/session/icon/" }
    : null;

const iconAuth = {
  connection: createChatBackendConnection({ apiBaseUrl: "https://api.test" }),
  token: "session-token",
  tokenType: "Bearer",
};

function Harness({ messages }: { messages: ThreadMessageLike[] }) {
  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages,
    isRunning: false,
    onNew: async () => {},
    convertMessage: (message) => message,
  });
  return (
    <AgentIconAuthContext.Provider value={iconAuth}>
      <AgentIconsContext.Provider value={lookup}>
        <AssistantRuntimeProvider runtime={runtime}>
          <ChatThread viewer={VIEWER} surface="page" />
        </AssistantRuntimeProvider>
      </AgentIconsContext.Provider>
    </AgentIconAuthContext.Provider>
  );
}

describe("ChatThread agent icons", () => {
  let container: HTMLDivElement;
  let root: Root;
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
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
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () =>
      new Response(new Blob(["<svg/>"], { type: "image/svg+xml" }), {
        status: 200,
        headers: { ETag: '"one"', "Content-Type": "image/svg+xml" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    Object.assign(URL, { createObjectURL: () => "blob:test/session-agent", revokeObjectURL: () => {} });
    clearAgentIconCache();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    clearAgentIconCache();
    vi.unstubAllGlobals();
  });

  it("draws the session agent's icon on its messages and keeps the robot for agents without one", async () => {
    act(() => {
      root.render(<Harness messages={thread} />);
    });
    const roots = () => Array.from(container.querySelectorAll<HTMLElement>("[data-actor-key]"));
    const assistantTurn = () => roots().find((element) => element.dataset.actorKey === `agent:${SESSION_AGENT_UID}`)!;
    const executorTurn = () => roots().find((element) => element.dataset.actorKey === `agent:${EXECUTOR_UID}`)!;
    // The robot shows at once, before the bytes arrive.
    expect(assistantTurn().querySelector('[data-actor-icon="robot"]')).not.toBeNull();
    await vi.waitFor(() =>
      expect(assistantTurn().querySelector('[data-agent-icon="mask"]')).not.toBeNull(),
    );
    expect(assistantTurn().querySelector('[data-actor-icon="robot"]')).toBeNull();
    expect(executorTurn().querySelector('[data-actor-icon="robot"]')).not.toBeNull();
    expect(executorTurn().querySelector("[data-agent-icon]")).toBeNull();
    // One agent, one request, however many messages it has.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // People keep their picture or monogram.
    const viewerTurn = roots().find((element) => element.dataset.actorKey === `user:${VIEWER_UID}`)!;
    expect(viewerTurn.querySelector("[data-agent-icon]")).toBeNull();
  });
});
