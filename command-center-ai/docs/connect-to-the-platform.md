# Connect the Chat to the Platform

The chat talks to two backends: the Main Sequence platform's API, for sessions, history, runtime
access, model providers, and agent icons; and the Agent runtime, for the chat request, the check
that the Agent answers, and cancel. This guide explains how a browser application reaches both.
Its agent skill is `connect-chat-to-the-platform`.

## The connection

```ts
import { createChatBackendConnection } from "@dev-mainsequence/command-center-ai";

const connection = createChatBackendConnection({
  apiBaseUrl: "https://platform.example.com",
  rewriteRequestUrl: (url, target) =>
    target === "platform" ? `/__platform__${url.pathname}${url.search}` : url.toString(),
});
```

- `apiBaseUrl` is the platform API's absolute `http` or `https` URL.
- `rewriteRequestUrl` is optional. It receives the full URL the chat is about to request and where
  the request is going, `platform` or `agent-runtime`, and returns the address the browser should
  request instead.

The package reads no environment variable and no configuration file; the application builds one
connection and passes it to `ChatEngineProvider` and `ModelProviderSettings`.

## Where requests go

| Backend | Requests | Credentials |
| --- | --- | --- |
| The platform API | Every route under `apiBaseUrl`: sessions, history, insights, runtime access, the model catalog and providers, agent icons | The person's token, from the engine's `auth` input |
| The Agent runtime | `POST` and `GET` on `{rpc_url}/api/chat`, and `POST {rpc_url}/api/chat/session/cancel` | The runtime token the platform issues with `rpc_url` for the session |
| A custom provider's own endpoint | Only the direct test conversation of the model provider settings | The provider key the person types; never the platform token |

The [backend connection README](../src/backend/README.md) and
[ADR 096](./adr/adr-096-independent-chat-package.md), section 3, list every route.

## Reaching them from another origin

The platform API and the Agent runtime answer browsers only from the origins on their allow-lists.
An application served from another origin has two ways to reach them: the platform adds its origin,
or the application forwards the calls through an address on its own origin. The package serves the
second: every request it makes passes through `rewriteRequestUrl`, including the icon URLs the
platform returns. The one exception is the direct test turn to a custom provider, which must never
go through a proxy. When to rewrite is the application's decision; the package does not detect a
development build or know about a proxy.

**In development**, the forwarder is the dev server's proxy. The standalone application's Vite
configuration forwards `/__platform__` to the platform:

```ts
server: {
  proxy: {
    "/__platform__": {
      target: "https://platform.example.com",
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/__platform__/, ""),
    },
  },
},
```

and its connection rewrites platform requests to that prefix (`standalone/connection.ts`).

**In production**, the forwarder is the site's own server on the same origin, for example the
site's FastAPI application, which passes platform requests on. Who the person is stays a
server-side decision; the Command Center SDK's
[static-site guide](https://github.com/mainsequence-sdk/command-center-sdk/blob/main/command-center-sdk/docs/static-site-embeds.md)
describes the identity sources of a site with its own FastAPI. Never accept a browser-supplied user
uid in place of it.

The Agent runtime is at the `rpc_url` the platform returns. A direct call works when the runtime
trusts the application's origin; otherwise the application forwards it too, from the
`agent-runtime` target.

## Tokens

- The application passes the person's current token in `auth`, and a new `auth` with the new token
  when it refreshes it. There is no refresh callback: the package never refreshes the person's
  token. With no token, the chat makes no platform request.
- A token never goes into a build variable, an environment file, the bundle, or browser storage.
  The standalone application keeps it in memory.
- The runtime token is the package's concern: it resolves runtime access for the session, sends that
  token only to the runtime, and on a `401` or `403` from the runtime resolves access again and
  retries once.

## Failure states

| What happens | What it means | What to do |
| --- | --- | --- |
| `401` or `403` from the platform | The token is missing, expired, or not allowed | Refresh the token in the application and pass the new one through `auth`. A `403` that persists is the platform's decision. |
| A network error on every platform request | The platform is unreachable, or the browser refused the request | Check the network panel. A CORS rejection looks exactly like an unreachable host to the page. |
| Requests to the platform's own origin from another origin | The rewrite or the forwarder is missing | Add the rewrite and the forwarder, or ask for the origin on the platform's allow-list. |
| The composer stays locked with a starting or waking notice | The Agent does not answer its check yet | Wait: the chat sends nothing on the person's behalf, keeps the draft, and unlocks when the Agent answers. |
| A notice that the session cannot take messages | The platform's runtime decision | Nothing in the application; the notice is the platform's. |

The readiness rules are [ADR 093](./adr/adr-093-client-verified-agent-readiness.md), and the whole
sequence from choosing the session to sending is
[AgentSession resolution](./agent-session-resolution.md).
