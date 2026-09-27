// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentRuntimeInteraction } from "../backend/runtime-interaction.js";

const readyReadiness = {
  status: "ready" as "idle" | "loading" | "ready" | "error" | "not_found",
  detailReady: true,
  historyReady: true,
  sessionId: "session-1" as string | null,
  error: null as string | null,
};

const model = {
  auth: { authKind: "api_key", authenticated: true, configuredFromEnv: false, required: true, signInAvailable: false },
  id: "openai:gpt-5",
  label: "GPT-5",
  defaultReasoningEffort: null,
  value: "openai:gpt-5",
  provider: "openai",
  reasoningEfforts: [],
  source: "platform" as const,
  selectable: true,
};

const engine = {
  activeAgentName: "Analyst",
  activeRuntimeInteraction: null as AgentRuntimeInteraction | null,
  activeSessionReadiness: { ...readyReadiness },
  activeSessionSummary: { sessionId: "session-1", displayLabel: null, working: false } as {
    sessionId: string;
    displayLabel: string | null;
    working: boolean;
  } | null,
  availableModels: [model],
  availableModelsError: null as string | null,
  availableProviders: [{ label: "OpenAI", value: "openai" }],
  availableReasoningEfforts: [],
  cancelActiveSession: vi.fn(),
  clearMessageQueue: vi.fn(),
  connection: { apiBaseUrl: "https://platform.test" },
  editQueuedMessage: vi.fn(() => null),
  enqueueMessage: vi.fn((_text: string) => true),
  hasRequestedAvailableModels: true,
  isActiveSessionLoading: false,
  isActiveSessionReady: true,
  isAssistantRuntimeStarting: false,
  isCancellingSession: false,
  isCreatingAgentSession: false,
  isDirectLaunchSession: false,
  isLoadingAvailableModels: false,
  isUpdatingSessionModel: false,
  messageQueue: [],
  removeQueuedMessage: vi.fn(),
  reorderQueuedMessage: vi.fn(),
  requestAvailableModels: vi.fn(),
  revalidateStaleRuntimeAccess: vi.fn(),
  selectedModelValue: "openai:gpt-5",
  selectedProviderValue: "openai",
  selectedReasoningEffortValue: null,
  sendNextQueuedMessage: vi.fn(),
  sessionModelSelectionRequest: null as unknown,
  setSelectedModelValue: vi.fn(),
  setSelectedProviderValue: vi.fn(),
  setSelectedReasoningEffortValue: vi.fn(),
};

vi.mock("../engine/ChatEngineProvider.js", () => ({ useChatEngine: () => engine }));
vi.mock("./MarkdownContent.js", () => ({ MarkdownContent: () => null }));

const { ChatComposer, useChatComposerState } = await import("./ChatThread.js");

let lastState: ReturnType<typeof useChatComposerState> | null = null;

function StateProbe() {
  lastState = useChatComposerState();
  return null;
}

function Harness({
  children,
  isRunning = false,
  onNew,
}: {
  children: React.ReactNode;
  isRunning?: boolean;
  onNew?: (message: AppendMessage) => Promise<void>;
}) {
  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages: [],
    isRunning,
    onNew: onNew ?? (async () => {}),
    onCancel: async () => {},
    convertMessage: (message) => message,
  });
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}

describe("the composer on its own", () => {
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
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    lastState = null;
    engine.activeRuntimeInteraction = null;
    engine.activeSessionReadiness = { ...readyReadiness };
    engine.activeSessionSummary = { sessionId: "session-1", displayLabel: null, working: false };
    engine.availableModels = [model];
    engine.hasRequestedAvailableModels = true;
    engine.isActiveSessionLoading = false;
    engine.isActiveSessionReady = true;
    engine.isAssistantRuntimeStarting = false;
    engine.isCreatingAgentSession = false;
    engine.sessionModelSelectionRequest = null;
    engine.enqueueMessage.mockClear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function render(node: React.ReactNode) {
    act(() => {
      root.render(node);
    });
  }

  it("reports ready, and sends the draft on Enter", async () => {
    const onNew = vi.fn(async (_message: AppendMessage) => {});
    render(
      <Harness onNew={onNew}>
        <StateProbe />
        <ChatComposer />
      </Harness>,
    );

    expect(lastState).toEqual({ status: "ready", canSend: true, queues: false, canWrite: true, reason: null });

    const input = container.querySelector<HTMLTextAreaElement>("textarea")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    await act(async () => {
      setter?.call(input, "Summarise the exposure.");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    expect(onNew).toHaveBeenCalledTimes(1);
    expect(onNew.mock.calls[0]![0].content).toEqual([{ type: "text", text: "Summarise the exposure." }]);
  });

  it("reports working and queues the draft on Enter while the Agent works", async () => {
    render(
      <Harness isRunning>
        <StateProbe />
        <ChatComposer />
      </Harness>,
    );

    expect(lastState).toEqual({
      status: "working",
      canSend: false,
      queues: true,
      canWrite: true,
      reason: "Analyst is working. Your message will send when it finishes.",
    });

    const input = container.querySelector<HTMLTextAreaElement>("textarea")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    await act(async () => {
      setter?.call(input, "Also the hedges.");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    expect(engine.enqueueMessage).toHaveBeenCalledWith("Also the hedges.");
  });

  it.each([
    [
      "waking",
      () => {
        engine.isAssistantRuntimeStarting = true;
      },
      { status: "waking", canSend: false, queues: false, canWrite: false, reason: "Analyst is waking up" },
    ],
    [
      "no session",
      () => {
        engine.activeSessionReadiness = { ...readyReadiness, status: "idle", sessionId: null };
      },
      {
        status: "no-session",
        canSend: false,
        queues: false,
        canWrite: false,
        reason: "Select or start a session to continue.",
      },
    ],
    [
      "loading",
      () => {
        engine.isActiveSessionLoading = true;
        engine.activeSessionReadiness = { ...readyReadiness, status: "loading", historyReady: false };
      },
      { status: "loading", canSend: false, queues: false, canWrite: false, reason: "Loading session..." },
    ],
    [
      "models loading",
      () => {
        engine.hasRequestedAvailableModels = false;
      },
      { status: "loading-models", canSend: false, queues: false, canWrite: true, reason: "Loading models..." },
    ],
    [
      "choosing a model",
      () => {
        engine.sessionModelSelectionRequest = { agentName: "Analyst" };
      },
      {
        status: "choosing-model",
        canSend: false,
        queues: false,
        canWrite: false,
        reason: "A model is needed to start this session. Choose one to continue.",
      },
    ],
  ])("reports %s", (_name, arrange, expected) => {
    arrange();
    render(
      <Harness>
        <StateProbe />
      </Harness>,
    );

    expect(lastState).toEqual(expected);
  });
});
