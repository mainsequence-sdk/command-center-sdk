# ADR 060: Main Sequence AI Session-Backed Chat Request Contract

- Status: Accepted
- Date: 2026-05-06
- Amended: 2026-09-17: the request carries no Agent type and no workflow key
- Related:
  - [AgentSession Resolution](../agent-session-resolution.md), for the readiness gate. The separate
    "AgentSession Interaction Readiness Gate" ADR was removed from the tree; its history is in Git.
  - [ADR 098: One Communication Contract for Every Agent](./adr-098-one-communication-contract-for-every-agent.md)

## Context

`Main Sequence AI` currently builds live `/api/chat` requests from a mixed client-side envelope:

- user message content
- local thread identifiers
- `agentName`
- `sessionId`
- `runtime_session_id`
- `sessionMetadata.workflow_key`
- optional top-level `model`

The current `model` field is resolved from the runtime catalog at send time. That creates two
problems:

1. the request can be built before model resolution is complete, so `/api/chat` is sent without a
   `model`
2. the request duplicates data that already belongs to the backend `AgentSession`, especially
   `llm_provider` and `llm_model`

At the same time, the page already loads the canonical backend session detail serializer through:

- `GET /api/v1/agent-sessions/{agent_session_id}/`

That payload is the authoritative session shape for chat configuration, and it is already part of
the readiness gate before the composer becomes interactive.

When the user changes provider/model in Command Center, the UI already persists that change through:

- `PATCH /api/v1/agent-sessions/{agent_session_id}/`

However, the live `/api/chat` request still sends a separate top-level `model` object instead of
using the session data that Main Sequence already owns.

Separately, runtime model discovery is currently shared by user + agent request name. That catalog
is not session-specific enough to justify constant reloads during session churn.

## Decision

### 1. Available-model discovery cache is 15 minutes

The shared `/api/chat/get_available_models` cache will use:

- key: `user id + agent request name`
- TTL: `15 minutes`

The cache remains a Command Center in-memory optimization. It is not a persisted backend contract.

### 2. The loaded AgentSession serializer becomes the authoritative chat-config payload

For session-bound `/api/chat` requests, Command Center will stop treating the top-level `model`
object as the source of truth.

Instead, each live request will include the full canonical session serializer payload loaded from:

- `GET /api/v1/agent-sessions/{agent_session_id}/`

under a dedicated top-level `session` field.

This `session` object is the exact backend-owned session shape that Command Center already hydrated
for the selected session. Command Center must not reconstruct a smaller ad hoc model/config object
for runtime sends.

### 3. Live `/api/chat` requests do not send top-level `model`

For session-bound chat sends:

- do not send the top-level `model` key
- do not depend on runtime-catalog resolution to build the send payload
- read model/provider from the serialized `session` object instead

Model discovery still matters for the picker UI, but not for the per-message request contract.

### 4. Model changes update Main Sequence first, then the injected local session snapshot

When the user changes provider/model in Command Center:

1. update the backend session through
   `PATCH /api/v1/agent-sessions/{agent_session_id}/`
2. update the in-memory selected-session snapshot
3. update the local persisted session snapshot used for later hydration
4. use that updated serialized `session` payload in all subsequent `/api/chat` requests

Command Center should not keep a separate long-lived request-model object that can drift away from
the session persisted in Main Sequence.

### 5. Send stays blocked until the canonical session snapshot exists

Because `/api/chat` will now depend on the loaded session serializer rather than a locally derived
top-level model object, the composer must stay non-interactive until Command Center has:

- selected a concrete backend `AgentSession`
- loaded its detail serializer successfully
- stored the canonical session snapshot that will be injected into the send payload

## Scope

This ADR covers:

- session-bound `/api/chat` request shape
- model/provider ownership for live assistant sends
- local session persistence requirements for the injected session snapshot
- available-model cache lifetime for the shared picker catalog

It does not cover:

- global settings runtime access
- non-session settings screens
- assistant-runtime history or tools response shapes
- model-provider authentication flows

## Design

### 1. Single source of truth for session config

The backend `AgentSession` serializer becomes the source of truth for:

- `llm_provider`
- `llm_model`
- agent identity already attached to the session
- any other session-owned runtime configuration that Main Sequence wants the runtime to inspect

Command Center should keep using lighter local session summaries for list rendering, but the send
path must inject the canonical detail payload.

### 2. Request assembly rule

The live request body keeps the existing message envelope fields that are still needed for thread
execution, but it adds the canonical session payload and removes the top-level `model` object.

The intended contract shape is:

```json
{
  "messages": [...],
  "tools": {},
  "threadId": "...",
  "parentId": "...",
  "sessionId": "...",
  "runtime_session_id": "...",
  "session": {
    "...": "verbatim AgentSession detail serializer payload"
  },
  "context": {
    "...": "surface context"
  }
}
```

The `session` field is authoritative for model/provider and any other session-owned runtime
configuration. The runtime must not require a parallel top-level `model` override for this path.

### 3. Session persistence rule

Command Center local storage may continue storing a lighter session-summary list for explorer
behavior, but it also needs a canonical per-session detail snapshot for the currently selected
session if that snapshot is what `/api/chat` injects.

This is a frontend persistence change only. It does not change how Main Sequence stores
`AgentSession`s.

### 4. PATCH and local mirror must stay aligned

If the user changes provider/model:

- a successful PATCH response means the local injected session snapshot must be updated immediately
- a failed PATCH means Command Center should keep using the previously known-good session snapshot
  and show the update error

This avoids a state where the runtime receives a session payload that Command Center never actually
persisted in Main Sequence.

### 5. Cache lifetime is intentionally longer than a single session view

The available-model catalog is a picker concern, not a per-message transport dependency. A 15-minute
TTL is acceptable because:

- the cache is already scoped by user + agent request name
- the request no longer blocks send-payload completeness once the session serializer is
  authoritative
- model-picker churn should not repeatedly hammer the agent runtime for the same catalog

## Consequences

### Positive

- `/api/chat` no longer races model resolution just to include a top-level `model`
- session-owned config is read from the same serializer Main Sequence already persists
- model changes stay aligned between Main Sequence, local session storage, and later chat sends
- runtime catalog fetch pressure drops because the shared cache stays warm for 15 minutes

### Negative

- the `/api/chat` payload becomes larger because it carries the full session serializer
- Command Center must preserve a canonical session-detail snapshot, not only a lightweight summary

## Backend Contract Impact

No new Main Sequence ORM contract is introduced here.

This ADR assumes the agent runtime session-bound chat path already supports a top-level `session`
payload containing the canonical `AgentSession` serializer and does not require a parallel
top-level `model` object for that path.

## Amendment 2026-09-17: No Agent Type in the Request

The platform no longer has an Agent type, and the Agent runtime never read one. The request
builder used to require a non-empty `agentType` and copied it into `sessionMetadata.workflow_key`;
once the platform stopped serializing `agent_type`, every send failed locally with "Agent session
requests require a non-empty agent type." before any request left the browser.

The live request body therefore carries neither `agentType` nor `sessionMetadata`. The Agent is
identified by the session: `runtime_session_uid` plus the canonical `session` payload. The
`agent_type` record field, the `requestAgentType` session field, and the `activeAgentType` /
`activeRequestAgentType` context values are removed with it.
