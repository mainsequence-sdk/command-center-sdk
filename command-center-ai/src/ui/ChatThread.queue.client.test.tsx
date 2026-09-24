// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type AgentRuntimeInteraction, type AgentRuntimePresence } from "../backend/runtime-interaction.js";

// The signed-in person, as the application passes them to the thread.
const VIEWER = { uid: "6e0d0d6c-4b8a-4a4a-9f3e-1c2d3e4f5a6b", name: "Ada", avatarUrl: null };

vi.mock("./MarkdownContent.js", () => ({
  MarkdownContent: ({ content }: { content: string }) => <div>{content}</div>,
}));

type Readiness = {
  status: "idle" | "loading" | "ready" | "error" | "not_found";
  detailReady: boolean;
  historyReady: boolean;
  sessionId: string | null;
  error: string | null;
};

const readyReadiness: Readiness = {
  status: "ready",
  detailReady: true,
  historyReady: true,
  sessionId: "session-1",
  error: null,
};

function interaction(
  state: AgentRuntimeInteraction["state"],
  overrides: Partial<AgentRuntimeInteraction> = {},
): AgentRuntimeInteraction {
  return {
    state,
    canSubmit: state === "ready" || state === "warning",
    notice: null,
    operation: null,
    retryAfterMs: null,
    ...overrides,
  };
}


const feature = {
  activeSessionReadiness: readyReadiness,
  activeAgentName: "MainSequence Tutorial Helper",
  activeSessionSummary: { sessionId: "session-1", displayLabel: null, working: false },
  activeRuntimeInteraction: null as AgentRuntimeInteraction | null,
  activeRuntimePresence: null as AgentRuntimePresence | null,
  // A resolved model catalog, so the composer is not in its "models
  // unavailable" state and the working placeholder can show.
  availableModels: [
    {
      auth: {
        authKind: "api_key",
        authenticated: true,
        configuredFromEnv: false,
        required: true,
        signInAvailable: false,
      },
      id: "openai:gpt-5",
      label: "GPT-5",
      defaultReasoningEffort: null,
      value: "openai:gpt-5",
      provider: "openai",
      reasoningEfforts: [],
      source: "platform" as const,
      selectable: true,
    },
  ],
  availableModelsError: null,
  availableProviders: [{ label: "OpenAI", value: "openai" }],
  availableReasoningEfforts: [],
  cancelActiveSession: vi.fn(),
  clearMessageQueue: vi.fn(),
  currentSessionId: "session-1" as string | null,
  editQueuedMessage: vi.fn((_id: string): string | null => null),
  enqueueMessage: vi.fn((_text: string) => true),
  hasActiveChatStream: false,
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
  messageQueue: [] as {
    id: string;
    text: string;
    createdAt: string;
    status: "queued" | "sending" | "held";
    holdReason?: "stopped" | "failed" | "away" | "blocked" | "unavailable";
    holdMessage?: string;
  }[],
  queuedMessageCountBySessionId: {} as Record<string, number>,
  isDirectLaunchSession: false,
  refreshActiveSessionRuntimeAccess: vi.fn(async () => {}),
  removeQueuedMessage: vi.fn(),
  reorderQueuedMessage: vi.fn(),
  requestAvailableModels: vi.fn(),
  revalidateStaleRuntimeAccess: vi.fn(),
  retryDefaultSession: vi.fn(),
  selectedModelValue: "openai:gpt-5",
  selectedProviderValue: "openai",
  selectedReasoningEffortValue: null,
  sendNextQueuedMessage: vi.fn(),
  sessionNotice: null as string | null,
  setSelectedModelValue: vi.fn(),
  setSelectedProviderValue: vi.fn(),
  setSelectedReasoningEffortValue: vi.fn(),
};
vi.mock("../engine/ChatEngineProvider.js", () => ({
  useChatEngine: () => feature,
}));
const { ChatThread } = await import("./ChatThread.js");

function historyFor(isRunning: boolean): ThreadMessageLike[] {
  return [
    { id: "u_1", role: "user", content: [{ type: "text", text: "Hello" }] },
    {
      id: "a_1",
      role: "assistant",
      content: [{ type: "text", text: "Hi" }],
      status: isRunning ? { type: "running" } : { type: "complete", reason: "stop" },
    },
  ];
}

function Harness({
  isRunning,
  surface,
}: {
  isRunning: boolean;
  surface: "overlay" | "page";
}) {
  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages: historyFor(isRunning),
    isRunning,
    onNew: async () => {},
    onCancel: async () => {},
    convertMessage: (message) => message,
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatThread viewer={VIEWER} surface={surface} />
    </AssistantRuntimeProvider>
  );
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

const queued = (id: string, text: string) => ({
  id,
  text,
  createdAt: new Date(0).toISOString(),
  status: "queued" as const,
});

describe("ChatThread message queue", () => {
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
    Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
    Element.prototype.scrollTo = Element.prototype.scrollTo ?? (() => {});
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    feature.messageQueue = [];
    feature.activeSessionSummary = { sessionId: "session-1", displayLabel: null, working: false };
    feature.clearMessageQueue.mockClear();
    feature.editQueuedMessage.mockReset();
    feature.editQueuedMessage.mockReturnValue(null);
    feature.enqueueMessage.mockReset();
    feature.enqueueMessage.mockReturnValue(true);
    feature.removeQueuedMessage.mockClear();
    feature.reorderQueuedMessage.mockClear();
    feature.sendNextQueuedMessage.mockClear();
  });
  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });
  function render(surface: "overlay" | "page", isRunning: boolean) {
    act(() => {
      root.render(<Harness isRunning={isRunning} surface={surface} />);
    });
  }
  const textarea = () => container.querySelector<HTMLTextAreaElement>("textarea");
  const strip = () => container.querySelector<HTMLElement>("[data-message-queue]");
  const action = (name: string, scope: ParentNode = container) =>
    scope.querySelector<HTMLButtonElement>(`[data-queue-action="${name}"]`);

  it.each(["page", "overlay"] as const)(
    "keeps typing open while the agent works and queues the draft on Enter, on the %s",
    async (surface) => {
      render(surface, true);
      const input = textarea();
      expect(input).not.toBeNull();
      expect(input?.disabled).toBe(false);
      expect(input?.placeholder).toBe(
        "MainSequence Tutorial Helper is working. Your message will send when it finishes.",
      );
      expect(container.querySelector("[data-queue-add]")).not.toBeNull();
      expect(container.querySelector("[data-composer-stop]")).not.toBeNull();

      await act(async () => {
        setTextareaValue(input!, "Also include the currency exposure.");
      });
      await act(async () => {
        input!.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
        );
      });
      expect(feature.enqueueMessage).toHaveBeenCalledWith("Also include the currency exposure.");
      expect(input?.value).toBe("");
    },
  );

  it("queues the draft from the primary control and keeps a refused draft in the composer", async () => {
    render("page", true);
    const input = textarea()!;
    await act(async () => {
      setTextareaValue(input, "second thought");
    });
    feature.enqueueMessage.mockReturnValueOnce(false);
    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-queue-add]")!.click();
    });
    expect(feature.enqueueMessage).toHaveBeenCalledWith("second thought");
    expect(input.value).toBe("second thought");
  });

  it("renders the rows in order with the count and the row controls", async () => {
    feature.messageQueue = [queued("q1", "First follow-up"), queued("q2", "Second follow-up")];
    feature.editQueuedMessage.mockReturnValue("Second follow-up");
    render("page", true);
    expect(strip()).not.toBeNull();
    expect(strip()?.querySelector("[data-queue-headline]")?.textContent).toBe(
      "2 queued · will send when MainSequence Tutorial Helper finishes",
    );
    const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-queue-item]"));
    expect(rows.map((row) => row.querySelector("[data-queue-text]")?.textContent)).toEqual([
      "First follow-up",
      "Second follow-up",
    ]);
    // No "Send now": the runtime cannot steer a running answer yet.
    expect(action("send-now", rows[0]!)).toBeNull();
    expect(rows[0]!.querySelector("[data-queue-handle]")).not.toBeNull();
    await act(async () => {
      action("remove", rows[0]!)!.click();
    });
    expect(feature.removeQueuedMessage).toHaveBeenCalledWith("q1");
    // The menu offers Edit and Remove only; Edit puts the text in the composer.
    await act(async () => {
      action("menu", rows[1]!)!.click();
    });
    expect(rows[1]!.querySelector("[data-queue-menu]")).not.toBeNull();
    expect(action("move-up", rows[1]!)).toBeNull();
    expect(action("move-down", rows[1]!)).toBeNull();
    expect(action("remove-menu", rows[1]!)).not.toBeNull();
    await act(async () => {
      action("edit", rows[1]!)!.click();
    });
    expect(rows[1]!.querySelector("[data-queue-menu]")).toBeNull();
    expect(feature.editQueuedMessage).toHaveBeenCalledWith("q2");
    expect(textarea()?.value).toBe("Second follow-up");
    await act(async () => {
      action("clear")!.click();
    });
    expect(feature.clearMessageQueue).toHaveBeenCalledTimes(1);
  });

  it("reorders rows by drag and drop, and with the arrow keys on a focused row", async () => {
    feature.messageQueue = [
      queued("q1", "First follow-up"),
      queued("q2", "Second follow-up"),
      queued("q3", "Third follow-up"),
    ];
    render("page", true);
    const rows = () => Array.from(container.querySelectorAll<HTMLElement>("[data-queue-item]"));
    expect(rows()[0]?.getAttribute("draggable")).toBe("true");
    // Drag the first row and drop it below the second: the row lands at index 1.
    await act(async () => {
      rows()[0]!.dispatchEvent(new Event("dragstart", { bubbles: true }));
    });
    expect(rows()[0]?.dataset.dragging).toBe("true");
    await act(async () => {
      rows()[1]!.dispatchEvent(new Event("dragover", { bubbles: true, cancelable: true }));
    });
    expect(rows()[1]?.dataset.dropEdge).toBe("after");
    await act(async () => {
      rows()[1]!.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    });
    expect(feature.reorderQueuedMessage).toHaveBeenCalledWith("q1", 1);
    expect(rows()[0]?.dataset.dragging).toBeUndefined();
    expect(rows()[1]?.dataset.dropEdge).toBeUndefined();
    // Keyboard: ArrowUp on the third row moves it to index 1; ArrowUp on the first is a no-op.
    feature.reorderQueuedMessage.mockClear();
    await act(async () => {
      rows()[2]!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }),
      );
    });
    expect(feature.reorderQueuedMessage).toHaveBeenCalledWith("q3", 1);
    feature.reorderQueuedMessage.mockClear();
    await act(async () => {
      rows()[0]!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }),
      );
    });
    expect(feature.reorderQueuedMessage).not.toHaveBeenCalled();
  });

  it("shows the hold reason with Send next when the queue is held", async () => {
    feature.messageQueue = [
      { ...queued("q1", "After the stop"), status: "held", holdReason: "stopped" },
    ];
    render("page", false);
    expect(strip()?.dataset.queueHeld).toBe("stopped");
    expect(strip()?.querySelector("[data-queue-headline]")?.textContent).toBe(
      "Held after you stopped MainSequence Tutorial Helper.",
    );
    await act(async () => {
      action("send-next")!.click();
    });
    expect(feature.sendNextQueuedMessage).toHaveBeenCalledTimes(1);
    expect(action("send-now")).toBeNull();
  });

  it("hides the strip when nothing is queued and keeps the normal send control when idle", () => {
    render("page", false);
    expect(strip()).toBeNull();
    expect(container.querySelector("[data-queue-add]")).toBeNull();
    expect(container.querySelector('button[aria-label="Send message"]')).not.toBeNull();
  });
});
