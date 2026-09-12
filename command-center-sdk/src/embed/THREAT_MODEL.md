# Static-Site Iframe Threat Model

## Assets

- host authentication and delegated runtime credentials;
- public user and theme context;
- host and child message integrity;
- application availability.

## Adversaries

- an untrusted or compromised child origin;
- a malicious page attempting to spoof messages;
- replayed, oversized, malformed, or out-of-order messages;
- a caller requesting credentials outside its authorized target scope.

## Controls

- exact-origin and exact-window checks;
- versioned channels and strict message parsing;
- bounded payloads, request correlation, timeouts, and replay rejection;
- sandboxed iframe execution;
- short-lived, target-scoped credentials minted by the backend;
- host-owned authorization and audit logging;
- deterministic teardown of listeners and pending requests.

The public SDK cannot prove that a configured origin is trustworthy. Deployment owners must review
the child origin, content security policy, requested backend capabilities, and data classification.
