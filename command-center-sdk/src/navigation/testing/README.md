# Application-shell conformance testing

This module verifies the semantic root structure of a complete embedded Command Center
application through the public `/navigation/testing` entrypoint.

## Public entrypoints

- `verifyCommandCenterApplicationShell` returns measurements and stable violation codes.
- `assertCommandCenterApplicationShell` throws `CommandCenterApplicationShellError` when the
  report fails.
- `formatCommandCenterApplicationShellViolations` formats deterministic failure output.
- `CommandCenterApplicationShellBrowserPage` is structurally compatible with Playwright `Page`.

## Behavior and dependencies

The module has no React or Playwright runtime dependency. It executes one DOM inspection through a
driver's `evaluate` method. Startup checks require exactly one viewport `ApplicationStatusScreen`
and no navigation or `ApplicationPage`. Ready checks require exactly one `ApplicationPage`, the
declared zero/one/two navigation depth, and no viewport status screen. Both phases reject child
topbar chrome.

## Maintenance constraints

Violation codes, report fields, navigation-depth values, and consumed `data-cc-*` attributes are
public compatibility boundaries. Keep the verifier aligned with navigation, layout, feedback,
CSS, documentation, the golden skill asset, declaration tests, real-browser tests, and the packed
consumer. It must remain framework-neutral and must not import React, Playwright, routes, API
clients, or application policy.
