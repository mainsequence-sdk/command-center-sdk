// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The engine the frame reads: the active Agent, the default-session restore, the sessions, and the
// run status.
const engine = {
  activeAgentUid: "agent-a" as string | null,
  activeSessionSummary: { sessionId: "s1", displayLabel: null, working: false } as {
    sessionId: string;
    displayLabel: string | null;
    working: boolean;
  } | null,
  agentSessions: [
    {
      id: "s1",
      title: "Currency exposure",
      preview: null,
      agent: { name: "Analyst" },
    },
  ],
  createAgentSession: vi.fn(),
  currentSessionId: "s1" as string | null,
  hasActiveChatStream: false,
  hasDirectLaunchSelection: vi.fn(() => false),
  isActiveSessionLoading: false,
  isCreatingAgentSession: false,
  restoreDefaultSessionSelection: vi.fn(),
  viewContext: { application: "crm", path: "/deals" } as unknown,
};
let runStatus: "idle" | "queued" | "thinking" | "responding" | "complete" | "error" = "idle";

vi.mock("../engine/ChatEngineProvider.js", () => ({
  useChatEngine: () => engine,
  useOptionalChatEngine: () => engine,
  useChatRunStatus: () => ({
    hasVisibleAssistantOutput: false,
    runStatus,
    runStatusDetail: null,
    thinkingSummary: null,
  }),
}));
vi.mock("./AgentSessionExplorer.js", () => ({
  AgentSessionExplorer: ({ headerActions }: { headerActions?: React.ReactNode }) => (
    <div data-testid="explorer">{headerActions}</div>
  ),
}));

const { ChatLauncher, ChatRail } = await import("./ChatRail.js");
const { ChatPageLayout } = await import("./ChatPageLayout.js");

describe("the chat frame", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    runStatus = "idle";
    engine.activeSessionSummary = { sessionId: "s1", displayLabel: null, working: false };
    engine.createAgentSession.mockClear();
    engine.hasDirectLaunchSelection.mockReset();
    engine.hasDirectLaunchSelection.mockReturnValue(false);
    engine.restoreDefaultSessionSelection.mockClear();
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

  const button = (label: string) =>
    container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

  it("draws the rail's header, decor, and body, with Expand only when the application gives it", () => {
    const onExpand = vi.fn();
    render(
      <ChatRail title="Main Sequence AI" subtitle="Assistant rail." detail="Session 42" onClose={() => {}} onExpand={onExpand}>
        <p data-testid="thread">thread</p>
      </ChatRail>,
    );

    const rail = container.querySelector<HTMLElement>("section.ms-chat-rail")!;
    expect(rail.getAttribute("aria-label")).toBe("Main Sequence AI");
    expect(rail.dataset.chatRail).toBe("docked");
    expect(rail.querySelectorAll(".ms-chat-rail__glow")).toHaveLength(3);
    expect(rail.querySelector(".ms-chat-rail__title")?.textContent).toBe("Main Sequence AI");
    expect(rail.querySelector(".ms-chat-rail__subtitle")?.textContent).toBe("Assistant rail.");
    expect(rail.querySelector(".ms-chat-rail__detail")?.textContent).toBe("Session 42");
    expect(rail.querySelector(".ms-chat-rail__body [data-testid='thread']")).not.toBeNull();

    const expand = [...rail.querySelectorAll("button")].find((item) => item.textContent === "Expand")!;
    act(() => {
      expand.click();
    });
    expect(onExpand).toHaveBeenCalledTimes(1);

    render(
      <ChatRail title="Main Sequence AI" onClose={() => {}}>
        <p>thread</p>
      </ChatRail>,
    );
    expect([...container.querySelectorAll("button")].some((item) => item.textContent === "Expand")).toBe(false);
  });

  it("floats the overlay rail, offset from the right edge, in the accent tone", () => {
    render(
      <ChatRail title="Agent" mode="overlay" tone="accent" rightOffset={48} onClose={() => {}}>
        <p>thread</p>
      </ChatRail>,
    );

    const rail = container.querySelector<HTMLElement>("section.ms-chat-rail")!;
    expect(rail.classList.contains("ms-chat-rail--overlay")).toBe(true);
    expect(rail.classList.contains("ms-chat-rail--accent")).toBe(true);
    expect(rail.style.right).toBe("48px");
  });

  it("returns to the default session when closing over another Agent's session, unless told not to", () => {
    const onClose = vi.fn();
    engine.hasDirectLaunchSelection.mockReturnValue(true);
    render(
      <ChatRail title="Agent" onClose={onClose}>
        <p>thread</p>
      </ChatRail>,
    );
    act(() => {
      button("Close chat rail")!.click();
    });
    expect(engine.restoreDefaultSessionSelection).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    render(
      <ChatRail title="Agent" onClose={onClose} restoreDefaultSessionOnClose={false}>
        <p>thread</p>
      </ChatRail>,
    );
    act(() => {
      button("Close chat rail")!.click();
    });
    expect(engine.restoreDefaultSessionSelection).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("opens the rail from the launcher", () => {
    const onClick = vi.fn();
    render(<ChatLauncher label="Ask Sentinel" onClick={onClick} />);

    const launcher = container.querySelector<HTMLButtonElement>("button.ms-chat-launcher")!;
    expect(launcher.textContent).toContain("Ask Sentinel");
    act(() => {
      launcher.click();
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("heads the expanded rail with the Agent, the session, and the run status", () => {
    runStatus = "responding";
    render(
      <ChatPageLayout>
        <p>thread</p>
      </ChatPageLayout>,
    );

    expect(container.querySelector(".ms-chat-page__agent")?.textContent).toBe("Analyst");
    expect(container.querySelector(".ms-chat-page__session")?.textContent).toBe("Currency exposure");
    const status = container.querySelector<HTMLElement>("[data-run-status]")!;
    expect(status.dataset.runStatus).toBe("responding");
    expect(status.classList.contains("ms-chat-page__status--primary")).toBe(true);
    expect(status.textContent).toBe("Responding");

    engine.activeSessionSummary = { sessionId: "s1", displayLabel: null, working: true };
    runStatus = "idle";
    render(
      <ChatPageLayout>
        <p>thread</p>
      </ChatPageLayout>,
    );
    expect(container.querySelector("[data-run-status]")?.textContent).toBe("Working");
  });

  it("puts the page's actions in the explorer, collapses it, and starts a session", () => {
    const onCreateSession = vi.fn();
    const onMinimize = vi.fn();
    render(
      <ChatPageLayout explorer={{ onOpenSession: () => {} }} onCreateSession={onCreateSession} onMinimize={onMinimize}>
        <p>thread</p>
      </ChatPageLayout>,
    );

    const explorer = container.querySelector("[data-testid='explorer']")!;
    expect(explorer.querySelector("button[aria-label='New session']")).not.toBeNull();
    act(() => {
      button("New session")!.click();
    });
    expect(engine.createAgentSession).toHaveBeenCalledTimes(1);
    expect(onCreateSession).toHaveBeenCalledTimes(1);

    act(() => {
      button("Minimize to rail")!.click();
    });
    expect(onMinimize).toHaveBeenCalledTimes(1);

    act(() => {
      button("Show context")!.click();
    });
    expect(container.querySelector(".ms-chat-page__context-payload")?.textContent).toContain('"application": "crm"');

    act(() => {
      button("Collapse Agents")!.click();
    });
    expect(container.querySelector("[data-testid='explorer']")).toBeNull();
    act(() => {
      button("Open Agents")!.click();
    });
    expect(container.querySelector("[data-testid='explorer']")).not.toBeNull();
  });

  it("shows only the blocking state while the application blocks the page", () => {
    render(
      <ChatPageLayout blockingState={<p data-testid="blocked">Opening the assistant</p>}>
        <p data-testid="thread">thread</p>
      </ChatPageLayout>,
    );

    expect(container.querySelector("[data-testid='blocked']")).not.toBeNull();
    expect(container.querySelector("[data-testid='thread']")).toBeNull();
  });
});
