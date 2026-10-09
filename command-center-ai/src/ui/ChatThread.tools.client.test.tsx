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

function Harness({
  messages,
  surface,
}: {
  messages: ThreadMessageLike[];
  surface: "overlay" | "page";
}) {
  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages,
    isRunning: false,
    onNew: async () => {},
    convertMessage: (message) => message,
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatThread viewer={VIEWER} surface={surface} />
    </AssistantRuntimeProvider>
  );
}

const toolThread: ThreadMessageLike[] = [
  { id: "u_1", role: "user", content: [{ type: "text", text: "List my repositories." }] },
  {
    id: "a_1",
    role: "assistant",
    status: { type: "complete", reason: "stop" },
    content: [
      { type: "reasoning", text: "I should list them." },
      {
        type: "tool-call",
        toolCallId: "call-1",
        toolName: "mainsequence__code_repository_list",
        args: { limit: 5 },
        result: {
          content: [{ type: "text", text: "[]" }],
          details: { mcp_tool: "code_repository_list", is_error: false },
        },
        isError: false,
      },
      {
        type: "tool-call",
        toolCallId: "call-2",
        toolName: "web_search",
        args: { query: "main sequence" },
        result: { content: [{ type: "text", text: "ok" }] },
        isError: false,
      },
      { type: "text", text: "You have no repositories." },
    ],
  },
];

function applicationToolThread(result?: unknown): ThreadMessageLike[] {
  return [
    { id: "u_1", role: "user", content: [{ type: "text", text: "How many namespaces are there?" }] },
    {
      id: "a_1",
      role: "assistant",
      status: { type: "complete", reason: "stop" },
      content: [
        { type: "reasoning", text: "Counting available namespaces" },
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "metatables__call_tool",
          args: { tool: "list_namespaces", arguments: { limit: 500 } },
          ...(result === undefined ? {} : { result }),
          isError: false,
        },
      ],
    },
  ];
}

async function expandChainOfThought(container: HTMLElement) {
  const trigger = container.querySelector<HTMLButtonElement>("button[aria-expanded]");
  expect(trigger).not.toBeNull();
  if (trigger?.getAttribute("aria-expanded") === "false") {
    // The chain-of-thought store applies the toggle asynchronously.
    await act(async () => {
      trigger.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
  expect(trigger?.getAttribute("aria-expanded")).toBe("true");
  return trigger!;
}

describe("ChatThread tools", () => {
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

  it.each(["page", "overlay"] as const)(
    "shows which tools ran, and that an MCP tool was used, on the %s",
    async (surface) => {
      act(() => {
        root.render(<Harness messages={toolThread} surface={surface} />);
      });

      const trigger = container.querySelector<HTMLButtonElement>("button[aria-expanded]");
      expect(trigger).not.toBeNull();
      // The header says MCP and counts the tools before anything is expanded.
      expect(trigger?.querySelector('[data-tool-badge="mcp"]')?.textContent).toBe("MCP");
      expect(trigger?.querySelector("[data-tool-summary]")?.textContent).toBe("2 tools · 1 MCP");

      if (trigger?.getAttribute("aria-expanded") === "false") {
        // The chain-of-thought store applies the toggle asynchronously.
        await act(async () => {
          trigger.click();
          await new Promise((resolve) => setTimeout(resolve, 20));
        });
      }
      expect(trigger?.getAttribute("aria-expanded")).toBe("true");
      const mcpCard = container.querySelector<HTMLElement>('[data-tool-kind="mcp"]');
      expect(mcpCard).not.toBeNull();
      expect(mcpCard?.dataset.toolName).toBe("mainsequence__code_repository_list");
      expect(mcpCard?.textContent).toContain("code_repository_list");
      expect(mcpCard?.textContent).toContain("MCP");
      expect(mcpCard?.textContent).toContain("Main Sequence MCP");
      expect(mcpCard?.textContent).toContain("Done");

      const builtinCard = container.querySelector<HTMLElement>('[data-tool-kind="builtin"]');
      expect(builtinCard).not.toBeNull();
      expect(builtinCard?.textContent).toContain("web_search");
      expect(builtinCard?.querySelector('[data-tool-badge="mcp"]')).toBeNull();

      expect(container.textContent).toContain("You have no repositories.");
    },
  );

  it("names an application's tool, not the runtime's call_tool, while it runs", async () => {
    act(() => {
      root.render(<Harness messages={applicationToolThread()} surface="page" />);
    });

    const trigger = await expandChainOfThought(container);
    expect(trigger.querySelector("[data-tool-summary]")?.textContent).toBe("1 MCP tool");

    const card = container.querySelector<HTMLElement>('[data-tool-kind="mcp"]');
    expect(card).not.toBeNull();
    expect(card?.dataset.toolName).toBe("metatables__call_tool");
    expect(card?.querySelector(".ms-chat-tool__name")?.textContent).toBe("list_namespaces");
    expect(card?.querySelector(".ms-chat-tool__provider")?.textContent).toBe("metatables");
    expect(card?.textContent).toContain("Running");
    // The input is the tool's own arguments, without the call_tool envelope.
    const input = card?.querySelector(".ms-chat-tool__code")?.textContent ?? "";
    expect(JSON.parse(input)).toEqual({ limit: 500 });
    expect(card?.textContent).not.toContain("Main Sequence MCP");
  });

  it.each(["page", "overlay"] as const)(
    "shows timeout metadata as a failed call even when the outer flag is false on the %s",
    async (surface) => {
      const text = "The metatables tool list_namespaces did not answer within 60 seconds.";
      act(() => {
        root.render(<Harness messages={applicationToolThread({
          content: [{ type: "text", text }],
          details: {
            application: "metatables", mcp_tool: "list_namespaces", is_error: true,
            failure: "timeout", timeout_seconds: 60,
          },
        })} surface={surface} />);
      });

      await expandChainOfThought(container);
      const card = container.querySelector<HTMLElement>('[data-tool-kind="mcp"]');
      expect(card?.querySelector(".ms-chat-tool__header")?.textContent).toContain("Timed out");
      expect(card?.querySelector(".ms-chat-tool__header")?.textContent).not.toContain("Done");
      expect(card?.querySelector(".ms-chat-tool__output--error")?.textContent).toBe(text);
      expect(card?.textContent).toContain('"failure": "timeout"');
      expect(card?.textContent).not.toContain("access_unavailable");
    },
  );

  it("keeps genuine access failures distinct from timeouts", async () => {
    act(() => {
      root.render(<Harness messages={applicationToolThread({
        content: [{ type: "text", text: "Main Sequence could not provide access to the metatables application." }],
        details: { application: "metatables", is_error: true, failure: "access_unavailable" },
      })} surface="page" />);
    });
    await expandChainOfThought(container);
    const card = container.querySelector<HTMLElement>('[data-tool-kind="mcp"]');
    expect(card?.querySelector(".ms-chat-tool__header")?.textContent).toContain("Failed");
    expect(card?.querySelector(".ms-chat-tool__header")?.textContent).not.toContain("Timed out");
    expect(card?.querySelector(".ms-chat-tool__output--error")).not.toBeNull();
  });

  it("keeps naming the application's tool once it ran", async () => {
    act(() => {
      root.render(
        <Harness
          messages={applicationToolThread({
            content: [{ type: "text", text: "12 namespaces" }],
            details: { mcp_tool: "list_namespaces", is_error: false, application: "metatables" },
          })}
          surface="overlay"
        />,
      );
    });

    await expandChainOfThought(container);
    const card = container.querySelector<HTMLElement>('[data-tool-kind="mcp"]');
    expect(card?.querySelector(".ms-chat-tool__name")?.textContent).toBe("list_namespaces");
    expect(card?.querySelector(".ms-chat-tool__provider")?.textContent).toBe("metatables");
    expect(card?.textContent).toContain("Done");
    expect(card?.textContent).toContain("12 namespaces");
  });
});
