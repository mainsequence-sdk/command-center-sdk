---
name: integrate-static-site-iframe
description: Build, migrate, review, or secure a Command Center static site in local Vite/FastAPI development, a non-local trusted iframe, or a non-local direct link. Use to choose the API transport and identity source, set up the local runner and same-origin proxy, or implement the mainsequence.* handshake and delegated FastAPI access.
---

# Integrate A Static Site And Its API

## Choose The API Transport Before Writing Requests

First record **both** whether the site uses the documented local development setup or a non-local
deployment, and whether an initialized trusted Command Center parent supplies a credential bridge.
This is a required decision before the site calls FastAPI. Non-local does not mean embedded:
a deployed page opened as a direct link has no host delegation.

| Runtime and trust state | API request path | Identity source | FastAPI release UID |
| --- | --- | --- | --- |
| Local development: top-level Vite page at `127.0.0.1:5174` plus loopback FastAPI | Application-owned `fetch("/api/...")` through Vite's same-origin proxy | Local API process's verified Main Sequence CLI login, for one developer | None |
| Non-local deployment: embedded by an initialized trusted Command Center host | `client.fetchFastApi({ resourceReleaseUid, path })` after the validated iframe handshake and first context | Host-resolved delegated credential; deployed FastAPI receives platform-injected per-request user state | Required for the authorized target release |
| Non-local deployment: direct link or no initialized trusted host | SDK delegation is `unsupported`; show an unavailable state, or use a separately designed application-owned authenticated backend transport | None from the iframe SDK; the separate backend must authenticate each request itself | No SDK delegated request is possible |

Choose the transport explicitly in the consuming application and verify the trust state at runtime.
Only a validated `ready`/`initialize` handshake and initial `onContext` from the configured host
enable the delegated path. A configured release UID, deployment URL, build flag, or
`window.parent !== window` alone does not establish that bridge. A deployed direct link must never
fall back to the local CLI identity. For the documented top-level local workflow, do not call
`fetchFastApi`, ask for a release UID, send a browser user UID header, copy a session token, or put
credentials in Vite variables. Local development needs no ResourceRelease UID or iframe host.

## Complete The Local Vite And FastAPI Setup

For a top-level page, **read and implement the packaged
[local Vite/FastAPI procedure](./references/local-vite-fastapi.md)** before calling the API. The
consuming application must establish the API process's signed-in developer identity with
`mainsequence login` and `mainsequence user`, start the loopback runner
(`python -m uvicorn local_api:app --host 127.0.0.1 --port 8001`), wait for `/healthz`, configure
Vite's same-origin `/api` proxy to `127.0.0.1:8001`, and use an
application-owned `fetch("/api/me", { signal })` client. Adapt the module and route names to the
application. Missing identity must produce `503 identity_unavailable` and an unavailable UI.
The procedure and its copyable Python and Vite snippets are shipped with the installed skill; the
SDK repository [consumer example](https://github.com/mainsequence-sdk/command-center-sdk/tree/main/examples/static-site-vite-fastapi)
is an additional runnable reference.

## Confirm The Hosted Iframe Protocol

Inspect the installed `/embed`, `/embed/react`, and `/theme` declarations and the iframe module
README before changing an integration. Use only APIs published by that installed SDK version.

For a hosted application, use `mainsequence.*` numeric version-one `ready` and `initialize`
messages. Wait for the initial `onContext` callback before requesting delegated FastAPI access.

## Build The Hosted Child Application

1. Read the exact parent origin from trusted deployment configuration.
2. Choose one stable, application-specific channel beginning with `mainsequence.`.
3. Create the client with `createStaticSiteIframeClient` and `window.parent`.
4. Install the message listener before calling `announceReady()`.
5. Apply every `onContext` update; theme or user context can change without iframe navigation.
6. Remove the listener and dispose the client only when the application is permanently disposed.

Apply known theme IDs with `resolveCommandCenterThemeById` and `applyThemePresetToRoot` from
`/theme`. Fall back to `themeMode` for an unknown preset. Import the packaged theme CSS when using
SDK theme variables. When the stylesheet is imported, follow `$theme-command-center-app` as a
closed theme contract and run `command-center-sdk theme audit` against the child CSS. Do not call
theme propagation complete merely because `data-theme` or root variables changed; verify that
rendered surfaces, typography, controls, statuses, and charts consume those values.

Consume `context.userUid` only as untrusted display or routing context. Never accept that UID as
proof of identity or permission. Use the delegated SDK flow below for a FastAPI ResourceRelease;
other backends still require their own application-defined authentication.

### Call a hosted FastAPI release

Only when the site is embedded under a trusted Command Center host, use the client's high-level
request method for a FastAPI release. The
SDK obtains, reuses, refreshes, and clears the short-lived delegated credential internally:

```ts
const response = await client.fetchFastApi(
  {
    resourceReleaseUid: configuredFastApiReleaseUid,
    path: "/api/positions",
  },
  { method: "GET", signal },
);
```

Pass a relative path only. The SDK uses the backend-issued RPC URL and adds the delegated bearer
credential plus canonical `X-Resource-Release-UID` header. Normal application code must not call
`requestFastApiCredential`, construct authorization headers, decode a token, call the platform
exchange endpoint, or persist/log credential material. That lower-level method exists only for an
advanced transport that cannot use `fetchFastApi` and accepts responsibility for containing the
credential in memory.

Give the application an explicit status surface through `onFastApiStateChange`, or read the latest
state with `getFastApiState(resourceReleaseUid)`. Render `authorizing`, `runtime-starting`, `ready`,
`expired`, `authentication-failed`, `forbidden`, `missing-route`, `transient`, `cancelled`,
`unavailable`, `unsupported`, and `invalid` distinctly. Do not label an opaque browser fetch
failure as cold start: only `502`, `503`, and `504` have that meaning. A `401` causes one bounded
credential reacquisition; `403` and origin denial are never retried; `404` is a missing route.

Let the SDK own retry and cancellation. Pass `RequestInit.signal`; do not add a second application
retry loop around `fetchFastApi`. The default policy makes no more than three attempts and replays
only `GET`, `HEAD`, `OPTIONS`, `PUT`, and `DELETE`. Keep `POST` and `PATCH` non-retryable unless the
API has an idempotency contract and the request explicitly opts into `retryUnsafeMethods`.

Build the child's screens from the same primitives as the host: `/layout` for pages and cards,
`/controls` for every button, badge, label, and text field, `/feedback` for readiness, and `/views`
for resources, with the SDK theme and component styles loaded once. A static site that hand-rolls
a button or a form, or ships its own CSS for one, will not match the host it is framed in. Route
action and form composition to `$compose-command-center-controls`.

## Wait For The Hosted API

For a deployed FastAPI release, call `client.fetchFastApi(...)`. The host's
`resolveFastApiCredential` asks Django for runtime access. While Django is starting the release,
present the SDK's `runtime-starting` state. When Django returns ready access, the resolver supplies
the RPC URL and delegated credential, and `fetchFastApi` sends the application request.

For hosted delegated requests, handle `StaticSiteFastApiCredentialError.code` as a small UI-safe
category: `access_denied`,
`origin_not_allowed`, `release_unavailable`, `runtime_starting`, `temporarily_unavailable`,
`invalid_request`, or `unsupported`. A direct-link static site has no trusted parent bridge and
returns `unsupported`; never fall back to a normal user credential.

### Open a FastAPI WebSocket

Use only `client.createFastApiWebSocket({ resourceReleaseUid, path, protocols }, { signal })`.
Supply an absolute normalized ASCII path and optional application subprotocol tokens. The SDK
obtains one fresh ticket, validates it, and invokes the native constructor with the reserved ticket
first and `mainsequence.ws-bridge.v1` second. It deliberately exposes no raw-ticket method.

Treat the returned socket as a native browser WebSocket. It may still be connecting, so install
`open`, `message`, `error`, and `close` listeners. `socket.protocol` is either the
application-selected protocol or the fixed acknowledgement; it is never the ticket. Reconnect by
calling `createFastApiWebSocket` again. Do not cache, deduplicate, replay, log, decode, or
automatically retry tickets, and do not reconstruct the ticket request with raw `postMessage`.

Reject application protocol values beginning with the reserved `mainsequence.ws-ticket.` or
`mainsequence.ws-bridge.` prefix. Keep the child CSP `connect-src` aligned with approved `wss:`
targets. A direct-link or old-host timeout is `unsupported`; a CSP or native handshake failure is
reported through WebSocket events after construction.

## Build The Host

Prefer `StaticSiteIframe` from `/embed/react`. Supply the authorized launch URL, current theme ID
and mode, and either the public user UID or `null`. Let the SDK own the ready/initialize handshake,
source/origin validation, reinitialization, payload limit, timeout, and teardown.

Keep launch-URL acquisition, exchange tokens, authentication stores, release authorization,
routing, and viewer chrome in the host application. The SDK must not import those product
services. Use `createStaticSiteIframeHost` only for a framework-independent host.

If child applications may call FastAPI releases, inject `resolveFastApiCredential`. Close over the
trusted source release UID and expected iframe origin in the application adapter. Use the host's
authenticated API client to acquire a narrow delegated credential, validate the returned source,
target, origin, RPC URL, and expiry, then map it to `StaticSiteFastApiCredential`. Never expose the
host session to the callback result or let the iframe supply source identity, origin, user, or
organization. If the capability is unavailable, omit the resolver and let the SDK return
`unsupported`.

When the child needs WebSockets, separately inject `resolveFastApiWebSocketTicket`. Accept only
`{ resourceReleaseUid, path }` from the SDK, derive Origin from the exact pinned iframe URL, and
call the authenticated ResourceRelease WebSocket-ticket action exactly once without caching or
retry. Validate the returned UID, Origin, path, WebSocket URL, RFC 3339 expiry, and canonical
`mainsequence.ws-ticket.<opaque>` subprotocol before returning
`StaticSiteFastApiWebSocketTicket`. Map failures only to `StaticSiteFastApiWebSocketError` codes;
never return raw backend bodies. Do not reuse the HTTP credential or the separate Command Center
WebSocket-ticket audience.

Review any change to the component's default sandbox. Add popups, downloads, modals, or navigation
only when required and security-reviewed. Keep production origins on exact HTTPS values and align
the host's `frame-src` with the child's `frame-ancestors` CSP.

## Protect User And Session Data

Preserve the version-one wire aliases `id`, `uid`, and `user_uid`, which all contain the same public
UID. New child code reads only the SDK-normalized `userUid`.

Never send a session JWT, cookie, auth header, full user/session object, email, name, organization,
permissions, or unrestricted backend credential through iframe context. Do not expand the public
wire shape without an explicit protocol compatibility and security review.

## Verify

For top-level local Vite development, verify `/healthz` only after Uvicorn completes startup,
then call `/api/me` from the Vite origin and confirm Vite proxies to the local FastAPI process.
With a valid CLI login, the API must return that developer's UID; with identity unavailable, it
must return `503 identity_unavailable` and the page must show an unavailable state. Confirm the
browser sends no user UID, token, or release UID and makes no iframe credential request. Do not
declare the local workflow complete from a Vite page load alone.

Test the valid handshake, wrong origin, wrong source window, invalid channel/version/payload,
anonymous context, repeated theme/user initialization, payload limits, handshake timeout,
navigation, and teardown. Confirm the iframe CSP and sandbox in a real browser when capabilities
change. Switch between representative dark and light host presets and compare iframe component
computed styles with the applied SDK root variables. State explicitly whether backend,
launch-token, CSP, theme-consumption, or storage contracts are affected.

For delegated FastAPI access, also test exact source/origin/target binding, single-flight reuse,
refresh before expiry, `401` reacquisition, non-retryable `403`/`404`, bounded `502`/`503`/`504`,
opaque CORS/transport failure, cancellation, user/navigation/disposal clearing, direct-link
failure, and target CORS. Use a real cross-origin browser test, not only mocked `postMessage`.
Confirm no host session or delegated token appears in DOM, URLs, browser storage, logs, analytics,
or serialized application state.

For WebSockets, additionally test request/cancel correlation, resolver abort/timeout/replacement,
repeated-ready document generations, user/disposal socket closure, exact UID/Origin/path/URL/expiry
binding, ticket-first and acknowledgement-second ordering, zero/one/multiple application
protocols, acknowledgement fallback, application selection, omitted/duplicate response selection
failure, bidirectional messages, close handling, and reconnect with a fresh ticket. Use a real
browser and confirm the ticket never appears in URLs, storage, DOM, logs, analytics, errors, or the
FastAPI-visible protocol list.
