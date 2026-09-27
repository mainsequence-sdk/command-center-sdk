import type { AgentSessionSummary } from "./agent-sessions.js";

// How the session explorer groups the person's sessions under the Agents they belong to. Pure and
// framework-free, so the grouping is tested without a browser.

export const UNNAMED_AGENT_LABEL = "Unnamed agent";

/** An Agent the explorer lists, whether or not the person has a session with it. */
export interface AgentSessionExplorerAgent {
  uid: string | null;
  id?: number | null;
  agentUniqueId?: string | null;
  name: string;
}

export interface AgentSessionGroup {
  key: string;
  name: string;
  /** The Agent from the application's catalog; null for a group built from sessions alone. */
  agent: AgentSessionExplorerAgent | null;
  /** The Agent's uid, from the catalog or the sessions, for its icon and archived sessions. */
  agentUid: string | null;
  sessions: AgentSessionSummary[];
}

function getUpdatedAtTimestamp(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getNormalizedName(value: string) {
  return value.trim().toLocaleLowerCase();
}

function getAgentName(value: string | null | undefined) {
  return value?.trim() || UNNAMED_AGENT_LABEL;
}

function getCatalogAgentIdentityKeys(agent: AgentSessionExplorerAgent) {
  return [
    agent.uid?.trim() ? `agent-uid:${agent.uid.trim()}` : null,
    typeof agent.id === "number" && agent.id > 0 ? `agent-id:${agent.id}` : null,
    agent.agentUniqueId?.trim() ? `agent-unique-id:${agent.agentUniqueId.trim()}` : null,
  ].filter((value): value is string => Boolean(value));
}

function getSessionAgentIdentityKeys(session: AgentSessionSummary) {
  const agent = session.agent;
  if (!agent) {
    return [];
  }

  return [
    agent.uid?.trim() ? `agent-uid:${agent.uid.trim()}` : null,
    agent.id !== null ? `agent-id:${agent.id}` : null,
    agent.agentUniqueId.trim() ? `agent-unique-id:${agent.agentUniqueId.trim()}` : null,
  ].filter((value): value is string => Boolean(value));
}

function getFallbackAgentNameKey(value: string | null | undefined) {
  return `agent-name:${getNormalizedName(getAgentName(value))}`;
}

/** The session's name, else its title unless that only repeats the Agent or the generated id. */
export function getAgentSessionNavigationTitle(session: AgentSessionSummary) {
  const sessionName = session.sessionName?.trim();
  if (sessionName) {
    return sessionName;
  }

  const title = session.title.trim();
  const generatedFallbackTitle = `Agent session ${session.id}`;

  return title && title !== session.agent?.name?.trim() && title !== generatedFallbackTitle
    ? title
    : "Untitled session";
}

/** The session's stable handle, shown under its title. */
export function getAgentSessionNavigationHandleLabel(session: AgentSessionSummary) {
  const handleUniqueId = session.handleUniqueId?.trim();
  return handleUniqueId ? `h: ${handleUniqueId}` : null;
}

export function agentSessionMatchesNavigationQuery(session: AgentSessionSummary, query: string) {
  const normalizedQuery = getNormalizedName(query);
  if (!normalizedQuery) {
    return false;
  }

  return [
    getAgentSessionNavigationTitle(session),
    session.sessionName,
    session.title,
    session.preview,
    session.handleUniqueId,
    session.agent?.name,
  ].some((value) => typeof value === "string" && getNormalizedName(value).includes(normalizedQuery));
}

/**
 * One group per Agent, sorted by name: every catalog Agent, even without sessions, then any Agent
 * that appears only on a session. Sessions are newest first within their group.
 */
export function groupAgentSessions(
  agents: readonly AgentSessionExplorerAgent[],
  sessions: readonly AgentSessionSummary[],
): AgentSessionGroup[] {
  const groups: AgentSessionGroup[] = [];
  const groupsByAgentIdentity = new Map<string, AgentSessionGroup>();
  const sortedSessions = [...sessions].sort(
    (left, right) => getUpdatedAtTimestamp(right.updatedAt) - getUpdatedAtTimestamp(left.updatedAt),
  );

  agents.forEach((agent) => {
    const agentName = getAgentName(agent.name);
    const identityKeys = getCatalogAgentIdentityKeys(agent);
    const groupKey = identityKeys[0] ?? getFallbackAgentNameKey(agentName);

    if (identityKeys.some((identityKey) => groupsByAgentIdentity.has(identityKey))) {
      return;
    }

    const group: AgentSessionGroup = {
      key: groupKey,
      name: agentName,
      agent,
      agentUid: agent.uid?.trim() || null,
      sessions: [],
    };

    groups.push(group);
    (identityKeys.length > 0 ? identityKeys : [groupKey]).forEach((identityKey) => {
      if (!groupsByAgentIdentity.has(identityKey)) {
        groupsByAgentIdentity.set(identityKey, group);
      }
    });
  });

  sortedSessions.forEach((session) => {
    const agentName = getAgentName(session.agent?.name);
    const identityKeys = getSessionAgentIdentityKeys(session);
    const groupKey = identityKeys[0] ?? getFallbackAgentNameKey(agentName);
    const existingGroup = identityKeys
      .map((identityKey) => groupsByAgentIdentity.get(identityKey))
      .find((group): group is AgentSessionGroup => Boolean(group));

    if (existingGroup) {
      existingGroup.sessions.push(session);
      existingGroup.agentUid ??= session.agent?.uid?.trim() || null;
      return;
    }

    const fallbackGroup: AgentSessionGroup = {
      key: groupKey,
      name: agentName,
      agent: null,
      agentUid: session.agent?.uid?.trim() || null,
      sessions: [session],
    };

    groups.push(fallbackGroup);
    (identityKeys.length > 0 ? identityKeys : [groupKey]).forEach((identityKey) => {
      if (!groupsByAgentIdentity.has(identityKey)) {
        groupsByAgentIdentity.set(identityKey, fallbackGroup);
      }
    });
  });

  return groups.sort((left, right) => left.name.localeCompare(right.name));
}
