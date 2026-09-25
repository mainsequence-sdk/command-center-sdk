# Connect to the Platform

Command Center AI talks to two backends: the Main Sequence platform's API, for sessions, history, runtime
access, model providers, and agent icons; and the Agent runtime, for the chat request, the check
that the Agent answers, and cancel. This guide explains how a browser application reaches both.
Its agent skill is `connect-command-center-ai-to-the-platform`.

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
| The platform API | Every route under `apiBaseUrl`: sessions, history, insights, runtime access, the model catalog and providers, agent icons | The application's credential for the person, added by its `sendPlatformRequest` |
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

## Authentication

The application owns authentication: signing the person in, keeping and renewing their credential,
and what happens when they must sign in again. The package only sends requests.

Give the connection `sendPlatformRequest(request)`. The package hands it every platform request, a
standard `Request` without any credential, and uses the `Response` it returns as it comes. The
application adds the person's credential and, when the platform answers `401`, renews it and sends
the request again:

```ts
const connection = createChatBackendConnection({
  apiBaseUrl: "https://platform.example.com",
  async sendPlatformRequest(request) {
    // A request's body can be sent once, so the retry needs its own copy.
    const retry = request.clone();
    const response = await fetch(withCredential(request));
    if (response.status !== 401 || !(await renewCredential())) {
      return response;
    }
    return fetch(withCredential(retry));
  },
});
```

`withCredential` and `renewCredential` are the application's own, for example adding
`Authorization: Bearer <access token>` from its sign-in, and a refresh-token exchange.

- `auth` then carries only who is signed in: `{ userUid }`.
- The Agent runtime never sees the application's credential. Its requests carry the runtime token
  the platform issues for the session; on a `401` or `403` from the runtime the package resolves
  runtime access again, through the sender, and retries once.
- Without a sender, the package's clients send `auth.token` themselves, and nothing can renew it:
  an expired token stops the chat until the application passes a new `auth`.
- A credential never goes into a build variable, an environment file, the bundle, or browser
  storage. The standalone application keeps its token in memory.

### Inside an application embedded in Command Center

An application embedded in Command Center holds no platform credential. Its host sends its platform
requests as the person: the SDK's static-site client passes each request to Command Center, which
sends it with its own credential and renewal and returns the response. Give the connection the
client's sender. The base URL only builds the request paths, which the host sends to its platform:

```ts
const connection = createChatBackendConnection({
  apiBaseUrl: window.location.origin,
  sendPlatformRequest: (request) => client.sendPlatformRequest(request),
});
```

`client.sendPlatformRequest` first shipped in Command Center SDK 0.5.5. Command Center AI accepts
older SDK versions, so an embedded application needs SDK `^0.5.5`: upgrade an older one.

`client` is the application's `createStaticSiteIframeClient(...)`, and `auth` is `{ userUid }` with
the person's uid from the host's context. The host decides which platform paths it sends; the
Command Center SDK's
[static-site guide](https://github.com/mainsequence-sdk/command-center-sdk/blob/main/command-center-sdk/docs/static-site-embeds.md)
describes the bridge. The Agent's live reply goes straight to the Agent runtime with the session's
runtime token, which works when the runtime accepts the application's origin.

### In local development

Build for the embedded path above: it is how the application runs deployed. A top-level page under
`vite serve` has no host, so during local development only, the Command Center SDK's Vite plugin
sends the platform requests with the developer's token (SDK `^0.5.6`). The dev server reads the
token from its environment; the page never holds it:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { platformRequestProxy } from "@dev-mainsequence/command-center-sdk/vite";

export default defineConfig({ plugins: [react(), platformRequestProxy()] });
```

```bash
export MAINSEQUENCE_ENDPOINT="https://your-platform.example"
export MAINSEQUENCE_ACCESS_TOKEN="<runtime access token>"
npm run dev
```

The sender uses the dev server only under `vite serve` on a top-level page. A production build
replaces `import.meta.env.DEV` with `false`, so it always sends through the host:

```ts
const runsWithoutHost = import.meta.env.DEV && window.parent === window;

const connection = createChatBackendConnection({
  apiBaseUrl: window.location.origin,
  sendPlatformRequest: runsWithoutHost
    ? sendThroughDevServer
    : (request) => client.sendPlatformRequest(request),
});

// Local development only: the dev server adds the developer's token.
async function sendThroughDevServer(request: Request): Promise<Response> {
  const { pathname, search } = new URL(request.url);
  return fetch(`/__mainsequence__${pathname}${search}`, {
    method: request.method,
    headers: request.headers,
    body: request.method === "GET" ? undefined : await request.text(),
    signal: request.signal,
  });
}
```

Without a host there is no context: `auth.userUid` is the `uid` from
`/__mainsequence__/api/v1/users/me/`. The dev server forwards any platform route, while Command
Center serves only the chat's, so test the application embedded before release. The SDK's
[static-site guide](https://github.com/mainsequence-sdk/command-center-sdk/blob/main/command-center-sdk/docs/static-site-embeds.md#send-platform-requests-in-local-development)
lists the plugin's answers, such as `503` when a variable is missing.

## Failure states

| What happens | What it means | What to do |
| --- | --- | --- |
| `401` or `403` from the platform | The credential is missing, expired, or not allowed | Renew it in the application's `sendPlatformRequest` and send the request again. A `403` that persists is the platform's decision. |
| A network error on every platform request | The platform is unreachable, or the browser refused the request | Check the network panel. A CORS rejection looks exactly like an unreachable host to the page. |
| Requests to the platform's own origin from another origin | The rewrite or the forwarder is missing | Add the rewrite and the forwarder, or ask for the origin on the platform's allow-list. |
| The composer stays locked with a starting or waking notice | The Agent does not answer its check yet | Wait: the chat sends nothing on the person's behalf, keeps the draft, and unlocks when the Agent answers. |
| A notice that the session cannot take messages | The platform's runtime decision | Nothing in the application; the notice is the platform's. |

The readiness rules are [ADR 093](./adr/adr-093-client-verified-agent-readiness.md), and the whole
sequence from choosing the session to sending is
[AgentSession resolution](./agent-session-resolution.md).
