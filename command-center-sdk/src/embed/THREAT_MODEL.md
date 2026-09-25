# Static-Site Iframe Threat Model

## Assets

- host authentication and delegated runtime credentials;
- the person's platform access, which the host exercises for the child through platform requests;
- one-time FastAPI WebSocket tickets and reserved authentication subprotocols;
- public user and theme context;
- host and child message integrity;
- application availability.

## Adversaries

- an untrusted or compromised child origin;
- a malicious page attempting to spoof messages;
- replayed, oversized, malformed, or out-of-order messages;
- a caller requesting credentials outside its authorized target scope;
- ticket replay, path/origin substitution, malformed protocol negotiation, or leakage into URLs,
  storage, logs, errors, and FastAPI-visible request state; and
- a child that uses platform requests to reach platform paths or methods the host did not mean to
  serve, through traversal, encoded separators, oversized bodies, or request floods.

## Controls

- exact-origin and exact-window checks;
- versioned channels and strict message parsing;
- bounded payloads, request correlation, timeouts, and replay rejection;
- sandboxed iframe execution;
- short-lived, target-scoped credentials issued by the platform;
- host-owned authorization and audit logging;
- deterministic teardown of listeners and pending requests;
- exact WebSocket UID, Origin, path, URL, expiry, and ticket-subprotocol binding checks;
- ticket-first and acknowledgement-second constructor ordering, with neither platform value
  reaching the FastAPI application;
- one fresh ticket and one constructor attempt per call, with no raw-ticket API, cache,
  deduplication, or automatic retry;
- cancellation propagation plus socket closure on user change and client disposal;
- a child `connect-src` CSP restricted to approved secure WebSocket targets;
- for platform requests, the host's path allow-list as the control: the host's sender serves only
  the paths and methods it chooses and refuses the rest with `not_allowed`, and the SDK knows no
  platform path;
- platform requests sent by the host with its own credential and renewal, so the child never
  receives a platform credential and a credential header the child sets never crosses the bridge;
- strict platform paths (no scheme, host, fragment, backslash, empty segment, dot segment, or
  percent-encoded dot segment, slash, or backslash), so the path an allow-list compares is the
  path the platform routes;
- only `accept`, `content-type`, and a text body cross toward the platform, and only the status,
  `content-type`, and body cross back, with sender failures reduced to five codes; and
- bounded platform requests: 1 MiB request bodies, 8 MiB responses, 16 in flight per child, a
  60-second host timeout, and cancellation that reaches the host's fetch.

The public SDK cannot prove that a configured origin is trustworthy. Deployment owners must review
the child origin, content security policy, requested backend capabilities, and data classification.
The SDK cannot continuously revoke an upgraded connection; the host must dispose the viewer on
authentication-session transitions, and applications own reconnect and resynchronization policy.
The same disposal closes a window platform requests leave open: a request the child posts just
before a person change can reach the host after it and be sent for the new person. The SDK cannot
judge an allow-list either; whatever paths the host serves, the child can reach as the person.
