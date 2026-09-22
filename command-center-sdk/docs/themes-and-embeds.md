---
sidebar_position: 6
title: Themes and embeds overview
---

# Themes and embeds

This guide matches the `theme-command-center-app` and `integrate-static-site-iframe` skills.

Themes and static-site embedding are separate concepts that meet when a host synchronizes visual
context into an iframe. This page remains at its original URL as a compact compatibility overview.
Use [Themes](./themes.md) for the complete token, density, data-visualization, persistence, and CSS
contract. Use [Static-site embeds](./static-site-embeds.md) for the complete trust boundary,
lifecycle, delegated HTTP, failure model, and production test matrix.

## Theme an application

Import the base styles once, resolve a stable preset ID, and apply it to the intended root:

```ts
import "@dev-mainsequence/command-center-sdk/theme/styles.css";
import {
  applyThemePresetToRoot,
  commandCenterThemes,
  resolveCommandCenterThemeById,
} from "@dev-mainsequence/command-center-sdk/theme";

const theme =
  resolveCommandCenterThemeById(savedThemeId) ?? commandCenterThemes[0];

applyThemePresetToRoot(document.documentElement, { theme });
```

Tailwind v4 applications load the mapping after Tailwind and before SDK utilities:

```css
@import "tailwindcss";
@import "@dev-mainsequence/command-center-sdk/theme/tailwind.css";
@import "@dev-mainsequence/command-center-sdk/theme/styles.css";
@import "@dev-mainsequence/command-center-sdk/theme/utilities.css";
```

Optional skins are separate exports. Import only those used by the application:

```css
@import "@dev-mainsequence/command-center-sdk/theme/markdown.css";
@import "@dev-mainsequence/command-center-sdk/theme/ag-grid.css";
```

Use exported CSS variables, density, surface hierarchy, and data-visualization helpers instead of
copying preset values. Released theme IDs and token names are compatibility contracts; renaming an
ID requires migration of persisted preferences.

### Treat theme variables as a closed consumer contract

Importing the base theme stylesheet means the application delegates semantic visual styling to
the SDK. Use the variables declared by the installed stylesheet for colors, surfaces, typography,
line height, radii, shadows, focus, statuses, density, and charts. Core tokens are unprefixed
semantic names such as `--background`, `--foreground`, `--card`, `--border`, and `--primary`.

Do not invent SDK-looking variables such as `--ms-color-background`, and do not write fallbacks
such as `var(--background, #ffffff)`. Fallbacks hide contract mistakes and create partially themed
interfaces. Consumer aliases are acceptable only when derived entirely from published variables:

```css
.application-panel {
  background: var(--card);
  color: var(--card-foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-family: var(--font-sans);
  font-size: var(--font-size-body);
  line-height: var(--line-height-body);
}
```

Repeated complete-application chrome—page gutters, page headers, top-level section rhythm,
ordinary card padding, and responsive sibling-card grids—is owned by the public `/layout`
primitives. Specialized grid placement, split panes, editors, canvases, positioning, and intrinsic
domain geometry remain application-owned. Audit authored CSS in local checks and CI:

```bash
npx command-center-sdk theme audit --path src
```

The audit fails on unknown variables, theme-variable fallbacks, literal colors, and hardcoded
semantic typography, radii, shadows, or other theme-owned values.

The theme audit does not prove layout conformance. Use
`@dev-mainsequence/command-center-sdk/layout/testing` in a real browser to verify computed sibling
gaps, standard card insets, responsive grid collapse, header-action wrapping, overflow, and
interactive geometry. See [Application layout](./application-layout.md).

## Embed an application-owned static site

The host supplies an authorized launch URL plus current theme/public-user context:

```tsx
import { StaticSiteIframe } from "@dev-mainsequence/command-center-sdk/embed/react";

<StaticSiteIframe
  src={authorizedLaunchUrl}
  themeId={activeTheme.id}
  themeMode={activeTheme.mode}
  userUid={session?.user.publicUid ?? null}
  resolveFastApiCredential={resolveFastApiCredential}
  resolveFastApiWebSocketTicket={resolveFastApiWebSocketTicket}
  className="h-full w-full"
/>;
```

`resolveFastApiCredential` is a host-application adapter. It closes over the trusted source release
UID and exact iframe origin, uses the host's authenticated API client, validates the backend-issued
source/target/origin/RPC URL/expiry binding, and returns only the SDK's narrow delegated credential
shape. The iframe supplies only the target ResourceRelease UID. Neither the host session nor raw
backend errors cross the iframe boundary.

The child installs its listener before announcing readiness and applies every later context update:

```ts
import {
  createStaticSiteIframeClient,
  type StaticSiteIframeContext,
} from "@dev-mainsequence/command-center-sdk/embed";
import {
  applyThemePresetToRoot,
  resolveCommandCenterThemeById,
} from "@dev-mainsequence/command-center-sdk/theme";

let markContextReady!: () => void;
const contextReady = new Promise<void>((resolve) => { markContextReady = resolve; });
const client = createStaticSiteIframeClient({
  channel: "mainsequence.fund-competition",
  hostOrigin: "https://command-center.example.com",
  parentWindow: window.parent,
  onContext(context: StaticSiteIframeContext) {
    const preset = resolveCommandCenterThemeById(context.themeId);
    if (preset) applyThemePresetToRoot(document.documentElement, { theme: preset });
    document.documentElement.classList.toggle("dark", context.themeMode === "dark");
    renderForUser(context.userUid);
    markContextReady();
  },
  onFastApiStateChange(state) {
    renderFastApiStatus(state);
  },
});

const onMessage = (event: MessageEvent<unknown>) => client.handleMessage(event);
window.addEventListener("message", onMessage);
client.announceReady();

// Issue delegated requests only after the trusted host initializes the child.
await contextReady;
const response = await client.fetchFastApi(
  {
    resourceReleaseUid: configuredFastApiReleaseUid,
    path: "/api/report",
  },
  { method: "GET" },
);

const socket = await client.createFastApiWebSocket({
  resourceReleaseUid: configuredFastApiReleaseUid,
  path: "/ws/report-events",
  protocols: ["report-events.v1"],
});

// On permanent disposal:
window.removeEventListener("message", onMessage);
client.dispose();
```

For a top-level local Vite page, use the [same-origin `/api` proxy workflow](./static-site-embeds.md#run-a-top-level-vite-site-with-local-fastapi)
instead of `fetchFastApi`; this hosted example requires an initialized trusted parent and an
authorized release UID. The static-site UID is untrusted display or routing context, not authentication. Never send session
tokens, email, name, organization, permissions, or credentials through this context. For an
authorized FastAPI release, `fetchFastApi` is the normal child API: it accepts only a relative path,
uses the backend-issued RPC URL, injects the delegated bearer token and canonical release header,
reuses the credential only in memory, and refreshes before expiry. Do not manually parse
postMessage, call the control-plane exchange, reconstruct hostnames, or store/log the token.

The client reports `authorizing`, `runtime-starting`, `ready`, `expired`,
`authentication-failed`, `forbidden`, `missing-route`, `transient`, `cancelled`, `unavailable`,
`unsupported`, and `invalid` through `onFastApiStateChange` and `getFastApiState`. It owns an
abortable maximum-three-attempt policy for replay-safe requests. Only `502`, `503`, and `504` mean
runtime start; `401` causes one bounded credential reacquisition, `403` is forbidden, `404` is a
missing route, and an opaque browser fetch failure stays transient/CORS-or-network rather than
being mislabeled as cold start. `POST` and `PATCH` are not replayed by default.

The low-level `requestFastApiCredential` method is reserved for advanced transports that cannot use
`fetchFastApi`; it exposes the narrow token and makes the caller responsible for containing it in
memory. A direct-link static site has no trusted parent bridge and receives `unsupported`, with no
fallback to a normal user credential. Target CORS remains required but is not authentication, and
the FastAPI application still owns route/object authorization.

For WebSockets, `resolveFastApiWebSocketTicket` is a separate authenticated host adapter. It
derives the pinned child Origin, calls the one-time ticket endpoint once, validates the exact
release/path/origin/URL/expiry binding, and returns the SDK ticket shape. The child uses only
`createFastApiWebSocket`; it never receives a raw-ticket API or reuses the HTTP credential. The SDK
places the ticket first and `mainsequence.ws-bridge.v1` second in the native protocol list. The
gateway strips both, so `socket.protocol` is the FastAPI-selected application protocol or the fixed
non-secret acknowledgement. Reconnect by calling the method again for a fresh ticket.

`StaticSiteIframe` defaults to `allow-forms allow-same-origin allow-scripts`. Any added popups,
downloads, modals, or navigation require a security review. Production deployments must align the
host's `frame-src`, the child's `frame-ancestors`, and an operator-controlled exact-origin allowlist.

## What to test

- Theme switching, fallback preset resolution, plain CSS, dark/light contrast, and every changed
  optional skin. Compare rendered component computed styles with root variables; a received theme
  ID alone is not proof that the application is themed.
- Wrong iframe origin/source, malformed or replayed messages, payload limits, timeout, navigation,
  repeated initialization, and teardown.
- Anonymous/public UID behavior and real-browser CSP/sandbox behavior for static sites.
- Delegated FastAPI source/origin/target validation, single-flight reuse, refresh before expiry,
  sanitized errors, bounded cold-start retry, cancellation, exact HTTP-state classification,
  user/navigation/disposal clearing, direct-link failure, and absence of tokens from DOM, URLs,
  storage, logs, analytics, or serialized state. Exercise this path in a real browser so CORS
  preflight, origin binding, and the canonical release header are covered.
- Native WebSocket ticket cancellation, exact binding, platform-protocol ordering, application
  negotiation, acknowledgement fallback, omitted/duplicate selection failure, bidirectional
  frames, close behavior, fresh-ticket reconnect, `connect-src`, and absence of tickets from URLs,
  storage, DOM, logs, analytics, and errors.
