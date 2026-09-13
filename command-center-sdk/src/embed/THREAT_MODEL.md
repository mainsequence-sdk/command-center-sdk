# Static-Site Iframe Threat Model

## Assets

- host authentication and delegated runtime credentials;
- one-time FastAPI WebSocket tickets and reserved authentication subprotocols;
- public user and theme context;
- host and child message integrity;
- application availability.

## Adversaries

- an untrusted or compromised child origin;
- a malicious page attempting to spoof messages;
- replayed, oversized, malformed, or out-of-order messages;
- a caller requesting credentials outside its authorized target scope; and
- ticket replay, path/origin substitution, malformed protocol negotiation, or leakage into URLs,
  storage, logs, errors, and FastAPI-visible request state.

## Controls

- exact-origin and exact-window checks;
- versioned channels and strict message parsing;
- bounded payloads, request correlation, timeouts, and replay rejection;
- sandboxed iframe execution;
- short-lived, target-scoped credentials minted by the backend;
- host-owned authorization and audit logging;
- deterministic teardown of listeners and pending requests;
- exact WebSocket UID, Origin, path, URL, expiry, and ticket-subprotocol binding checks;
- ticket-first and acknowledgement-second constructor ordering, with both platform values stripped
  by the gateway before FastAPI;
- one fresh ticket and one constructor attempt per call, with no raw-ticket API, cache,
  deduplication, or automatic retry;
- cancellation propagation plus socket closure on user change and client disposal; and
- a child `connect-src` CSP restricted to approved secure WebSocket targets.

The public SDK cannot prove that a configured origin is trustworthy. Deployment owners must review
the child origin, content security policy, requested backend capabilities, and data classification.
The SDK cannot continuously revoke an upgraded connection; the host must dispose the viewer on
authentication-session transitions, and applications own reconnect and resynchronization policy.
