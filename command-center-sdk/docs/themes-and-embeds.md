---
sidebar_position: 6
title: Themes and embeds
---

# Themes and embeds

This guide matches the `theme-command-center-app`, `embed-command-center-app`, and
`integrate-static-site-iframe` skills.

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
@import "@dev-mainsequence/command-center-sdk/theme/react-flow.css";
@import "@dev-mainsequence/command-center-sdk/theme/react-grid-layout.css";
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

Structural layout—grid placement, breakpoints, widths, positioning, and intrinsic geometry—remains
application-owned unless the SDK publishes a metric for it. Audit authored CSS in local checks and
CI:

```bash
npx command-center-sdk theme audit --path src
```

The audit fails on unknown variables, theme-variable fallbacks, literal colors, and hardcoded
semantic typography, radii, shadows, or other theme-owned values.

## Choose the correct iframe protocol

The SDK has two unrelated protocols:

| Use case | Protocol | Host | Child |
| --- | --- | --- | --- |
| External widget with props, inputs, outputs, user state, sizing, and scoped capabilities | `command-center-iframe@v1` | `SandboxedIframeWidget` or `createIframeBridgeHost` | `createIframeBridgeEmbed` |
| Project-owned static site receiving theme and public-user context | `mainsequence.*`, numeric version `1` | `StaticSiteIframe` or `createStaticSiteIframeHost` | `createStaticSiteIframeClient` |

Do not translate between them. The npm version does not replace either wire-protocol version.

## Embed an external widget

The React host pins one exact HTTPS origin and gives the iframe a scripts-only sandbox:

```tsx
import { SandboxedIframeWidget } from "@dev-mainsequence/command-center-sdk/embed/react";

<SandboxedIframeWidget
  instanceId="risk-summary-1"
  src="https://widgets.example.com/risk-summary"
  allowedOrigin="https://widgets.example.com"
  props={{ portfolioUid }}
  inputs={{ positions }}
  theme={{ "--background": "#09090b", "--foreground": "#fafafa" }}
  locale="en"
  onOutputs={(outputs) => publishWidgetOutputs(outputs)}
  onUserState={(state) => saveWidgetUserState(state)}
  onError={(message) => reportEmbedError(message)}
/>;
```

The external application uses the framework-neutral child controller:

```ts
import { createIframeBridgeEmbed } from "@dev-mainsequence/command-center-sdk/embed";

const bridge = createIframeBridgeEmbed({
  instanceId: "risk-summary-1",
  hostOrigin: "https://command-center.example.com",
  parentWindow: window.parent,
  onMessage(message) {
    if (message.type === "host:init") applyHostContext(message);
    if (message.type === "host:inputs") renderInputs(message.inputs);
  },
});

const onMessage = (event: MessageEvent<unknown>) => bridge.handleMessage(event);
window.addEventListener("message", onMessage);
bridge.post({ type: "embed:ready" });

function publish(outputs: Record<string, unknown>) {
  bridge.post({ type: "embed:outputs", outputs });
}

// On permanent disposal:
window.removeEventListener("message", onMessage);
bridge.dispose();
```

Never send a Command Center session JWT, cookies, unrestricted authorization headers, or an open
backend proxy. If capabilities are required, mint short-lived, audience-bound, capability-scoped
tokens on the server and enforce them at the backend.

## Embed a project-owned static site

The host supplies an authorized launch URL plus current theme/public-user context:

```tsx
import { StaticSiteIframe } from "@dev-mainsequence/command-center-sdk/embed/react";

<StaticSiteIframe
  src={authorizedLaunchUrl}
  themeId={activeTheme.id}
  themeMode={activeTheme.mode}
  userUid={session?.user.publicUid ?? null}
  resolveFastApiCredential={resolveFastApiCredential}
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

const client = createStaticSiteIframeClient({
  channel: "mainsequence.fund-competition",
  hostOrigin: "https://command-center.example.com",
  parentWindow: window.parent,
  onContext(context: StaticSiteIframeContext) {
    const preset = resolveCommandCenterThemeById(context.themeId);
    if (preset) applyThemePresetToRoot(document.documentElement, { theme: preset });
    document.documentElement.classList.toggle("dark", context.themeMode === "dark");
    renderForUser(context.userUid);
  },
  onFastApiStateChange(state) {
    renderFastApiStatus(state);
  },
});

const onMessage = (event: MessageEvent<unknown>) => client.handleMessage(event);
window.addEventListener("message", onMessage);
client.announceReady();

const response = await client.fetchFastApi(
  {
    resourceReleaseUid: configuredFastApiReleaseUid,
    path: "/api/report",
  },
  { method: "GET" },
);

// On permanent disposal:
window.removeEventListener("message", onMessage);
client.dispose();
```

The static-site UID is untrusted display or routing context, not authentication. Never send session
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

`StaticSiteIframe` defaults to `allow-forms allow-same-origin allow-scripts`. Any added popups,
downloads, modals, or navigation require a security review. Production deployments must align the
host's `frame-src`, the child's `frame-ancestors`, and an operator-controlled exact-origin allowlist.

## What to test

- Theme switching, fallback preset resolution, plain CSS, dark/light contrast, and every changed
  optional skin. Compare rendered component computed styles with root variables; a received theme
  ID alone is not proof that the application is themed.
- Wrong iframe origin/source, malformed or replayed messages, payload limits, timeout, navigation,
  repeated initialization, and teardown.
- Expired capabilities and backend token enforcement for generic external widgets.
- Anonymous/public UID behavior and real-browser CSP/sandbox behavior for static sites.
- Delegated FastAPI source/origin/target validation, single-flight reuse, refresh before expiry,
  sanitized errors, bounded cold-start retry, cancellation, exact HTTP-state classification,
  user/navigation/disposal clearing, direct-link failure, and absence of tokens from DOM, URLs,
  storage, logs, analytics, or serialized state. Exercise this path in a real browser so CORS
  preflight, origin binding, and the canonical release header are covered.
