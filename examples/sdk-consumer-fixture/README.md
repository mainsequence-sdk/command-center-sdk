# Packed Package Consumer Fixture

Standalone TypeScript consumer used to prove that the unified Command Center SDK works through its
published export map rather than repository source aliases. Release CI rewrites its SDK dependency
to a freshly produced tarball, installs it in a temporary directory, and compiles
`src/consumer.tsx`.

`src/consumer.tsx` defines a resource application, renders an SDK-owned view, and resolves every
foundational SDK module absorbed from the removed packages: navigation, contracts, embeds,
widgets, widget host/built-ins/testing/UI, workspaces, workspace React, themes, presets, palettes, and packaged
styles. It also compiles the narrow AppComponent, Tabular Transform, Community Table, and Pro Table
entrypoints plus the public Table, AppComponent/Mock JSON, and Tabular Transform authoring contracts
and the workspace-document contract constants.
It also compiles a `StaticSiteIframe` host with the public
`ResolveStaticSiteFastApiCredential` callback, proving that an external application can inject a
trusted resolver without importing product auth, endpoint, or iframe-protocol internals. It also
renders a controlled application rail and grouped sub-application panel through the public
`/navigation` export.

This fixture must not import `@/`, `src/`, `extensions/`, or unpublished private host APIs.

## Validation Contract

- Keep the package dependency pointed at the public SDK name.
- The release workflow replaces it with a freshly packed tarball in an isolated temporary
  installation.
- `npm --prefix examples/sdk-consumer-fixture run check` must compile only
  through published export maps.
- Add one minimal import/use case when a new public SDK subpath joins the release set.

See the [fixture architecture page](../../docs/packages/sdk-consumer-fixture.md) and
[publishing guide](../../docs/packages/publishing.md).
