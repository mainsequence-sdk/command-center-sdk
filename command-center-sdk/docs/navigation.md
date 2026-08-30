---
sidebar_position: 3
title: Application navigation
---

# Build application navigation

The `/navigation` entrypoint provides the same reusable structure used by Command Center: an
expandable application rail with icons, a selected-application panel, grouped sub-applications,
and destination links. The components are controlled and router-neutral.

Use this surface for navigation owned by your product or standalone shell. When your application
is embedded in the main Command Center, do not mirror the host's global applications; use the
primitives only for navigation that belongs inside your application.

## Ownership boundary

| SDK owns | Consumer owns |
| --- | --- |
| Application, sub-application, and destination definitions with native link rendering | Authentication and permission evaluation |
| Rail, panel, collapsed tooltips, focus states, and keyboard movement | Filtering inaccessible definitions before render |
| Open, active, disabled, and unavailable rendering | Router integration and URL persistence |
| Deterministic composition and ordering | Favorites, badges, user menu, branding, and product actions |

Navigation definitions are runtime TypeScript values, not a backend wire contract. Icons are
React components and callbacks are consumer functions, so the model is intentionally not JSON
Schema-backed.

## Define the hierarchy

```tsx
import { Boxes, FolderKanban, Rocket } from "lucide-react";
import {
  defineNavigationApplication,
  type NavigationIntent,
} from "@dev-mainsequence/command-center-sdk/navigation";

const foundry = defineNavigationApplication({
  id: "foundry",
  label: "Foundry",
  icon: Boxes,
  href: "/app/foundry/services",
  defaultDestinationId: "services",
  subApplications: [
    {
      id: "build",
      label: "Build",
      order: 10,
      destinations: [
        {
          id: "services",
          label: "Services",
          href: "/app/foundry/services",
          icon: FolderKanban,
        },
      ],
    },
    {
      id: "ship",
      label: "Ship",
      order: 20,
      destinations: [
        {
          id: "releases",
          label: "Releases",
          href: "/app/foundry/releases",
          icon: Rocket,
        },
      ],
    },
  ],
});
```

IDs must be stable and unique within their owning application. Destination IDs are unique across
an application because active route state identifies one destination without also requiring a
section ID. Definitions render in their supplied array order. `composeNavigationApplications`
sorts composed applications, sub-applications, and destinations by `order`, then label and ID.
An optional `href` must be a non-empty relative or absolute URL. Give every routed destination an
`href`; an application rail item uses its own `href`, or the `href` of its enabled
`defaultDestinationId` when the application URL is omitted.

## Render a controlled shell

```tsx
import { useState } from "react";
import {
  ApplicationNavigationShell,
  type NavigationIntent,
} from "@dev-mainsequence/command-center-sdk/navigation";
import "@dev-mainsequence/command-center-sdk/styles.css";

export function ProductShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [openApplicationId, setOpenApplicationId] = useState<string | null>(
    "foundry",
  );
  const [activeDestinationId, setActiveDestinationId] = useState("services");

  function navigate(intent: NavigationIntent) {
    setActiveDestinationId(intent.destinationId);
    window.history.pushState(
      null,
      "",
      `/app/${intent.applicationId}/${intent.destinationId}`,
    );
  }

  return (
    <ApplicationNavigationShell
      activeApplicationId="foundry"
      activeDestinationId={activeDestinationId}
      applications={[foundry]}
      collapsed={collapsed}
      onCollapsedChange={setCollapsed}
      onNavigate={navigate}
      onOpenApplicationChange={setOpenApplicationId}
      openApplicationId={openApplicationId}
    >
      <main>Your routed application content</main>
    </ApplicationNavigationShell>
  );
}
```

You can render `ApplicationRail` and `ApplicationNavigationPanel` separately when your layout
already owns positioning. `ApplicationRailItem` is public for hosts that need SDK-consistent app
items inside existing chrome.

## Preserve native link behavior

Routed applications and destinations render as real anchors when they have an `href`. An ordinary
unmodified primary click is prevented and passed to the existing controlled callback so the
consumer can perform client-side routing. Command-click on macOS, Control-click on Windows/Linux,
Shift-click, middle-click, the browser context menu, and copy-link behavior remain native and use
the same `href`.

Do not omit `href` from a routed item and attempt to reconstruct modifier-click behavior inside
`onNavigate`; browsers can only provide reliable new-tab and link-context behavior for anchors.
Items without an `href` remain callback buttons. Disabled items and UI actions such as expanding,
collapsing, or closing navigation also remain buttons.

## Compose sub-applications

Packages can contribute a complete section without mutating the target definition:

```ts
import {
  composeNavigationApplications,
  defineNavigationContribution,
} from "@dev-mainsequence/command-center-sdk/navigation";

const contribution = defineNavigationContribution({
  id: "connections.workspace-navigation",
  targetApplicationId: "workspaces",
  subApplication: {
    id: "connections",
    label: "Connections",
    destinations: [
      { id: "data-sources", label: "Data Sources" },
      { id: "explore", label: "Explore" },
    ],
  },
});

const applications = composeNavigationApplications(
  [workspacesApplication],
  [contribution],
);
```

Composition rejects duplicate application, contribution, sub-application, and destination IDs,
as well as contributions targeting an unknown application.

## Interaction and accessibility

- Arrow Up and Arrow Down move between rail applications or panel destinations.
- Home and End move to the first or last enabled item.
- Escape closes the panel when `onClose` is supplied.
- Active items use `aria-current="page"`; collapsed items retain accessible labels and tooltips.
- Routed items with `href` support native new-tab, new-window, context-menu, and copy-link actions.
- Disabled items require a user-safe `unavailableReason` when the default message is insufficient.

Filter authorization-sensitive applications and destinations before passing definitions to the
SDK. A disabled item explains temporary unavailability; it is not a substitute for access
control.
