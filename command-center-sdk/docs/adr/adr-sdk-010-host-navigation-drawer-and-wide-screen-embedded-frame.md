# SDK ADR 010: Host Navigation Drawer and the Wide-Screen Embedded Frame

- Status: Accepted
- Date: 2026-09-20
- Implementation: `@dev-mainsequence/command-center-sdk` 0.4.1
- Owners: Command Center SDK maintainers
- Package: `@dev-mainsequence/command-center-sdk`
- Related:
  - [SDK ADR 006: Device-Aware Primitives](./adr-sdk-006-device-aware-primitives.md)
  - [SDK ADR 008: Immersive Embedded Presentation](./adr-sdk-008-immersive-embedded-presentation.md)
  - [SDK ADR 009: Opinionated Embedded Application Shell](./adr-sdk-009-opinionated-embedded-application-shell.md)
  - [Application navigation](../navigation.md), [Static-site embeds](../static-site-embeds.md)

## Decision summary

From the `md` breakpoint up, a host that frames an embedded application keeps only its top bar
around it. The host renders no left navigation beside the child, so the child's left navigation
is the only one on screen, and the host's own navigation opens in a drawer from a trigger in that
top bar. The SDK publishes the drawer as `ApplicationNavigationDrawer` in `/navigation`. Which
routes are embedded, the top bar, and the content of the drawer stay host-owned. The iframe
protocol does not change.

## Context

SDK ADR 009 fixed ownership around an embedded application: the host owns top navigation,
application switching, account and session controls, and branding; the child owns its left
navigation at depth zero, one, or two and never renders a top bar.

SDK ADR 008 applied that on phones only. Its section 2 recommended that the Command Center host
keep its whole chrome on tablets and desktops, and `docs/navigation.md` described framing an
embedded site only below `md`. Measured in the Command Center host on 2026-09-18:

- The depth-two shell's rail defaults to 52px collapsed and 248px expanded, and a host built on
  `ApplicationRailItem` uses the same widths. A host sidebar beside a depth-two child is two
  adjacent rails from the same component, up to 496px of navigation before the child's panel.
- The child resolves its presentation from the iframe's width through the viewport seam, not from
  the screen. At an 800px viewport with a 248px host sidebar the iframe is 552px wide, so the child
  switches to its phone overlay inside a host that is in its desktop layout.

Once the host drops its sidebar column it needs somewhere to put its navigation. The SDK already
had the right behavior but no way for a host to use it. The shells' drawers are internal to the
shells, which render SDK rails and panels; a host renders its own sidebar. `useOverlayBehavior`,
which supplies the focus trap, focus restoration, scroll lock, and dismissal, is deliberately not
exported. Hosts rebuilt the drawer from unpublished class names, without focus containment or
scroll lock.

## Decision drivers

- An embedded application should read as one application: one top bar, one left navigation.
- Host and child should resolve the same breakpoint, which requires the iframe to span the
  viewport.
- A host should get modal-drawer accessibility from the SDK once, not rebuild it.
- The embedded child must not need to know how the host frames it. No serialized contract changes.

## Decision

### 1. The wide-screen host frame

From `md` up, around an embedded application, a host:

- renders its top bar and no sidebar column, so the iframe spans the viewport's width;
- places `ApplicationNavigationTrigger` in that top bar and opens its navigation in
  `ApplicationNavigationDrawer`;
- shows the embedded application's name in the top bar as a label, because the child owns
  navigation inside it; and
- derives the frame from its route and the `/layout` viewport seam on every render, so a deep link
  paints the right frame first and leaving restores the host's own sidebar state.

Below `md` SDK ADR 008 still applies: only `ApplicationImmersiveBar` and the iframe. This amends
ADR 008 section 2, which recommended keeping the host's whole chrome on tablets and desktops.

The host still decides which routes are embedded. A host layer that shows an embedded application
without a route, such as a preview, is not a history entry; it keeps the top bar at every width
and gives the user a visible close control there, because Escape and pointer events inside a
cross-origin iframe never reach the host.

### 2. `ApplicationNavigationDrawer`

`/navigation` exports:

```tsx
import {
  ApplicationNavigationDrawer,
  ApplicationNavigationTrigger,
} from "@dev-mainsequence/command-center-sdk/navigation";

<ApplicationNavigationTrigger controlsId="host-menu" open={menuOpen} onOpenChange={setMenuOpen} />

<ApplicationNavigationDrawer id="host-menu" open={menuOpen} onOpenChange={setMenuOpen}>
  <HostSidebar />
</ApplicationNavigationDrawer>
```

- Controlled. `open` and `onOpenChange` belong to the host; a dismissal only reports. The drawer
  renders nothing while closed.
- The root is a `role="dialog"` with `aria-modal="true"`, the required `id` the trigger's
  `controlsId` points at, and an accessible name from `label` (default "Navigation menu"). It
  carries `data-cc-navigation-drawer` and `data-theme-chrome="sidebar"`; the scrim carries
  `data-cc-navigation-scrim`. These are the same data attributes the shells' drawers publish.
- It applies the internal overlay behavior the shells use: focus moves into the drawer on open and
  returns to the previously focused element on close, Tab is contained, document scrolling is
  locked, and Escape, the scrim, and a pointer press outside the drawer report
  `onOpenChange(false)`.
- The SDK renders nothing inside. The host's navigation is the child; other `div` attributes pass
  through, and `role`, `aria-modal`, `aria-label`, and `id` cannot be overridden.
- It is fixed to the inline-start edge at full `100dvh` height, above a scrim that covers the
  viewport, with the shells' z-order, slide-in animation under `prefers-reduced-motion:
  no-preference`, sidebar chrome colors, and safe-area padding. Its width is
  `--application-navigation-drawer-width` (default `20rem`), capped at `calc(100vw - 3rem)` so a
  strip of scrim always remains.
- `useOverlayBehavior` stays internal. Each surface exposes its own controlled props.

An embedded application does not use this component. It uses a navigation shell, whose overlay
presentation owns its drawer and floating trigger (SDK ADR 009).

### 3. Still deferred

- A `host_presentation` field on the initialize message (SDK ADR 008 section 4). The child's left
  navigation is correct in every host frame and the child adapts by width, so nothing here needs
  it.
- A child-to-host shortcut relay. It is a protocol addition in the family ADR 008 rejected, a
  child steering its parent. Host keyboard shortcuts stay unavailable while focus is inside the
  iframe, which is why the trigger is a pointer control.

## Compatibility and release impact

- One new export, one new CSS block, and one new CSS variable the theme sheet publishes,
  `--application-navigation-drawer-width`; additive.
- The class names `cc-application-navigation-drawer` and `cc-application-navigation-drawer__scrim`
  become stable on release. The shells' drawer class names and output are unchanged.
- No backend, storage, iframe protocol, contract schema, fixture, theme ID, or persisted field
  changes. No packaged agent skill changes: the skills cover embedded children, and the shell
  skill excludes host chrome by description.

## Acceptance criteria

- Closed, the drawer renders nothing. Open, it renders a named modal dialog with the given `id`
  over a scrim, passes host attributes through, and renders no SDK rail, panel, or depth marker.
- Opening moves focus into the drawer and locks document scrolling; closing restores both. Tab
  wraps inside the drawer. Escape, the scrim, and an outside pointer press report
  `onOpenChange(false)`, and a press inside does not.
- At 1280×800 above a full-width iframe the drawer is 320px wide from the top-left corner at full
  height, the scrim covers the viewport including the host top bar and the iframe, and the page
  does not scroll horizontally. The published width variable changes the width. At 375×812 the
  drawer leaves at least 48px of scrim.
- The navigation guide and the embed guide show the wide-screen composition, and the packed
  consumer smoke test finds the new file.

## Alternatives considered

- **Export `useOverlayBehavior`.** Rejected. A hook leaves the scrim, the dialog semantics, the
  stacking, and the geometry to every host again, and it would freeze an internal utility three
  other surfaces share.
- **Document the shells' drawer class names as public.** Rejected. It publishes markup the SDK
  could not change and still gives a host no focus handling.
- **A host mode on `ApplicationNavigationShell`.** Rejected. The shell renders SDK rails and
  panels from definitions; a real host's sidebar has branding, links, and product actions that are
  not definitions.
- **Keep the host sidebar and have the child hide its navigation.** Rejected. It crosses origins,
  needs a protocol message, and reverses SDK ADR 009.
- **Reveal the host sidebar on edge hover.** Rejected. The iframe receives the pointer, and a
  host strip over the iframe's inline-start edge would cover the child's rail.

## Consequences

- An embedded application reads as one application at every width, and host and child agree on
  the breakpoint.
- Hosts get an accessible navigation drawer from one component and stop depending on unpublished
  class names.
- On an embedded route every host destination is two activations, trigger then item, instead of
  one.
- A child that draws its own top bar, which the ADR 009 verifier already fails, shows two top
  bars inside this frame. That is fixed in the child.
- The Command Center host adopts the drawer when it moves to a release that contains it.
