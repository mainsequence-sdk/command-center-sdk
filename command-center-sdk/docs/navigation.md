---
sidebar_position: 3
title: Application navigation
---

# Build application navigation

The `/navigation` entrypoint provides canonical zero-, one-, and two-level application composition.
Its components are controlled and router-neutral. A production Command Center application is
embedded: the host already owns global navigation, app switching, account/settings controls, and
branding. The child owns only durable routes inside its application and never renders a top
navigation bar. Standalone rendering is a local development or test harness only.

## Ownership boundary

| SDK owns | Consumer owns |
| --- | --- |
| Application, sub-application, and destination definitions with native link rendering | Authentication and permission evaluation |
| Rail, panel, collapsed tooltips, focus states, and keyboard movement | Filtering inaccessible definitions before render |
| Open, active, disabled, and unavailable rendering | Router integration and URL persistence |
| Deterministic composition and ordering | Favorites, badges, user menu, branding, and product actions |

## Choose exactly one navigation depth

Choose from information architecture before writing layout code:

| Depth | Durable route shape | Composition |
| --- | --- | --- |
| 0 | One destination | No sidebar; render the route in `ApplicationPage` |
| 1 | One cohesive work area with multiple destinations | `ApplicationNavigationPanelShell` |
| 2 | Multiple independent work areas, each with multiple destinations | `ApplicationNavigationShell` rail + panel |

Tabs subdivide the current page and do not increase sidebar depth. Never create a third sidebar
level. Do not add a one-route sidebar, one-item application rail, disabled planned destinations,
or filler section labels such as “Explore”, “Manage”, or a repeated application name.

Both shells expose `data-cc-navigation-depth` for browser conformance. Their `auto` presentation
becomes an accessible drawer below 768px. `ApplicationNavigationPanelShell` owns its floating
trigger automatically; a depth-two `ApplicationNavigationShell` opts into the same behavior with
`overlayTrigger="floating"`. No child top bar is needed.

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

## Render the canonical one-level shell

```tsx
import { useState } from "react";
import {
  ApplicationNavigationPanelShell,
  type NavigationIntent,
} from "@dev-mainsequence/command-center-sdk/navigation";
import "@dev-mainsequence/command-center-sdk/styles.css";

export function ProductShell() {
  const [menuOpen, setMenuOpen] = useState(false);
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
    <ApplicationNavigationPanelShell
      activeDestinationId={activeDestinationId}
      application={foundry}
      menuOpen={menuOpen}
      onMenuOpenChange={setMenuOpen}
      onNavigate={navigate}
      presentation="auto"
    >
      <main>Your routed application content</main>
    </ApplicationNavigationPanelShell>
  );
}
```

The panel shell hides a redundant section label by default when the application has one
sub-application. It preserves that section's accessible name. Set `showSectionLabels` explicitly
only when multiple meaningful groups need visible labels.

Use `ApplicationNavigationShell` only for genuine depth-two navigation. Supply multiple
application definitions, controlled `openApplicationId`, `presentation="auto"`, and
`overlayTrigger="floating"`. You can render `ApplicationRail` and
`ApplicationNavigationPanel` separately only when an existing host already owns their placement;
do not use the low-level pieces to recreate the standard child shell.

## Present the shell on a small screen

`presentation="auto"` keeps navigation docked on wide screens and switches to an off-canvas drawer
below the `md` breakpoint (768px). The application owns controlled `menuOpen` state while the SDK
owns the floating trigger, drawer, scrim, focus handling, and scroll lock:

```tsx
import { useState } from "react";
import {
  ApplicationNavigationShell,
} from "@dev-mainsequence/command-center-sdk/navigation";

export function ProductShell() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <ApplicationNavigationShell
      applications={[foundry]}
      collapsed={false}
      menuId="product-menu"
      menuOpen={menuOpen}
      onMenuOpenChange={setMenuOpen}
      onNavigate={navigate}
      onOpenApplicationChange={setOpenApplicationId}
      openApplicationId={openApplicationId}
      overlayTrigger="floating"
      presentation="auto"
    >
      <main>Your routed application content</main>
    </ApplicationNavigationShell>
  );
}
```

In the depth-two overlay presentation the rail is forced expanded so every label is visible without a hover
tooltip, the rail and panel render together inside one `role="dialog"` with a scrim, focus stays
inside the drawer, document scrolling is locked with a technique iOS honors, and Escape, a tap on
the scrim, or a chosen destination closes it through `onMenuOpenChange(false)`. Pass
`presentation="overlay"` or `"docked"` to fix the form regardless of width. The resolved form is
exposed as `data-cc-presentation`.

`overlayTrigger="external"` remains available for a real host that already owns chrome. It is the
backward-compatible default, but it is not the complete embedded-child pattern.

The document must carry `<meta name="viewport" content="width=device-width, initial-scale=1">`;
without it mobile browsers lay the page out at 980px and the breakpoint never applies. See
[Mobile and touch](./concepts/mobile.md).

## Gate and verify the complete shell

From the first frame, render one `ApplicationStatusScreen variant="viewport"` while the child
initializes host context/theme, delegated API transport/authentication, and the critical
application readiness endpoint. Navigation and `ApplicationPage` route content remain unmounted
until all three succeed. A reconnect returns to the same gate. See
[Application feedback](./application-feedback.md) for retry, cancellation, and terminal failure.

Assert both phases in the application's Playwright suite:

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

The verifier rejects child top-bar chrome, startup content mounted behind the gate, missing or
duplicate viewport status screens, and a ready shell that differs from the declared depth.

## Frame an embedded site from host chrome on a phone

This is a host-side composition, not permission for an embedded child to add top navigation. When
a Command Center host route shows another embedded static site, a phone should see only the site
and one small bar to get back. The host may render `ApplicationImmersiveBar` above the iframe and
nothing else below the `md` breakpoint; the host decides the route and breakpoint through
`useCommandCenterViewport`:

```tsx
import {
  ApplicationImmersiveBar,
  ApplicationNavigationTrigger,
} from "@dev-mainsequence/command-center-sdk/navigation";
import { useCommandCenterViewport } from "@dev-mainsequence/command-center-sdk/layout";

export function EmbeddedSiteRoute({ link }: { link: { label: string; launchUrl: string } }) {
  const { breakpoint } = useCommandCenterViewport();
  const immersive = breakpoint === "xs" || breakpoint === "sm";

  if (!immersive) return <FramedSite link={link} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
      <ApplicationImmersiveBar
        backHref="/app/home"
        backLabel="Command Center"
        onBack={() => navigate(-1)}
        title={link.label}
        trailing={
          <ApplicationNavigationTrigger controlsId="menu" open={menuOpen} onOpenChange={setMenuOpen} />
        }
      />
      <StaticSiteIframe className="flex-1 min-h-0" src={link.launchUrl} {...context} />
    </div>
  );
}
```

The bar is 44px tall on touch, pads the top and inline safe areas, and is styled as top-bar chrome.
Do not pad the bottom safe area in the host: the site inside the iframe already does. See
[Static-site embeds](./static-site-embeds.md) and [Mobile and touch](./concepts/mobile.md).

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
  id: "reports.operations-navigation",
  targetApplicationId: "operations",
  subApplication: {
    id: "reports",
    label: "Reports",
    destinations: [
      { id: "daily", label: "Daily" },
      { id: "monthly", label: "Monthly" },
    ],
  },
});

const applications = composeNavigationApplications(
  [operationsApplication],
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
