# Application navigation

This module provides controlled React primitives and a framework-neutral definition model for
application rails with grouped sub-applications and destinations.

- `types.ts` defines the application → sub-application → destination hierarchy.
- `definition.ts` validates, composes, and deterministically orders definitions and contributions.
- `ApplicationRail.tsx` renders expandable/collapsible application selection and uses an
  application's `href`, or its default destination's `href`, for native browser link behavior.
- `ApplicationNavigationPanel.tsx` renders the selected application's grouped destinations as
  anchors when an `href` is available and as callback buttons otherwise.
- `ApplicationNavigationShell.tsx` composes both around consumer-owned content.

The module deliberately does not import a router, authentication client, permission store, or
application registry. Consumers filter definitions before rendering and translate
`NavigationIntent` values into their own routes. Plain anchor clicks use those controlled intents;
modified clicks, middle clicks, link context menus, and copy-link behavior remain browser-native.
See `docs/navigation.md` for the public workflow.
