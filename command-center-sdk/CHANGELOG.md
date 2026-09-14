# Changelog

## Unreleased

- Fix a standalone `ApplicationNavigationPanel` below 768px: 0.3.0 offset it by
  `--application-navigation-rail-width` (248px by default) even outside the SDK shell, so a host
  that positions the panel itself saw it pushed off a phone screen. The panel now sits at the edge
  of its container and only the SDK shell applies the rail-width offset.

## 0.4.0

Compatibility axes: npm public API 0.4.0 (additive); local agent-skill provenance sentinel schema
3 (migrated automatically with rollback coverage). No backend contract, JSON Schema, fixture,
iframe protocol, theme ID, or remote storage change. Existing depth-two navigation remains docked
with an external trigger unless new props are selected, and direct panel section labels remain
visible by default.

- Standardize complete production applications as embedded children with no child top navigation,
  one explicit zero/one/two-level left-navigation decision, and a mandatory viewport startup gate
  covering host context/theme, delegated API transport/authentication, and critical API readiness.
- Add the public depth-one `ApplicationNavigationPanelShell`, including automatic responsive
  docked/overlay presentation, an SDK-owned floating phone trigger, accessible drawer behavior,
  and suppression of redundant single-section labels. Add depth markers to both navigation shells
  and the opt-in `overlayTrigger="floating"` mode to the existing depth-two shell.
- Add `/navigation/testing` with Playwright-compatible verification for startup gating, declared
  navigation depth, and absence of child topbar chrome. Cover the API with declaration, unit,
  real-browser, package-boundary, package-size, and packed-consumer checks.
- Ship `navigation/compose-command-center-application-shell`, a focused agent skill with a golden
  embedded-root TSX asset and migration checklist. Strengthen the general application and loading
  skills so navigation/routes stay unmounted until true application readiness and reconnect uses
  the same gate.
- Make the packaged agent-skill catalog authoritative for the complete
  `.agents/skills/command-center` namespace. Install, postinstall, SDK update, and skill sync now
  prune unrecorded or obsolete entries such as retired `widget`, `workspace`, and embed skills,
  while preserving all other skill namespaces; dry-run and JSON results report the pruned paths.

## 0.3.0

Compatibility axes: npm public API 0.3.0 (additive). No backend contract, schema, fixture, iframe
protocol, or theme ID changes. The CSS variables `--application-control-min-size`,
`--application-safe-area-*`, and `--application-navigation-rail-width`, the `presentation` prop
vocabulary, and the new `data-cc-*` attributes become stable with this release. Visible changes for
existing consumers: the progress stage list stacks at 639px instead of 559px, table cell padding
follows the density variables, and verifier reports carry `severity` and `warnings` with a
six-entry default matrix.

- Add the device axis from SDK ADR 006. `/theme` publishes the breakpoint scale (`sm` 640,
  `md` 768, `lg` 1024) and `/layout` publishes the viewport seam `useCommandCenterViewport`,
  `resolveCommandCenterViewport`, and `subscribeCommandCenterViewport`.
- Publish `--application-control-min-size`, `--application-safe-area-*`, and
  `--application-navigation-rail-width`. Guard every SDK hover rule with `@media (hover: hover)`,
  add `100dvh` fallbacks, safe-area padding, and a coarse-pointer block that sizes controls to
  44px, keeps text inputs at 16px, floors table density, and drops `background-attachment: fixed`.
  The progress stage list now stacks at 639px instead of 559px; fine-pointer output is otherwise
  unchanged.
- `ApplicationNavigationShell` gains `presentation` (`docked`, `overlay`, `auto`), `menuOpen`,
  `onMenuOpenChange`, `menuId`, and `menuLabel`, and exposes `data-cc-presentation`. Add the
  exported `ApplicationNavigationTrigger`. The panel's narrow-viewport offset reads the published
  rail width variable instead of a literal 52px.
- The layout verifier's default matrix becomes six entries with a declared pointer and adds the
  `touch-target`, `input-zoom`, and `sticky-hover` rules. Findings carry a `severity`, and reports
  gain `warnings`. Consumers that construct report objects by hand must add the new fields.
- Add the "Mobile and touch" concept guide, update the navigation, layout, themes, and public API
  guides, and add a phone-presentation step to the list, detail, picker, and page skills.
- Implement SDK ADR 007. `ResourceColumnDefinition` gains `importance` (the discovery contract's
  existing vocabulary) and the host-only `hideBelow`; `resolveResourceDiscoveryColumns` now carries
  the backend's `importance` instead of dropping it. `/resource` exports
  `resolveResourceColumnImportance`, `isResourceColumnVisibleAt`, and `selectResourceColumnsAt`.
  No contract, schema, fixture, or backend change.
- `DataTable` gains `presentation` (`table`, `stacked`, `auto`), hides columns by importance band
  in the table form, keeps the header and primary column sticky inside the scroller with a scroll
  edge shadow, reads cell padding from the density variables (a visible density change at relaxed
  and tight presets), and collapses row actions into a menu when there are more than two or the
  pointer is coarse. `ResourcePagination` gains `presentation` with a compact form.
  `ResourceListPage` gains `tablePresentation`, a sort picker while rows are stacked, a filters
  disclosure and compact pagination below 640px.
- `ResourcePicker` gains `presentation` (`popover`, `sheet`, `auto`). The sheet is bottom-anchored
  to the visual viewport with a scrim, focus trap, and scroll lock; the popover flips above the
  trigger when there is no room below. `ResourceActionConfirmationDialog` gains the same prop with
  a bottom-anchored `sheet` form, traps focus, uses the iOS-safe scroll lock, and drops its
  backdrop blur under a coarse pointer. `ResourceBulkActionPicker` passes `presentation` through.
  Every picker and dialog the SDK renders itself uses `auto`.
- Add `ApplicationImmersiveBar` to `/navigation` (SDK ADR 008): the one-row chrome a host shows
  above an embedded static site on a phone, with a back control that keeps native link behavior,
  a truncated title, and a trailing slot for the menu trigger. Immersive routes stay host-owned;
  the iframe protocol is unchanged.
- `EntitySummary` opens a field's `info` on tap through a disclosure button instead of a hover
  `title`, and on narrow screens shows facts in two columns with wrapping values.
  `ResourceDetailShell` scrolls the active tab into view and shades the scrolling tab strip's edges.

## 0.2.1

- Reorganize the SDK documentation around architecture, ownership, resource, interface,
  integration, and operational concepts; add deeper public API, theme, embed, and operations
  guides; and verify the complete guide set in the published package artifact.
- Add the accepted static-site FastAPI WebSocket bridge with one-time ticket resolution, strict
  additive v1 messages, native protocol ordering, cancellation and lifecycle invalidation,
  language-neutral fixtures, and real-browser handshake coverage.
- Refactor the application-documentation skill and scaffold into an end-user-only help system.
  Schema-version-2 navigation now derives the docs folder tree from stable application-menu IDs,
  while validation enforces user-facing page types, task completeness, navigation parity, and the
  exclusion of architecture and implementation material from the served `/docs/` site.
- Retheme the `quartz-light` preset ("Main Sequence Light") to the light half of the Linear-derived
  dark theme: white canvas, dead-neutral grey surfaces (`#F8F8F8`, `#F4F4F4`, `#F0F0F0`), soft
  charcoal text at `#282A30`, the same `#5E6AD2` indigo brand, and `radius` from `16px` to `8px`.
  Status tokens are Linear's light hues darkened along their own hue until they clear WCAG AA as
  text on white (`danger #E42020`, `success #1F8536`, `warning #8D7000`), because the SDK paints
  cells and pills with these tokens as text; the previous `success` and `warning` failed. Give the
  theme its own chrome block: no background gradient, no panel shadow, lighter dialog and picker
  shadows, and a solid `::selection` pair. Add a data-visualization palette whose series clear 3:1
  on white and whose scales are hue-matched for the palette resolver. The theme ID and every token
  key are unchanged.

## 0.2.0

- Narrow the SDK to reusable application navigation, layout, feedback, resource, theme, contract,
  documentation, and static-site embed primitives.
- Remove product-domain exports, schemas, examples, styles, skills, and compatibility aliases.
- Keep one public package and validate it through source, schema, packed-consumer, and documentation
  checks.
