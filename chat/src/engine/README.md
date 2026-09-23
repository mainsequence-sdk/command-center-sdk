# Session Engine

## Purpose

This directory owns the chat's session engine, `ChatEngineProvider`: everything between the
[backend connection](../backend/README.md) and the thread on screen.

- Choosing, starting, or opening the session for an Agent, including the default session behind a
  stable handle.
- Hydrating it: detail, insights, and history.
- Following runtime access and readiness
  ([ADR 093](../../docs/adr/adr-093-client-verified-agent-readiness.md)).
- The session's provider, model, and thinking, against the model catalog.
- Sending, cancelling, and the queue of messages written while the Agent works
  ([ADR 087](../../docs/adr/adr-087-queued-chat-messages-while-the-agent-works.md)).
- The session list: archive, restore, and delete.

The engine reads no environment variable, no router, and no application store, and it uses no
react-query. Everything it needs from the application arrives as inputs. The operational sequence,
the same for every Agent, is in [AgentSession Resolution](../../docs/agent-session-resolution.md).

## Inputs

`ChatEngineProviderProps`; the input types are in `types.ts`.

| Input | What it is |
| --- | --- |
| `connection` | The connection to the platform: base URL and request-URL rewrite. |
| `auth` | The person's token, token type, and user uid (`ChatAuth`). The token goes with every platform request. |
| `environmentUid` | The active Organization Environment. Session lists and detail are scoped by it. |
| `notify` | Shows the person a short notice (`ChatNotice`: title, description, variant), in place of a toaster. |
| `viewContext` | Sent with every chat request as its `context`. Opaque to the engine. |
| `isVisible` | Whether the chat is on screen. While it is not, the engine does not hydrate the session, read the latest sessions, check runtime access, open a launch target, or load the catalog (unless a session waits for a model choice). |
| `requestedSessionId` | The session the application asks to show, for example from its URL. |
| `avoidImplicitSessionSelection` | Start from nothing instead of resuming the newest session, unless one is requested. |
| `defaultSession` | The default session (`ChatDefaultSession`), below. |
| `showsDefaultSession` | Whether the surface on screen shows the default session. |
| `launchTarget` | An Agent to open once the chat is visible: its latest session, or a new one. A new `launchKey` opens it again. |
| `onRequestVisible` | Asks the application to put the chat on screen: when a session waits for a model choice, and after a session is opened for an Agent by id or launch target. |
| `onRequestedSessionRemoved` | Called when the requested session is archived, so the application can drop the request. |

## The Default Session

The default session is the session behind a stable handle for one Agent. The platform returns the
same session for the same person, Agent, and handle, so every visit continues the same
conversation. A standalone chat application opens its Agent this way; Command Center passes its
Agent shortcut (`command_center_shortcut`).

`ChatDefaultSession` carries the Agent (`agentUid`, null when none is configured), the handle
(`handleUniqueId`), the name the session gets when it is created (`name`), whether the
application's source for the Agent is ready (`status`), and the message shown when the session
cannot be opened (`unavailableMessage`).

While `showsDefaultSession` is true and no launched session is selected, the engine selects the
default session and no other. It shows a session it already has only when both the handle and the
Agent uid match, and it gets or creates the session once per person, Environment, Agent, and
handle. `defaultSessionStatus` is `idle`, `loading`, `missing`, `opening`, `ready`, or `error`
(with `defaultSessionError`); `retryDefaultSession()` asks again, and
`restoreDefaultSessionSelection()` leaves a launched session. The full rules are in
[AgentSession Resolution](../../docs/agent-session-resolution.md#the-default-session).

Session records mark the default session with `DEFAULT_SESSION_ORIGIN`. Its stored value is
`command_center_shortcut`, from before the engine left Command Center, so session lists saved by
earlier versions stay readable.

## Context and Hooks

- `ChatEngineProvider` mounts the engine around its children, together with `AgentIconsProvider`
  (the agent icon projection of the active Environment) and assistant-ui's
  `AssistantRuntimeProvider` with the engine's runtime, so assistant-ui's thread and composer
  primitives work in its children.
- `useChatEngine()` returns the engine's value, `ChatEngineValue`: the session list and the active
  session, its detail and summary, readiness, the runtime decision, the model catalog and the
  selection, the default session's status, the queue, the pending model choice, the connection it
  was given, and the actions. The package's [UI](../ui/README.md) reads it. It throws outside the
  provider.
- `useOptionalChatEngine()` returns the same value, or null outside the provider.
- `useChatRunStatus()` returns run progress: `runStatus`, `runStatusDetail`, `thinkingSummary`, and
  `hasVisibleAssistantOutput`. It is a separate context because the thinking summary changes on
  every reasoning chunk; only the components that render progress subscribe to it.

An application may layer its own fields over the engine's value. Command Center's `ChatProvider`
does, and its components read `useChatFeature()`.

## Modules

- `ChatEngineProvider.tsx`: the provider, its contexts, and the hooks.
- `types.ts`: `ChatAuth`, `ChatNotice`, `ChatNotify`, `ChatDefaultSession`,
  `DefaultSessionStatus`, and `ChatLaunchTarget`.
- `agent-sessions.ts`: session records (`AgentSessionRecord`), their normalization from the
  platform's records, the default-session marker, and the stored session list.
- `message-queue.ts`: the pure queue reducer, its limit of ten messages per session, the strip's
  wording, and the `sessionStorage` helpers (ADR 087).
- `session-model-fallback.ts`: `createSessionWithModelFallback`, which asks for a model when the
  platform refuses to create a session without one, and `createFreshSessionHandleId`.
- `session-model-default.ts`: `pickDefaultSessionModel`, the model the "choose a model" state
  offers first.
- `run-config-options.ts`: the model catalog store, below.
- `useLatestMessageDataStreamRuntime.ts`: the assistant-ui local runtime adapter. It sends only the
  newest user message, decodes `ui-message-stream`, rewrites the tool chunks of older Agent
  runtimes into the names the decoder reads, and reports stream chunks and errors to the engine.
- `message-actors.ts`: who a message is from (the viewer, another person, or an Agent), resolved
  from the provenance the platform's history stamps on each message, for the thread's avatars and
  names.
- `agent-icons-context.tsx` and `agent-icon-cache.ts`: the agent icon projection, one per
  Environment and trusted for five minutes, and the icon bytes cache, both cleared when the token
  goes (ADR 090).

## The Model Catalog Store

`useModelProviderCatalog` reads the platform's catalog (`GET /api/v1/model-providers/`), and
`useRunConfigOptions` projects it into the provider, model, and thinking options every picker
offers. The [model provider settings](../model-providers/README.md) read the same store. It is a
small module store:

- one entry per person, trusted for five minutes (`RUN_CONFIG_OPTIONS_STALE_MS`);
- one request at a time per person, retried twice, after one and two seconds;
- shared by every picker and settings screen on the page; each re-renders when the store changes.

`invalidateModelProviderCatalog()` drops every entry, so every mounted picker reads the catalog
again. Call it whenever the catalog changes: a provider signed in or out, a custom provider or
model created, edited, or deleted. The engine loads the catalog only while the chat is visible or
a session waits for a model choice; `requestAvailableModels()` reads it again at once.

## Browser Storage

| Storage | Key | Content |
| --- | --- | --- |
| `sessionStorage` | `main_sequence_ai.message_queue.{session}` | One session's queued messages (`id`, `text`, `createdAt`). Written on every change, removed when the queue empties, read when the session comes on screen. Rows read back after a reload are held. |
| `localStorage` | `ms.main-sequence-ai.agent-sessions:{user}:{environment}` | One person's session list in one Environment, as summaries: no messages, no serialized session, never `working`. Read when the person or the Environment changes, written when the list changes. |

A missing user or Environment is stored as `anonymous` or `no-environment`. A storage failure is
ignored; the state in memory is the truth. The keys and shapes are the ones Command Center stored
before the engine moved into the package.

## Dependencies

- `../backend/`: every platform and Agent runtime call.
- `../session-detail/`: the detail model and `useAgentSessionDetail`.
- `@assistant-ui/react` and `@assistant-ui/core`: the runtime provider and the local runtime the
  adapter builds on. `assistant-stream`: the stream decoder.
- `react`.

The boundary check (`../../scripts/check-boundary.mjs`) fails the build on any other dependency, an
`@/` import, an import that leaves the package, or an environment read.

## Maintenance Notes

- Keep Command Center out: the shortcut's handle and name, the rails, the route, the preferences,
  and the toaster arrive as inputs.
- Keep the storage keys and shapes, and the value of `DEFAULT_SESSION_ORIGIN`, stable. Changing them
  loses what people have stored.
- Keep run progress in `useChatRunStatus()`. In the engine's value it would re-render every
  consumer on every chunk.
- Completion handlers clean up the session that owns the run, not the one on screen.
- Every path that creates a session goes through `createSessionWithModelFallback`.
- Keep catalog loading independent of runtime access. Every screen that changes providers calls
  `invalidateModelProviderCatalog()`.
- Cancel a run before resetting the thread, and never reload history into a session whose answer
  is streaming.
- `ChatEngineProvider` has no component test of its own; the modules beside it are unit-tested.
