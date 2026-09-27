# ADR 099: Local Agents Through the Same Engine

- Status: Accepted
- Date: 2026-09-27
- Implemented: 2026-09-27 (Command Center AI and the Command Center SDK); the `ms-tau-sdk`
  prerequisites are [ms-tau-sdk#47](https://github.com/mainsequence-sdk/ms-tau-sdk/issues/47)
- Owners: Command Center AI, with the Main Sequence TAU SDK (`ms-tau-sdk`) for the runtime prerequisites
- Related:
  - [ADR 060: Session-Backed Chat Request Contract](./adr-060-session-backed-chat-request-contract.md)
  - [ADR 093: Client-Verified Agent Readiness](./adr-093-client-verified-agent-readiness.md)
  - [ADR 096: The Chat as One Independent Package](./adr-096-independent-chat-package.md)
  - [ADR 098: One Communication Contract for Every Agent](./adr-098-one-communication-contract-for-every-agent.md)
  - SDK ADR 014: local platform requests through `platformRequestProxy()`
  - `ms-tau-sdk` ADR 0005 (authenticated local development), ADR 0008 (Tau Board), ADR 0017 (local
    conversation discovery)

## Context

### The gap

Command Center AI can only reach an Agent through the platform. ADR 098 fixes the sequence: select
or create an AgentSession, hydrate its detail and history, call `resolve-runtime-access`, follow
`runtime_interaction`, and only then send to the returned `rpc_url`. Every step before the last is
a platform route, and `ChatEngineProvider` requires a platform `environmentUid`, an Agent uid for
the default session, and an `auth.userUid`.

A developer who runs an Agent on their own machine with `ms-tau` (`TAU_LOCAL_MODE=true`) has an
Agent runtime and nothing else: no platform Agent, AgentSession, Environment, or runtime-access
decision. So the package cannot talk to it, and an application that wants its assistant during
local development writes a second chat.

This happened. The Main Sequence CRM (its ADR 0004, "Tau local mode has no platform Agent or
AgentSession ... local chat needs its own transport rather than invented identifiers") ships a
244-line `LocalAssistant` for local mode. It calls Tau's A2A `message:send`, blocks until the whole
answer arrives, and draws it as plain text in a `<span>`. It has no streaming, no markdown, no
reasoning or tool calls, no Enter to send, no queue, no readiness, no Stop, no model picker, no run
status, no view context, and none of the rail's look. The same application in platform mode uses
`ChatThread` and has all of them. The person sees two different assistants for the same Agent, and
every application that wants local development will repeat the work.

### What a local Tau runtime already offers

Platform-hosted Main Sequence Agents are `ms-tau-sdk` runtimes, and Command Center's stream is
their `POST /api/chat` (the encoder, `ms_tau_sdk/protocols/assistant_ui.py`, names Command Center as
its consumer). The same application runs locally, with these routes (`ms_tau_sdk/api/`):

| Route | Local mode | What the chat needs it for |
| --- | --- | --- |
| `GET /api/chat` | Yes | ADR 093's readiness probe. |
| `POST /api/chat` | Yes; `sessionUid` optional, the effective id returned in `X-Agent-Session-Uid` | The live answer as `ui-message-stream`: text, reasoning, tool calls with results, lifecycle, and errors, in the decoder vocabulary the engine already reads (`text-delta`, `tool-call-start`, `tool-result`). The request model allows extra fields and reads `runtime_session_uid`, so the engine's current body is accepted. |
| `POST /api/chat/session/cancel` | Yes | Stop. |
| `GET` / `PUT /api/chat/session-model` | `PUT` only in local mode | The session's provider, model, and thinking level: the model picker. |
| `GET /api/chat/model-providers` | Local only | The provider list, proxied from the platform with the developer's credential. |
| `GET /ready`, `GET /health` | Yes | Runtime readiness and `mode: "local"`. |
| `GET /api/local/v1/conversations`, `/{contextId}/messages` | Local only | A conversation list and reload-safe history, but only for A2A `message:send` conversations, text only. |
| A2A `message:send` / `message:stream` | Yes | Text only: the stream forwards only text deltas, so reasoning and tool calls are lost. |

A local runtime has no inbound authentication: every caller acts as the developer whose JWT the
process holds, and a loopback bind is the only safeguard (`ms-tau-sdk` ADR 0017). Its CORS is off
by default and, when enabled, exposes no response headers, so a cross-origin browser cannot read
`X-Agent-Session-Uid`. Tau Board, the SDK's own browser client, never calls Tau cross-origin: it
uses a same-origin allowlisted proxy that checks `Origin` on mutations (`ms-tau-sdk` ADR 0008).

### What is missing on each side

- **Command Center AI** has no way to send to a runtime without the platform's session and
  runtime-access steps, and no seam where sessions, history, the model catalog, readiness, and
  cancel could come from somewhere else.
- **`ms-tau-sdk`** does not record `/api/chat` turns in the local conversation projection and has
  no route to read an `/api/chat` session back. A local conversation over the chat stream is live
  only: a reload loses it. The local conversation list and history exist only for A2A, as text.
- **The Command Center SDK** has `platformRequestProxy()` for the platform (SDK ADR 014) but no
  same-origin proxy for a local Agent runtime, so each application writes its own (the CRM's is a
  Vite `/tau` rewrite with no allowlist and no `Origin` check).

## Decision

### 1. One engine, two Agent sources

`ChatEngineProvider` gets an Agent source. The platform source is today's behaviour, unchanged,
and stays the default. The local source is new:

```tsx
import { ChatEngineProvider, createLocalAgentSource } from "@dev-mainsequence/command-center-ai";

const localAgent = createLocalAgentSource({
  baseUrl: "/__agent__",          // same-origin, through the proxy of section 5
  displayName: "CRM assistant",
});

<ChatEngineProvider source={localAgent} isVisible={visible} notify={notify} viewContext={context}>
  <ChatRail title="CRM assistant" onClose={close} onExpand={expand}>
    <ChatThread surface="overlay" />
  </ChatRail>
</ChatEngineProvider>
```

With a local source the provider takes no `connection`, `auth`, `environmentUid`, or
`defaultSession`; the TypeScript props are a discriminated union, so the compiler refuses a mix.
Everything the person sees (`ChatThread`, `ChatComposer`, `ChatRail`, `ChatPageLayout`,
`AgentSessionExplorer`, `useChatComposerState()`, the queue, markdown, reasoning, and tool calls) is
the same component in both sources. Nothing branches on the source above the engine.

### 2. The engine talks to a source, not to platform routes

The seam is the engine's value. `ChatEngineProvider` mounts one of two engines that publish the same
`ChatEngineValue`: the platform engine, which is the existing code unchanged, and the local engine
(`LocalChatEngineProvider`), which calls only the runtime. Every component reads the value, so none
knows which engine is mounted. Two engines behind one value were chosen over one engine with an
internal source interface because the platform engine's session, readiness, and wake logic stays
byte-for-byte what 0.0.6 shipped, and the local engine reuses its pure parts: the stream adapter,
the history and catalog parsers, the request body builder, and the queue reducer. Each capability
maps as follows:

| Capability | Platform source (ADR 098, unchanged) | Local source |
| --- | --- | --- |
| Select or create a session | `get-or-create-session`, `start-new-session` | A client-generated session id; the runtime's canonical id from `X-Agent-Session-Uid` replaces it after the first answer. |
| Session list | `GET /api/v1/agent-sessions/` | The runtime's local session list (prerequisite, section 4). |
| History on reload | `GET .../history/` | The runtime's local session history (prerequisite, section 4). |
| Session detail in the request (ADR 060) | The canonical session record | None: the runtime owns the session's model. The body keeps `runtime_session_uid`, the newest message, the person, and `context`. |
| Admission | `resolve-runtime-access` and `runtime_interaction` | None: the runtime is admitted when `GET /ready` answers `ok`; ADR 093's `GET /api/chat` probe still runs. A runtime that does not answer is `unavailable`, never `waking`. |
| Send | `POST {rpc_url}/api/chat` with the runtime token | `POST {baseUrl}/api/chat`, same body, no token. |
| Stop | `POST {rpc_url}/api/chat/session/cancel` | `POST {baseUrl}/api/chat/session/cancel`. |
| Model picker | Model catalog and `PATCH` of the session | `GET /api/chat/model-providers`, `GET` / `PUT /api/chat/session-model`. |
| Provider sign-in and custom providers | Platform routes | Not offered: the local runtime uses the providers of the developer's platform account. `ModelProviderSettings` stays a platform screen. |
| Archive | Platform routes | Not offered; the explorer hides the action. |
| Insights (context usage) | `GET .../insights/` | Not offered; the footer hides. |
| Agent icon | Platform icon projection | The fallback icon. |
| Queue | Client-side (ADR 087) | Client-side, unchanged. |

A capability the local source does not offer is `false` in the value's `capabilities`
(`ChatEngineCapabilities`), and the UI hides it; it never shows a disabled control that cannot work.

### 3. The request contract is the one Agents already serve

The local source sends exactly the `POST /api/chat` request the runtime already accepts, and reads
exactly the `ui-message-stream` the thread already draws. It does not speak A2A for chat: A2A's
stream carries text only, so reasoning and tool calls would be lost, and a second decoder would
drift from the first. A2A stays the protocol between Agents, not between a person and an Agent.

### 4. Prerequisites in `ms-tau-sdk` (its own ADR)

Local mode is reload-safe only when the runtime can list and replay chat sessions. `ms-tau-sdk`
adds, in local mode:

1. **Chat sessions in the local projection.** Every `/api/chat` turn is recorded, as A2A
   `message:send` turns are today (ADR 0017).
2. **`GET /api/local/v1/chat-sessions?limit=&cursor=`**: `{sessions: [{sessionUid, title,
   messageCount, latestMessagePreview, createdAt, updatedAt, working}], nextCursor}`.
3. **`GET /api/local/v1/chat-sessions/{sessionUid}/history?limit=&beforeSequence=`**: the turns with
   their parts (text, reasoning, tool calls with results), in the shape the platform's history
   route returns, so the engine's history reader serves both sources.
4. **`GET /api/local/v1/agent`**: the Agent's display name, for the rail's title and the explorer's
   group, instead of each application reading its own agent card.

Until 1–3 ship, the local source is live-only: the conversation works with every feature, and a
reload starts a new one. The thread says so rather than showing an empty history. These routes are
requested in [ms-tau-sdk#47](https://github.com/mainsequence-sdk/ms-tau-sdk/issues/47), together
with the disconnect and CORS questions above.

A local session exists on the runtime only after its first turn, and `ms-tau` changes the model
only of an existing, idle session. So a new local conversation's first message uses the model the
runtime was started with (`TAU_LOCAL_MODEL`); the picker applies from the next one, and the chat
says so once.

### 5. A same-origin proxy from the Command Center SDK

The browser never calls a local runtime cross-origin. The SDK's `/vite` entry, next to
`platformRequestProxy()`, adds `localAgentProxy({ target: "http://127.0.0.1:8787", path:
"/__agent__" })`. It shares `platformRequestProxy()`'s checks (this machine only, the page's own
origin only, no DNS rebinding) and adds:

- it forwards only the routes of section 2, rejecting everything else, including the runtime's
  inspection and internal routes;
- it refuses a mutating request whose `Origin` is not the dev server's;
- it strips `Authorization`, cookies, and `X-Caller-*` headers, so the page cannot impersonate a
  caller;
- it passes `X-Agent-Session-Uid` through and streams the answer as it arrives;
- it refuses a target that is not an `http` origin on this machine;
- it exists only under `vite serve`. A production build has no local source route, and the package
  refuses a local source whose `baseUrl` is not same-origin.

This replaces each application's hand-written `/tau` rewrite.

### 6. Applications choose the source; the package does not guess

The application decides which source to mount, as the CRM decides today from its bootstrap
(`runtime.mode`). The package never probes for a local runtime by itself and never falls back from
one source to the other: an unavailable local runtime shows the thread's unavailable state with the
runtime's address, not the platform's.

## Consequences

- One assistant everywhere. Local development shows the same rail, page, thread, markdown,
  reasoning, tool calls, queue, readiness, Stop, and model picker as the deployed application.
  The CRM deletes `LocalAssistant.tsx`, `local-tau.ts`, and `local-tau-history.ts`.
- The engine gains a seam it lacked: platform routes are no longer called from the engine's body.
  The platform source must keep ADR 060, 087, 093, and 098 behaviour exactly; its tests move with
  it unchanged.
- The package's public API grows additively: `createLocalAgentSource`, the `source` prop, and the
  local source's types. Existing applications change nothing.
- Local mode inherits the runtime's trust model: whoever reaches the proxy acts as the developer.
  The proxy's allowlist, `Origin` check, dev-server-only scope, and loopback target are the
  controls, and they are documented as such.
- Until `ms-tau-sdk` ships section 4, local conversations do not survive a reload.

## Rejected Alternatives

- **Invent platform identifiers for local mode.** Rejected by the CRM's ADR 0004 and here: fake
  AgentSessions would leak into platform calls and lie about ownership.
- **Speak A2A from the browser.** Its stream is text only; reasoning and tool calls, which the
  thread draws, would be lost, and the package would carry a second decoder.
- **Export `MarkdownContent` and let applications keep their own local chat.** It fixes the
  markdown and nothing else, and every application still writes its own chat.
- **Call the local runtime cross-origin with CORS.** The runtime has no inbound authentication, does
  not expose `X-Agent-Session-Uid`, and Tau Board already chose a same-origin proxy for the same
  reasons.

## Backend and Storage Impact

- No platform route or payload changes. The platform source is unchanged.
- `ms-tau-sdk` adds the local routes of section 4, local mode only, with its own ADR and release.
  The `/api/chat` request and stream are unchanged.
- Browser storage: the local source keeps its selected session under a new key,
  `ms.command-center-ai.local-session:<baseUrl>`, and stores no transcript; the runtime owns it.
  The platform keys are unchanged.
- The Command Center SDK adds `localAgentProxy()` to `/vite` (additive).

## Rollout

1. Command Center SDK: `localAgentProxy()` in `/vite`, released with its tests.
2. Command Center AI: the local engine behind `ChatEngineProvider`, `createLocalAgentSource`, and
   `capabilities`, released. The platform engine is unchanged, so no separate seam-only release was
   needed. Without `ms-tau-sdk#47` the local source is live-only.
3. `ms-tau-sdk`: [#47](https://github.com/mainsequence-sdk/ms-tau-sdk/issues/47), released; the
   local source then lists and replays sessions with no change of its own, because it already
   calls those routes and falls back when they answer 404.
4. The CRM replaces `LocalAssistant` with `ChatEngineProvider source={createLocalAgentSource(...)}`
   and `localAgentProxy()` in place of its `/tau` rewrite.

## Verification Invariants

- With a local source, the engine makes no request to a platform route.
- With the platform source, the engine's requests are byte-for-byte those of 0.0.6.
- The same `ui-message-stream` fixture renders identically from both sources.
- The package's scripted stand-in serves a local runtime too (`standalone/stand-in/local-runtime.ts`),
  and `standalone/LocalAgent.client.test.tsx` runs the thread against it: streaming with reasoning
  and tool calls, the canonical session id, reload, live-only, unavailable, Stop, and the model.
- A local source whose `baseUrl` is cross-origin is refused.
- `localAgentProxy()` rejects a route outside its allowlist and a mutation from another origin.
- No component above the engine reads which source is mounted, except through the capabilities it
  offers.
