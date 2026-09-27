// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentSessionAgent, AgentSessionSummary } from "../engine/agent-sessions.js";

function agent(uid: string, name: string): AgentSessionAgent {
  return {
    id: null,
    uid,
    name,
    displayLabel: name,
    agentUniqueId: `${uid}-unique`,
    description: "",
    status: "active",
    llmProvider: "",
    llmModel: "",
    engineName: "",
  };
}

function session(id: string, title: string, overrides: Partial<AgentSessionSummary> = {}): AgentSessionSummary {
  return {
    id,
    sessionName: null,
    title,
    preview: null,
    runtimeSessionId: id,
    sessionKey: null,
    handleUniqueId: null,
    threadId: null,
    codeRepositoryBranchId: null,
    cwd: null,
    runtimeState: null,
    working: false,
    updatedAt: "2026-09-01T10:00:00Z",
    agent: agent("agent-a", "Analyst"),
    origin: null,
    isPlaceholder: false,
    ...overrides,
  };
}

const engine = {
  agentSessions: [
    session("s1", "Currency exposure", { working: true }),
    session("s2", "Quarterly review"),
  ],
  archiveAgentSession: vi.fn(async (_id: string) => true),
  auth: { userUid: "user-1", token: null },
  capabilities: {
    archiveSessions: true,
    searchSessions: true,
    sessionHistory: true,
    sessionInsights: true,
    modelProviderSettings: true,
  },
  connection: { apiBaseUrl: "https://platform.test" },
  currentSessionId: "s1" as string | null,
  environmentUid: "env-1" as string | null,
  hasActiveChatStream: false,
  isActiveSessionLoading: false,
  isCreatingAgentSession: false,
  isLoadingLatestSessions: false,
  latestSessionsError: null as string | null,
  queuedMessageCountBySessionId: { s1: 2 } as Record<string, number>,
  unarchiveAgentSession: vi.fn(async (_id: string) => true),
};

const fetchArchivedAgentSessions = vi.fn(async (_input: unknown) => [
  { archived_at: "2026-08-01T10:00:00Z", session: session("old-1", "Last month's plan") },
]);
const searchAgentSessions = vi.fn(async (_input: unknown) => [
  { session: session("remote-1", "Currency hedge memo") },
]);

vi.mock("../engine/ChatEngineProvider.js", () => ({ useChatEngine: () => engine }));
vi.mock("../backend/agent-sessions-api.js", () => ({
  fetchArchivedAgentSessions: (input: unknown) => fetchArchivedAgentSessions(input),
  searchAgentSessions: (input: unknown) => searchAgentSessions(input),
}));
vi.mock("../engine/agent-sessions.js", () => ({
  toAgentSessionRecordFromApi: (record: { session: AgentSessionSummary }) => record.session,
}));

const { AgentSessionExplorer } = await import("./AgentSessionExplorer.js");

describe("AgentSessionExplorer", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    engine.archiveAgentSession.mockClear();
    engine.unarchiveAgentSession.mockClear();
    fetchArchivedAgentSessions.mockClear();
    searchAgentSessions.mockClear();
    engine.capabilities = { ...engine.capabilities, archiveSessions: true, searchSessions: true };
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  function render(node: React.ReactNode) {
    act(() => {
      root.render(node);
    });
  }

  const button = (label: string) =>
    document.body.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

  it("groups sessions under their Agents, with catalog Agents that have none, and marks the open one", () => {
    render(
      <AgentSessionExplorer
        agents={[{ uid: "agent-b", name: "Builder" }]}
        environmentLabel="Production"
        onOpenSession={() => {}}
      />,
    );

    const groups = [...container.querySelectorAll(".ms-chat-explorer__group-name")].map((item) => item.textContent);
    expect(groups).toEqual(["Analyst", "Builder"]);
    expect(container.querySelector(".ms-chat-explorer__environment")?.textContent).toBe("Production");
    const active = container.querySelector<HTMLElement>("[data-session-row='s1']")!;
    expect(active.classList.contains("ms-chat-explorer__row--active")).toBe(true);
    expect(active.querySelector(".ms-chat-explorer__working")).not.toBeNull();
    expect(active.querySelector("[data-queued-count]")?.textContent).toBe("2 queued");
    // The Builder group has no sessions and starts collapsed.
    expect(container.querySelector("[data-agent-group='agent-uid:agent-b'] .ms-chat-explorer__sessions")).toBeNull();
  });

  it("opens a session and its details through the application", () => {
    const onOpenSession = vi.fn();
    const onOpenSessionDetails = vi.fn();
    render(<AgentSessionExplorer onOpenSession={onOpenSession} />);
    expect(button("Open details for session Quarterly review")).toBeNull();

    act(() => {
      button("Open session Quarterly review")!.click();
    });
    expect(onOpenSession).toHaveBeenCalledWith("s2");

    render(<AgentSessionExplorer onOpenSession={onOpenSession} onOpenSessionDetails={onOpenSessionDetails} />);
    act(() => {
      button("Open details for session Quarterly review")!.click();
    });
    expect(onOpenSessionDetails).toHaveBeenCalledWith("s2");
  });

  it("archives a session, lists the Agent's archived sessions, and restores one", async () => {
    render(<AgentSessionExplorer onOpenSession={() => {}} />);

    await act(async () => {
      button("Archive session Quarterly review")!.click();
    });
    expect(engine.archiveAgentSession).toHaveBeenCalledWith("s2");

    const more = [...container.querySelectorAll("button")].find((item) => item.textContent === "Show more")!;
    await act(async () => {
      more.click();
    });
    expect(fetchArchivedAgentSessions).toHaveBeenCalledWith(
      expect.objectContaining({ agentUid: "agent-a", createdByUserUid: "user-1", organizationEnvironmentUid: "env-1" }),
    );
    expect(container.querySelector("[data-archived-session-row='old-1']")?.textContent).toContain("Last month's plan");

    await act(async () => {
      button("Unarchive session Last month's plan")!.click();
    });
    expect(engine.unarchiveAgentSession).toHaveBeenCalledWith("old-1");
    // A change reloads the archived sessions shown.
    expect(fetchArchivedAgentSessions).toHaveBeenCalledTimes(2);
  });

  it("searches loaded sessions at once and adds the platform's matches", async () => {
    vi.useFakeTimers();
    const onOpenSession = vi.fn();
    render(<AgentSessionExplorer onOpenSession={onOpenSession} />);

    act(() => {
      button("Search conversations")!.click();
    });
    const input = document.body.querySelector<HTMLInputElement>("input[aria-label='Search conversations']")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    act(() => {
      setter?.call(input, "curr");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect([...document.body.querySelectorAll("[data-search-result]")].map((item) => item.getAttribute("data-search-result"))).toEqual(["s1"]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(searchAgentSessions).toHaveBeenCalledWith(expect.objectContaining({ query: "curr" }));
    const results = [...document.body.querySelectorAll<HTMLButtonElement>("[data-search-result]")];
    expect(results.map((item) => item.getAttribute("data-search-result")).sort()).toEqual(["remote-1", "s1"]);

    act(() => {
      results.find((item) => item.getAttribute("data-search-result") === "remote-1")!.click();
    });
    expect(onOpenSession).toHaveBeenCalledWith("remote-1");
    expect(document.body.querySelector("input[aria-label='Search conversations']")).toBeNull();
  });

  it("hides archive and searches only loaded sessions for a source without them", async () => {
    vi.useFakeTimers();
    engine.capabilities = { ...engine.capabilities, archiveSessions: false, searchSessions: false };
    render(<AgentSessionExplorer onOpenSession={() => {}} />);

    expect(button("Archive session Quarterly review")).toBeNull();
    expect([...container.querySelectorAll("button")].some((item) => item.textContent === "Show more")).toBe(false);

    act(() => {
      button("Search conversations")!.click();
    });
    const input = document.body.querySelector<HTMLInputElement>("input[aria-label='Search conversations']")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    act(() => {
      setter?.call(input, "quarterly");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(searchAgentSessions).not.toHaveBeenCalled();
    expect(
      [...document.body.querySelectorAll("[data-search-result]")].map((item) => item.getAttribute("data-search-result")),
    ).toEqual(["s2"]);
  });
});
