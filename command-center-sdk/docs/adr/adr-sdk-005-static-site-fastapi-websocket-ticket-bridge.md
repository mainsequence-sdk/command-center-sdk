# SDK ADR 005: Static-Site FastAPI WebSocket Ticket Bridge

- Status: Accepted
- Date: 2026-09-13
- Owners: Command Center SDK Embed
- Package: `@dev-mainsequence/command-center-sdk`
- Related:
  - [SDK ADR 001: Static-Site Delegated FastAPI Credential Bridge](./adr-sdk-001-static-site-delegated-fastapi-credential-bridge.md)
  - [Django ADR-059: FastAPI Knative WebSocket Support](https://github.com/Main-Sequence-Server-Side/tdag-django/blob/development/docs/tdag/pod_manager/adr/adr-059-fastapi-knative-websocket-support.md)
  - [PodDeploymentOrchestrator ADR-0002: FastAPI WebSocket Runtime](https://github.com/Main-Sequence-Server-Side/PodDeploymentOrchestrator/blob/development/docs/architecture/adr-0002-fastapi-websocket-runtime.md)
  - [Infrastructure ADR-009: FastAPI Knative WebSocket Gateway](https://github.com/Main-Sequence-Server-Side/infrastructure/blob/main/docs/ADR/ADR-009-fastapi-knative-websocket-gateway.md)
  - [WHATWG WebSockets opening handshake](https://websockets.spec.whatwg.org/#opening-handshake)

## Decision Summary

The SDK will add a browser-only, one-time FastAPI WebSocket-ticket bridge to the existing
`mainsequence.*` static-site iframe protocol. An embedded site will call one high-level SDK method
with a FastAPI ResourceRelease UID, a normalized WebSocket path, and optional application
subprotocols. The trusted host will obtain a target-, user-, session-, Origin-, and path-bound
ticket through an injected application resolver. The child SDK will immediately construct one
native `WebSocket` with the returned reserved authentication subprotocol first, one fixed
non-secret bridge-acknowledgement subprotocol second, and the application's subprotocols after it.
The gateway will remove both platform values before proxying. It will return the application
subprotocol selected by the FastAPI route, or the fixed acknowledgement when the route selects no
application subprotocol, so the browser always receives exactly one protocol it offered.

The SDK will not reuse the HTTP delegated Bearer credential, expose the opaque ticket as a separate
public value, place a credential in a URL, poll HTTP, proxy WebSocket frames through the parent,
cache tickets, retry a handshake automatically, or create a second iframe protocol version.

The SDK remains application- and backend-neutral. Command Center owns the authenticated resolver
that calls Django's accepted ticket action and injects the resolver into each managed static-site
viewer. Django remains the authorization authority, and after the gateway accepts the upgrade
neither Django nor Command Center is in the WebSocket data path.

## Current-State Verification

This decision was checked against the repositories and package registry on 2026-09-13:

- npm's `latest` dist-tag for `@dev-mainsequence/command-center-sdk` is `0.1.21`;
- the SDK repository's current `main` package metadata is the not-yet-published `0.2.0` line;
- npm `latest` provides `requestFastApiCredential` and `fetchFastApi` for HTTP but no browser
  WebSocket-ticket API; the repository's `0.2.0` line now implements this decision pending release;
- Command Center injects the existing HTTP credential resolver into managed static-site viewers,
  but does not inject a FastAPI WebSocket-ticket resolver; and
- Django ADR-059 fixes the public ticket action, response fields, ticket transport, TTL,
  single-use behavior, error surface, and control-plane/data-plane boundary. The coordinated GCP
  and Azure gateways now strip both platform protocols, validate upstream application selection,
  hide the upstream response header, and return the selected application protocol or the fixed
  acknowledgement. The runtime rejects and redacts either platform protocol if it leaks upstream.

The implementation targets the current application-agnostic SDK architecture. The release number
that first contains it is deliberately not fixed here; Command Center must consume the exact
published version that actually exports this contract.

## Context

REST routes and Starlette-compatible WebSocket routes can be served by the same FastAPI
ResourceRelease, image, Knative revision, hostname, and Uvicorn process. There is no separate
WebSocket release kind or deployment declaration. The browser-side authentication mechanisms are
nevertheless different:

```text
HTTP fetch
  child -> SDK iframe bridge -> Command Center resolver -> delegated Bearer credential
  child -> fetch(rpcUrl, Authorization: Bearer ...)

WebSocket handshake
  child -> SDK iframe bridge -> Command Center resolver -> one-time browser ticket
  child -> WebSocket(websocketUrl, [reserved-ticket, bridge-ack, ...appProtocols])
  gateway -> Django private validator
  gateway -> FastAPI/Starlette route with only appProtocols
  gateway <- selected appProtocol, or no protocol
  browser <- selected appProtocol, or bridge-ack when none was selected
  browser <==================== upgraded connection ====================> pod
```

The standard browser `WebSocket` constructor cannot attach the existing Bearer `Authorization`
header. Putting that credential in a query string would expose it to URLs, history, proxies, logs,
and telemetry. Passing it as an application subprotocol would also violate the accepted backend
contract and expose a reusable credential to project code.

HTTP polling is not an equivalent fallback. It cannot provide full-duplex messages, server-push
latency, WebSocket close semantics, application subprotocol negotiation, or a long-lived upgraded
connection.

## Ownership Boundary

### Owned by this package

This ADR governs only reusable behavior shipped by
`@dev-mainsequence/command-center-sdk`:

1. additive version-one iframe message types and runtime validation;
2. framework-independent host and child APIs;
3. the React `StaticSiteIframe` resolver prop;
4. ticket request correlation, wire-level cancellation, timeout, and sanitization;
5. construction and lifecycle tracking of the native browser `WebSocket`;
6. protocol schemas, fixtures, manifest metadata, public documentation, examples, and threat model;
7. packaged SDK skills and templates that teach the same public API; and
8. focused unit, contract, packaging, external-consumer, and browser tests.

### Owned by Command Center

Command Center must define its companion integration decision and implementation for:

1. using its normal authenticated API client to call Django's public ticket action;
2. deriving the iframe Origin from the viewer's pinned launch URL, never from child input;
3. mapping and sanitizing the backend response and failures into this SDK contract;
4. injecting one stable resolver into every managed `StaticSiteIframe` surface that can launch a
   site; and
5. application-specific cancellation, navigation, authentication-store, and observability wiring.

The SDK must not import a Command Center endpoint, auth store, router, generated API client, or
private application module.

### Owned elsewhere

Django owns ticket issuance, authorization, Origin and path policy, TTL, atomic consumption, and
the private gateway validator. Infrastructure owns upgrade forwarding, authentication and
acknowledgement-subprotocol extraction and removal, downstream selected-protocol rewriting,
uncached validation, and trusted-header injection. The PodDeploymentOrchestrator owns the
always-capable Uvicorn runtime, defense-in-depth rejection if either platform subprotocol leaks
upstream, and WebSocket request identity middleware. The FastAPI application owns its routes,
messages, close behavior, and optional application subprotocols.

## Accepted Backend Contract

The Command Center resolver calls the normal authenticated Django action:

```text
POST /api/v1/resource-releases/{resource_release_uid}/websocket-ticket/
```

with the strict body:

```json
{
  "origin": "https://app.example.com",
  "path": "/ws/orders"
}
```

The response is `Cache-Control: no-store` and has this accepted shape:

```json
{
  "ticket": "<opaque one-time value>",
  "ticket_type": "fastapi_websocket_ticket",
  "credential_transport": "websocket_subprotocol",
  "audience": "fastapi_release_ws",
  "expires_at": "2026-09-13T12:02:00Z",
  "resource_release_uid": "<canonical UUID>",
  "origin": "https://app.example.com",
  "path": "/ws/orders",
  "websocket_url": "wss://<release-host>/ws/orders",
  "subprotocol": "mainsequence.ws-ticket.<opaque one-time value>"
}
```

The default TTL is 120 seconds and is bounded by Django to 1--300 seconds. The ticket is for one
handshake, not one connection lifetime. The first syntactically valid private validation attempt
consumes it even if a later policy check or upstream connection fails. An already upgraded
connection may outlive the ticket expiry.

The complete reserved authentication subprotocol must match the gateway's canonical grammar:

```text
^mainsequence\.ws-ticket\.[A-Za-z0-9_-]{32,256}$
```

The fixed public acknowledgement is:

```text
mainsequence.ws-bridge.v1
```

The acknowledgement is not a credential and is not returned by Django. It is a browser-to-gateway
protocol marker owned by the coordinated SDK/gateway contract. The browser WebSocket algorithm
fails a handshake when the constructor was given one or more protocols but the `101` response does
not select exactly one offered protocol. Therefore the gateway must hide any upstream
`Sec-WebSocket-Protocol` response and emit exactly one downstream value: the valid
upstream-selected application protocol, or `mainsequence.ws-bridge.v1` when upstream selected none.
The gateway must never select or echo the reserved authentication subprotocol.

Command Center validates the backend constants and bindings, then maps only the narrow SDK result.
It does not pass `ticket`, `ticket_type`, `credential_transport`, `audience`, raw error bodies, or
backend metadata across the iframe boundary.

## Decision

### 1. Extend the existing version-one protocol additively

The numeric protocol version remains `1`. Existing `ready`, `initialize`, theme, public-user, and
HTTP credential messages and meanings remain byte-compatible.

Four optional message types are added:

```text
fastapi-websocket-ticket-request
fastapi-websocket-ticket-cancel
fastapi-websocket-ticket-response
fastapi-websocket-ticket-error
```

No WebSocket capability flag is added to `initialize`. Existing version-one parsers validate that
payload strictly, and changing it would break mixed-version consumers. A new child used with an
old host fails its WebSocket request as `unsupported` after the bounded request timeout; it does
not fall back to a broader credential or HTTP polling. A new host remains compatible with an old
child that never sends these optional messages.

### 2. Define the ticket request message

The child requests one exact target and connection path:

```json
{
  "channel": "mainsequence.<application>",
  "version": 1,
  "type": "fastapi-websocket-ticket-request",
  "payload": {
    "requestId": "<bounded-correlation-id>",
    "resourceReleaseUid": "<canonical UUID>",
    "path": "/ws/orders"
  }
}
```

Rules:

- `requestId` matches the existing bounded correlation-ID grammar and is unique among pending
  requests;
- `resourceReleaseUid` is a canonical lowercase UUID;
- `path` is an ASCII absolute path of at most 2,048 bytes with no query, fragment, percent
  encoding, backslash, `//`, or `.`/`..` segment; `/` and trailing-slash routes remain valid;
- `/_healthz` and `/logos/...` are rejected as reserved gateway paths;
- the child does not send Origin, source identity, user identity, organization, environment,
  cluster, release URL, ticket, or application subprotocols; and
- the message remains subject to the existing iframe payload-size bound.

The SDK validates the UID and path before posting the request. The host validates them again before
calling the resolver. The trusted host derives Origin from the exact pinned iframe URL already
used for `postMessage` source and target-origin checks.

### 3. Define cancellation on the iframe wire

If the caller's `AbortSignal` fires while ticket resolution is pending, the child removes the
pending request locally and posts:

```json
{
  "channel": "mainsequence.<application>",
  "version": 1,
  "type": "fastapi-websocket-ticket-cancel",
  "payload": {
    "requestId": "<same-correlation-id>",
    "resourceReleaseUid": "<canonical UUID>",
    "path": "/ws/orders"
  }
}
```

The host acts on a cancel only when its source, Origin, channel, request ID, target UID, and path
match one active request. It aborts that resolver's `AbortController`, removes the request, and
sends no response. Unknown, duplicate, settled, late, or mismatched cancellation is ignored and
cannot cancel another request. Cancellation is best effort: if the authenticated backend request
has already been processed, the backend may already have minted a ticket. Any such late result is
discarded and is never sent to the child or used for a socket.

### 4. Define the injected resolver

The `/embed` entrypoint exposes JSON-safe request/result types and a runtime error class equivalent
to:

```ts
export interface StaticSiteFastApiWebSocketRequest {
  resourceReleaseUid: string;
  path: string;
}

export interface StaticSiteFastApiWebSocketTicket {
  resourceReleaseUid: string;
  origin: string;
  path: string;
  websocketUrl: string;
  subprotocol: string;
  expiresAt: string;
}

export type StaticSiteFastApiWebSocketErrorCode =
  | "invalid_request"
  | "access_denied"
  | "origin_not_allowed"
  | "release_unavailable"
  | "temporarily_unavailable"
  | "unsupported";

export class StaticSiteFastApiWebSocketError extends Error {
  readonly code: StaticSiteFastApiWebSocketErrorCode;

  constructor(code: StaticSiteFastApiWebSocketErrorCode, message?: string);
}

export interface StaticSiteFastApiWebSocketResolverContext {
  signal: AbortSignal;
}

export type ResolveStaticSiteFastApiWebSocketTicket = (
  request: StaticSiteFastApiWebSocketRequest,
  context: StaticSiteFastApiWebSocketResolverContext,
) => Promise<StaticSiteFastApiWebSocketTicket>;
```

`StaticSiteIframeHostOptions` and the React `StaticSiteIframe` props gain:

```ts
resolveFastApiWebSocketTicket?: ResolveStaticSiteFastApiWebSocketTicket;
```

The resolver receives only the exact target UID and normalized path plus an `AbortSignal`. The SDK
host validates that its result has:

- the exact requested target UID and path;
- the exact concrete HTTP(S) Origin pinned for the iframe;
- a future RFC 3339 expiry;
- a `ws:` or `wss:` URL with no username, password, query, or fragment and with the exact requested
  path;
- one canonical reserved subprotocol matching exactly
  `^mainsequence\.ws-ticket\.[A-Za-z0-9_-]{32,256}$`.

The host does not decode the opaque suffix. It requires `wss:` whenever the pinned iframe Origin is
HTTPS. A `ws:` result is valid only when the pinned iframe Origin is HTTP for explicit non-secure
local development. The child repeats the secure-context, URL, path, expiry, and subprotocol checks
before calling the native constructor.

When no resolver is configured, the host responds `unsupported`. A resolver rejects with
`StaticSiteFastApiWebSocketError` to preserve one of the narrow public codes; any other rejection is
sanitized to `temporarily_unavailable`, while a malformed successful result becomes
`invalid_request`. In particular, Django's
`websocket_ticket_store_unavailable`, unclassified `5xx`, and transport failures map to
`temporarily_unavailable`; raw backend bodies and internal metadata are never forwarded.

### 5. Define the narrow response messages

A successful host response contains the connection material the child needs, but not a separate
raw-ticket field:

```json
{
  "channel": "mainsequence.<application>",
  "version": 1,
  "type": "fastapi-websocket-ticket-response",
  "payload": {
    "requestId": "<same-correlation-id>",
    "resourceReleaseUid": "<canonical UUID>",
    "path": "/ws/orders",
    "websocketUrl": "wss://<release-host>/ws/orders",
    "subprotocol": "mainsequence.ws-ticket.<opaque one-time value>",
    "expiresAt": "2026-09-13T12:02:00Z"
  }
}
```

An error response is:

```json
{
  "channel": "mainsequence.<application>",
  "version": 1,
  "type": "fastapi-websocket-ticket-error",
  "payload": {
    "requestId": "<same-correlation-id>",
    "resourceReleaseUid": "<canonical UUID>",
    "path": "/ws/orders",
    "code": "access_denied"
  }
}
```

The child resolves or rejects only the pending request whose channel, request ID, target UID, and
path all match. Unknown, duplicate, late, cancelled, mismatched, or replayed responses are rejected
without constructing a socket.

### 6. Provide one high-level child API

`StaticSiteIframeClient` gains:

```ts
export const STATIC_SITE_FAST_API_WEBSOCKET_ACK_PROTOCOL =
  "mainsequence.ws-bridge.v1" as const;

export interface StaticSiteFastApiWebSocketConnectRequest
  extends StaticSiteFastApiWebSocketRequest {
  protocols?: readonly string[];
}

createFastApiWebSocket(
  request: StaticSiteFastApiWebSocketConnectRequest,
  options?: { signal?: AbortSignal },
): Promise<WebSocket>;
```

The promise resolves after a valid ticket response is received and the SDK has successfully called
the native `WebSocket` constructor. The returned socket may still be in `CONNECTING`; normal
`open`, `message`, `error`, and `close` events remain the caller's interface. The promise does not
wait for `open`, because handshake failures are reported by the browser through WebSocket events
rather than a portable HTTP response.

Preflight, bridge, and resolver failures reject with `StaticSiteFastApiWebSocketError`. An absent
native `WebSocket` implementation rejects as `unsupported`; invalid input or a synchronous native
constructor `SyntaxError` rejects as `invalid_request`. Aborting before construction rejects with a
standard `AbortError`. After construction, handshake and connection failures are delivered only by
the native socket's `error` and `close` events.

For exactly one call, the client:

1. validates the target UID, path, and optional application protocols;
2. requests exactly one new ticket;
3. validates the correlated response and confirms it has not expired;
4. rechecks cancellation immediately before construction;
5. rejects any application protocol using the reserved `mainsequence.ws-ticket.` or
   `mainsequence.ws-bridge.` prefix under an ASCII case-insensitive comparison;
6. constructs
   `new WebSocket(websocketUrl, [ticketSubprotocol, STATIC_SITE_FAST_API_WEBSOCKET_ACK_PROTOCOL,
   ...applicationProtocols])`;
7. installs its lifecycle listener and tracks the socket before resolving the promise; and
8. returns that one socket without exposing the ticket as a separate public value.

Application protocols must be unique, valid WebSocket subprotocol tokens. A request may contain at
most 16 application protocols, each at most 128 ASCII bytes, and the complete serialized protocol
header including the ticket, acknowledgement, delimiters, and application protocols must not
exceed 4,096 bytes. The authentication subprotocol is always first and the acknowledgement always
second. The gateway removes both before proxying, so the FastAPI application sees and negotiates
only the caller's application protocols.

The gateway must return exactly one selected protocol in every successful browser-ticket `101`.
When the FastAPI route selects an application protocol, the gateway returns that value. When the
route selects none, including when the caller supplied no application protocols, the gateway
returns `mainsequence.ws-bridge.v1`. Consequently `socket.protocol` is either the selected
application protocol or the fixed acknowledgement; it is never the ticket. A response with no
selected protocol, the ticket protocol, more than one protocol, or an unoffered protocol fails the
browser handshake.

The initial public API deliberately does not include a raw
`requestFastApiWebSocketTicket` escape hatch. Returning only the constructed `WebSocket` keeps the
single-use secret's normal handling inside the SDK and reduces accidental caching, logging,
replay, or movement into a URL. This is an API-safety boundary, not secrecy from other code running
in the iframe realm: such code can observe `postMessage` traffic or replace the native constructor.
Authorization therefore relies on the ticket's one-time, target, user, session, Origin, path, and
expiry bindings rather than on hiding it from the embedded application.

### 7. Never cache, reuse, or automatically retry a ticket

Every `createFastApiWebSocket` call requests one fresh ticket and makes at most one constructor
attempt. The SDK does not deduplicate concurrent requests, cache tickets, reuse a ticket after a
close or failure, or retry a handshake. A reconnect is an application decision and must call
`createFastApiWebSocket` again to obtain a new ticket.

This rule follows the backend consume boundary: the first validation attempt may spend the ticket
before the upstream connection succeeds. Automatic retry with the same ticket would be both
incorrect and indistinguishable from replay. Automatic retry with a fresh ticket could create
duplicate live connections and would hide application-specific backoff and resynchronization
semantics.

Aborting before construction cancels the pending bridge request. Once the method returns, the
caller owns the socket and uses `socket.close()` for ordinary lifecycle control. The SDK tracks
sockets it created until their `close` event so that changing the initialized user UID or disposing
the iframe client closes any still-open sockets and rejects late ticket responses. Ticket expiry
does not close an already upgraded socket.

### 8. Preserve the iframe trust boundary

The existing exact `event.source`, pinned `event.origin`, channel, version, payload-size, and
runtime-schema checks apply to every new message. Responses are posted only to the pinned child
window and exact Origin. Navigation, iframe replacement, user change, resolver replacement, host
disposal, child disposal, timeout, or abort invalidates pending requests.

Every accepted `ready` after an established handshake starts a new child-document generation,
even when the iframe keeps the same `WindowProxy`, Origin, and channel during a same-Origin reload.
The host aborts and removes requests from the prior generation before sending the new
`initialize`. Late resolver results and responses from an older generation are discarded. The
React wrapper must update a changed resolver without replacing an initialized host with an
uninitialized one; resolver replacement aborts active resolver calls while preserving the current
handshake, unless `src`, target Origin, or target window also changed.

The ticket and reserved subprotocol are transient secrets. They must not enter:

- URLs, query strings, fragments, browser history, or referrers;
- cookies, `localStorage`, `sessionStorage`, IndexedDB, or service-worker caches;
- application state persistence, React Query persistence, Redux/devtools snapshots, or build
  variables;
- logs, analytics, monitoring events, exception messages, or serialized errors; or
- the FastAPI application's headers, scope, state, or selected application subprotocol.

The browser and SDK necessarily hold the reserved subprotocol briefly to initiate the handshake.
The infrastructure gateway is responsible for redacting and removing it before proxying. Project
code receives only the trusted identity context defined by Django ADR-059.

The embedded site's Content Security Policy must permit the returned secure WebSocket target in
`connect-src`. A CSP block is reported through the native socket's `error`/`close` events and is not
misclassified as a ticket or authorization failure.

### 9. Direct-link and mixed-version behavior fail closed

A static site opened without a managed parent has no ticket authority and receives
`unsupported`/timeout behavior. The SDK does not call Django directly because the embedded site
does not own the Command Center session and must not infer an auth endpoint.

Compatibility is:

| Child | Host | Result |
| --- | --- | --- |
| Old | Old or new | Existing initialization and HTTP bridge remain unchanged |
| New | New with resolver and acknowledgement-capable gateway | WebSocket bridge is available |
| New | New without resolver | Immediate sanitized `unsupported` error |
| New | Old | Bounded timeout mapped to `unsupported`; no credential or polling fallback |

The host resolver deadline must be strictly shorter than the child bridge deadline so a capable
host reports `temporarily_unavailable` before the child times out. A post-initialization child
timeout therefore represents an old or non-supporting host and maps to `unsupported`.

## Command Center Integration Handoff

After the SDK contract is implemented and published, Command Center must:

1. create a backend adapter with its normal authenticated client;
2. accept only `{ resourceReleaseUid, path }` from the SDK resolver call;
3. derive `origin` from the exact pinned static-site launch URL owned by the viewer;
4. call
   `POST /api/v1/resource-releases/{resourceReleaseUid}/websocket-ticket/` with
   `{ origin, path }`;
5. require `ticket_type=fastapi_websocket_ticket`,
   `credential_transport=websocket_subprotocol`, and `audience=fastapi_release_ws`;
6. validate exact UID, Origin, path, URL, expiry, and the complete canonical reserved-subprotocol
   grammar before mapping to `StaticSiteFastApiWebSocketTicket`;
7. make exactly one non-cached, non-retried ticket request per resolver invocation;
8. map Django and network failures to the SDK's narrow error codes without returning raw bodies;
9. inject the resolver into every Command Center and Foundry viewer that already provides the
   HTTP `resolveFastApiCredential`; and
10. abort pending issuance and dispose the viewer on every authentication-session transition,
    including logout or same-user session replacement, as well as user, viewer source, iframe
    Origin, target association, or component lifecycle changes.

The application adapter uses this fail-closed mapping:

| Django result | SDK code |
| --- | --- |
| Explicit `400 invalid_request` or serializer rejection | `invalid_request` |
| `401`, non-Origin `403`, or `404` | `access_denied` |
| Explicit `403 origin_not_allowed` | `origin_not_allowed` |
| `409 release_unavailable` | `release_unavailable` |
| `503 websocket_ticket_store_unavailable`, other `5xx`, timeout, or network failure | `temporarily_unavailable` |

Command Center does not invent a positive capability result, retry after an uncertain response, or
turn an unclassified response into authorization. The SDK host itself emits `unsupported` only
when no resolver is installed; that code is not expected from Django.

The existing Command Center WebSocket ticket is a different audience and transport. It must not be
reused for FastAPI, widened, or hidden behind the SDK resolver. The shared concept is one-time
ticketing, not an interchangeable credential.

## Contract, Documentation, and Skill Impact

Implementation is one serialized-protocol change and therefore must update together:

- the public TypeScript message, resolver, request, error, and client API types;
- runtime message and resolver-result validators;
- `contracts/schemas/static-site-iframe-v1.schema.json` with the four additive messages;
- the contract manifest without changing the existing contract ID or protocol version;
- valid fixtures for request, cancellation, response, and each error code;
- invalid fixtures for extra fields, malformed IDs/paths/URLs/expiry/subprotocols, reserved
  platform application protocols, mismatched cancellation/responses, and oversized
  payloads or protocol lists;
- framework-independent host/client tests and React lifecycle tests;
- the embed README, themes-and-embeds guide, threat model, and runnable examples;
- packaged static-site/ResourceRelease skills and templates so agents call
  `createFastApiWebSocket` and do not invent polling or raw postMessage code; and
- package exports, declarations, bundle checks, external-consumer tests, and packed-tarball
  inspection.

No backend model, storage, endpoint, OpenAPI schema, MCP tool, deployment field, ResourceRelease
kind, or automatic-deployment contract is added by this SDK decision.

## Verification Plan

Focused implementation verification must cover:

1. parser and language-neutral schema acceptance of each exact new message;
2. rejection of additional fields, wrong source/origin/channel/version, malformed UID/path,
   mismatched correlation fields, late response, replay, and oversized payload;
3. correlated wire cancellation, resolver abort, cancellation races, and disposal of a ticket
   returned after cancellation;
4. resolver success, typed and sanitized failure mapping, ordered host/child timeouts, navigation,
   repeated-ready generation changes, resolver replacement, user change, and disposal;
5. exact backend-result binding checks for UID, Origin, path, URL, expiry, and the complete reserved
   subprotocol grammar;
6. ticket-first and acknowledgement-second ordering; removal of both before upstream; preservation
   of zero, one, and multiple valid application protocols; upstream application selection; and
   acknowledgement selection when upstream selects none;
7. rejection of duplicate, reserved-platform, over-count, over-length, and over-aggregate
   application protocol lists;
8. one fresh resolver call per connection attempt, with no cache, deduplication, or automatic
   retry;
9. socket ownership after return and forced closure on initialized-user change or client disposal;
10. proof that no raw ticket API, URL credential, persistent storage, or secret-bearing error/log is
   exposed;
11. old-host/new-child and new-host/old-child compatibility;
12. real cross-origin browser tests proving that zero application protocols opens with
    `socket.protocol === mainsequence.ws-bridge.v1`, an upstream-selected application protocol is
    preserved, and omission or duplication of the downstream selected protocol fails the
    handshake, in addition to `Origin`, messages, and close behavior;
13. a Command Center integration test proving that its authenticated resolver uses the pinned
    iframe Origin and is supplied to every managed viewer; and
14. `npm run check`, `npm pack --dry-run`, packed artifact inspection, and an external TypeScript
    consumer importing the new public API.

The browser end-to-end test must not be replaced by a mocked polling or fetch test. Native browser
WebSocket constructor and subprotocol behavior are part of this contract.

## Rollout

1. Amend Django ADR-059, infrastructure ADR-009, and PodDeploymentOrchestrator ADR-0002 with the
   fixed non-secret acknowledgement contract, downstream response selection, stripping rules, and
   runtime defense-in-depth rejection.
2. Implement and test the gateway acknowledgement behavior while gateway activation remains
   default-off.
3. Implement this ADR in the SDK, complete its full maintenance cycle, and publish the first
   package version that actually contains the new APIs, protocol schema, documentation, skills,
   and tests.
4. Complete ADR-059's runtime rollout: release the PodDeploymentOrchestrator with the approved
   runtime, promote its standard base image, and rebuild/redeploy reachable FastAPI images.
5. Deploy Django ticket issuance/validation, then deploy infrastructure gateway changes
   default-off.
6. Enable each infrastructure gateway only after its approved runtime and gateway canaries pass.
   There is no SDK or Command Center cluster-capability switch.
7. Pin Command Center to the exact published SDK version; implement and inject the authenticated
   resolver into every managed viewer after infrastructure is ready for every FastAPI target those
   viewers may expose.
8. Canary an embedded site that serves REST and WebSocket routes from one FastAPI release, then
   broaden rollout.

Rolling back Command Center's resolver makes new WebSocket requests fail closed as `unsupported`
while leaving the existing HTTP bridge and REST traffic unchanged. Rolling back the SDK consumer
must not introduce a polling or credential fallback.

## Rejected Alternatives

### Reuse `requestFastApiCredential`

Rejected because that API returns a delegated Bearer credential. Browsers cannot attach its
`Authorization` header to the WebSocket handshake, and placing it in a URL or subprotocol changes
the credential's exposure and replay properties.

### Poll with `fetchFastApi`

Rejected because polling is not a WebSocket transport and cannot preserve server push,
full-duplex messages, application subprotocols, or connection close semantics.

### Let the embedded child call Django directly

Rejected because the child does not own Command Center's authenticated client, and endpoint/auth
knowledge belongs to the application adapter rather than the reusable SDK.

### Put the ticket in the WebSocket URL

Rejected because URLs leak through browser history, proxies, logs, referrers, telemetry, and error
reporting. Django ADR-059 accepts only the reserved subprotocol transport for browsers.

### Strip the ticket and return no selected subprotocol

Rejected because the browser constructor was given a non-empty protocol list. The browser
WebSocket algorithm fails the handshake when the `101` response omits
`Sec-WebSocket-Protocol`, even though the gateway successfully consumed the ticket and the
upstream accepted the connection.

### Echo the ticket as the selected subprotocol

Rejected because `socket.protocol` would expose the ticket to application code and the one
server-selected value would no longer represent an application subprotocol. The fixed non-secret
acknowledgement satisfies the browser handshake without exposing the credential or preventing an
upstream-selected application protocol from being returned.

### Proxy WebSocket frames through Command Center or Django

Rejected because both are control-plane participants. After the `101` upgrade, the browser must
connect through the gateway directly to the FastAPI pod.

### Cache or automatically retry tickets

Rejected because tickets are single-use and may be consumed before an upstream connection is
established. Automatic fresh-ticket retry could create duplicate connections and cannot know the
application's resynchronization policy.

### Add a WebSocket enablement field or second deployment

Rejected because WebSocket support is an invariant of the standard FastAPI runtime. REST and
WebSocket routes deploy atomically in one existing FastAPI release and pipeline.

### Add a protocol-v2 capability flag

Rejected because the new request/cancel/response/error messages are optional and additive.
Changing the strict `initialize` payload would create a compatibility break without improving the
fail-closed mixed-version behavior.

## Consequences

Embedded applications gain a supported native WebSocket path without receiving Command Center's
general credential or making Command Center/Django a frame proxy. The additional cost is one
uncached authenticated ticket issue and validation per connection attempt. Applications must own
reconnect and state resynchronization, while the SDK owns the safe creation boundary.

The public acknowledgement is visible through `socket.protocol` when the FastAPI route selects no
application subprotocol. It carries no identity or credential. Authorization and session policy are
evaluated when the gateway consumes the ticket; an already upgraded connection is not continuously
revalidated by Django. Command Center must dispose the viewer on local authentication-session
transitions, while applications remain responsible for close/reconnect behavior after remote
revocation, rollout, or transport loss.

The same FastAPI deployment can continue serving REST through `fetchFastApi` and WebSockets
through `createFastApiWebSocket`. Transport selection is made by application code at call time; it
is not inferred by the SDK, Django, deployment orchestrator, or cluster.

## Acceptance Criteria

- Existing `ready`, `initialize`, theme, user, and HTTP FastAPI behavior remains unchanged.
- A managed embedded site can open an authenticated native WebSocket to a specified FastAPI
  ResourceRelease using only the public SDK API.
- The reserved ticket subprotocol is first and the fixed non-secret acknowledgement is second; both
  are removed before upstream, and the ticket is never selected or exposed as a raw public value.
- Every successful browser-ticket `101` returns exactly one protocol offered by the browser: the
  upstream-selected application protocol, or `mainsequence.ws-bridge.v1` when upstream selected
  none. Zero-application-protocol connections open successfully.
- The target UID, pinned iframe Origin, normalized path, returned URL, expiry, and subprotocol are
  checked before socket construction.
- Every connection attempt obtains a fresh ticket; replay, cache, deduplication, and automatic
  handshake retry are absent.
- Command Center supplies the authenticated resolver to every managed static-site viewer and keeps
  its general credential outside the iframe.
- Missing resolver, direct-link, mixed-version, cancellation, and backend-unavailable paths fail
  closed with bounded, sanitized behavior.
- Child cancellation reaches the host resolver, and a late ticket result is discarded without
  constructing a socket.
- REST and WebSocket routes work from one FastAPI release without a new release kind, deployment
  field, pipeline, image, service, hostname, or cluster decision.
- The public TypeScript declarations, runtime validators, language-neutral schema, manifest,
  fixtures, docs, examples, threat model, skills, package exports, and tests describe the same
  contract.
- A real browser canary proves Origin binding, one-time authentication, acknowledgement fallback,
  application-subprotocol negotiation, bidirectional messages, close handling, and a reconnect
  with a new ticket.

## Implementation Record

- [x] Public types and framework-independent host/client APIs implemented.
- [x] React resolver prop implemented.
- [x] Version-one runtime validators, schema, manifest, and fixtures updated together.
- [x] Unit, lifecycle, mixed-version, external-consumer, and real-browser tests passing.
- [x] Embed docs, examples, threat model, and packaged skills updated.
- [ ] Command Center companion ADR accepted and authenticated resolver integrated into every
      managed viewer.
- [x] Django, infrastructure, and runtime ADRs amended for the non-secret acknowledgement and
      downstream protocol-selection contract.
- [ ] Exact package version containing the contract published and consumed by Command Center.
- [ ] End-to-end browser canary passing against the enabled gateway and approved FastAPI runtime.
