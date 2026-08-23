# Application layout

This module provides the public React primitives for complete Command Center-compatible page
composition. Import components from `@dev-mainsequence/command-center-sdk/layout`, import the SDK
component and theme styles once, and use
`@dev-mainsequence/command-center-sdk/layout/testing` for real-browser geometry verification.

## Public entrypoints

- `/layout`: `ApplicationPage`, `ApplicationPageHeader`, `ApplicationPageStack`,
  `ApplicationCard`, and `ApplicationCardGrid` plus their public prop types.
- `/layout/testing`: framework-neutral browser-page types, the supported viewport matrix,
  `verifyCommandCenterPageLayout`, and `assertCommandCenterPageLayout`.

The SDK owns responsive page gutters, maximum width, top-level section rhythm, ordinary card
surfaces and content insets, page-header wrapping, and ordinary card-grid collapse. Consumers own
section ordering, product state, specialized charts/forms/editors/canvases, and explicit
full-bleed content.

The module has no router, authentication, permission, persistence, transport, or backend
dependency. Keep the stable `data-cc-*` attributes intact: the public browser verifier uses them to
measure final geometry.

See `docs/application-layout.md` for the complete workflow and copyable examples.
