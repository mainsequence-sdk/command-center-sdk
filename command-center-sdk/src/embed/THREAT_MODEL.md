# Iframe Widget Threat Model

## Assets

- Command Center session and backend authorization;
- workspace props, resolved inputs, outputs, and per-user state;
- host page integrity, navigation, availability, and audit trail.
- static-site theme context and the logged-in user's public UID.
- the host application's general session credential and the short-lived delegated FastAPI
  credential issued for one source/target release pair.

## Adversaries

- a compromised approved embed origin;
- an unapproved or navigated origin sending messages;
- another frame spoofing bridge messages;
- malformed or oversized payloads attempting resource exhaustion;
- replayed or expired capability tokens.
- project static-site code attempting to choose a source identity, broaden a target credential,
  persist delegated credentials, or trick the host into returning raw backend errors.

## Required Controls

- exact-origin allowlist and exact `event.source` validation;
- sandboxed iframe without top-navigation, popups, downloads, or same-origin privileges by default;
- for static sites that require their own origin, an explicit reviewed sandbox such as the SDK
  default `allow-forms allow-same-origin allow-scripts`, with the iframe kept cross-origin from the
  host and no added popup, download, or navigation capability without review;
- CSP `frame-src`, HTTPS, protocol-version negotiation, JSON-shape validation, and payload limits;
- handshake timeout, sequence checks, explicit teardown, and navigation-triggered re-handshake;
- short-lived, audience-bound, capability-scoped backend tokens with revocation and audit;
- no raw Command Center JWT, cookies, auth headers, or unrestricted backend proxy;
- no full Command Center user/session object; a static-site context may contain only the public UID
  aliases required by its version-one compatibility contract;
- delegated FastAPI requests only after the ready handshake, with exact source window, iframe
  origin, channel, request ID, canonical target UID, backend-issued RPC URL, and future expiry;
- application-owned source release identity and origin validation inside the injected resolver;
- one in-flight credential acquisition per target, bounded timeouts, replay rejection, abort on
  iframe/user/resolver disposal, and in-memory-only refresh before expiry;
- normal project code uses `fetchFastApi` so token/header handling stays inside the SDK; the SDK
  removes legacy routing headers and sends only canonical `X-Resource-Release-UID` authority;
- one bounded, abortable retry policy that retries only replay-safe methods by default, refreshes
  once after `401`, never retries `403`, and treats only `502`/`503`/`504` as runtime start;
- no host session credential, raw backend error, absolute child-selected URL, or persistent token
  storage;
- target FastAPI CORS and route authorization remain independently enforced by the backend; and
- rate and resource limits at both host and backend proxy.

## Residual Risks

An approved embed can exfiltrate data intentionally provided through props or inputs. Operators must
review requested capabilities and data classifications before approval. Native widgets remain more
powerful and therefore require deployment-time code trust rather than iframe trust controls.

Project JavaScript intentionally receives enough authority to call the selected FastAPI release
through `fetchFastApi`. Compromised code in that iframe can exercise operations authorized by that
FastAPI application and exfiltrate returned data while the credential is valid. The bridge limits
target and lifetime; it cannot make code trusted once that code must use the credential. A direct
link has no trusted parent and therefore has no delegated bridge access.
