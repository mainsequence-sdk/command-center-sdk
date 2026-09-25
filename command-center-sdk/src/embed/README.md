# Static-Site Iframe APIs

The embed module implements the application-owned `mainsequence.*` version-one static-site
handshake. It provides a framework-neutral host/client protocol and a React host component.

## Entry points

- `/embed`: message types, parsers, host/client creation, origin resolution, delegated FastAPI
  HTTP helpers, native WebSocket ticket construction, and platform requests sent through the host.
- `/embed/react`: `StaticSiteIframe`.

## Required controls

- Use an exact expected origin; never `*`.
- Keep the iframe sandbox minimal.
- Validate channel, version, message type, request IDs, payload size, and message source.
- Expose only the public user UID and theme context.
- Resolve runtime credentials through a trusted host callback.
- Resolve one-time WebSocket tickets through a separate trusted host callback; never reuse the
  HTTP credential.
- Send the child's platform requests through a trusted host sender that serves only the paths the
  host chooses; the child never holds a platform credential.
- Enforce authorization, target scope, expiry, CORS, and origin policy in the backend.
- Dispose listeners and reject late or duplicate responses.

The SDK does not own authentication or credential minting. The host application injects those
capabilities and remains responsible for policy and audit behavior.
For a directly opened Vite page, use an application-owned `/api` client and local FastAPI proxy.
The [static-site embed guide](../../docs/static-site-embeds.md#run-a-top-level-vite-site-with-local-fastapi)
links a runnable consumer example. `fetchFastApi` requires a trusted host bridge and target release
UID; it is not the local proxy transport.

## Protocol lifecycle

The child installs a message listener and sends `ready`. The host accepts it only from the exact
configured origin and target window, records the version-one channel, and sends current theme and
public-user context. Later context updates reuse that channel. Both sides reject malformed,
oversized, wrong-origin, wrong-window, wrong-channel, and out-of-order messages.

```text
child                         host
  ── ready ───────────────────→
  ←──────────── initialize ────
  ── credential request ──────→
  ← credential response/error ─
  ── WebSocket ticket request →
  ← ticket response/error ─────
  ── native WebSocket ─────────────────────────→ FastAPI release
  ── platform request ────────→  host sender ──→ platform, as the person
  ← platform response/error ───
  ── platform cancel ─────────→
```

Request IDs are correlated and replay-protected. Handshake, credential, and platform request work
have bounded timeouts. Disposing either endpoint removes its ability to accept later work; active
host resolver and sender calls receive an aborted signal.

## React host

```tsx
import { StaticSiteIframe } from "@dev-mainsequence/command-center-sdk/embed/react";

<StaticSiteIframe
  src={launchUrl}
  allowedOrigin="https://reports.example.com"
  themeId={activeTheme.id}
  themeMode={activeTheme.mode}
  userUid={session?.user.publicUid ?? null}
  resolveFastApiCredential={resolveFastApiCredential}
  resolveFastApiWebSocketTicket={resolveFastApiWebSocketTicket}
  sendPlatformRequest={sendPlatformRequest}
  onProtocolError={reportProtocolError}
/>;
```

`StaticSiteIframe` owns listener setup, exact source-window validation, context updates, and
teardown. Its default sandbox is `allow-forms allow-same-origin allow-scripts`. Additional popup,
download, modal, or navigation permissions require a deployment security review.

The host's resolver closes over trusted source identity and the approved child origin. It validates
the backend result's target UID, RPC origin/path, and expiry before returning the narrow public
credential. Raw backend response bodies and the host session never cross the iframe boundary.

## Framework-neutral child

```ts
import { createStaticSiteIframeClient } from "@dev-mainsequence/command-center-sdk/embed";

const client = createStaticSiteIframeClient({
  channel: "mainsequence.report",
  hostOrigin: "https://command-center.example.com",
  parentWindow: window.parent,
  onContext: applyPublicContext,
  onFastApiStateChange: renderTransportState,
});

const onMessage = (event: MessageEvent<unknown>) => client.handleMessage(event);
window.addEventListener("message", onMessage);
client.announceReady();

const response = await client.fetchFastApi(
  { resourceReleaseUid, path: "/api/report" },
  { method: "GET", signal },
);

const socket = await client.createFastApiWebSocket({
  resourceReleaseUid,
  path: "/ws/orders",
  protocols: ["orders.v2"],
});

window.removeEventListener("message", onMessage);
client.dispose();
```

Install the listener before `announceReady`. The child applies every context update and keeps
delegated credentials only in memory. `fetchFastApi` requires a relative path, injects the
credential and canonical release header, refreshes before expiry, and applies the documented
abortable bounded retry policy. Direct-link mode has no trusted host and fails as `unsupported`
without a credential fallback.

`createFastApiWebSocket` accepts one absolute WebSocket path and optional application protocols.
It requests a fresh one-time ticket, validates the response, and calls the native constructor with
the reserved ticket first and `mainsequence.ws-bridge.v1` second. It returns the socket without
exposing a raw ticket. Neither reserved protocol reaches the FastAPI application; `socket.protocol` is the
application-selected protocol or the fixed acknowledgement. Reconnects require a new method call.

## Platform requests

An embedded application never holds a platform credential. It hands `sendPlatformRequest` a
standard Fetch `Request`; the host sends it as the signed-in person and the child receives a
standard Fetch `Response`:

```ts
const host = createStaticSiteIframeHost({
  // ...
  sendPlatformRequest: async (request, { signal }) => {
    if (!servesPlatformPath(request.method, request.path)) {
      throw new StaticSitePlatformRequestError("not_allowed");
    }
    // The host's own authenticated fetch: it adds the host's credential and renews it.
    return platformFetch(request.path, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal,
    });
  },
});

const response = await client.sendPlatformRequest(new Request("/api/projects/", { signal }));
```

- Wire: `platform-request` (`requestId`, `userUid`, `method`, `path`, optional `headers` limited
  to `accept` and `content-type`, optional text `body`), `platform-response` (`requestId`, `status`,
  `headers` limited to `content-type`, `body`, `bodyEncoding` of `text` or `base64`),
  `platform-error` (`requestId`, `code`), and `platform-cancel` (`requestId`).
- Caps: a path and query of 4,096 characters; header values of 1,024; a request body of 1 MiB of
  UTF-8; a response body of 8 MiB decoded, past which the answer is `unsupported`; 16 requests in
  flight per child, which the client queues past and the host refuses past. Platform requests and
  responses are exempt from `maxPayloadBytes`, which still bounds every other message.
- The host calls the sender only when the request's `userUid` is the person in its current context
  (`access_denied` when it names anyone else or the host has none, `unsupported` without a
  sender), so a request sent before a person change is refused rather than sent for the new person.
  It aborts the sender's signal on `platform-cancel`, a person change, a new handshake, a replaced
  sender (answered `temporarily_unavailable`), and disposal. Its timeout is 60 seconds.
- The client names its current person as `userUid`, upper-cases the method, sends the URL's
  pathname and search, drops every other header, and refuses what the rules exclude before
  sending. It cancels on `request.signal`,
  rejects pending requests with `access_denied` on a person change, and reports a host that never
  answers as `unsupported` after 65 seconds.
- JSON and UTF-8 `text/*` bodies travel as text and every other body as base64; the child's
  `Response` holds the exact bytes, the status, and the content type, and nothing else.
- The bridge does not stream: live streams are not bridged.

## Failure model

Credential resolver failures are reduced to `StaticSiteFastApiCredentialError` codes, and platform
request failures to `StaticSitePlatformRequestError` codes: `invalid_request`, `access_denied`,
`not_allowed`, `temporarily_unavailable`, and `unsupported`. A sender's failure that is not a
`StaticSitePlatformRequestError` becomes `temporarily_unavailable` without its message. A status
below 200 cannot be a Fetch `Response` and is `unsupported` on the child. Transport
state distinguishes authorization, runtime start, ready, expiry, authentication failure,
forbidden, missing route, transient, cancelled, unavailable, unsupported, and invalid. Do not
serialize raw credentials or backend diagnostic bodies into errors.

Only `502`, `503`, and `504` mean the runtime is starting. `401` permits one credential
reacquisition, `403` is forbidden, `404` is a missing route, and opaque fetch failure remains
transient/CORS-or-network. Unsafe methods are not retried unless explicitly enabled under an
application/backend idempotency contract.

## Compatibility and maintenance

- `command-center.static_site_iframe@v1`, schema ID, message fields, channel grammar, and error
  meanings are compatibility boundaries.
- Keep TypeScript types, strict parsers/builders, JSON Schema, fixtures, docs, tests, and host/child
  mixed-version behavior synchronized for any wire change.
- Authentication, target authorization, CORS, Origin policy, expiry, and audit remain backend/host
  responsibilities.
- WebSocket tickets are one-time transient secrets: do not put them in URLs, storage, application
  state, logs, analytics, errors, or FastAPI-visible headers.
- Test this module with unit fixtures and a real cross-origin browser deployment covering CSP,
  sandbox, CORS, context updates, request replay, cancellation, user/navigation transitions, and
  disposal.
- ADR SDK-005 defines the implemented WebSocket contract. Its message fields, reserved protocol
  constants, ordering, cancellation, and no-retry behavior are compatibility boundaries.
- ADR SDK-013 defines the platform request bridge. Its message fields, error codes, caps, the
  body-encoding rule, and the child's unsupported-on-silence behavior are compatibility
  boundaries. The SDK names no platform path; the host's sender owns the allow-list.

See `docs/static-site-embeds.md` for the complete integration guide and `THREAT_MODEL.md` for the
assets, adversaries, and required controls.
