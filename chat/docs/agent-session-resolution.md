# AgentSession Resolution

## Scope

This document defines how the chat engine, `ChatEngineProvider`, chooses an AgentSession, hydrates
it, resolves runtime access, and enables sending. The same contract applies to every Agent
([ADR 098](./adr/adr-098-one-communication-contract-for-every-agent.md)). The engine's inputs and
the values it exposes are listed in its [README](../src/engine/README.md).

The former special orchestrator and coding-agent service bootstrap paths are retired. The chat does
not list, deploy, poll, patch, or delete coding-agent services and does not load coding-agent
deployment defaults.

Command Center fills the engine's inputs with its Agent shortcut and its `?session=` route; that
half is in
[Main Sequence AI AgentSession Resolution](../../../docs/extensions/main-sequence-ai-agent-session-resolution.md).

## Identities

Keep these identities separate:

- Organization Environment: the active application scope, the engine's `environmentUid`.
- Agent: a platform Agent visible in that Environment.
- AgentSession: the concrete conversation identity.
- Runtime access: the transient endpoint and token issued for one AgentSession.
- Default session: the AgentSession behind a stable handle for one Agent, described by the
  engine's `defaultSession`. The platform returns the same session for the same person, Agent, and
  handle.

Agent names and types are presentation metadata. They do not select a transport or runtime flow.

## Choosing the Session

The engine shows one session at a time. Its inputs decide which:

- `requestedSessionId`: that exact session.
- `defaultSession`, while `showsDefaultSession` is true: the default session, and no other except
  a launched session.
- `launchTarget`: the Agent's latest session, or a new one when it has none. It opens once the chat
  is visible, and again whenever `launchKey` changes.
- Otherwise, the newest of the person's latest sessions in the Environment, unless
  `avoidImplicitSessionSelection` is set. Then nothing is selected until a session is requested,
  started, or opened.

Sessions are also started or opened on request: `startAgentSession`, `startAgentSessionById`,
`openLatestOrStartAgentSessionById`, and `createAgentSession`. A session opened for an Agent by
`launchTarget`, `startAgentSessionById`, or `openLatestOrStartAgentSessionById` is a launched
session (`isDirectLaunchSession`) until the selection changes. Whatever selected a session, its
hydration and runtime flow is the same.

### A Requested Session

The engine selects a requested session at once. If it is not in the latest-sessions list, the
engine fetches its detail directly and adds it to the list. A session that loads is never replaced
by the newest one. If it cannot be loaded, the engine selects the newest session and sets the
notice "The session referenced by this link is unavailable." with the reason.

When the requested session is archived, the engine calls `onRequestedSessionRemoved`, so the
application can drop the request.

### The Default Session

`defaultSession` names the Agent (`agentUid`), the stable handle (`handleUniqueId`), the name the
session gets when it is created (`name`), whether the application's source for the Agent is ready
(`status`), and the message shown when the session cannot be opened (`unavailableMessage`).

While `showsDefaultSession` is true and no launched session is selected:

1. The engine keeps the default session selected and replaces any other selection with it, a
   requested session included. The latest-sessions list never places another session there, not
   even while the handle resolves.
2. While `status` is `loading` or `error`, or no Environment is active, nothing is selected. With no
   `agentUid`, nothing is selected and no session or runtime request is made.
3. A session already in the list is shown at once, but only when both the handle and the Agent uid
   match, so a change of Agent or Environment cannot keep the wrong session.
4. Once per person, Environment, Agent, and handle, the engine calls:

   ```http
   POST /api/v1/agents/{agent_uid}/sessions/get-or-create-session/
   ```

   with `handle_unique_id` and `name` from `defaultSession`, and selects the session it returns.
   `retryDefaultSession()` asks again.

`defaultSessionStatus` says where it stands: `idle` (the surface does not show the default
session), `loading`, `missing`, `opening`, `ready`, or `error`, with `defaultSessionError`.
`restoreDefaultSessionSelection()` leaves a launched session and selects the default session again.

### When the Agent Has No Default Model

Two different things carry the word "model", and this flow is about the first:

- **Session model settings**: the provider, model and thinking stored on one AgentSession
  (`llm_provider`, `llm_model`, `llm_thinking`). The chat's picker edits them, and so can an
  application's own editors; all of them resolve a choice with `resolveRunConfigSelection`
  (`src/backend/run-config-selection.ts`).
- **Model provider settings**: which providers the person has connected and signed in to. They
  decide what the catalog offers; they are not chosen per session, and this flow never sends the
  person there to pick a model.

An Agent may carry no default provider and model. The platform then refuses to create a session unless
the request names them: HTTP 400 with `llm_provider` and/or `llm_model` reported as required. The
API layer turns exactly that response into `AgentSessionModelRequiredError`; every other failure
stays a plain error.

Every path that creates a session runs through `createSessionWithModelFallback`
(`src/engine/session-model-fallback.ts`):

1. Create the session the normal way.
2. Only on `AgentSessionModelRequiredError`, the engine sets `sessionModelSelectionRequest`, and the
   chat shows its "choose a model" state in place of the thread, with the same provider, model and
   thinking picker the composer uses. It starts from the most recent session's model that can
   still run (`pickDefaultSessionModel` over `sessionModelLastUsed`). If the chat is not visible,
   the engine calls `onRequestVisible`. The catalog is loaded for this state even while the chat is
   not hydrated. The choice is local to that state, so it never patches a session that is already
   open.
3. `resolveSessionModelSelection(choice)` creates the session again with the chosen `llm_provider`,
   `llm_model` and `llm_thinking`. The new session stores exactly what the picker showed, so the
   composer's picker reconciles to the same values when the session opens and no later patch is
   needed.

The default session retries on its own handle, so the chosen model is bound to that handle's
session. The plain `start-new-session` endpoint cannot carry a model, so the other creation paths
retry through get-or-create with a fresh handle (`createFreshSessionHandleId`). A second refusal is
not retried. Cancelling (`cancelSessionModelSelection()`) is a choice, not a failure: no error
notice. For the default session it leaves `defaultSessionStatus` at `error` with
`SESSION_MODEL_NEEDED_MESSAGE`, and `retryDefaultSession()` asks again.

## Hydration

While the chat is visible (`isVisible`), the engine loads the selected session:

- the detail, `GET /api/v1/agent-sessions/{session_uid}/`, through `useAgentSessionDetail`
  ([session detail](../src/session-detail/README.md));
- the insights, `GET /api/v1/agent-sessions/{session_uid}/insights/`, once the detail has loaded;
- the history, `GET /api/v1/agent-sessions/{session_uid}/history/`, which replaces the thread.

The chat is ready (`activeSessionReadiness` is `ready`) when the detail and the history of the
selected session have loaded. Insights never gate the chat. A fresh session may return `404` for
history; treat that as an empty transcript. A detail refetch keeps a loaded session ready while it
runs. History is never reloaded into a session whose answer is streaming.

None of this is fetched while the chat is not visible.

## Runtime Access

For the selected session, while the chat is visible, the engine calls:

```http
POST /api/v1/agent-sessions/{session_uid}/resolve-runtime-access/
```

The returned `runtime_interaction` is the admission decision (`activeRuntimeInteraction`):

- `can_submit: true` enables sending.
- transient states such as checking, starting, waking, or updating lock the composer, keep the
  draft already written, and never send it on the user's behalf. The engine asks again after the
  backend's retry interval (two seconds when it gives none), paused while the page is hidden,
  until the decision is ready or terminal. A failed request backs off and keeps asking. Writing
  resumes when `can_submit` turns true.
- terminal blocked states display the backend notice, with its support reference when present, and
  keep sending disabled.

`runtime_presence` is progress and diagnostic data (`activeRuntimePresence`). It never overrides
`runtime_interaction`.

A `ready` decision is then confirmed with the Agent itself
([ADR 093](./adr/adr-093-client-verified-agent-readiness.md)), because the platform reports every
deployed Agent as ready whether or not it is running:

```http
GET {rpc_url}/api/chat
Authorization: Bearer {runtime token}
```

Any answer other than `502`, `503` or `504` means the Agent serves. No answer means it is still
starting: the decision becomes `waking`, the composer stays locked, and the engine asks again until
the Agent answers. That first request is also what starts an idle Agent. A newly selected session
stays `checking` (locked, no notice) until the first confirmation returns; if that request fails,
the notice says the chat is still checking and names the Agent.

A decision older than one minute is confirmed again when the chat comes back into view (locked and
silent until it is), when the page returns after being hidden for a minute or more, and when
`revalidateStaleRuntimeAccess()` is called, which the composer does when it takes focus.
`refreshActiveSessionRuntimeAccess()` asks once, at once, for a "Check again" action.

A launched session is not checked before its first send, and the latest-sessions list is not read
for it; a wake that the send starts is followed like any other.

## Sending

The engine sends through an assistant-ui local runtime (`useLatestMessageDataStreamRuntime`),
mounted with `AssistantRuntimeProvider`. Each request carries only the newest user message; the
platform owns the history.

Before a request leaves, the engine:

- refuses it unless the session is ready and its canonical detail payload has loaded;
- resolves runtime access again. The confirmation above is part of it (remembered for fifteen
  seconds), so a message is sent only to an Agent that just answered;
- builds the body of [ADR 060](./adr/adr-060-session-backed-chat-request-contract.md): the
  canonical `session`, `runtime_session_uid`, `threadId`, `user_uid`, the selected reasoning effort
  as `runConfig`, and the application's `viewContext` as `context`.

The request goes to `POST {rpc_url}/api/chat` with the runtime token, and the answer streams back
as `ui-message-stream`. It does not select a transport by Agent type.

A send that meets a transient decision is held (`requestThroughRuntimeWake`) while the engine
follows the start, and goes out once the Agent can take it. A terminal decision, a cancelled run,
or a start past its deadline fails it. A message request that fails at the network level is never
re-sent; when the Agent answered the check but the message could not reach it, the engine checks
the runtime again.

`cancelActiveSession()` stops the local run, clears the session's working state at once, and then
calls `POST {rpc_url}/api/chat/session/cancel`.

Messages written while the Agent works wait in the queue of
[ADR 087](./adr/adr-087-queued-chat-messages-while-the-agent-works.md); each one is sent as its own
turn after a clean finish.

## Shared States

The engine computes each state once, and every surface that mounts the chat renders the same
value, so two surfaces showing one session cannot disagree:

- `defaultSessionStatus` and `defaultSessionError`: where the default session stands.
- `activeSessionReadiness`: `idle` while the chat is not visible or nothing is selected on purpose,
  then `loading`, `ready`, `error`, or `not_found` for a session the platform does not have.
- `activeRuntimeInteraction` and `isAssistantRuntimeStarting`: the admission decision and whether
  it is transient.
- `sessionModelSelectionRequest`: a session waits for the person to choose a model.
- `sessionNotice`: a message about the selected session, such as an unavailable requested session.

The surfaces render them with these rules:

- while the application's source for the default Agent loads or the default session opens, show
  the connecting state, not an error;
- a missing default Agent is a calm configuration prerequisite, not a failure;
- session and runtime progress uses the connecting stage while no transcript is visible;
- an existing transcript remains readable while runtime access is transient;
- runtime notices and composer admission follow `activeRuntimeInteraction`.

In Command Center, `ChatThread` and `AgentConnectingState` render these states. They move into the
package with the chat UI (ADR 096, step 4).

## Model Catalog

Provider and model choices come directly from:

```http
GET /api/v1/model-providers/
```

Catalog loading is independent of AgentSession selection and runtime access. It does not create an
Agent or session and does not wake a runtime.

The engine reads the catalog through its own store (`src/engine/run-config-options.ts`): one entry
per person, trusted for five minutes, retried twice, and shared by every picker on the page. It
loads while the chat is visible or a session waits for a model. `invalidateModelProviderCatalog()`
drops every entry, so every mounted picker reads the catalog again; an application calls it when a
provider is signed in or out or a custom provider changes. `requestAvailableModels()` reads it again
at once.

The engine applies the session's stored provider and model to the picker once per session, stored
choice, and catalog. When the stored model is not in the catalog, it selects the first model of the
session's provider, or of the first provider, and notifies "Session model is not available".
Changing the provider, the model, or the thinking level of a ready session patches the session:

```http
PATCH /api/v1/agent-sessions/{session_uid}/
```

The picker updates at once and reverts, with a session notice, when the platform refuses.

## Environment

The engine keeps one session list per person and Environment. When the person or `environmentUid`
changes, it restores the stored list for the new pair, clears the selection and every runtime
decision, and cancels an open default-session request; the default session then opens for the new
Environment. Session list and detail requests carry `organization_environment_uid`, and
user-scoped lists also carry `created_by_user_uid`.

## Failure Rules

- Source for the default Agent failed (`defaultSession.status` is `error`): `defaultSessionStatus`
  is `error`; no session is selected.
- No default Agent: `missing`; no session or runtime request.
- Default session get-or-create failure: `error` with the platform's message or
  `unavailableMessage`; `retryDefaultSession()` asks again.
- Latest sessions failure: `latestSessionsError`; with nothing selected, readiness is an error.
- Requested session unavailable: the newest session is selected, with a notice.
- Session detail failure: keep the error owned by session readiness (`not_found` for a `404`).
- History failure: an error owned by session readiness, with the notice "Failed to rehydrate the
  selected AgentSession. Interaction is disabled until session history loads."
- Insights failure: kept on the detail snapshot (`insightsError`); it never blocks the chat.
- Session creation failure: a notice through `notify`. Cancelling the model choice is not a
  failure.
- Runtime transient state: poll according to backend policy while preserving the draft.
- Runtime terminal state: show the backend-owned notice and support reference when present.
- Catalog failure: `availableModelsError`, kept separate from session and runtime readiness; the
  chat disables model-dependent sending.

## Ownership

- `src/engine/ChatEngineProvider.tsx`: choosing the session, the default session, hydration,
  runtime access, sending, the model selection, and the queue.
- `src/engine/session-model-fallback.ts`: session creation when the Agent has no default model.
- `src/session-detail/useAgentSessionDetail.ts`: session detail and insights.
- `src/backend/agent-sessions-api.ts`: session list/detail and get-or-create transport.
- `src/backend/agent-session-runtime-access.ts`: runtime-access request and normalization.
- `src/backend/assistant-endpoint.ts`: runtime endpoint/token resolution and authenticated
  requests.
- `src/backend/agent-runtime-serving.ts`: the check that the Agent answers (ADR 093).

## Invariants

- Every Agent uses the same AgentSession and runtime-access contracts.
- The engine reads no router, no application store, and no environment variable; everything it
  needs arrives as inputs.
- The default session is reused only when both the handle and the Agent uid match.
- A missing default Agent never falls back to another Agent or a recent session.
- A surface that shows the default session shows no other session, except a launched one.
- `runtime_interaction` decides admission; `runtime_presence` never does.
- A message goes only to an Agent that just answered, and a message request that failed at the
  network level is never re-sent.
- No chat code calls retired coding-agent service or deployment-default endpoints.
