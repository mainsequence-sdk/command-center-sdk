# Vite

Node-side helpers for an application's Vite dev server. They run under `vite serve` only; nothing
here reaches the browser bundle.

## Entry point

`@dev-mainsequence/command-center-sdk/vite` exports two Vite plugins: `platformRequestProxy(options?)`,
with `PlatformRequestProxyOptions` and `PlatformRequestProxyPlugin`, and `localAgentProxy(options?)`,
with `LocalAgentProxyOptions` and `LocalAgentProxyPlugin`.

## Platform requests in local development

A static site deployed in Command Center sends its platform requests through the host with
`client.sendPlatformRequest(request)` (SDK ADR 013). That is the path to build for. A top-level
page on a local dev server has no host, so `platformRequestProxy()` stands in for it during local
development only:

- The page sends a platform request to `/__mainsequence__/api/...` on its own dev server.
- The dev server sends it to `MAINSEQUENCE_ENDPOINT` with
  `Authorization: Bearer $MAINSEQUENCE_ACCESS_TOKEN`. Both are process-only variables, the same ones
  the SDK's CLI reads; the page never holds the token, and a build never contains it.
- Only the method (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`), the path and query under the platform's
  `/api/`, `accept`, `content-type`, and a body of at most 1 MiB go out, as through the host bridge.
  The status, `content-type`, and the body come back.
- A missing or invalid variable is a `503` with code `platform_not_configured` and a warning when
  the dev server starts. A platform that does not answer is a `502` (`platform_unreachable`). A
  `401` from the platform passes through, with one warning to refresh the token and restart.

`options.path` changes the route; it starts with `/` and does not end with one.

## Security

The route adds the developer's token, so it serves only the page its own dev server serves:

- The caller must be this machine (`127.0.0.0/8` or `::1`), so another computer cannot use it when
  the dev server listens on the network.
- The `Host` header must name this machine (`localhost`, `*.localhost`, `127.x.x.x`, or `[::1]`), so
  a site that points its own domain name at `127.0.0.1` (DNS rebinding) cannot read through it.
- A browser request another site makes (`Sec-Fetch-Site` other than `same-origin` or `none`, or an
  `Origin` other than the page's) is refused, so no other site can act as the developer.

The plugin does not rely on Vite's own checks, which depend on its version and configuration:
Vite skips its host check for an HTTPS dev server or `allowedHosts: true`, and its default CORS lets
any localhost page read responses. The middleware runs before Vite serves files, which also keeps
Vite's SPA fallback from answering an `Accept: */*` request, such as an image, with the page.

## An Agent on this machine

`localAgentProxy()` serves a chat that talks to an Agent the developer runs with `ms-tau` in local
mode (Command Center AI's local source, its ADR 099). A local runtime has no inbound authentication:
it answers every caller as the developer whose credential it holds. So the page never calls it; it
calls `/__agent__` on its own dev server, which forwards:

- only the chat's routes: `GET /ready`, `GET /health`, `GET` and `POST /api/chat`,
  `POST /api/chat/session/cancel`, `GET` and `PUT /api/chat/session-model`,
  `GET /api/chat/model-providers`, `GET /api/local/v1/agent`, `GET /api/local/v1/chat-sessions`, and
  `GET /api/local/v1/chat-sessions/{session}/history`. The runtime's inspection, tool-test, internal,
  and A2A routes are refused with `404` (`not_a_local_agent_route`), after dot segments are resolved;
- only `accept` and `content-type`. `Authorization`, cookies, and `X-Caller-*` headers never reach
  the runtime, so the page cannot present itself as another caller;
- the answer as it arrives (a server-sent event stream), with `content-type`,
  `x-agent-session-uid`, and `x-vercel-ai-ui-message-stream`, and no cookie;
- to `http://127.0.0.1:8787`, `ms-tau`'s default, or `MAINSEQUENCE_TAU_LOCAL_ORIGIN`, or
  `options.target`. A target that is not an `http` origin on this machine is refused (`503`,
  `local_agent_not_configured`, and a warning at start). A runtime that does not answer is a `502`
  (`local_agent_unreachable`).

It makes the same caller checks as `platformRequestProxy()` (this machine, a local host name, the
page's own origin), from `proxy-guards.ts`, which both plugins share. Closing the page's request
aborts the runtime's; `ms-tau` then cancels the turn.

## Maintenance

- Keep the request shape equal to the host bridge's (`src/embed/static-site.ts`), so a request that
  works locally also works embedded.
- The plugin types only the parts of Vite's dev server it uses, so the published declarations need
  neither Vite's nor Node's types. `tests/types/vite-platform-request-proxy.ts` proves it still fits
  Vite's `PluginOption`.
- `platform-request-proxy.test.ts` runs the middleware against a stand-in platform and inside a real
  Vite dev server; every refusal above has a test that fails without its check.
- `local-agent-proxy.test.ts` runs `localAgentProxy()` against a stand-in runtime: the streamed
  answer, the stripped headers, each refused route, and the target checks.
  `tests/types/vite-local-agent-proxy.ts` proves it fits Vite's `PluginOption`.
- Keep `localAgentProxy()`'s route list equal to the routes Command Center AI's local source calls.
