---
title: Static-site embeds
description: Integrate an application-owned iframe with strict origin, lifecycle, theme, user, delegated HTTP, and native WebSocket boundaries.
---

# Static-site embeds

The embed API connects a trusted host application to an application-owned static site in a
sandboxed iframe. It solves two problems without sharing the host session:

- synchronize public theme and user context; and
- make narrowly delegated HTTP requests and native WebSocket connections to an authorized FastAPI
  runtime.

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
  channel: "mainsequence.fund-competition",
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
| `runtime-starting` | A gateway response says the target runtime is not ready yet |
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

## Open a native FastAPI WebSocket

The host injects a separate one-time ticket resolver. It accepts only the exact target and path
from the iframe, derives Origin from the pinned iframe URL, and maps the authenticated Django
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
socket with `[ticket, "mainsequence.ws-bridge.v1", ...applicationProtocols]`. The gateway strips
the first two values before FastAPI and returns either the application-selected protocol or the
fixed acknowledgement. `socket.protocol` is therefore never the ticket.

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
segment, or dot segment. `/_healthz` and `/logos/...` are gateway-reserved. Application protocols
must be unique valid WebSocket tokens; the `mainsequence.ws-ticket.` and
`mainsequence.ws-bridge.` prefixes are reserved for the platform.

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
  absence of tickets in URLs, storage, DOM, logs, analytics, or errors.

The shorter [Themes and embeds](./themes-and-embeds.md) page remains as a compatibility overview.
The threat model is maintained beside the implementation in `src/embed/THREAT_MODEL.md`.
