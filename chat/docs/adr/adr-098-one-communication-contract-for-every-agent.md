# ADR 098: One Communication Contract for Every Agent

- Status: Accepted
- Date: 2026-09-16
- Split: 2026-09-23: split out of ADR 092 when the chat's documentation moved into the chat
  package (ADR 096, section 7). The decisions are unchanged.
- Owners: Main Sequence AI and Command Center
- Related:
  - Command Center ADR 092: Environment Agent Shortcut and Unified Runtime,
    the rest of the original record: the shortcut preference, its blocking state, and the
    CodeRepository surfaces
  - [ADR 060: Main Sequence AI Session-Backed Chat Request Contract](./adr-060-session-backed-chat-request-contract.md)
  - [ADR 093: Client-Verified Agent Readiness](./adr-093-client-verified-agent-readiness.md)
  - [AgentSession Resolution](../agent-session-resolution.md)

## Context

Command Center previously treated one Agent type as a special orchestrator. The right rail first
discovered a user-scoped coding-agent service, polled service readiness, found the service's Agent,
and then created a special handle session. CodeRepository Agent screens used the same service
abstraction for discovery, configuration, deployment, patching, and deletion.

That model duplicated platform concepts now owned by the platform's Agent, AgentSession, release,
and runtime-access contracts. It also created incorrect frontend distinctions:

- Agent communication depended on an Agent type instead of a concrete AgentSession;
- CodeRepository Agent configuration was coupled to a removed compatibility API;
- frontend deployment controls implied ownership that now belongs to Agent/release workflows.

Every AgentSession already exposes the same runtime-access endpoint and backend-owned
`runtime_interaction` decision.

## Decision

### 1. All Agents use one communication contract

Command Center does not select transport, session creation, readiness, or send behavior by Agent
type or name. Every interaction follows the same sequence:

1. select or create a concrete AgentSession;
2. hydrate session detail, insights, and history;
3. call `POST /api/v1/agent-sessions/{session_uid}/resolve-runtime-access/`;
4. follow the returned `runtime_interaction` admission decision;
5. send to the returned `rpc_url` with the returned bearer token.

`runtime_presence` is diagnostic. It does not override `runtime_interaction.can_submit`. A
`ready` decision is additionally confirmed with the Agent itself while the platform cannot tell a
serving Agent from an idle one ([ADR 093](./adr-093-client-verified-agent-readiness.md)). The
platform no longer reports image drift, so the client carries no `image_drift` field, notice, or
banner (removed 2026-09-17).

### 2. Retire the compatibility service clients

The frontend removes the coding-agent service list, detail, deploy, patch, delete, and deployment-
defaults clients, along with their dialogs, controllers, polling hooks, types, tests, and active
documentation. No URL substitution or compatibility alias replaces them.

Historical decisions that made those contracts authoritative are removed from the active ADR tree,
as required by the repository ADR policy. Their history remains in Git.

## Consequences

- The platform presents Agents uniformly; Agent type remains descriptive metadata only.
- Runtime admission remains backend-owned and session-specific.

## Backend and Storage Impact

This decision does not introduce a new browser-storage or backend persistence shape.

The removed compatibility endpoints may be deleted independently by their backend owner once no
other supported clients depend on them. Command Center neither probes nor calls them.

## Verification Invariants

- Production sources contain no coding-agent service or deployment-default requests.
- Agent communication contains no Agent-type-specific branch.
