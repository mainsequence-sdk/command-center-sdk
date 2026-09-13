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

## Public API

Import the complete surface from the declared subpath:

```ts
import {
  ApplicationNavigationShell,
  composeNavigationApplications,
  defineNavigationApplication,
  defineNavigationContribution,
  findNavigationDestination,
  type NavigationIntent,
} from "@dev-mainsequence/command-center-sdk/navigation";
```

Definitions form an application → sub-application → destination hierarchy. IDs are stable
controlled-state identifiers. `composeNavigationApplications` validates every definition, applies
contributions to an existing target application, and sorts by finite `order`, then label and ID.
It returns cloned ordered definitions rather than mutating caller data.

## Minimal controlled composition

```tsx
const applications = composeNavigationApplications([
  defineNavigationApplication({
    id: "operations",
    label: "Operations",
    defaultDestinationId: "services",
    subApplications: [
      {
        id: "inventory",
        label: "Inventory",
        destinations: [
          { id: "services", label: "Services", href: "/services" },
        ],
      },
    ],
  }),
]);

<ApplicationNavigationShell
  applications={applications}
  activeApplicationId="operations"
  activeDestinationId="services"
  collapsed={collapsed}
  onCollapsedChange={setCollapsed}
  openApplicationId={openApplicationId}
  onOpenApplicationChange={setOpenApplicationId}
  onNavigate={(intent) => navigateIntent(intent)}
>
  {routeContent}
</ApplicationNavigationShell>;
```

The host controls active route identity, rail collapse, the open application panel, and route
commit. The shell owns composition and interaction presentation. A destination `href` preserves
native new-tab, modified-click, context-menu, and copy-link behavior; only a plain activation is
delivered as `NavigationIntent` to the host.

## Validation and unavailable states

Definition helpers throw `NavigationDefinitionError` for empty IDs/labels, empty supplied hrefs,
non-finite order values, duplicate application/sub-application/destination/contribution IDs,
missing contribution targets, or an invalid default destination. Validate static definitions at
module initialization so configuration errors fail before render.

Permission evaluation remains host-owned. Filter definitions before composition or mark a known
destination disabled with an `unavailableReason`. Do not fetch permissions inside a renderer or
silently convert forbidden destinations into working links.

## Extension and maintenance constraints

- Use contributions to add a sub-application to a known application; do not mutate a shared
  registry after composition.
- Keep route objects and router APIs out of definitions. Translate semantic intents at the host.
- Keep `data-cc-*` and theme-chrome attributes stable because CSS and browser checks consume them.
- Test ordering, duplicate rejection, disabled behavior, Escape closing, native anchor semantics,
  narrow viewport behavior, and controlled active/open state.
- A released definition ID may be persisted or deep-linked by a consumer; renaming it requires a
  compatibility review even though the definition is TypeScript data.

The conceptual ownership model is documented in `docs/concepts/sdk-architecture.md`; the full
task guide and accessibility rules are in `docs/navigation.md`.
