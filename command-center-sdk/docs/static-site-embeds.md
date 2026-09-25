---
title: Static-site embeds
description: Integrate an application-owned iframe with strict origin, lifecycle, theme, user, delegated HTTP, native WebSocket, and platform request boundaries.
---

# Static-site embeds

**Choose the API path before implementing requests.** Local development, non-local trusted
embedding, and non-local direct links have different identity sources:

| Case | API access and identity |
| --- | --- |
| Top-level local Vite plus loopback FastAPI | Run the local API with one verified CLI developer identity; use Vite's same-origin `/api` proxy. No release UID or iframe host is needed. |
| Non-local site inside a trusted Command Center iframe | Wait for the validated host handshake and initial context; call `fetchFastApi` with an authorized release UID. The host delegates access and deployed FastAPI receives platform-injected per-request user state. |
| Non-local direct link, or no initialized trusted host | SDK delegation is `unsupported`. Show an unavailable state, or build a separate application-owned backend that authenticates every request. |

Non-local deployment alone does not grant the iframe bridge. A release UID, build flag, URL, or
`window.parent !== window` does not establish host trust. The installed
`integrate-static-site-iframe` skill requires this distinction and the complete
[local setup](#run-a-top-level-vite-site-with-local-fastapi) before treating local API calls as
working.

The embed API connects a trusted host application to an application-owned static site in a
sandboxed iframe. It solves three problems without sharing the host session:

- synchronize public theme and user context;
- make narrowly delegated HTTP requests and native WebSocket connections to an authorized FastAPI
  runtime; and
- [send the platform requests the site needs through the host](#send-platform-requests-through-the-host),
  which sends them as the signed-in person.

It is not a general-purpose cross-origin RPC framework. The host owns authorization and credential
resolution; the child receives only the smallest versioned contract required for its own UI.

## Understand the trust boundary

```text
Command Center host                        Static-site child
-------------------                        -----------------
authenticated session                     no host session
approved child origin       postMessage    exact host origin
credential resolver       ←────────────→   versioned SDK client
backend API client                        delegated fetch helper
platform request sender                   sendPlatformRequest(Request)
```

The child is allowed to be application code, but it is not allowed to impersonate the host. Treat
its requested target UID as untrusted input. The host resolver must bind the authenticated user,
source release, target release, exact child origin, RPC URL, and expiry through the backend.

The public `userUid` is context, not proof of identity. Never send access tokens, email, name,
organization membership, permissions, or raw backend errors in the initialization payload.

## Host: use the managed React component

```tsx
import { StaticSiteIframe } from "@dev-mainsequence/command-center-sdk/embed/react";
import { StaticSiteFastApiCredentialError } from "@dev-mainsequence/command-center-sdk/embed";

export function ReportEmbed() {
  return (
    <StaticSiteIframe
      src={authorizedLaunchUrl}
      allowedOrigin="https://reports.example.com"
      themeId={activeTheme.id}
      themeMode={activeTheme.mode}
      userUid={session?.user.publicUid ?? null}
      resolveFastApiCredential={async ({ resourceReleaseUid }, { signal }) => {
        try {
          const result = await commandCenterClient.createStaticSiteCredential(
            {
              sourceReleaseUid,
              targetReleaseUid: resourceReleaseUid,
              origin: "https://reports.example.com",
            },
            { signal },
          );

          validateCredentialBinding(result, {
            resourceReleaseUid,
            sourceReleaseUid,
            origin: "https://reports.example.com",
          });

          return {
            resourceReleaseUid: result.resource_release_uid,
            rpcUrl: result.rpc_url,
            token: result.token,
            expiresAt: result.expires_at,
          };
        } catch (error) {
          throw mapCredentialError(error, StaticSiteFastApiCredentialError);
        }
      }}
      onProtocolError={(message) => reportEmbedProtocolFailure(message)}
      title="Report application"
    />
  );
}
```

`validateCredentialBinding` and `mapCredentialError` are application adapters in this example,
not SDK exports. They illustrate the host's required job: validate the backend result before
returning the narrow `StaticSiteFastApiCredential`, and translate failures into the SDK's public
error codes without forwarding sensitive response bodies.

`allowedOrigin` must be an exact origin. If omitted, the component derives it from `src`. Do not
use `*`, a suffix match, or an application-provided value. The SDK also checks the actual message
window, channel, version, shape, size, correlation ID, and lifecycle.

The default sandbox is:

```text
allow-forms allow-same-origin allow-scripts
```

Adding popups, downloads, modals, or navigation expands what child code can do and requires a
security review. Keep the host's `frame-src`, the child's `frame-ancestors`, and the deployment
allowlist aligned with the exact production origins.

## Host: present the site on a phone

Below the `md` breakpoint show only the iframe and `ApplicationImmersiveBar` from `/navigation`
(a back control, the site's name, and optionally the host menu trigger) in a `100dvh` column with
`overflow: hidden`. The site inside the iframe adapts to its own width on its own; the host does
not send it a presentation hint and must not pad the bottom safe area a second time. Every
embedded site must carry its own viewport meta tag. See
[Application navigation](./navigation.md#frame-an-embedded-site-from-host-chrome-on-a-phone).

## Host: present the site on a wide screen

From the `md` breakpoint up keep the host top bar and render no host sidebar column beside the
iframe (SDK ADR 010). The embedded application owns its left navigation; a host sidebar next to
it shows two rails, and it narrows the iframe until the site picks its phone layout inside a
desktop host, because the site measures its own window. Open the host's navigation in
`ApplicationNavigationDrawer` from an `ApplicationNavigationTrigger` in the top bar, and show the
site's name there as a label.

Escape and pointer events inside the cross-origin iframe never reach the host. A host layer that
shows a site without a route, such as a release preview, therefore needs a visible close control
in the top bar; a host `keydown` listener alone leaves it with no way out once the site has
focus. The host still sends no presentation hint. See
[Application navigation](./navigation.md#frame-an-embedded-site-from-host-chrome-on-a-wide-screen).

## Child: install the listener before announcing readiness

```ts
import {
  createStaticSiteIframeClient,
  type StaticSiteIframeContext,
} from "@dev-mainsequence/command-center-sdk/embed";
import {
  applyThemePresetToRoot,
  resolveCommandCenterThemeById,
} from "@dev-mainsequence/command-center-sdk/theme";

const client = createStaticSiteIframeClient({
  channel: "mainsequence.reports",
  hostOrigin: "https://command-center.example.com",
  parentWindow: window.parent,
  onContext(context: StaticSiteIframeContext) {
    const theme = resolveCommandCenterThemeById(context.themeId);
    if (theme) applyThemePresetToRoot(document.documentElement, { theme });
    renderForPublicUser(context.userUid);
  },
  onFastApiStateChange(state) {
    renderTransportStatus(state);
  },
  onProtocolError(message) {
    reportChildProtocolFailure(message);
  },
});

const handleMessage = (event: MessageEvent<unknown>) => client.handleMessage(event);
window.addEventListener("message", handleMessage);
client.announceReady();

// Permanent disposal only:
window.removeEventListener("message", handleMessage);
client.dispose();
```

Listener-before-ready ordering prevents the host's immediate initialization response from being
missed. Apply every later context update; do not treat initialization as immutable because the
theme or authenticated user may change while the iframe remains mounted.

Direct-link mode has no trusted parent bridge. Credential requests reject as `unsupported` and
must not fall back to a normal user token, URL credential, or reconstructed runtime hostname.

## Child: build it from the host's primitives

Build the child's screens from the same primitives as the host: [`/layout`](./application-layout.md)
for pages and cards, [`/controls`](./application-controls.md) for every button, badge, label, and
text field, [`/feedback`](./application-feedback.md) for readiness, and [`/views`](./resources.md)
for resources, with the SDK theme and component styles loaded once. A static site that hand-rolls
a button or a form, or ships its own CSS for one, will not match the host it is framed in.

## Run a top-level Vite site with local FastAPI

Use the [runnable Vite/FastAPI consumer example](https://github.com/mainsequence-sdk/command-center-sdk/tree/main/examples/static-site-vite-fastapi)
when opening a local static site directly at `http://127.0.0.1:5174/`. It supplies a named
loopback-only API runner (`python -m uvicorn local_api:app`), a `/healthz` readiness endpoint, a
same-origin `/api` Vite proxy to `127.0.0.1:8001`, and a transport adapter covering both local and
hosted requests. No ResourceRelease UID is involved in the local path.

```bash
# Terminal 1, in examples/static-site-vite-fastapi, after Python 3.13 setup
python3.13 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
mainsequence login
mainsequence user
python -m uvicorn local_api:app --host 127.0.0.1 --port 8001

# Terminal 2, after Uvicorn reports "Application startup complete"
curl --fail http://127.0.0.1:8001/healthz
npm install
npm run dev
```

Open `http://127.0.0.1:5174/`. The application-owned client uses
`fetch("/api/me", { signal })`; Vite sends it to the local FastAPI process. The Python runner
calls `User.get_authenticated_user_details()` with its own Main Sequence CLI login and returns
only that developer's public UID and optional username. It is a **single-developer local identity**,
not per-browser authentication. The platform injects `request.state.user` and
`request.state.user_uid` in deployed FastAPI requests; see the
[platform FastAPI request-user guide](https://github.com/mainsequence-sdk/mainsequence-sdk/blob/main/docs/knowledge/fastapi/index.md).
If the local CLI login is missing, expired, or inaccessible, `/api/me` returns
`503 identity_unavailable`. Show an unavailable state and sign in again in the API process's
environment. Do not share this local server with other users. Never accept a
browser-supplied UID header, copy session tokens, or put credentials in Vite variables.

The frontend selects the transport explicitly and confirms the trusted host handshake before
using delegation:

```ts
// Application-owned adapter. The example contains the full typed version.
let response: Response;
if (mode === "local") {
  response = await fetch("/api/me", { signal });
} else if (mode === "hosted") {
  await trustedHostReady; // resolves only after a validated handshake and initial onContext
  response = await client.fetchFastApi(
    { resourceReleaseUid: configuredFastApiReleaseUid, path: "/api/me" },
    { method: "GET", signal },
  );
} else {
  throw new Error("No authenticated API transport for this direct link");
}
```

The hosted branch is valid only inside an iframe with a trusted parent credential bridge. A
deployed direct link cannot use the local CLI identity as a fallback. The example's hosted build
reports the missing handshake as unavailable when opened directly.
`configuredFastApiReleaseUid` is public routing configuration for an authorized deployed release,
not a local development prerequisite.

## Use delegated HTTP through `fetchFastApi`

```ts
const response = await client.fetchFastApi(
  {
    resourceReleaseUid: configuredFastApiReleaseUid,
    path: "/api/report?period=2026-Q3",
  },
  {
    method: "GET",
    signal: pageAbortController.signal,
  },
);

if (!response.ok) {
  renderReportFailure(response.status);
} else {
  renderReport(await response.json());
}
```

The path must remain relative to the backend-issued RPC URL. The client injects the delegated
bearer token and canonical release header, caches a valid credential only in memory, refreshes it
before expiry, and coalesces concurrent requests for the same target.

Use the low-level `requestFastApiCredential` only for a transport that cannot use `fetchFastApi`.
Doing so makes application code responsible for keeping the token in memory and out of URLs, DOM,
storage, logs, analytics, and serialized state.

## Retry and state semantics

The default fetch lifecycle is abortable and bounded to three attempts for replay-safe requests.
Only `502`, `503`, and `504` identify a runtime-starting response. A `401` permits one bounded
credential reacquisition. `403` is forbidden, `404` is a missing application route, and an opaque
browser fetch failure remains a transient CORS-or-network failure.

Unsafe methods such as `POST` and `PATCH` are not replayed by default. Enable unsafe retry only when
the application and backend provide an idempotency contract.

The state callback distinguishes:

| Status | Meaning |
| --- | --- |
| `idle` | No request has started for the target |
| `authorizing` | The child is waiting for delegated credentials |
| `runtime-starting` | The platform answered `502`, `503`, or `504`: the target runtime is not ready yet |
| `ready` | A delegated request reached a usable response |
| `expired` | A cached credential crossed its refresh window |
| `authentication-failed` | Reacquisition did not recover authentication |
| `forbidden` | Origin or access policy denied the request |
| `missing-route` | The target runtime has no matching path |
| `transient` | Network, CORS, or temporary transport failure |
| `cancelled` | The supplied signal cancelled current work |
| `unavailable` | The target release is unavailable |
| `unsupported` | No trusted host bridge or resolver exists |
| `invalid` | Input or protocol validation failed |

Render these meanings truthfully. In particular, do not label every network failure “starting” and
do not retry a permanent permission or contract error.

## Lifecycle invalidation

The host aborts active credential work when the initialized public user changes and on disposal.
The child clears credentials when context changes to another user, when explicitly requested, or
when disposed. It also cancels pending WebSocket-ticket work and closes SDK-created sockets on a
user change or disposal. Navigation that creates a new document must create a fresh handshake; old
request IDs and responses must not be accepted by the new document. Every accepted repeated
`ready` starts a new child-document generation and aborts host resolver calls from the prior one.

If the host replaces an authenticated session while retaining the same public UID, the consuming
application must still recreate or otherwise invalidate the resolver boundary. Same-user session
replacement can change credentials and permissions even when the visible UID is unchanged.

Platform requests follow the same lifecycle. The host aborts its sender's work on a user change, a
repeated `ready`, a replaced sender, and disposal, and refuses a request that names a user other
than its current one; the child rejects its pending platform requests with `access_denied` on a
user change and with `unsupported` on disposal.

## Open a native FastAPI WebSocket

The host injects a separate one-time ticket resolver. It accepts only the exact target and path
from the iframe, derives Origin from the pinned iframe URL, and maps the authenticated backend
response into the SDK type:

```tsx
import {
  StaticSiteFastApiWebSocketError,
  type StaticSiteFastApiWebSocketTicket,
} from "@dev-mainsequence/command-center-sdk/embed";

<StaticSiteIframe
  {...viewerProps}
  resolveFastApiWebSocketTicket={async (
    { resourceReleaseUid, path },
    { signal },
  ): Promise<StaticSiteFastApiWebSocketTicket> => {
    try {
      const result = await commandCenterClient.createFastApiWebSocketTicket(
        resourceReleaseUid,
        { origin: approvedIframeOrigin, path },
        { signal },
      );
      return {
        resourceReleaseUid: result.resource_release_uid,
        origin: result.origin,
        path: result.path,
        websocketUrl: result.websocket_url,
        subprotocol: result.subprotocol,
        expiresAt: result.expires_at,
      };
    } catch (error) {
      throw mapWebSocketTicketError(error, StaticSiteFastApiWebSocketError);
    }
  }}
/>;
```

`mapWebSocketTicketError` is an application adapter, not an SDK export. Map only to
`invalid_request`, `access_denied`, `origin_not_allowed`, `release_unavailable`, or
`temporarily_unavailable`; never forward backend bodies. Omit the resolver when the capability is
unavailable, and the host responds with `unsupported`. Ticket issuance is one-shot and must not be
cached or retried after an uncertain response.

The child calls only the high-level constructor API:

```ts
import {
  STATIC_SITE_FAST_API_WEBSOCKET_ACK_PROTOCOL,
  StaticSiteFastApiWebSocketError,
} from "@dev-mainsequence/command-center-sdk/embed";

try {
  const socket = await client.createFastApiWebSocket(
    {
      resourceReleaseUid: configuredFastApiReleaseUid,
      path: "/ws/orders",
      protocols: ["orders.v2", "json"],
    },
    { signal },
  );

  socket.addEventListener("open", () => {
    const selected = socket.protocol;
    const applicationProtocol =
      selected === STATIC_SITE_FAST_API_WEBSOCKET_ACK_PROTOCOL ? null : selected;
    markConnected(applicationProtocol);
  });
  socket.addEventListener("message", consumeOrderEvent);
  socket.addEventListener("error", showConnectionFailure);
  socket.addEventListener("close", scheduleApplicationOwnedReconnect);
} catch (error) {
  if (error instanceof StaticSiteFastApiWebSocketError) {
    renderTicketFailure(error.code);
  }
}
```

The SDK validates the canonical release UID, absolute path, correlated ticket response, exact
binding, future expiry, secure scheme, and application protocols. It constructs the native browser
socket with `[ticket, "mainsequence.ws-bridge.v1", ...applicationProtocols]`. FastAPI receives
only the application protocols, and the socket opens with the protocol FastAPI selects or, when it
selects none, the fixed acknowledgement. `socket.protocol` is therefore never the ticket.

Each call obtains one fresh ticket and makes one native constructor attempt. There is deliberately
no public raw-ticket method, cache, concurrent deduplication, or automatic reconnect. After the
promise returns, connection and handshake failures arrive through the native `error` and `close`
events. Application reconnect code must call `createFastApiWebSocket` again. The child CSP must
allow the returned `wss:` origin in `connect-src`.

The default host resolver deadline is 10 seconds and the default child bridge deadline is 12
seconds. If you override `webSocketTicketRequestTimeoutMs` independently on the host and child,
keep the host value strictly shorter so a capable but unavailable resolver returns
`temporarily_unavailable`; a child timeout means the host is old or unsupported.

Paths must be absolute ASCII paths without a query, fragment, percent encoding, backslash, empty
segment, or dot segment. `/_healthz` and `/logos/...` are reserved by the platform. Application protocols
must be unique valid WebSocket tokens; the `mainsequence.ws-ticket.` and
`mainsequence.ws-bridge.` prefixes are reserved for the platform.

## Send platform requests through the host

An embedded site that needs the platform itself, not a FastAPI release, never receives a platform
credential. It hands the SDK a standard Fetch `Request`; the host sends it as the signed-in person,
with the host's own credential and renewal, if the host serves that path; the site receives a
standard Fetch `Response` ([SDK ADR 013](./adr/adr-sdk-013-static-site-platform-request-bridge.md)).

The host passes `sendPlatformRequest`. The SDK calls it with `{ method, path, headers, body }` and
`{ signal, userUid }`, and the host decides which paths it serves. That allow-list is the control:
whatever the host serves, the site can reach as the person. Each request names the person the site
believes is signed in, and the SDK calls the sender only when that is the person in the host's
current context; otherwise it answers `access_denied`. A request the site sent just before a
person change is therefore refused, never sent for the new person.

```tsx
import { useCallback } from "react";
import { StaticSiteIframe } from "@dev-mainsequence/command-center-sdk/embed/react";
import {
  StaticSitePlatformRequestError,
  type SendStaticSitePlatformRequest,
} from "@dev-mainsequence/command-center-sdk/embed";

const servedPlatformPaths = ["/api/projects/", "/api/reports/"];

export function ReportEmbed() {
  const sendPlatformRequest = useCallback<SendStaticSitePlatformRequest>(
    async (request, { signal }) => {
      const [pathname = ""] = request.path.split("?");
      if (!servedPlatformPaths.some((prefix) => pathname.startsWith(prefix))) {
        throw new StaticSitePlatformRequestError("not_allowed");
      }
      return platformFetch(request.path, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal,
      });
    },
    [],
  );

  return <StaticSiteIframe {...viewerProps} sendPlatformRequest={sendPlatformRequest} />;
}
```

`platformFetch` is the host's own authenticated fetch against the platform, an application
adapter rather than an SDK export: it adds the host's credential and renews it. Compare the path
before `?` against prefixes that end in `/`, and check the method too where a path is read-only.
The SDK's path rules make that comparison sound: the path the host compares is the path the
platform routes.

- Keep the sender stable, for example with `useCallback`. Replacing it abandons the requests in
  flight, which the site receives as `temporarily_unavailable`. Without a sender, every platform
  request is `unsupported`.
- Throw `StaticSitePlatformRequestError("not_allowed")` for a path or method you do not serve, and
  `access_denied` when you cannot send as the person. Any other failure reaches the site as
  `temporarily_unavailable`, without its message. An HTTP error status is a response, not an
  error.
- The platform sees the host's requests, from the host's origin with the host's credential. It
  needs no CORS for the site's origin, and the site's `connect-src` needs nothing for it.

The site sends requests after the first `onContext`:

```ts
const response = await client.sendPlatformRequest(
  new Request("/api/projects/?limit=20", { headers: { accept: "application/json" }, signal }),
);
if (response.ok) renderProjects(await response.json());

// A fetch-shaped function for code that takes one.
const fetchThroughHost = (input: RequestInfo | URL, init?: RequestInit) =>
  client.sendPlatformRequest(new Request(input, init));
```

| From the site | To the site |
| --- | --- |
| The person in its current context (`userUid`), which the SDK adds | The status |
| The method: `GET`, `POST`, `PUT`, `PATCH`, or `DELETE` | `content-type` |
| The URL's path and query, at most 4,096 characters | The body, at most 8 MiB once decoded |
| `accept` and `content-type` | |
| A text body, at most 1 MiB of UTF-8 | |

- The URL's origin and fragment stay behind. Every other request header is dropped, including any
  credential the site sets, and no other response header, status text, or URL comes back: a design
  that needs a response header, such as a pagination link, does not work through the bridge.
- Paths are printable ASCII with well-formed percent-encoding, without a fragment or backslash;
  before the query they have no empty segment, no `.` or `..` segment even percent-encoded, and no
  percent-encoded slash or backslash. The SDK refuses any other path, any other method, a binary or
  oversized body, and a body already read with `invalid_request`, and sends nothing.
- JSON and UTF-8 `text/*` bodies travel as text, and everything else, images included, as base64.
  Either way the `Response` holds the platform's exact bytes; `204`, `205`, and `304` have no body.
- Abort `request.signal` to cancel: the SDK tells the host, which aborts its work, and rejects with
  an `AbortError`. The site keeps at most 16 requests in flight and queues the rest in order.
- The bridge carries one request and one complete response. Live streams, the Agent runtime's
  included, are not bridged, and neither is a binary upload.

Failures are `StaticSitePlatformRequestError` codes:

| Code | Meaning |
| --- | --- |
| `invalid_request` | The request breaks the rules above and was not sent, or reused a request ID. |
| `access_denied` | No person is signed in, the request names a person other than the host's current one (the person changed), or the host cannot send as the person. |
| `not_allowed` | The host does not serve this path or method. |
| `temporarily_unavailable` | The platform was unreachable, the host timed out (60 seconds), already had 16 of the site's requests in flight, or replaced its sender. A retry can succeed. |
| `unsupported` | The host has no sender or never answered within 65 seconds, as an older host does, or the response exceeds 8 MiB. Do not retry. |

The first request to an older host fails only after the child's 65-second timeout. If you override
`platformRequestTimeoutMs`, keep the host's value shorter than the child's, so that only a host that
never answers reaches the child's timeout.

## Send platform requests in local development

Build for the host path above: it is how a deployed site reaches the platform. A top-level page on
a local Vite dev server has no host, so during local development only, the SDK's Vite plugin stands
in for it. The dev server sends each platform request with the developer's token, which it reads
from its own environment; the page never holds it, and a build never contains it.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { platformRequestProxy } from "@dev-mainsequence/command-center-sdk/vite";

export default defineConfig({
  plugins: [platformRequestProxy()],
});
```

```bash
export MAINSEQUENCE_ENDPOINT="https://your-platform.example"
export MAINSEQUENCE_ACCESS_TOKEN="<runtime access token>"
npm run dev
```

These are the process-only variables the SDK's CLI reads. Never give the token a `VITE_` name:
Vite writes those into the bundle.

The page sends a platform request to `/__mainsequence__` plus the platform path, and only when it
runs under `vite serve` without a host. A production build replaces `import.meta.env.DEV` with
`false`, so it always takes the host path:

```ts
// Deployed or embedded, the host sends it; a top-level page under `vite serve`, the dev server.
const runsWithoutHost = import.meta.env.DEV && window.parent === window;

async function sendPlatformRequest(request: Request): Promise<Response> {
  if (!runsWithoutHost) return client.sendPlatformRequest(request);
  const { pathname, search } = new URL(request.url);
  return fetch(`/__mainsequence__${pathname}${search}`, {
    method: request.method,
    headers: request.headers,
    body: request.method === "GET" ? undefined : await request.text(),
    signal: request.signal,
  });
}
```

Without a host there is no `onContext`: read the developer's uid from
`/__mainsequence__/api/v1/users/me/` (its `uid`) and use the default theme.

- The dev server forwards what the host bridge carries: the method (`GET`, `POST`, `PUT`, `PATCH`,
  `DELETE`), the path and query under the platform's `/api/`, `accept`, `content-type`, and a body
  of at most 1 MiB. The status, `content-type`, and the body come back.
- It has no allow-list. The host serves only the paths it chooses, so a request that works locally
  can be `not_allowed` embedded; test the site embedded before release.
- A missing or invalid variable answers `503` (`platform_not_configured`, naming the variable) and
  warns when the dev server starts. A platform that does not answer is `502`
  (`platform_unreachable`). A `401` from the platform passes through, and the dev server warns once
  to refresh `MAINSEQUENCE_ACCESS_TOKEN` and restart.
- Only the page the dev server serves can use the route: another site gets `403`
  (`cross_site_request`), and another computer, or a request through any name other than
  `localhost`, `*.localhost`, `127.x.x.x`, or `[::1]`, gets `403` (`not_local`).
- `platformRequestProxy({ path })` changes the route. The plugin runs only under `vite serve`.

## Production test matrix

Use a real cross-origin browser setup. Unit tests around `postMessage` parsing do not exercise CSP,
sandboxing, CORS preflight, browser origin values, or credential headers.

Cover at least:

- successful handshake and repeated context updates;
- incorrect origin, incorrect source window, malformed messages, oversized payloads, replayed
  request IDs, timeouts, and teardown;
- anonymous and authenticated public-user context;
- resolver validation of source, target, origin, RPC URL, and expiry bindings;
- single-flight credential reuse and refresh-before-expiry;
- cancellation, navigation, user transition, same-user session replacement, and disposal;
- `401`, `403`, `404`, `502`, `503`, `504`, and opaque browser fetch failures;
- replay-safe retry limits and no default replay of unsafe methods;
- direct-link failure with no credential fallback;
- absence of credentials in URLs, storage, logs, analytics, DOM, and error messages;
- ticket-first/acknowledgement-second ordering, zero and multiple application protocols, upstream
  selection, acknowledgement fallback, omitted/duplicate selection failure, bidirectional frames,
  native close behavior, and reconnect with a fresh ticket;
- WebSocket request cancellation, resolver timeout/replacement, repeated-ready generation change,
  strict result binding, user/disposal socket closure, mixed-version timeout, CSP `connect-src`, and
  absence of tickets in URLs, storage, DOM, logs, analytics, or errors;
- platform requests: the host's allow-list refusing other paths and methods with `not_allowed`,
  JSON and binary responses, request and response caps, cancellation reaching the host's fetch,
  sender timeout and replacement, a user change, an older host's timeout, and the platform seeing
  only the host's origin and credential, never one from the site.

The shorter [Themes and embeds](./themes-and-embeds.md) page remains as a compatibility overview.
The threat model is maintained beside the implementation in `src/embed/THREAT_MODEL.md`.
