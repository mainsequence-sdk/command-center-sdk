// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const VIEWER_UID = "6e0d0d6c-4b8a-4a4a-9f3e-1c2d3e4f5a6b";

// The signed-in person, as the application passes them to the thread.
const VIEWER = { uid: VIEWER_UID, name: "Ada Lovelace", avatarUrl: null };

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
  activeAgentLabel: "research-assistant",
  activeAgentName: "Research Assistant",
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
  messageQueue: [] as { id: string; text: string; createdAt: string; status: "queued" }[],
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

function text(value: string) {
  return [{ type: "text" as const, text: value }];
}

const LONG_PROMPT = [
  "First paragraph of the plan.",
  "Second paragraph with the details.",
  "Third paragraph with the ask.",
  "Fourth paragraph with the deadline.",
].join("\n\n");

const history: ThreadMessageLike[] = [
  { id: "u_1", role: "user", content: text(LONG_PROMPT) },
  {
    id: "a_1",
    role: "assistant",
    content: text("Here is the answer."),
    status: { type: "complete", reason: "stop" },
  },
];

const failedHistory: ThreadMessageLike[] = [
  { id: "u_1", role: "user", content: text("Run the failing suite.") },
  {
    id: "a_1",
    role: "assistant",
    content: [],
    status: { type: "incomplete", reason: "error", error: "The runtime dropped the run." },
  },
];

const newMessages: string[] = [];
const clipboardWrites: string[] = [];

function Harness({
  isRunning = false,
  messages,
}: {
  isRunning?: boolean;
  messages: ThreadMessageLike[];
}) {
  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages,
    isRunning,
    onNew: async (message) => {
      const part = message.content[0];
      newMessages.push(part && part.type === "text" ? part.text : "");
    },
    convertMessage: (message) => message,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatThread viewer={VIEWER} surface="page" />
    </AssistantRuntimeProvider>
  );
}

function userTurn(container: HTMLElement) {
  return container.querySelector<HTMLElement>(`[data-actor-key="user:${VIEWER_UID}"]`);
}

function action(scope: HTMLElement | null, name: string) {
  return scope?.querySelector<HTMLButtonElement>(`[data-message-action="${name}"]`) ?? null;
}

function composerInput(container: HTMLElement) {
  return container.querySelector<HTMLTextAreaElement>("textarea");
}

async function click(element: Element | null | undefined) {
  // The composer send settles in a microtask, so the flush has to be async.
  await act(async () => {
    (element as HTMLElement).click();
  });
}

describe("ChatThread message actions", () => {
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
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (value: string) => {
          clipboardWrites.push(value);
          return Promise.resolve();
        },
      },
    });
    newMessages.length = 0;
    clipboardWrites.length = 0;
    chatFeature.activeSessionSummary.working = false;
    chatFeature.enqueueMessage.mockClear();
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

  it("copies the whole user message, not the shortened preview the page shows", async () => {
    act(() => {
      root.render(<Harness messages={history} />);
    });

    const turn = userTurn(container);
    // The page shows the tail of a long prompt.
    expect(turn?.textContent).not.toContain("First paragraph of the plan.");

    await click(action(turn, "copy"));

    expect(clipboardWrites).toEqual([LONG_PROMPT]);
  });

  it("puts the hidden part of a long prompt behind a toggle instead of dropping it", async () => {
    act(() => {
      root.render(<Harness messages={history} />);
    });

    const turn = userTurn(container);
    const expand = turn?.querySelector<HTMLButtonElement>('[data-user-message-toggle="expand"]');
    expect(expand).not.toBeNull();

    await click(expand);

    expect(userTurn(container)?.textContent).toContain("First paragraph of the plan.");
    expect(
      userTurn(container)?.querySelector('[data-user-message-toggle="collapse"]'),
    ).not.toBeNull();
  });

  it("loads the message into the composer to edit and send again, leaving the turn in place", async () => {
    act(() => {
      root.render(<Harness messages={history} />);
    });

    await click(action(userTurn(container), "edit-resend"));

    expect(composerInput(container)?.value).toBe(LONG_PROMPT);
    // Nothing was sent and the original turn is untouched: the edit goes out
    // as a new message when the person sends it.
    expect(newMessages).toEqual([]);
    expect(userTurn(container)).not.toBeNull();
  });

  it("sends the message again as a new turn", async () => {
    act(() => {
      root.render(<Harness messages={history} />);
    });

    await click(action(userTurn(container), "resend"));

    expect(newMessages).toEqual([LONG_PROMPT]);
  });

  it("queues a resend while the agent is working instead of racing the run", async () => {
    chatFeature.activeSessionSummary.working = true;

    act(() => {
      root.render(<Harness messages={history} />);
    });

    await click(action(userTurn(container), "resend"));

    expect(chatFeature.enqueueMessage).toHaveBeenCalledWith(LONG_PROMPT);
    expect(newMessages).toEqual([]);
  });

  it("offers a retry on a failed turn that sends the prompt above it again", async () => {
    act(() => {
      root.render(<Harness messages={failedHistory} />);
    });

    const retry = container.querySelector<HTMLButtonElement>('[data-message-action="retry"]');
    expect(retry).not.toBeNull();

    await click(retry);

    expect(newMessages).toEqual(["Run the failing suite."]);
  });

  it("copies an assistant answer", async () => {
    act(() => {
      root.render(<Harness messages={history} />);
    });

    const assistantTurn = container.querySelectorAll<HTMLElement>("[data-actor-key]")[1];
    await click(action(assistantTurn, "copy"));

    expect(clipboardWrites).toEqual(["Here is the answer."]);
  });
});
