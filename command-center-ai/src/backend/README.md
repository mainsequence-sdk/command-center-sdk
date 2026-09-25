# Backend Connection

## Purpose

This directory owns the chat package's connection to the backend: the same platform Command Center
talks to. It holds the transport and endpoint helpers for agent sessions, runtime access and
readiness, the chat request, and model providers. UI state stays outside this directory.

Every Agent uses the same session-bound runtime contract. There is no Agent-type-specific runtime
bootstrap and no coding-agent service discovery layer.

See [ADR 096](../../docs/adr/adr-096-independent-chat-package.md) for the package and the routes it
calls, [ADR 098](../../docs/adr/adr-098-one-communication-contract-for-every-agent.md) for the
unified Agent decision, and [AgentSession Resolution](../../docs/agent-session-resolution.md) for
the end-to-end sequence.

## The Connection

`connection.ts` is the one input every client takes. The package reads no environment variable and
no configuration file; whoever mounts the chat builds a connection and passes it in:

```ts
const connection = createChatBackendConnection({
  apiBaseUrl: "https://api.example.com",
  rewriteRequestUrl: (url, target) => url.toString(),
  sendPlatformRequest: (request) => sendAsThePerson(request),
});
```

- `apiBaseUrl` is the platform API base URL, absolute.
- `rewriteRequestUrl` is optional. It receives the full URL the package is about to request and
  where the request is going (`"platform"` or `"agent-runtime"`), and returns the address the
  browser should request instead.
- `sendPlatformRequest` is optional and is how an application owns authentication. Every platform
  request goes to it as a standard `Request` without any credential (`platform-request.ts`
  removes the `Authorization` a client set), and its `Response` is used as it comes: the
  application adds the person's credential, renews it after a `401`, and sends the request again.
  Without it, clients send the `token` their caller passes. Requests to the Agent's runtime never
  go through it.

The rewrite exists because the platform API and the Agent's runtime answer browser requests only
from the origins on their allow-lists. An application served from another origin reaches them
through an address on its own origin that forwards the call, and the rewrite is where it says
which one. Command Center uses it for its development proxy, and the standalone application for
its own (`/__platform__`). The package never detects a
development build and never knows about a proxy.

Every request goes through the rewrite. `connection.test.ts` holds each client to that, and to
the sender when there is one, because one client
that skipped the rewrite would break an application that depends on it. The only request that does
not is the direct test turn to a custom provider's own endpoint, which must never pass through a
proxy.

## Entry Points

- `agent-session-runtime-access.ts` calls
  `POST /api/v1/agent-sessions/{session_uid}/resolve-runtime-access/` and normalizes the backend
  `runtime_interaction` and `runtime_presence` envelopes.
- `assistant-endpoint.ts` resolves a concrete session's runtime endpoint and bearer token, then
  owns consistent authorization refresh-and-retry behavior for runtime requests.
  `fetchVerifiedAgentSessionRuntimeAccess` is the access every caller uses: the platform decision
  plus the check that the Agent answers (ADR 093).
- `agent-runtime-serving.ts` is that check: one `GET {rpc_url}/api/chat` with the runtime token,
  the fifteen-second memo of an Agent that answered, the wake clock of one that does not, and the
  client-built `waking` and `checking` decisions.
- `runtime-interaction.ts` normalizes the backend admission decision and identifies transient
  states without deriving policy from diagnostics. `requestThroughRuntimeWake` holds a request
  that met a transient decision until the shared poller reports the Agent ready, then sends it.
- `agent-sessions-api.ts` owns AgentSession list/detail/archive/delete, managed session creation,
  and handle-based get-or-create transport.
- `agent-session-readiness.ts` defines the shared detail, insights, and history readiness model.
- `agent-session-request.ts` builds session-bound assistant request payloads (ADR 060).
- `session-history-api.ts`, `session-insights-api.ts`, and `session-cancel-api.ts` own their
  respective AgentSession operations. `session-history.ts`, `session-insights.ts`, and
  `message-provenance.ts` normalize what they return.
- `model-catalog-api.ts` reads the platform's canonical `/api/v1/model-providers/` catalog, and
  `run-config-selection.ts` resolves a provider, model, and thinking choice against it.
- `model-provider-auth-api.ts` and `custom-model-provider-api.ts` own provider authentication and
  Organization-scoped provider administration. `custom-model-provider-model-json.ts` reads and
  writes a custom model as JSON.
- `custom-model-direct-chat.ts` sends one stateless test turn straight from the browser to an
  Organization custom provider's OpenAI-compatible endpoint (`/chat/completions` or `/responses`)
  and parses the streamed reply. It is the only module here that does not talk to the platform or
  an Agent runtime: no Agent, AgentSession, runtime access, or platform JWT is involved.
- `command-center-agent-icons-api.ts` reads the agent icon projection and an icon's bytes
  (ADR 090).
- `tool-activity.ts`, `error-source.ts`, `http-error.ts`, and `user-scope.ts` are the shared
  helpers: tool activity labels, where an error came from, HTTP error text, and the user scope of
  a request. See [provider errors](../../docs/main-sequence-ai-provider-errors.md).

## Runtime Contract

Callers must provide a concrete AgentSession ID. Runtime resolution calls:

```text
POST /api/v1/agent-sessions/{session_uid}/resolve-runtime-access/
```

`mode: "token"` must include a usable `rpc_url` and token. `mode: "unavailable"` may omit both and
must preserve the backend detail and interaction decision. The frontend must use the returned URL
and token as one access bundle.

`runtime_interaction.can_submit` is the admission decision. Notice copy, severity, operation,
and retry timing are backend-owned. `runtime_presence` is diagnostic only.

One exception, ADR 093: the platform answers `ready` for every deployed Agent, idle or not, so a
`ready` is confirmed by asking the Agent itself. Until it answers, the access result carries a
client-built `waking` decision (`can_submit: false`) and every consumer waits as for a
platform-reported wake. Only a `ready` can be downgraded; a blocked or transient platform decision
is never upgraded or re-checked. A message request is sent only after a check succeeded and is
never re-sent after a network failure.

Runtime code must not read user preferences, discover services, or choose an Agent implicitly.
Whoever mounts the chat chooses the Agent and the session; after that every session uses this
exact runtime flow.

## Environment and Identity

AgentSession collection reads require `organization_environment_uid`. User-scoped chat catalogs
also include `created_by_user_uid`, and returned records are rejected if their serialized
Environment differs from the active Environment.

Handle-session requests send the Agent UID, handle, name, and optional run configuration. User
identity comes from authenticated backend context and must not be supplied by the frontend.

## Maintenance Notes

- Keep this directory free of assistant-ui hooks and presentation state.
- Every new client takes `connection` and builds its address with `resolvePlatformApiUrl` or
  `resolveRequestUrl`. Add it to `connection.test.ts`.
- Never read `import.meta.env`, a configuration file, or a host module here. The boundary check
  fails the build on it.
- Never add a configured endpoint fallback for a session-bound production runtime request. The
  Agent's runtime is reached only through the `rpc_url` the platform returns.
- Do not branch runtime resolution by Agent name or type.
- Do not reintroduce coding-agent service list/detail/deploy endpoints or deployment defaults.
- Keep transient polling driven by backend `retry_after_ms`, paused while the document is hidden,
  and stopped on ready or terminal state.
- Keep provider/model catalog loading independent of runtime access.
- `custom-model-direct-chat.ts` mirrors the request an Agent sends a custom provider
  (`stream: true`, `stream_options.include_usage`, `store: false`, `max_completion_tokens` or
  `max_output_tokens`, `reasoning_effort` with `off` omitted, API key as bearer unless an explicit
  `Authorization` header is configured) minus tools, so a passing test predicts agent execution.
  Update it when that request shape changes. It must never send the platform JWT or cookies
  (`credentials: "omit"`), log or persist caller-supplied secrets, or be routed through a proxy or
  the connection's rewrite: the endpoint has to be HTTPS (browsers block plain HTTP from an HTTPS
  page, loopback excepted) and must allow CORS from the application's origin. A browser cannot tell
  a CORS rejection from an unreachable host, so both surface as one `network` error stage.
- Treat a `404` history read for a fresh session as an empty transcript, not a failed session.
- Keep archived and active session queries explicitly scoped and UID-first.
