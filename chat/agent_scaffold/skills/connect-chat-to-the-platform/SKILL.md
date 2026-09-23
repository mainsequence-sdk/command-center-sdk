---
name: connect-chat-to-the-platform
description: Connect the @dev-mainsequence/chat package to the Main Sequence platform and the Agent runtime from a browser application - the platform API base URL, the person's bearer token, the request-URL rewrite and its targets (platform, agent-runtime), the same-origin forwarder (a Vite dev-server proxy, or the site's own server), allowed origins, and the failure states (401 and 403, an unreachable platform, CORS rejections, an Agent that does not answer yet). Use when the chat cannot reach the platform, when choosing how a deployed chat application reaches it, or when reviewing token handling. Do not use for the chat's layout or for building an Agent.
---

# Connect The Chat To The Platform

The chat talks to two backends: the platform API, for sessions, history, runtime access, model
providers, and agent icons; and the Agent runtime, for the chat request, its check, and cancel. The
human guide is `docs/connect-to-the-platform.md` in the installed package.

## Build The Connection

```ts
import { createChatBackendConnection } from "@dev-mainsequence/chat";

const connection = createChatBackendConnection({
  apiBaseUrl: "https://platform.example.com",
  rewriteRequestUrl: (url, target) =>
    target === "platform" ? `/__platform__${url.pathname}${url.search}` : url.toString(),
});
```

- `apiBaseUrl` is the platform API's absolute `http(s)` URL; anything else throws.
- The package reads no environment variable and no configuration file. The application decides the
  URL; reading `import.meta.env` for it belongs in the application.
- Build one connection and pass it to `ChatEngineProvider` and `ModelProviderSettings`.

## Know Where Each Request Goes

- **The platform API**: every route under `apiBaseUrl`, with the person's token as
  `Authorization: <tokenType> <token>` from the engine's `auth` input. Session collection reads are
  scoped by the Organization Environment, and user-scoped lists by the person.
- **The Agent runtime**: `POST {rpc_url}/api/chat` (a message; the answer streams back),
  `GET {rpc_url}/api/chat` (the check that the Agent answers), and
  `POST {rpc_url}/api/chat/session/cancel` (stop the run). `rpc_url` and the runtime token come
  from the platform's runtime access for the session; they are never configured.
- **A custom provider's own endpoint**: only the direct test conversation of the model provider
  settings calls it, with the provider's key and never the platform token. It never goes through
  the rewrite or a proxy.

## Reach Them From The Application's Origin

The platform API and the Agent runtime answer browsers only from the origins on their allow-lists.
An application on another origin has two ways in: the platform adds its origin, or the application
forwards the calls through an address on its own origin. The package serves the second through
`rewriteRequestUrl(url, target)`: it receives the full `URL` the package is about to request and
where it is going (`"platform"` or `"agent-runtime"`), and returns the address the browser requests
instead. Every request passes through it, including the icon URLs the platform returns, except the
direct test turn above. Whether and when to rewrite is the application's decision; the package
detects no development build and knows no proxy.

In development, the forwarder is the dev server's proxy. The standalone application in
`node_modules/@dev-mainsequence/chat/standalone/` does exactly this: `vite.config.ts` in the chat's
repository forwards `/__platform__` to the platform URL, and `connection.ts` rewrites platform
requests to that prefix. In Vite:

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

In production, the forwarder is the site's own server on the same origin, for example its FastAPI
application, which passes platform requests on. Who the person is stays a server-side decision;
follow the SDK skill `integrate-static-site-iframe` and its `references/local-vite-fastapi.md` for
server-side identity, and never accept a browser-supplied user uid in its place.

The Agent runtime is at `rpc_url`. The standalone application calls it directly, which works when
the runtime's trusted origins include the application's origin; otherwise forward it too, from the
`"agent-runtime"` target.

## Handle The Tokens

- The person's token: the application passes the current one in `auth`, and passes the new one
  when it refreshes it. There is no refresh callback; the package never refreshes the person's
  token, and with a `null` token it makes no platform request.
- Never put a token in a build variable (`VITE_*`), an environment file, the bundle, or browser
  storage. The standalone application keeps it in memory only.
- The runtime token: the package resolves runtime access for the session and sends its token only
  to the runtime. On a `401` or `403` from the runtime it resolves access again and retries once.

## Read The Failure States

- **`401` or `403` from the platform**: the token is missing, expired, or not allowed. Refresh it in
  the application and pass the new one through `auth`. A `403` that persists is the platform's
  authorization decision; the chat does not work around it.
- **An unreachable platform**: requests fail with a network error and the chat shows its error
  states; nothing is retried behind the person's back.
- **A CORS rejection**: the browser reports it exactly like an unreachable host, as a network
  error. Check the browser's network panel: a request to the platform's own origin from another
  origin means the rewrite or the forwarder is missing, or the origin is not on the allow-list.
- **An Agent that does not answer yet**: the chat checks `GET {rpc_url}/api/chat` before it sends.
  While the Agent starts, wakes, or updates, the composer is locked, a draft is kept, and nothing
  is sent on the person's behalf. When the platform's runtime interaction says the session cannot
  take messages, its notice is shown as it is.

## Verify

1. On the scripted stand-in (`build-chat-application`), connect and chat with no platform.
2. Against the platform, through the forwarder: in the browser's network panel, every platform
   request goes to the application's own origin, carries the person's token, and succeeds; the
   runtime requests go to `rpc_url` or through the forwarder.
3. Expire or revoke the token and confirm the application refreshes it and passes the new one.
