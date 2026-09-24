# SDK ADR 008: Immersive Embedded Presentation

- Status: Accepted
- Date: 2026-09-14
- Implementation: `@dev-mainsequence/command-center-sdk` 0.3.0 (bar and documentation); host
  adoption is outside this package
- Owners: Command Center SDK maintainers
- Package: `@dev-mainsequence/command-center-sdk`
- Related:
  - [SDK ADR 006: Device-Aware Primitives](./adr-sdk-006-device-aware-primitives.md)
  - [SDK ADR 001: Static-Site Delegated FastAPI Credential Bridge](./adr-sdk-001-static-site-delegated-fastapi-credential-bridge.md)
  - [SDK ADR 010: Host Navigation Drawer and the Wide-Screen Embedded Frame](./adr-sdk-010-host-navigation-drawer-and-wide-screen-embedded-frame.md)
    (the same routes from `md` up)
  - [Static-site embeds](../static-site-embeds.md), [Application navigation](../navigation.md)

## Publication status

The `ApplicationImmersiveBar` primitive shipped in 0.3.0. The immersive route behavior itself is
host-owned and is not part of the package. A consumer may use the bar only when its installed
package export map and declarations contain it.

## Decision summary

When a host opens an embedded static site on a phone, the site should be the whole screen with
one small bar above it: a way back to the host application, the site's name, and optionally the
host's menu trigger. The SDK publishes that bar as `ApplicationImmersiveBar` in `/navigation`.
The host decides which routes are immersive and below which breakpoint, what "back" means, and
what the title is. The iframe protocol does not change.

## Context

Embedded static sites are SDK applications rendered through `StaticSiteIframe` inside a host
route. In the Command Center host the route is already full-bleed inside the shell's main area,
the iframe is sized with the flex pattern iOS needs, and the host document carries a viewport
meta tag. With SDK ADR 006 the site inside the iframe adapts to its own width without host help:
its navigation becomes an overlay drawer below 768px of iframe width, its tables stack, and its
pickers become sheets.

What does not adapt is the frame around the iframe. Measured in the host on 2026-09-14:

- the shell grid reserves a 52px or 248px sidebar column and a 56px top bar row at every width,
  and docked chat rails can add two more columns, so a 375px phone leaves 323px by 756px for the
  site at best;
- the top bar hides the application switcher and search below its `md` breakpoint with nothing
  in their place, so the only way back is the collapsed rail with hover-only labels; and
- the SDK has no primitive for a compact "back, title, menu" row. The rail, panel, shell, trigger,
  and page header exist; none of them is that.

Three places for the back control were considered. Inside the embedded site is rejected: the
child cannot navigate the host, the version-one protocol deliberately has no such message, and
adding one would let a child steer its parent. Host-only code works but every host that embeds
sites would rebuild the same bar, and the bar's touch sizing, safe-area padding, and trigger
wiring are exactly what ADR 006 standardized. An SDK primitive the host places is the smallest
shared piece.

## Decision drivers

- The embedded site should not need to know it is embedded or on a phone.
- Hosts keep ownership of routing, history, and which routes are immersive.
- Touch sizing, safe-area insets, theme chrome, and native link behavior come from the SDK once.
- No serialized contract changes.

## Decision

### 1. `ApplicationImmersiveBar`

`/navigation` exports:

```tsx
import { ApplicationImmersiveBar } from "@dev-mainsequence/command-center-sdk/navigation";

<ApplicationImmersiveBar
  backHref="/app/foundry/services"
  backLabel="Command Center"
  onBack={() => navigate(-1)}
  title={link.label}
  trailing={<ApplicationNavigationTrigger controlsId="menu" open={menuOpen} onOpenChange={setMenuOpen} />}
/>
```

- One row, `min-block-size: var(--application-control-min-size)` (44px under a coarse pointer),
  padded by `--application-safe-area-top` and the inline safe-area variables, and marked
  `data-theme-chrome="topbar"` so themes style it like the host's top bar.
- The leading back control is an anchor when `backHref` is given, so native new-tab,
  modified-click, context-menu, and copy-link behavior is preserved exactly as for rail items; an
  unmodified primary click is prevented and delivered to `onBack`. Without `backHref` it is a
  button. It renders a chevron and `backLabel` (default "Back").
- The title is one truncated line and names the bar through `aria-labelledby`.
- The optional `trailing` slot is for the host's `ApplicationNavigationTrigger` or another compact
  control; the SDK does not render anything there by default.
- The root carries `data-cc-immersive-bar` and `role="banner"` is not used, because the host's own
  banner may still exist above the route on wide screens; the bar is a `<header>` element with an
  accessible name.

### 2. Immersive routes are host-owned

The host decides which routes are immersive and below which breakpoint using the ADR 006 viewport
seam. For the Command Center host the recommended rule is: the navigation-link static-site route
below `md` renders only the bar and the iframe in a `100dvh` column with `overflow: hidden`, no
sidebar, no top bar, no docked rails. "Back" goes to the previous in-app history entry when there
is one, otherwise the default application. The title is the navigation link's label.

From `md` up the same routes are not immersive, and they do not keep the host's whole chrome
either. SDK ADR 010 amends this section: the host keeps its top bar, renders no sidebar column
beside the embedded site, and opens its own navigation in `ApplicationNavigationDrawer`.

### 3. Iframe details

- The immersive container is `100dvh`; the host does not pad the bottom safe area because the
  child's SDK CSS already pads its page gutters with `--application-safe-area-bottom`.
- The bar stays visible in landscape and never auto-hides; the iframe owns scrolling and the host
  cannot observe it.
- The sandbox is unchanged. Each embedded site must carry its own viewport meta tag; the mobile
  concept guide and the embed guide say so.

### 4. Deferred: a presentation hint on the wire

An optional `host_presentation: "immersive" | "framed"` field on the initialize message would let
a child hide branding it duplicates from the host. It is an additive change to
`command-center.static_site_iframe@v1` and needs the schema, fixtures, mixed-version rules, and
backend awareness the evolve-contract workflow requires. Nothing in this decision needs it; the
child adapts by width already. Revisit when a real site shows duplicated chrome.

## Compatibility and release impact

- One new export and one new CSS block; additive.
- No backend, storage, iframe protocol, contract schema, fixture, or persisted field changes. The
  version-one static-site handshake is untouched.
- The bar's class names and `data-cc-immersive-bar` attribute become stable on release.

## Acceptance criteria

- The bar renders an anchor with the given `backHref` and delivers only unmodified primary clicks
  to `onBack`; without an href it renders a button.
- At 375×812 with touch the bar is 44px or taller, spans the viewport, and its controls meet the
  verifier's touch floor.
- The navigation guide and the embed guide show the immersive composition, and the packed consumer
  smoke test finds the new file.

## Alternatives considered

- **A message from the child to navigate the host.** Rejected; see Context.
- **Reusing `ApplicationPageHeader`.** Rejected. It is page content with title hierarchy and
  wrapping actions, not chrome; it has no back semantics and is not sized as a bar.
- **A `presentation="immersive"` mode on `ApplicationNavigationShell`.** Rejected. The overlay
  presentation already renders no persistent chrome; what is missing is the bar, and the bar is
  useful to hosts that do not use the SDK shell at all.

## Consequences

- Hosts get a consistent immersive frame for embedded sites with one component.
- Embedded sites stay unaware of the host frame, so they need no change.
- The Command Center host implements the immersive route to realize the behavior.
