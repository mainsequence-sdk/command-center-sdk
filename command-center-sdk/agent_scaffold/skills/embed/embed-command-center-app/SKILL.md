---
name: embed-command-center-app
description: Build, review, or secure an external widget integration with the generic command-center-iframe@v1 APIs in @dev-mainsequence/command-center-sdk/embed or /embed/react. Use for SandboxedIframeWidget hosts, createIframeBridgeEmbed clients, widget props, inputs and outputs, theme tokens, locale, user state, sizing, scoped capability tokens, lifecycle teardown, or external-widget iframe threat modeling. Use integrate-static-site-iframe instead for application-owned mainsequence.* ready/initialize static sites.
---

# Embed A Command Center Application

This skill covers the generic external-widget protocol. Route application-owned static sites that
receive theme mode, theme ID, and public user UID through `$integrate-static-site-iframe` instead.

## Read The Protocol And Threat Boundary

Inspect the installed `/embed` and `/embed/react` declarations and the package threat model before
implementing either side. Keep the explicit `command-center-iframe@v1` protocol identifier; npm
package versions do not replace wire-version negotiation.

## Build The Host Safely

1. Allow one exact HTTPS origin; never use `*`.
2. Validate both `event.origin` and `event.source`.
3. Sandbox the iframe without `allow-same-origin`, top navigation, popups, or downloads unless a
   separate security review requires them.
4. Apply CSP `frame-src` and an operator-controlled origin allowlist.
5. Mint short-lived, audience-bound, capability-scoped tokens on the server.
6. Destroy the host controller when the iframe unmounts or navigates.

Never send a Command Center session JWT, cookies, unrestricted auth headers, or an open backend
proxy to the embedded application.

## Build The External Client

Validate the expected parent origin, handle every host initialization message, and exchange only
the typed protocol payloads. Treat props, locale, theme data, and public user identifiers as
untrusted UI context rather than authentication. Publish only declared outputs.

Reinitialize safely when theme, locale, props, or capabilities change. Enforce payload, sequence,
timeout, rate, and resource limits appropriate to the deployment.

## Verify

Test wrong origins, wrong source windows, malformed and oversized payloads, timeout, navigation,
reinitialization, teardown, expired capabilities, and output delivery. Record backend/security work
needed for token minting, revocation, audit, and proxy enforcement.
