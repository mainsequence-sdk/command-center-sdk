# SDK ADR 014: Local Platform Request Proxy

- Status: Accepted
- Date: 2026-09-25
- Owners: Command Center SDK maintainers
- Package: `@dev-mainsequence/command-center-sdk`
- Contract: none; a new `/vite` entry point for the dev server
- Related:
  - [SDK ADR 013: Static-Site Platform Request Bridge](./adr-sdk-013-static-site-platform-request-bridge.md)
  - [Static-site embeds](../static-site-embeds.md#send-platform-requests-in-local-development)

## Decision summary

A static site deployed in a host sends its platform requests through the host (SDK ADR 013), and
that stays the only path a deployed site takes. A top-level page on a local Vite dev server has no
host, so for local development only the SDK adds `platformRequestProxy()`, a Vite plugin from the
new `/vite` entry point. The page sends a platform request to `/__mainsequence__/api/...` on its own
dev server, which sends it to `MAINSEQUENCE_ENDPOINT` with the developer's
`MAINSEQUENCE_ACCESS_TOKEN`, both read from the dev server's environment. The page never holds the
token, and a build never contains it.

## Context

With SDK ADR 013 an embedded application holds no platform credential: the host sends each request
as the signed-in person. During local development the page runs top-level, under `vite serve`, and
nothing hosts it, so every platform request fails and features built on the platform, such as AI
capabilities, cannot be developed locally.

The platform's developer tooling already authenticates a developer with a JWT in the process
environment: the SDK's CLI reads `MAINSEQUENCE_ENDPOINT` and `MAINSEQUENCE_ACCESS_TOKEN`. Local
development can use the same variables, provided the token stays in the dev server.

## Decision drivers

- The deployed path does not change, and a production build cannot take the local one.
- The page never holds the developer's token; no `VITE_` variable, bundle, URL, or browser storage
  carries it.
- No change to the platform, to an application's own API, or to the host.
- A request that works locally has the shape the host bridge carries.
- The route must not let another site, or another computer, act as the developer.

## Decision

1. `@dev-mainsequence/command-center-sdk/vite` exports `platformRequestProxy(options?)`, a Vite plugin
   that runs only under `vite serve`. `options.path` changes the route from `/__mainsequence__`.
2. The plugin adds one middleware, which runs before Vite serves files. A request under the route is
   sent to `MAINSEQUENCE_ENDPOINT` plus the rest of the path, with `Authorization: Bearer` and the
   token. The variables are read from the process environment on each request. The plugin makes its
   own checks rather than rely on Vite's, which depend on Vite's version and configuration.
3. The request shape is the bridge's: `GET`, `POST`, `PUT`, `PATCH`, or `DELETE`; a path and query
   under the platform's `/api/`, resolved before the check; `accept` and `content-type`; a body of at
   most 1 MiB. The status, `content-type`, and the body come back, with `cache-control: no-store`.
   There is no allow-list: the host has one, so a path that works locally can still be refused
   embedded.
4. Refusals, each a JSON body with `code` and `detail`: `not_local` (403) when the caller is not this
   machine or the `Host` header is not a loopback name, which stops DNS rebinding;
   `cross_site_request` (403) when `Sec-Fetch-Site` is other than `same-origin` or `none`, or `Origin`
   is not the page's; `method_not_allowed` (405); `not_a_platform_api_path` (404);
   `request_too_large` (413); `platform_not_configured` (503), naming the missing or invalid
   variable and never its value; `platform_unreachable` (502). A `401` from the platform passes
   through, and the dev server warns once to refresh the token and restart.
5. The page selects the local path itself, only when `import.meta.env.DEV` is true and it runs
   top-level, and otherwise calls `client.sendPlatformRequest`. The iframe client does not change and
   never falls back to the dev server.
6. The published declarations describe only the parts of Vite's dev server the plugin uses, so they
   need neither Vite's nor Node's types; a type test proves the plugin fits Vite's `PluginOption`.

## Compatibility and Mixed Versions

Additive. The `/vite` entry point is new; no existing export, contract, message, or behavior
changes. Applications that do not add the plugin are unaffected. The plugin works with any Vite
dev server whose middleware stack is connect-compatible, which the type test pins.

## Host Handoff and Backend Impact

None. The platform receives the developer's requests with the developer's own token, exactly as it
receives the SDK CLI's. Hosts are not involved in local development.

## Alternatives Considered

- **A token in a `VITE_` variable, read by the page.** Rejected: Vite writes those into the bundle,
  so a build made on that machine would ship the token, and the page would hold a credential.
- **A sign-in inside the site for local development.** Rejected: every application would carry
  development-only authentication code, and the developer's password would go into a development
  page.
- **Forwarding through the application's own API.** Rejected: a static site may have no API, and the
  API would carry development-only code.
- **Running a host locally.** Rejected: developers of static sites do not run the host.
- **A fallback inside `createStaticSiteIframeClient` when there is no parent.** Rejected: the client
  would guess between transports; the page chooses explicitly, and the client keeps one path.
- **Plain Vite `server.proxy` configuration with an `Authorization` header.** Rejected: it adds the
  token to every request that reaches it. Vite's own host and CORS checks depend on its version and
  configuration; an HTTPS dev server has no host check, and the default CORS lets any localhost page
  read responses.

## Consequences

- AI capabilities and other platform features can be developed on a top-level local page with the
  same request shape as the deployed site.
- Local development has no allow-list, so embedded testing before release stays necessary.
- The token lives in the dev server's environment until the developer replaces it; an expired
  token is a `401` until the dev server restarts with a new one.
