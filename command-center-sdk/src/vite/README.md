# Vite

Node-side helpers for an application's Vite dev server. They run under `vite serve` only; nothing
here reaches the browser bundle.

## Entry point

`@dev-mainsequence/command-center-sdk/vite` exports `platformRequestProxy(options?)`, a Vite
plugin, with `PlatformRequestProxyOptions` and `PlatformRequestProxyPlugin`.

## Platform requests in local development

A static site deployed in Command Center sends its platform requests through the host with
`client.sendPlatformRequest(request)` (SDK ADR 013). That is the path to build for. A top-level
page on a local dev server has no host, so `platformRequestProxy()` stands in for it during local
development only:

- The page sends a platform request to `/__mainsequence__/api/...` on its own dev server.
- The dev server sends it to `MAINSEQUENCE_ENDPOINT` with
  `Authorization: Bearer $MAINSEQUENCE_ACCESS_TOKEN`. Both are process-only variables, the same ones
  the SDK's CLI reads; the page never holds the token, and a build never contains it.
- Only the method (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`), the path and query under the platform's
  `/api/`, `accept`, `content-type`, and a body of at most 1 MiB go out, as through the host bridge.
  The status, `content-type`, and the body come back.
- A missing or invalid variable is a `503` with code `platform_not_configured` and a warning when
  the dev server starts. A platform that does not answer is a `502` (`platform_unreachable`). A
  `401` from the platform passes through, with one warning to refresh the token and restart.

`options.path` changes the route; it starts with `/` and does not end with one.

## Security

The route adds the developer's token, so it serves only the page its own dev server serves:

- The caller must be this machine (`127.0.0.0/8` or `::1`), so another computer cannot use it when
  the dev server listens on the network.
- The `Host` header must name this machine (`localhost`, `*.localhost`, `127.x.x.x`, or `[::1]`), so
  a site that points its own domain name at `127.0.0.1` (DNS rebinding) cannot read through it.
- A browser request another site makes (`Sec-Fetch-Site` other than `same-origin` or `none`, or an
  `Origin` other than the page's) is refused, so no other site can act as the developer.

The plugin does not rely on Vite's own checks, which depend on its version and configuration:
Vite skips its host check for an HTTPS dev server or `allowedHosts: true`, and its default CORS lets
any localhost page read responses. The middleware runs before Vite serves files, which also keeps
Vite's SPA fallback from answering an `Accept: */*` request, such as an image, with the page.

## Maintenance

- Keep the request shape equal to the host bridge's (`src/embed/static-site.ts`), so a request that
  works locally also works embedded.
- The plugin types only the parts of Vite's dev server it uses, so the published declarations need
  neither Vite's nor Node's types. `tests/types/vite-platform-request-proxy.ts` proves it still fits
  Vite's `PluginOption`.
- `platform-request-proxy.test.ts` runs the middleware against a stand-in platform and inside a real
  Vite dev server; every refusal above has a test that fails without its check.
