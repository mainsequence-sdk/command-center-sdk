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

function presence(overrides: Partial<AgentRuntimePresence> = {}): AgentRuntimePresence {
  return {
    phase: "provisioning",
    replicas: { desired: 1, actual: 0 },
    detail: "Waiting for a machine to become available.",
    observedAt: new Date().toISOString(),
    wake: {
      operationUid: "op-1",
      state: "in_progress",
      requestedAt: new Date(Date.now() - 42_000).toISOString(),
      deadlineAt: new Date(Date.now() + 500_000).toISOString(),
    },
    ...overrides,
  };
}

const wakingNotice = {
  code: "agent_runtime_waking",
  severity: "info" as const,
  title: "Starting the agent",
  message: "The agent was idle and is starting now.",
};

const feature = {
  activeSessionReadiness: readyReadiness,
  activeAgentName: "MainSequence Tutorial Helper",
  activeSessionSummary: { sessionId: "session-1", displayLabel: null, working: false },
  activeRuntimeInteraction: null as AgentRuntimeInteraction | null,
  activeRuntimePresence: null as AgentRuntimePresence | null,
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
  currentSessionId: "session-1" as string | null,
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
  isDirectLaunchSession: false,
  refreshActiveSessionRuntimeAccess: vi.fn(async () => {}),
  requestAvailableModels: vi.fn(),
  revalidateStaleRuntimeAccess: vi.fn(),
  retryDefaultSession: vi.fn(),
  selectedModelValue: null,
  selectedProviderValue: null,
  selectedReasoningEffortValue: null,
  sessionNotice: null as string | null,
  setSelectedModelValue: vi.fn(),
  setSelectedProviderValue: vi.fn(),
  setSelectedReasoningEffortValue: vi.fn(),
};

vi.mock("../engine/ChatEngineProvider.js", () => ({
  useChatEngine: () => feature,
}));

const { ChatThread } = await import("./ChatThread.js");

function setFeature(overrides: Partial<typeof feature>) {
  Object.assign(feature, {
    activeSessionReadiness: readyReadiness,
    activeRuntimeInteraction: null,
    activeRuntimePresence: null,
    currentSessionId: "session-1",
    isActiveSessionLoading: false,
    isActiveSessionReady: true,
    isAssistantRuntimeStarting: false,
    sessionNotice: null,
    ...overrides,
  });
}

const history: ThreadMessageLike[] = [
  { id: "u_1", role: "user", content: [{ type: "text", text: "Hello" }] },
  {
    id: "a_1",
    role: "assistant",
    content: [{ type: "text", text: "Hi" }],
    status: { type: "complete", reason: "stop" },
  },
];

const onNewMessage = vi.fn(async () => {});

function Harness({ messages, surface }: { messages: ThreadMessageLike[]; surface: "overlay" | "page" }) {
  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages,
    isRunning: false,
    onNew: onNewMessage,
    convertMessage: (message) => message,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatThread viewer={VIEWER} surface={surface} />
    </AssistantRuntimeProvider>
  );
}

describe("ChatThread connecting stage and runtime status", () => {
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
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function render(surface: "overlay" | "page", messages: ThreadMessageLike[] = history) {
    act(() => {
      root.render(<Harness messages={messages} surface={surface} />);
    });
  }

  const stage = () => container.querySelector<HTMLElement>("[data-agent-connecting-state]");
  const textarea = () => container.querySelector<HTMLTextAreaElement>("textarea");
  const sendButton = () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="Send message"]');

  function typeDraft(value: string) {
    const element = textarea();
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (!element || !setValue) {
      throw new Error("The composer input is not mounted.");
    }
    act(() => {
      setValue.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("shows the runtime step while the Agent is starting and locks the composer", () => {
    setFeature({ isAssistantRuntimeStarting: true });
    render("page", []);

    expect(stage()?.dataset.activeStep).toBe("runtime");
    expect(stage()?.textContent).toContain("Connecting to MainSequence Tutorial Helper");
    expect(stage()?.textContent).toContain("Starting MainSequence Tutorial Helper");
    expect(stage()?.textContent).not.toContain("Starting a different Agent");
    expect(textarea()).not.toBeNull();
    expect(textarea()?.disabled).toBe(true);
    expect(textarea()?.placeholder).toBe(
      "MainSequence Tutorial Helper is waking up. You can write once it is ready.",
    );
    expect(sendButton()?.disabled).toBe(true);
    expect(sendButton()?.title).toBe("MainSequence Tutorial Helper is waking up");
  });

  it("keeps the draft through the waking lock and never sends it", () => {
    onNewMessage.mockClear();
    render("page");
    typeDraft("Compare the two funds");
    expect(textarea()?.value).toBe("Compare the two funds");

    setFeature({
      activeRuntimeInteraction: interaction("waking", { notice: wakingNotice, retryAfterMs: 2000 }),
    });
    render("page");
    expect(textarea()?.disabled).toBe(true);
    expect(textarea()?.value).toBe("Compare the two funds");

    setFeature({ activeRuntimeInteraction: interaction("ready") });
    render("page");
    expect(textarea()?.disabled).toBe(false);
    expect(textarea()?.value).toBe("Compare the two funds");
    expect(onNewMessage).not.toHaveBeenCalled();
  });

  it("returns focus to the composer when the waking lock lifts", () => {
    setFeature({ isAssistantRuntimeStarting: true });
    render("page");
    expect(document.activeElement).not.toBe(textarea());

    setFeature({ isAssistantRuntimeStarting: false });
    render("page");
    expect(textarea()?.disabled).toBe(false);
    expect(document.activeElement).toBe(textarea());
  });

  it.each(["page", "overlay"] as const)(
    "keeps an open conversation visible while the Agent restarts or re-verifies, on the %s",
    (surface) => {
      setFeature({ isAssistantRuntimeStarting: true });
      render(surface);
      expect(stage()).toBeNull();
      expect(container.textContent).toContain("Hello");
      expect(textarea()?.disabled).toBe(true);
      expect(sendButton()?.disabled).toBe(true);
    },
  );

  it("locks silently while the first check that the Agent answers is in flight", () => {
    setFeature({
      activeRuntimeInteraction: interaction("checking"),
      isAssistantRuntimeStarting: true,
    });
    render("page");

    expect(container.textContent).toContain("Hello");
    expect(textarea()?.disabled).toBe(true);
    expect(textarea()?.placeholder).toBe(
      "Checking that MainSequence Tutorial Helper is ready...",
    );
    expect(sendButton()?.disabled).toBe(true);
    // Nothing flashes for an Agent that answers at once.
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("confirms the Agent is ready only after a wait the person sat through", () => {
    const nowSpy = vi.spyOn(Date, "now");
    try {
      // A check that comes back at once shows nothing.
      nowSpy.mockReturnValue(1_000_000);
      setFeature({
        activeRuntimeInteraction: interaction("checking"),
        isAssistantRuntimeStarting: true,
      });
      render("page");
      nowSpy.mockReturnValue(1_000_300);
      setFeature({ activeRuntimeInteraction: interaction("ready") });
      render("page");
      expect(container.textContent).not.toContain("MainSequence Tutorial Helper is ready");

      // A real wake does.
      nowSpy.mockReturnValue(2_000_000);
      setFeature({
        activeRuntimeInteraction: interaction("waking", { notice: wakingNotice, retryAfterMs: 3000 }),
        isAssistantRuntimeStarting: true,
      });
      render("page");
      nowSpy.mockReturnValue(2_090_000);
      setFeature({ activeRuntimeInteraction: interaction("ready") });
      render("page");
      expect(container.textContent).toContain("MainSequence Tutorial Helper is ready");
      expect(container.textContent).toContain("You can write and send your message now.");
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("re-checks a stale decision when the person goes to write", () => {
    feature.revalidateStaleRuntimeAccess.mockClear();
    render("page");

    act(() => {
      textarea()?.focus();
    });

    expect(feature.revalidateStaleRuntimeAccess).toHaveBeenCalled();
  });

  it("shows the history step while the session history loads", () => {
    setFeature({
      activeSessionReadiness: { ...readyReadiness, status: "loading", historyReady: false },
      isActiveSessionLoading: true,
      isActiveSessionReady: false,
    });
    render("page");

    expect(stage()?.dataset.activeStep).toBe("history");
  });

  it("hosts the waking stage with elapsed time and presence detail when the thread is empty", () => {
    setFeature({
      activeRuntimeInteraction: interaction("waking", {
        notice: wakingNotice,
        retryAfterMs: 2000,
      }),
      activeRuntimePresence: presence(),
    });
    render("overlay", []);

    const stageElement = stage();
    expect(stageElement?.dataset.activeStep).toBe("runtime");
    expect(stageElement?.textContent).toContain(wakingNotice.message);
    expect(stageElement?.querySelector("[data-runtime-presence-detail]")?.textContent).toBe(
      "Waiting for a machine to become available.",
    );
    expect(stageElement?.querySelector("[data-runtime-elapsed]")?.textContent).toMatch(/^4\ds$/);
    expect(stageElement?.textContent).toContain("Usually one to three minutes.");
    expect(textarea()?.disabled).toBe(true);
    expect(sendButton()?.disabled).toBe(true);
  });

  it("keeps the conversation readable and shows the waking notice when history exists", () => {
    setFeature({
      activeRuntimeInteraction: interaction("waking", { notice: wakingNotice, retryAfterMs: 2000 }),
      activeRuntimePresence: presence({ phase: "pulling_image", detail: "Downloading the agent." }),
    });
    render("page");

    expect(stage()).toBeNull();
    expect(container.textContent).toContain("Hello");
    const status = container.querySelector("[data-runtime-status]");
    expect(status?.textContent).toContain("Downloading the agent.");
    expect(status?.querySelector("[data-runtime-elapsed]")).not.toBeNull();
    expect(textarea()?.disabled).toBe(true);
    expect(sendButton()?.disabled).toBe(true);
  });

  it("offers a re-check once the wake outlives its deadline", () => {
    setFeature({
      activeRuntimeInteraction: interaction("waking", { notice: wakingNotice, retryAfterMs: 10_000 }),
      activeRuntimePresence: presence({
        wake: {
          operationUid: "op-2",
          state: "in_progress",
          requestedAt: new Date(Date.now() - 700_000).toISOString(),
          deadlineAt: new Date(Date.now() - 60_000).toISOString(),
        },
      }),
    });
    render("page");

    expect(container.textContent).toContain("This is taking longer than expected.");
    const checkAgain = container.querySelector<HTMLButtonElement>("[data-runtime-check-again]");
    expect(checkAgain).not.toBeNull();
    act(() => {
      checkAgain?.click();
    });
    expect(feature.refreshActiveSessionRuntimeAccess).toHaveBeenCalledTimes(1);
  });

  it("does not let an old expired wake lend its detail or its clock to a later check", () => {
    setFeature({
      activeRuntimeInteraction: interaction("checking", {
        notice: {
          code: "agent_runtime_checking",
          severity: "info",
          title: "Checking the agent",
          message: "Checking that this agent is up to date.",
        },
        retryAfterMs: 2000,
      }),
      activeRuntimePresence: presence({
        phase: "failed",
        detail: "The agent did not start in time.",
        wake: {
          operationUid: "op-old",
          state: "expired",
          requestedAt: new Date(Date.now() - 49 * 60_000).toISOString(),
          deadlineAt: new Date(Date.now() - 39 * 60_000).toISOString(),
        },
      }),
    });
    render("page");

    const status = container.querySelector("[data-runtime-status]");
    expect(status).not.toBeNull();
    expect(container.textContent).not.toContain("The agent did not start in time.");
    expect(status?.querySelector("[data-runtime-elapsed]")?.textContent).toMatch(/^[0-5]s$/);
    expect(container.textContent).not.toContain("This is taking longer than expected.");
    expect(container.querySelector("[data-runtime-check-again]")).toBeNull();
  });

  it("does not show a support reference on an informational notice", () => {
    setFeature({
      activeRuntimeInteraction: interaction("waking", {
        notice: wakingNotice,
        retryAfterMs: 2000,
        operation: {
          uid: "op-9",
          status: "running",
          createdAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          finishedAt: null,
          supportReference: "op-9",
        },
      }),
      activeRuntimePresence: presence(),
    });
    render("page");

    expect(container.textContent).not.toContain("Support reference");
  });

  it("shows a failed wake as an error with its support reference and keeps the draft", () => {
    setFeature({
      activeRuntimeInteraction: interaction("unavailable", {
        notice: {
          code: "agent_runtime_wake_failed",
          severity: "error",
          title: "The agent did not start",
          message: "The agent could not be started. Try again.",
        },
        operation: {
          uid: "op-3",
          status: "failed",
          createdAt: new Date().toISOString(),
          startedAt: null,
          finishedAt: new Date().toISOString(),
          supportReference: "op-3",
        },
      }),
      activeRuntimePresence: presence({ phase: "failed", detail: "The agent could not be started. Try again.", wake: null }),
    });
    render("page");

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "The agent could not be started. Try again.",
    );
    expect(container.textContent).not.toContain("Try starting again");
    expect(container.textContent).toContain("Support reference: op-3");
    expect(textarea()).not.toBeNull();
    expect(sendButton()?.disabled).toBe(true);
  });

  it("renders the thread and an enabled composer once the runtime is ready", () => {
    setFeature({ activeRuntimeInteraction: interaction("ready") });
    render("page");

    expect(stage()).toBeNull();
    expect(container.textContent).toContain("Hello");
    expect(textarea()?.disabled).toBe(false);
    expect(sendButton()?.getAttribute("aria-label")).toBe("Send message");
  });

  it("leaves session errors to the readiness state, which carries the retry", () => {
    setFeature({
      activeSessionReadiness: {
        ...readyReadiness,
        status: "error",
        detailReady: false,
        historyReady: false,
        error: "The Agent did not become ready within five minutes.",
      },
      isActiveSessionReady: false,
    });
    render("page");

    expect(stage()).toBeNull();
    expect(container.textContent).toContain("The Agent did not become ready within five minutes.");
  });

  it("does not treat an empty selection on the page as connecting", () => {
    setFeature({
      activeSessionReadiness: {
        status: "idle",
        detailReady: false,
        historyReady: false,
        sessionId: null,
        error: null,
      },
      currentSessionId: null,
      isActiveSessionReady: false,
    });
    render("page", []);

    expect(stage()).toBeNull();
  });
});
