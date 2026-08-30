# Command Center Iframe APIs

The `/embed` module owns the public, framework-independent iframe protocols and controllers used by
Command Center-compatible hosts and embedded applications. React hosts import components from
`/embed/react`.

## Protocols

The SDK intentionally supports two independently versioned contracts:

- `command-center-iframe@v1` is the generic external-widget protocol. It carries props, inputs,
  theme tokens, locale, declared outputs, user state, sizing, and optional scoped capabilities.
- `mainsequence.*` with numeric `version: 1` is the static-site parent-context protocol. It carries
  the active theme mode, theme preset ID, the logged-in user's public UID, and optional delegated
  access to one requested FastAPI ResourceRelease after a child-owned `ready` handshake.

Do not translate messages between these protocols or choose one based on the npm package version.
Use the generic bridge for independently deployed widgets participating in the widget runtime. Use
the static-site bridge for application-owned web applications opened in the Command Center static-site
viewer.

## Entry Points

- `src/protocol.ts`: generic widget protocol contracts and validators.
- `src/host.ts`: generic widget host controller.
- `src/embed.ts`: generic external-widget client.
- `src/static-site.ts`: static-site message contracts, validation, host controller, and child
  client.
- `/embed/react`: `SandboxedIframeWidget` and `StaticSiteIframe` React hosts.
- `THREAT_MODEL.md`: required deployment controls and residual risks.

## Static-Site Host

The host supplies application state and a backend-neutral credential resolver explicitly; the SDK
never reads an auth or theme store:

```tsx
import { StaticSiteIframe } from "@dev-mainsequence/command-center-sdk/embed/react";

<StaticSiteIframe
  src={launchUrl}
  themeId={activeTheme.id}
  themeMode={activeTheme.mode}
  userUid={session?.user.uid ?? null}
  resolveFastApiCredential={async ({ resourceReleaseUid }, { signal }) =>
    applicationApi.issueStaticSiteFastApiCredential({
      sourceResourceReleaseUid,
      targetResourceReleaseUid: resourceReleaseUid,
      expectedOrigin: staticSiteOrigin,
      signal,
    })
  }
  className="h-full w-full"
/>;
```

The React host derives and pins the target origin, validates `event.source`, sends context only
after a valid `ready` message, and republishes context whenever the theme or public user UID
changes. Its default sandbox is `allow-forms allow-same-origin allow-scripts`; review any added
capabilities such as popups, downloads, or top navigation against the deployment threat model.

Framework-independent hosts use `createStaticSiteIframeHost` from `/embed` and attach its
`handleMessage` method to their message listener.

The application adapter owns the authenticated exchange endpoint and validates its source release,
target release, iframe origin, RPC URL, and expiry before returning the public
`StaticSiteFastApiCredential` shape. The iframe chooses only the canonical target release UID. It
never supplies source identity, origin, user, organization, endpoint, or token claims. If no
resolver is configured, credential requests fail safely with `unsupported` while theme and public
user context continue to work.

## Static-Site Child

Use the SDK client instead of implementing `postMessage` parsing in each application:

```ts
import {
  createStaticSiteIframeClient,
  type StaticSiteIframeContext,
} from "@dev-mainsequence/command-center-sdk/embed";

const client = createStaticSiteIframeClient({
  channel: "mainsequence.fund-competition",
  hostOrigin: import.meta.env.VITE_COMMAND_CENTER_ORIGIN,
  parentWindow: window.parent,
  onContext(context: StaticSiteIframeContext) {
    document.documentElement.dataset.theme = context.themeId;
    document.documentElement.style.colorScheme = context.themeMode;
    document.documentElement.classList.toggle("dark", context.themeMode === "dark");
  },
  onFastApiStateChange(state) {
    renderFastApiStatus(state);
  },
});

const handleMessage = (event: MessageEvent<unknown>) => client.handleMessage(event);
window.addEventListener("message", handleMessage);
client.announceReady();

const response = await client.fetchFastApi(
  {
    resourceReleaseUid: configuredFastApiReleaseUid,
    path: "/api/positions",
  },
  { method: "GET" },
);

// On permanent application disposal:
window.removeEventListener("message", handleMessage);
client.dispose();
```

Install the listener before calling `announceReady`, keep it active for every initialization, and
configure the exact parent origin from trusted deployment configuration. The channel must be a
stable application-specific value beginning with `mainsequence.`.

`fetchFastApi` is the normal application API. It accepts only a relative path, uses the exact
backend-issued RPC URL, and adds the delegated bearer credential plus canonical
`X-Resource-Release-UID` header. The client coordinates one in-flight acquisition per target,
reuses valid credentials in memory, refreshes before expiry, and clears them on public-user change,
explicit clear, or disposal. It never stores credentials in browser storage, URLs, cookies,
service-worker caches, serialized application state, logs, or analytics.

The same client owns a bounded, abortable transport policy. By default it makes at most three
attempts for `502`, `503`, `504`, or an opaque browser transport failure, and automatically reuses
only replay-safe `GET`, `HEAD`, `OPTIONS`, `PUT`, and `DELETE` requests. `POST` and `PATCH` are never
automatically replayed unless the caller explicitly sets `retryUnsafeMethods: true` and the API
provides its own idempotency protection. Pass `RequestInit.signal` to cancel credential waiting,
backoff, or the active fetch. Set `retry: false` on one request when retry is inappropriate.

Use `onFastApiStateChange` or `getFastApiState(resourceReleaseUid)` to render the exact lifecycle:
`authorizing`, `runtime-starting`, `ready`, `expired`, `authentication-failed`, `forbidden`,
`missing-route`, `transient`, `cancelled`, `unavailable`, `unsupported`, or `invalid`. Only
`502`/`503`/`504` are classified as runtime start. A browser `TypeError` remains `transient`
because browsers intentionally do not reveal whether CORS, DNS, TLS, or the network blocked the
response. A `401` clears the cached credential and permits one bounded reacquisition; `403` is
never retried.

`requestFastApiCredential` is a lower-level advanced API for a transport that cannot use
`fetchFastApi`; using it exposes the narrow token to application code and transfers responsibility for
containing it in memory. It must never be used to expose or request the host application's general
session credential.

Credential failures are `StaticSiteFastApiCredentialError` values with one safe code:
`invalid_request`, `access_denied`, `origin_not_allowed`, `release_unavailable`,
`runtime_starting`, `temporarily_unavailable`, or `unsupported`. Raw backend errors never cross the
iframe boundary.
A directly opened static site has no trusted host bridge and therefore receives `unsupported`; it
must not fall back to a copied user token or call the control-plane exchange directly.

An iframe importing `/theme` can resolve `context.themeId` with
`resolveCommandCenterThemeById(...)` and apply the preset with `applyThemePresetToRoot(...)`. If a
host uses an unpublished theme ID, the child should still apply `context.themeMode` as a fallback.

## User Context

The static-site wire payload retains `id`, `uid`, and `user_uid` aliases for version-one
compatibility, but all three contain the same public UID. New applications consume only
`context.userUid` from the SDK client.

This UID is untrusted display or routing context. It is not authentication, authorization, or
proof of identity. Never send a session JWT, cookies, email, name, organization membership,
permissions, or unrestricted backend credentials through the iframe context.

## Generic Widget Bridge

Generic external widgets use `SandboxedIframeWidget` and `createIframeBridgeEmbed`. The host sends
theme tokens through `host:init.theme`. If a widget requires a public UID, the application host
must deliberately include it in `host:init.props`; the generic bridge does not read Command Center
authentication state.

## Compatibility And Backend Impact

Wire compatibility is controlled by each explicit protocol version, not by the npm version.
Breaking message changes require a new protocol version and a host transition path.

The iframe APIs do not persist data and do not require a backend model change. Exchange-launch URL
issuance, authentication, source/target authorization, origin allowlists, target CORS, token
minting, revocation, auditing, application-route authorization, and proxy enforcement remain
host/backend responsibilities. CORS permits an origin; it is not authentication or authorization.
