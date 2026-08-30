# SDK ADR 001: Static-Site Delegated FastAPI Credential Bridge

- Status: Accepted
- Date: 2026-08-18
- Owners: Command Center SDK Embed
- Package: `@dev-mainsequence/command-center-sdk`
- Related:
  - [Themes and embeds](../themes-and-embeds.md)
  - [command-center-sdk issue 3](https://github.com/mainsequence-sdk/command-center-sdk/issues/3)
  - [tdag-django issue 383](https://github.com/Main-Sequence-Server-Side/tdag-django/issues/383)
  - [Command Center ADR 075: Foundry Static-Site FastAPI Credential Bridge Integration](https://github.com/Main-Sequence-Server-Side/CommandCenter/blob/main/docs/adr/main_sequence/adr-075-foundry-static-site-fastapi-credential-bridge-integration.md)
  - [Backend ADR-0034: Static-Site-Delegated FastAPI Release Credentials](https://github.com/Main-Sequence-Server-Side/tdag-django/blob/development/docs/platform/adr/adr-0034-static-site-delegated-fastapi-release-access.md)

## Decision Summary

The Command Center SDK owns the public browser bridge through which an
embedded Main Sequence static-site application requests a short-lived
credential for one FastAPI ResourceRelease.

The trusted host application keeps its normal user credential inside its own
authenticated API client. It injects a backend-neutral resolver that returns a
narrow credential for the requested release. The SDK transfers that credential
to the exact managed iframe through the `mainsequence.*` protocol.

Application static-site code uses a supported SDK child API. It never parses raw
postMessage events, receives the host application's general credential, imports
the host application's auth store, or calls a control-plane exchange endpoint
directly.

This package owns the complete reusable bridge slice:

- versioned iframe messages and runtime validation;
- framework-independent host and child APIs;
- the React `StaticSiteIframe` host integration;
- in-memory credential lifecycle and refresh coordination;
- public documentation, threat model, examples, and compatibility behavior;
- the language-neutral protocol schema, fixtures, and manifest entry; and
- packaged Command Center SDK skills and templates.

## Ownership Boundary

### Owned by this package

This ADR governs only code and contracts shipped by
`@dev-mainsequence/command-center-sdk`:

1. `@dev-mainsequence/command-center-sdk/embed` public TypeScript APIs;
2. `@dev-mainsequence/command-center-sdk/embed/react` host integration;
3. the `mainsequence.*` static-site iframe protocol;
4. frontend-only memory, expiry, refresh, cancellation, and error handling;
5. the SDK contract bundle for bytes crossing the iframe boundary;
6. public SDK documentation and threat modeling;
7. `agent_scaffold` skills, templates, skill metadata, and packaged-skill
   validation; and
8. focused SDK, contract, packaging, external-consumer, and browser tests.

### Not owned by this package

This ADR does not define or implement:

- a host application's authenticated API adapter, endpoint selection, auth
  store, router, or viewer-specific resolver closure;
- Django token claims, permissions, serializers, models, or validators;
- backend MCP ontology or backend-owned design skills;
- FastAPI gateway routing or authentication configuration;
- PodDeploymentOrchestrator middleware;
- FastAPI runtime request-user injection;
- Main Sequence Python SDK behavior;
- target FastAPI CORS persistence or deployment;
- application FastAPI route authorization; or
- a static-site direct-link authentication service.

Those are external dependencies or application responsibilities. This ADR
records only the public resolver behavior the SDK consumes from a host. It must
not contain implementation plans or private paths for another repository.

## Context

The SDK already owns the static-site iframe protocol:

```text
channel: "mainsequence.<application>"
version: 1
```

Its existing handshake carries:

- `ready` from child to parent;
- `initialize` from parent to child;
- theme mode and theme ID; and
- the logged-in user's public UID as untrusted display context.

The current contract correctly prohibits sending a normal host access token or
session into application-controlled iframe code.

Static-site dashboards also need to call separately deployed FastAPI releases.
CORS permits a browser origin but does not authenticate a user. The trusted
parent can obtain a delegated credential through an application-owned adapter,
then satisfy the SDK's resolver contract without exposing its general session.

The missing frontend capability is a supported bridge. Without one, every
application would invent its own postMessage payloads, token caching, refresh,
origin checks, and error behavior. Some applications would eventually pass the host
user's general credential because it is the easiest credential available to the
parent.

## Injected Application Resolver Contract

The SDK does not call a control-plane endpoint and does not know how the host
authenticates. The host injects a resolver through a public SDK option. The SDK
passes that resolver only:

- the exact canonical target ResourceRelease UID requested by the child; and
- an `AbortSignal` tied to the active iframe lifecycle.

The application derives source identity, user authority, organization, origin,
and endpoint selection from its own trusted state. It maps its backend response
to the public `StaticSiteFastApiCredential` shape only after validating the
target UID, URL, token, and expiry plus any application-specific source and
origin bindings.

The SDK validates the mapped public result again before sending it across the
iframe boundary. Backend endpoint paths, response implementation fields, token
claims, permissions, and application error bodies are deliberately outside
this package decision. The owning application and backend ADRs define those
details.

## Decision

### 1. Preserve the host credential boundary

The host application's normal user credential remains exclusively inside the
parent application's authenticated API client.

It must never be included in:

- iframe source URLs, query parameters, or fragments;
- `ready`, `initialize`, or credential messages;
- SDK static-site context;
- static-site build environment variables;
- application-owned browser storage;
- application logs, analytics, or errors; or
- a FastAPI request made by hosted application code.

The SDK accepts only the already delegated credential returned by the
application-provided resolver. It has no access to the application's auth store
and no API for supplying a general user credential.

### 2. Extend the existing version-one protocol additively

The current numeric version remains `1`. Existing `ready` and `initialize`
messages do not change.

Three optional message types are added:

```text
fastapi-credential-request
fastapi-credential-response
fastapi-credential-error
```

This is additive because existing children need not request a credential and
existing theme/public-user initialization remains unchanged. A future change
that alters an existing message or its meaning requires a new protocol version
and a transition plan.

### 3. Credential request message

The child requests one exact target ResourceRelease:

```json
{
  "channel": "mainsequence.<application>",
  "version": 1,
  "type": "fastapi-credential-request",
  "payload": {
    "requestId": "<bounded-correlation-id>",
    "resourceReleaseUid": "<canonical-fastapi-release-uid>"
  }
}
```

Rules:

- `requestId` is generated by the SDK child, matches
  `^[A-Za-z0-9._:-]{1,128}$`, and is unique among that child's pending
  requests;
- `resourceReleaseUid` is a canonical UUID string;
- the child does not send a source release UID, origin, user identity, backend
  URL, token scope, or organization; and
- the message is subject to the existing payload-size limit.

The host derives source identity from the viewer association owned by the
parent application. It never trusts source identity from application code.

### 4. Credential response message

After its injected resolver succeeds, the host responds:

```json
{
  "channel": "mainsequence.<application>",
  "version": 1,
  "type": "fastapi-credential-response",
  "payload": {
    "requestId": "<same-correlation-id>",
    "resourceReleaseUid": "<canonical-fastapi-release-uid>",
    "rpcUrl": "<backend-issued-rpc-url>",
    "token": "<delegated-token>",
    "expiresAt": "2026-08-18T12:05:00Z"
  }
}
```

The response is posted only to the exact pinned iframe origin. The SDK does not
reconstruct the FastAPI hostname and does not decode the token.

The child resolves only the pending request whose channel, request ID, and
target UID all match. Unknown, duplicate, late, mismatched, or replayed
responses are rejected.

### 5. Credential error message

The host maps application resolver failures to a small frontend-safe
vocabulary:

```json
{
  "channel": "mainsequence.<application>",
  "version": 1,
  "type": "fastapi-credential-error",
  "payload": {
    "requestId": "<same-correlation-id>",
    "resourceReleaseUid": "<canonical-fastapi-release-uid>",
    "code": "access_denied"
  }
}
```

The supported codes are:

```text
invalid_request
access_denied
origin_not_allowed
release_unavailable
temporarily_unavailable
unsupported
```

The bridge does not forward raw backend bodies, stack traces, internal URLs,
permissions, branches, environments, clusters, or provider metadata.

### 6. Public SDK types

The `/embed` entrypoint exposes JSON-safe public types equivalent to:

```ts
export interface StaticSiteFastApiCredentialRequest {
  resourceReleaseUid: string;
}

export interface StaticSiteFastApiCredential {
  resourceReleaseUid: string;
  rpcUrl: string;
  token: string;
  expiresAt: string;
}

export type StaticSiteFastApiCredentialErrorCode =
  | "invalid_request"
  | "access_denied"
  | "origin_not_allowed"
  | "release_unavailable"
  | "runtime_starting"
  | "temporarily_unavailable"
  | "unsupported";

export interface StaticSiteFastApiCredentialResolverContext {
  signal: AbortSignal;
}

export type ResolveStaticSiteFastApiCredential = (
  request: StaticSiteFastApiCredentialRequest,
  context: StaticSiteFastApiCredentialResolverContext,
) => Promise<StaticSiteFastApiCredential>;
```

The runtime parsers validate the same shapes. They do not expose decoded JWT
claims or backend response implementation fields such as `delegation`.

### 7. Framework-independent host API

`StaticSiteIframeHostOptions` gains an optional injected resolver:

```ts
resolveFastApiCredential?: ResolveStaticSiteFastApiCredential;
```

The host remains backend-neutral:

- it validates source window, exact iframe origin, channel, version, payload,
  request ID, and target UID;
- it invokes the resolver with an `AbortSignal`;
- it validates the returned target UID, URL, token, and expiry;
- it posts the exact response or a sanitized error;
- it aborts pending work on disposal, navigation, channel replacement, or
  resolver replacement; and
- it never imports a product endpoint, auth store, router, or Main Sequence
  API adapter.

When no resolver is provided, credential requests receive `unsupported`.
Theme and public-user initialization continue normally.

### 8. Framework-independent child API

`StaticSiteIframeClient` gains:

```ts
requestFastApiCredential(
  request: StaticSiteFastApiCredentialRequest,
  options?: StaticSiteFastApiCredentialRequestOptions,
): Promise<StaticSiteFastApiCredential>;

fetchFastApi(
  request: StaticSiteFastApiFetchRequest,
  init?: RequestInit,
): Promise<Response>;

getFastApiState(resourceReleaseUid: string): StaticSiteFastApiTransportState;

clearFastApiCredentials(): void;
```

`fetchFastApi` is the normal child API. It accepts a canonical target release UID and relative
path, uses the backend-issued RPC URL, and injects the delegated bearer credential plus
`X-Resource-Release-UID`. `requestFastApiCredential` is the advanced escape hatch for transports
that cannot use `fetch`; it exposes the narrow token and therefore requires the caller to preserve
the same in-memory-only boundary.

The client owns:

- correlation IDs;
- pending request promises;
- response and error parsing;
- one in-flight request per target release;
- in-memory credential reuse before the refresh threshold;
- reacquisition before expiry;
- explicit `authorizing`, `runtime-starting`, `ready`, `expired`,
  `authentication-failed`, `forbidden`, `missing-route`, `transient`, `cancelled`,
  `unavailable`, `unsupported`, and `invalid` client states;
- one bounded credential reacquisition after `401`;
- maximum-three-attempt backoff for `502`, `503`, `504`, or opaque transport
  failures on replay-safe methods;
- `AbortSignal` cancellation during credential waiting, retry backoff, and fetch;
- bounded timeouts;
- clearing credential memory on context-user change, disposal, or explicit
  clear; and
- rejection of responses after cancellation or disposal.

It does not own:

- the host application's authenticated backend exchange call;
- a refresh token;
- persistent browser storage;
- application request authorization; or
- FastAPI route construction beyond returning the backend-issued `rpcUrl`.

### 9. React host API

`StaticSiteIframe` from `/embed/react` gains the same optional controlled
resolver prop:

```tsx
<StaticSiteIframe
  src={launchUrl}
  themeId={activeTheme.id}
  themeMode={activeTheme.mode}
  userUid={session.user.uid}
  resolveFastApiCredential={resolveFastApiCredential}
/>
```

The React wrapper passes the resolver to the SDK host lifecycle. It aborts
pending requests and clears bridge state whenever the iframe source/origin,
component instance, user UID, or resolver identity changes.

The React component does not import host-application authentication or backend
API code.

### 10. Hosted application request usage

Application-owned static-site code normally uses the SDK's high-level fetch method:

```ts
const response = await iframeClient.fetchFastApi(
  {
    resourceReleaseUid: configuredFastApiReleaseUid,
    path: "/api/me",
  },
  { method: "GET" },
);
```

Applications use the exact `rpcUrl`; they do not reconstruct `fapi` hostnames. They
do not set the browser-controlled `Origin` header. Normal application code does not receive or manage
the token directly.

The SDK documentation must explain that the credential authenticates the user
to one FastAPI release. It does not itself grant permission for every
application route or object.

### 11. In-memory-only credential lifecycle

The child keeps credentials only in closure/module memory owned by the client
instance.

Credentials must not enter:

- `localStorage` or `sessionStorage`;
- IndexedDB;
- cookies;
- URLs, fragments, history, or referrers;
- service-worker persistent caches;
- workspace/widget persistence;
- build variables;
- logs, analytics, monitoring, or error serialization; or
- React Query persistence or development-state snapshots.

The SDK treats `expiresAt` as authoritative. It requests a new credential
before expiry using a small clock-skew margin and never attempts to refresh by
decoding or extending the current token.

The SDK owns the single retry policy so applications do not reinterpret HTTP
states independently. `401` clears credential memory and allows one bounded
reacquisition, `403` is forbidden, `404` is a missing route, and only
`502`/`503`/`504` represent runtime start. An opaque browser failure is
`transient` because the browser cannot distinguish CORS, DNS, TLS, and network
failures. The default maximum is three attempts. `POST` and `PATCH` are not
automatically replayed; an application may explicitly opt in only when its API
provides idempotency protection. Authorization and origin-policy errors are
never retried.

### 12. Parent source and origin binding

The host accepts a request only after the normal `ready` handshake and only
when:

- `event.source` is the exact managed iframe window;
- `event.origin` equals the exact origin resolved from the current iframe URL;
- channel matches the established application channel;
- version equals 1;
- the message is schema-valid and within the payload limit; and
- the viewer instance is still active.

The parent application supplies the source StaticSiteRelease UID inside the
resolver closure. The iframe never chooses or overrides it.

Every host response uses the exact pinned target origin, never `*`.

### 13. Host application integration boundary

A host application wires the bridge by creating a resolver with its own trusted
source identity, authenticated API client, expected iframe origin, and backend
adapter. It passes that resolver to `StaticSiteIframe`; it does not pass a host
access token prop, duplicate SDK message parsing, or maintain a second bridge
credential cache.

The host adapter is responsible for validating every application-specific
binding before returning the small public SDK credential shape. Its endpoint,
authentication, source-release rules, organization policy, and error mapping
remain application-owned.

The MainSequence Foundry implementation is specified separately by Command
Center ADR 075. That decision consumes this SDK extension point without making
Foundry paths, endpoints, or auth state part of the reusable package.

## Language-Neutral Protocol Contract

Messages cross an iframe boundary and may be implemented by applications that
do not use TypeScript. The SDK package must therefore add a language-neutral
contract bundle.

The implementation adds, relative to the package root:

```text
contracts/schemas/
  static-site-iframe-v1.schema.json
contracts/fixtures/valid/
  static-site-iframe-v1.ready.json
  static-site-iframe-v1.initialize.json
  static-site-iframe-v1.fastapi-credential-request.json
  static-site-iframe-v1.fastapi-credential-response.json
  static-site-iframe-v1.fastapi-credential-error.json
contracts/fixtures/invalid/
  static-site-iframe-v1.wrong-version.json
  static-site-iframe-v1.invalid-target-uid.json
  static-site-iframe-v1.missing-token.json
  static-site-iframe-v1.unrestricted-user-credential.json
```

`contracts/manifest.json`, `contracts/README.md`, backend-contract guidance,
contract tests, and packed-package assertions must include the new contract.

The JSON Schema covers only wire messages. It does not serialize callbacks,
`AbortSignal`, React props, client instances, or cached credentials.

Runtime parsers and the schema must accept and reject the same fixtures.

## Compatibility and Mixed Versions

### New host with old child

Works unchanged. The child sends only `ready` and receives `initialize`.

### Old host with new child

Theme initialization works, but the old host cannot answer a credential
request. The new child times out or reports `unsupported`. It must not fall
back to requesting or accepting a general host credential.

### New host with new child

The credential request uses the additive version-one messages.

### Navigation or user replacement

The old client instance is disposed, pending requests are rejected, and
in-memory credentials are cleared. A new iframe performs a new handshake.

There is no compatibility alias, alternate message name, token-in-initialize
field, or raw-postMessage escape hatch.

## Direct-Link Behavior

A static site opened directly in a new tab has no trusted host-application parent
and therefore cannot use this SDK bridge to obtain a delegated FastAPI
credential.

The client reports that the bridge is unavailable. It must not discover the
parent origin dynamically, call the backend exchange with a copied token, or
reinterpret the static-site session as a FastAPI credential.

Direct-link authenticated API access requires a separate product decision and
is not owned by this ADR.

## Security Model

### Protected assets

- the host application's normal user credential and refresh credential;
- the short-lived delegated FastAPI credential;
- authenticated FastAPI response data; and
- the integrity of source/target release selection.

### Trust boundaries

- The host application is trusted to hold its normal user session.
- The SDK host is trusted to enforce iframe source/origin/channel binding.
- Application static-site JavaScript is not trusted with general platform
  authority but intentionally receives the narrow delegated credential.
- The backend and public gateway remain authoritative for authentication and
  release access; the frontend is not an authorization boundary.

### Residual risk

Application JavaScript can exercise every FastAPI operation that the target
application authorizes for the current user while the delegated credential is
valid. It can also exfiltrate returned data.

The SDK cannot protect a credential from malicious code in the same iframe
that must use it. The design limits authority and lifetime; it does not turn
untrusted application code into a safe environment.

## Packaged Skill and Template Contract

The SDK's skills are a required product surface and ship with the same package
version as the public APIs.

The implementation must update:

```text
agent_scaffold/skills/embed/
  integrate-static-site-iframe/SKILL.md
agent_scaffold/skills/general/
  use-command-center-sdk/SKILL.md
  build-command-center-application/SKILL.md
```

Update associated skill metadata, installation/copy tests, skill maps, packed
package assertions, and any static-site application template that emits iframe
client code.

`integrate-static-site-iframe` must teach agents to:

- use `createStaticSiteIframeClient` from the public `/embed` entrypoint;
- request an exact FastAPI ResourceRelease through `fetchFastApi` with a relative path;
- consume the backend-issued `rpcUrl`;
- let the SDK send the delegated token and canonical target UID only to that release;
- keep credentials in memory;
- clear/dispose on teardown;
- handle unavailable, access-denied, origin-denied, timeout, and expiry states;
- recognize that direct-link mode has no bridge; and
  - never request, accept, store, or log a host application's general user
    credential.

The general skills must route static-site/FastAPI composition to
`integrate-static-site-iframe` and must not retain contradictory guidance that
there is no supported authenticated transport.

Skills must name only APIs exported by the same packed SDK version. Raw
postMessage examples may illustrate the wire contract in protocol docs but
must not be presented as the application implementation workflow.

## Human Documentation

The same implementation updates:

```text
src/embed/README.md
src/embed/THREAT_MODEL.md
docs/themes-and-embeds.md
```

Documentation must include:

- the public import and smallest working host/child example;
- the backend-neutral resolver boundary;
- exact source and origin validation;
- in-memory-only credential lifecycle;
- refresh and disposal behavior;
- target CORS as an external prerequisite, not authentication;
- application-owned FastAPI authorization;
- mixed-version behavior;
- direct-link limitations; and
- the residual risk of application JavaScript receiving the narrow credential.

## Backend and Storage Impact

### Backend impact

This package defines no backend endpoint. An application resolver may consume
an additive backend contract such as the one documented by backend ADR-0034,
but the SDK sees only the mapped public credential or a sanitized error.

If the application or backend capability is unavailable, the resolver returns
`unsupported` or `temporarily_unavailable`; the SDK never falls back to a
broader credential.

### Storage impact

There is no persisted frontend storage change.

The credential, pending requests, expiry metadata, and cache live only in the
SDK client/host instance. Workspace documents, widget state, application
settings, URL state, browser auth storage, and backend persistence remain
unchanged.

## Rejected Alternatives

### Pass the general host credential through `initialize`

Rejected. It would mix untrusted display context with general platform
authority and expose the credential to every hosted application.

### Let each application implement postMessage

Rejected. It would duplicate validation, correlation, refresh, cancellation,
storage, and error behavior and would make security dependent on every application.

### Import the host application's auth store into the SDK

Rejected. The public SDK must remain backend-neutral and reusable. The owning
application injects a narrow resolver.

### Let the iframe call the control-plane exchange endpoint

Rejected. The iframe does not receive the normal parent credential and must not
own control-plane authentication.

### Put the delegated token in the launch URL

Rejected. URLs leak through browser history, copied links, instrumentation,
screenshots, and application location handling.

### Persist delegated credentials

Rejected. The token is short-lived and intentionally tied to one live iframe
session. Persistence increases exposure and complicates user/navigation
changes.

### Create a parallel application-local bridge

Rejected. Applications own authenticated backend adapters and viewer context,
but the protocol and lifecycle are reusable SDK responsibilities. A host
integrates through the injected resolver instead of duplicating message parsing
or credential caching.

## Package Implementation Record

### Phase 1: Version-one protocol contract

- [x] Add the three message types and strict runtime parsers.
- [x] Add public JSON-safe message and credential types.
- [x] Add the JSON Schema, manifest entry, valid/invalid fixtures, and parser
      parity tests.
- [x] Preserve existing ready/initialize behavior and document mixed versions.

### Phase 2: Public host and child APIs

- [x] Add the injected host resolver and sanitized error mapping.
- [x] Add child request, high-level fetch, correlation, single-flight, memory, expiry, clear, and
      disposal behavior.
- [x] Add the controlled React resolver prop and lifecycle cleanup.
- [x] Export every supported type/API through public package entrypoints.

### Phase 3: External-consumer boundary

- [x] Add a clean external-consumer fixture that injects a resolver through the
      public package entrypoint.
- [x] Verify the resolver can enforce application-owned source and origin
      context without importing application state into the SDK.
- [x] Verify no product endpoint, auth store, router, or private application
      type enters package source or declarations.
- [x] Keep real product integration and backend-response validation in their
      owning application repositories.

### Phase 4: Documentation, skills, and packaging

- [x] Update embed README, threat model, and the human themes-and-embeds guide.
- [x] Update `integrate-static-site-iframe`, related general skills, metadata,
      examples, and static-site templates.
- [x] Update contract README/backend guide and packed-package contents.
- [x] Validate that public docs, skills, schemas, fixtures, and source expose the
      same released API.

## Focused Validation

### Protocol

- valid request, response, and error messages parse;
- wrong origin, source window, channel, version, UID, request ID, payload size,
  URL, token, and expiry fail;
- replayed, duplicate, late, and mismatched responses fail;
- existing ready/initialize messages remain byte-compatible; and
- runtime parser and JSON Schema agree on every fixture.

### Host and child lifecycle

- host invokes the resolver only after a valid handshake;
- absent resolver returns `unsupported`;
- one target has one in-flight child request;
- valid unexpired credentials are reused only in memory;
- expiry causes reacquisition rather than token decoding or extension;
- lifecycle callbacks distinguish authorizing, cold start, readiness, expiry,
  authentication, authorization, missing route, and opaque transport failure;
- replay-safe cold-start and transport failures stop at the configured bound;
- `POST` and `PATCH` are not replayed by default;
- cancellation stops credential waiting, retry backoff, or fetch;
- access/origin denial does not loop;
- navigation, user change, resolver change, disposal, and explicit clear abort
  work and remove credentials; and
- no general host credential appears in any message or persisted state.

### External consumer

- a clean consumer injects a resolver through only published package exports;
- the resolver can return a valid credential or every sanitized error code;
- application-specific source and origin context remains inside the consumer;
- the consumer does not duplicate bridge message parsing or credential cache;
- replacing the resolver or iframe cancels pending work; and
- a real cross-origin browser fixture proves preflight, canonical
  `X-Resource-Release-UID`, bounded cold-start retry, refresh, failure-state
  classification, cancellation, and absence of credential persistence; and
- the existing static-site launch/theme/public-user-context flow remains
  unchanged.

### Documentation, skills, contracts, and package

- public examples import only published entrypoints;
- `integrate-static-site-iframe` teaches the exact shipped APIs;
- general skills route to the specialized workflow;
- no skill recommends a general host credential, raw postMessage implementation, URL token,
  or persistent token storage;
- schema, fixtures, manifest, README, and backend guide agree;
- install/copy tests include the updated skills; and
- an `npm pack` consumer can import the APIs and read the protocol contract.

Use the package maintenance cycle and run the focused SDK, external-consumer,
contract, skill, packaging, and docs checks required by the final diff.

## Consequences

### Positive

- Hosted applications gain one supported authenticated FastAPI bridge.
- The host application's general credential remains outside application-controlled
  code.
- SDK consumers do not implement security-sensitive postMessage or refresh
  logic independently.
- The SDK package remains backend-neutral through an injected resolver.
- The actual product viewer uses the same public API taught by skills and docs.
- Non-TypeScript clients can validate the versioned wire contract.

### Costs and risks

- The SDK owns additional asynchronous credential lifecycle state.
- The integrated viewer depends on the separately owned backend exchange and
  FastAPI gateway enforcement remaining available and compatible.
- Old hosts cannot satisfy new credential requests, so new clients must handle
  `unsupported` without unsafe fallback.
- Application JavaScript intentionally sees the narrow delegated credential and can
  use it for the target release until expiry.
- Public source, schemas, fixtures, docs, skills, templates, and packaging must
  remain synchronized.

## Acceptance Evidence

This ADR is `Accepted` because:

1. the version-one protocol includes the three documented credential messages;
2. public host, child, and React APIs implement the resolver and in-memory
   credential lifecycle;
3. runtime parsers, JSON Schema, manifest, and valid/invalid fixtures agree;
4. a clean external consumer can inject a resolver and complete the bridge
   through only public package entrypoints;
5. no general host credential crosses the iframe boundary or enters application
   code;
6. public docs, threat model, examples, templates, and packaged
   skills teach the exact released APIs;
7. no frontend persisted-storage contract changes;
8. mixed-version and direct-link behavior fail safely without broader
   credential fallback;
9. focused SDK, external-consumer, protocol, contract, skill, package, browser,
   and docs checks pass;
10. the public package version containing this implementation is merged to the
    default branch and published; and
11. the ADR contains no claim that this package implements Django, gateway,
    orchestrator, Python SDK, or backend MCP responsibilities.
