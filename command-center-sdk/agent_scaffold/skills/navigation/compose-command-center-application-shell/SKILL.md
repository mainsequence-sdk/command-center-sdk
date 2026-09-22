---
name: compose-command-center-application-shell
description: "Compose or review the canonical shell of a complete Command Center application: embedded production ownership, no child top navigation, zero/one/two-level left navigation, responsive mobile drawers, and the mandatory host-to-API startup gate. Use when creating an app root, choosing sidebar depth, removing duplicate chrome, standardizing an existing Command Center app, or verifying shell conformance. Do not use for page-internal tabs, resource view loading, or host Command Center chrome."
---

# Compose A Command Center Application Shell

## Apply The Production Contract

A complete production application is embedded in the main Command Center. The host owns global
navigation, application switching, account/settings controls, session chrome, and product
branding. The child must not render a top navigation bar, a second global application switcher,
or host controls. Standalone rendering is allowed only behind an explicit local development or
test entrypoint; it is not a second production shell.

Start from [the packaged shell template](assets/embedded-application-shell.tsx). Keep the root
sequence invariant:

```text
viewport startup gate → one chosen navigation depth → ApplicationPage route content
```

Do not mount navigation or route content behind an opaque loader. Until readiness succeeds, they
must be absent from the DOM.

## Choose Exactly One Navigation Depth

Decide from durable route information architecture, not screen size or visual preference:

| Depth | Use when | Composition |
| --- | --- | --- |
| 0 | The app has one durable destination | No sidebar; render `ApplicationPage` |
| 1 | One cohesive work area has multiple durable destinations | `ApplicationNavigationPanelShell` |
| 2 | Multiple independent work areas each have multiple durable destinations | `ApplicationNavigationShell` rail + contextual panel |

For depth one, model one `NavigationApplicationDefinition` and let
`ApplicationNavigationPanelShell` suppress the redundant label when it contains a single section.
For depth two, the rail chooses a work area and the panel shows destinations in that work area.
Use `presentation="auto"`; depth-two apps also set `overlayTrigger="floating"`. Both shells then
own the phone drawer and trigger without forcing the child to invent a top bar.

Use page tabs for subdivisions of the current route. Never add a third sidebar level. Do not create
an application rail for one item, a sidebar for one destination, disabled planned destinations, or
filler group labels such as “Explore”, “Manage”, or a repeated application name. Every routed
destination gets a stable `href`; the application maps plain `NavigationIntent` values to its
router while native modified-link behavior remains intact.

## Gate The Whole Application Until It Is Ready

Route lifecycle implementation to `$build-application-loading-flow`. Every complete app must
verify these stages in order:

1. iframe host context and theme are initialized;
2. delegated API transport and authentication are usable; and
3. the application's critical readiness endpoint confirms required configuration, APIs, and
   models.

Render one `ApplicationStatusScreen variant="viewport"` from the first frame. A successful iframe
handshake alone is not application readiness. On transport loss or session reconnection, return to
the same gate and unmount the shell until all three stages succeed again. Abort obsolete attempts.
Automatically retry transient failures with a bounded application-owned policy; expose a manual
retry for terminal failure. After startup, keep list, detail, picker, and action loading inside the
SDK surface that owns that operation.

Inside every destination, compose the page with `/layout`, its actions and forms with `/controls`,
and its status with `/feedback`. An embedded application that reaches these primitives through the
SDK is indistinguishable from the host; one that hand-rolls a button or a form is not. Route
control work to `$compose-command-center-controls`.

## Verify The Contract

Add a browser test for both startup and ready state using the public verifier:

```ts
import { assertCommandCenterApplicationShell } from
  "@dev-mainsequence/command-center-sdk/navigation/testing";

await assertCommandCenterApplicationShell(page, {
  navigationDepth: 1,
  phase: "startup",
});

await waitForApplicationReady(page);

await assertCommandCenterApplicationShell(page, {
  navigationDepth: 1,
  phase: "ready",
});
```

Test first frame, slow readiness, transient retry, terminal retry, reconnect, phone drawer,
desktop layout, native destination links, and absence of `[data-theme-chrome="topbar"]`. Use the
navigation depth selected in the architecture decision; do not weaken the verifier to accept the
existing implementation.

Read [the application-shell standard](references/application-shell-standard.md) when migrating an
existing application or resolving ambiguous information architecture. Keep API clients, router,
permissions, readiness policy, and persistence in the consuming application.
