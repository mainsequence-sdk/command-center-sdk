import { describe, expect, it } from "vitest";

import {
  agentSessionMatchesNavigationQuery,
  getAgentSessionNavigationHandleLabel,
  getAgentSessionNavigationTitle,
  groupAgentSessions,
  UNNAMED_AGENT_LABEL,
} from "./agent-session-groups.js";
import type { AgentSessionAgent, AgentSessionSummary } from "./agent-sessions.js";

function agent(uid: string, name: string, id: number | null = null): AgentSessionAgent {
  return {
    id,
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

function session(
  id: string,
  updatedAt: string,
  sessionAgent: AgentSessionAgent | null,
  overrides: Partial<AgentSessionSummary> = {},
): AgentSessionSummary {
  return {
    id,
    sessionName: null,
    title: `Title ${id}`,
    preview: null,
    runtimeSessionId: id,
    sessionKey: null,
    handleUniqueId: null,
    threadId: null,
    codeRepositoryBranchId: null,
    cwd: null,
    runtimeState: null,
    working: false,
    updatedAt,
    agent: sessionAgent,
    origin: null,
    isPlaceholder: false,
    ...overrides,
  };
}

describe("groupAgentSessions", () => {
  const analyst = agent("agent-a", "Analyst", 1);
  const builder = agent("agent-b", "Builder", 2);

  it("lists every catalog Agent, newest session first, sorted by name", () => {
    const groups = groupAgentSessions(
      [{ uid: "agent-b", id: 2, name: "Builder" }, { uid: "agent-c", name: "Curator" }],
      [
        session("s1", "2026-09-01T10:00:00Z", builder),
        session("s2", "2026-09-03T10:00:00Z", builder),
        session("s3", "2026-09-02T10:00:00Z", analyst),
      ],
    );

    expect(groups.map((group) => group.name)).toEqual(["Analyst", "Builder", "Curator"]);
    expect(groups[1]!.sessions.map((item) => item.id)).toEqual(["s2", "s1"]);
    expect(groups[2]!.sessions).toEqual([]);
    expect(groups[2]!.agentUid).toBe("agent-c");
    // An Agent known only from a session is a group of its own, with the session's uid.
    expect(groups[0]!.agent).toBeNull();
    expect(groups[0]!.agentUid).toBe("agent-a");
  });

  it("matches a session to a catalog Agent by any identity it carries", () => {
    const groups = groupAgentSessions(
      [{ uid: null, id: 1, name: "Analyst" }],
      [session("s1", "2026-09-01T10:00:00Z", analyst)],
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]!.sessions.map((item) => item.id)).toEqual(["s1"]);
    expect(groups[0]!.agentUid).toBe("agent-a");
  });

  it("groups sessions without an Agent under the unnamed label", () => {
    const groups = groupAgentSessions([], [session("s1", "2026-09-01T10:00:00Z", null)]);

    expect(groups.map((group) => group.name)).toEqual([UNNAMED_AGENT_LABEL]);
  });
});

describe("session navigation labels", () => {
  const analyst = agent("agent-a", "Analyst");

  it("prefers the session name, then a title that is not the Agent's name or the generated one", () => {
    expect(
      getAgentSessionNavigationTitle(
        session("s1", "2026-09-01T10:00:00Z", analyst, { sessionName: "Quarterly review" }),
      ),
    ).toBe("Quarterly review");
    expect(
      getAgentSessionNavigationTitle(session("s1", "2026-09-01T10:00:00Z", analyst, { title: "Analyst" })),
    ).toBe("Untitled session");
    expect(
      getAgentSessionNavigationTitle(
        session("s1", "2026-09-01T10:00:00Z", analyst, { title: "Agent session s1" }),
      ),
    ).toBe("Untitled session");
  });

  it("labels the handle and searches titles, previews, handles, and Agent names", () => {
    const item = session("s1", "2026-09-01T10:00:00Z", analyst, {
      handleUniqueId: "crm_assistant",
      preview: "Currency exposure",
    });

    expect(getAgentSessionNavigationHandleLabel(item)).toBe("h: crm_assistant");
    expect(agentSessionMatchesNavigationQuery(item, "currency")).toBe(true);
    expect(agentSessionMatchesNavigationQuery(item, "ANALYST")).toBe(true);
    expect(agentSessionMatchesNavigationQuery(item, "crm_")).toBe(true);
    expect(agentSessionMatchesNavigationQuery(item, "nothing")).toBe(false);
    expect(agentSessionMatchesNavigationQuery(item, "  ")).toBe(false);
  });
});
