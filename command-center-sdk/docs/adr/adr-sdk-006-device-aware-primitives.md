# SDK ADR 006: Device-Aware Primitives

- Status: Accepted
- Date: 2026-09-14
- Implementation: `@dev-mainsequence/command-center-sdk` unreleased (all sections)
- Owners: Command Center SDK maintainers
- Package: `@dev-mainsequence/command-center-sdk`
- Related:
  - [SDK ADR 002: Controlled Application Navigation](./adr-sdk-002-controlled-application-navigation.md)
  - [SDK ADR 003: Public Application Layout System](./adr-sdk-003-public-application-layout-system.md)
  - [SDK ADR 007: Responsive Column Importance and Stacked Tables](./adr-sdk-007-responsive-column-importance-and-stacked-tables.md)
  - [Application navigation](../navigation.md), [Application layout](../application-layout.md),
    [Themes](../themes.md)

## Publication status

This decision is implemented in SDK source for the next package release. A consumer may use the
constants, variables, props, hook, and verifier rules only when its installed package export map
and declarations contain them.

## Decision summary

The SDK gains a device axis alongside its existing theme and density axes. It publishes one
breakpoint scale, a viewport and pointer hook, touch-size and safe-area CSS variables, a shared
`presentation` prop convention for surfaces that change shape on small screens, an overlay
navigation mode, sheet-style picker and dialog presentations, and verifier rules that run against
a declared pointer type. Every addition is optional and additive; the desktop behavior shipped in
0.2.1 stays the default when nothing is declared.

## Context

The SDK already reflows. Page gutters and card metrics are fluid `clamp()` values, headers and
toolbars stack below 640px, dialogs use `100dvh` arithmetic, the feedback module guards motion,
and `/layout/testing` verifies geometry at 375×812, 768×900, and 1280×800. That is why layout and
feedback are usable on a phone today.

What the SDK lacks is any notion of the device. Measured against 0.2.1 on 2026-09-14:

- `styles.css` uses three breakpoints, 559px, 639px, and 767px, in three places, none published.
- 13 `:hover` rules, none guarded by `@media (hover: hover)`, so touch leaves rows and rail items
  lit after a tap.
- No `pointer: coarse` rule and no `env(safe-area-inset-*)` reference in any SDK CSS.
- SDK inputs inherit the 12–13px body size at tight and default density. iOS Safari zooms the page
  on focus for any input under 16px.
- `ApplicationNavigationShell` is a flex row in which the rail is always present at 52px or
  248px. Below 768px the panel becomes `position: absolute; left: 52px`, hardcoding the collapsed
  width. With the rail collapsed and a panel open, 115px of a 375px viewport remains for content.
  Collapsed rail labels exist only as `mouseenter`/`focus` tooltips.
- `ResourcePicker` positions from `window.innerWidth`/`innerHeight`, so the on-screen keyboard
  covers it after search autofocus. `ResourceActionConfirmationDialog` locks scrolling with
  `body.style.overflow`, which iOS Safari ignores.
- The verifier's `interactive-size` rule fails only below its 1px tolerance; it detects zero-size
  controls, not small ones. It never runs with touch emulation.
- The rail and panel still use `100vh`, and `body` uses `background-attachment: fixed`, which iOS
  ignores or repaints on scroll.

The consuming Command Center host does not compensate: its topbar hides the application switcher
and search below its `md` breakpoint with nothing in their place, and its shell grid reserves a
sidebar column at every width. The primitives the host consumes are the right place to fix this
once.

The scope is deliberately narrow. Command Center is an operator and analyst console; on a phone the
job is to check status, open a detail, run one action, or pick a resource. Targets are phone
portrait 360–430px with a coarse pointer, tablet 768–1024px in both orientations, and any embedded
iframe whose own width falls in those bands. Desktop remains the primary surface.

## Decision drivers

- An extender who declares navigation, columns, or a page should inherit phone behavior from the
  declaration. Behavior that appears only when a consumer writes `matchMedia` code is not an SDK
  capability.
- Stable IDs, CSS variable names, `data-cc-*` attributes, and contract schemas are compatibility
  boundaries and must not change meaning.
- Hosts keep ownership of state. Overlay navigation, sheets, and drawers are controlled surfaces
  like everything else in the SDK.
- Verification must observe rendered geometry under the pointer type the page will actually meet.
- Framework-neutral roots must stay free of React and browser globals.

## Decision

### 1. One breakpoint scale and one viewport seam

`/theme` exports pure data:

```ts
export const commandCenterBreakpoints = { sm: 640, md: 768, lg: 1024 } as const;
export type CommandCenterBreakpoint = "xs" | "sm" | "md" | "lg";
```

SDK stylesheets use only these three widths, expressed as `max-width: 639px` and
`max-width: 767px`. The one off-scale rule (559px) migrates to the `sm` boundary. Because CSS media
queries cannot read custom properties, the scale is a documented constant set, not a variable.

`/layout` exports the browser seam:

```ts
export function resolveCommandCenterViewport(target: Window): CommandCenterViewportState;
export function useCommandCenterViewport(): CommandCenterViewportState;

interface CommandCenterViewportState {
  breakpoint: CommandCenterBreakpoint;
  coarsePointer: boolean;
  hoverCapable: boolean;
  reducedMotion: boolean;
}
```

The hook subscribes to the matching media queries and is SSR-safe, resolving to `lg`, fine
pointer, hover capable, and no reduced motion when no window exists. Hosts and extenders use this
seam instead of writing their own `matchMedia` logic.

### 2. Touch and safe-area variables

The theme resolves and publishes:

```css
--application-control-min-size      /* 36px; 44px under (pointer: coarse) */
--application-safe-area-top
--application-safe-area-right
--application-safe-area-bottom
--application-safe-area-left        /* env(safe-area-inset-*) with 0 fallback */
--application-navigation-rail-width /* set by ApplicationRail from its current width */
```

SDK CSS consumes them as follows:

- Rail items, panel destinations, pagination buttons, picker options, dialog actions, the
  selection checkbox hit area, and the summary edit and label controls take
  `min-block-size: var(--application-control-min-size)`.
- Page gutters, the rail footer, the status screen, and every sheet add the safe-area variables.
- All `:hover` rules move under `@media (hover: hover)`.
- Every SDK text input declares `font-size: max(16px, var(--font-size-body))` under
  `(pointer: coarse)`.
- The remaining `100vh` uses become `100dvh`. `background-attachment: fixed` is dropped under
  `(pointer: coarse)`.
- Rail and drawer transitions gain a `prefers-reduced-motion` guard.
- Density gains a floor rather than a new axis: under a coarse pointer, table font size does not
  resolve below 13px and cell padding does not resolve below the standard row. The tightness
  metrics object is unchanged; the floor is applied in CSS.

### 3. A shared `presentation` convention

Surfaces that change shape on small screens accept one prop with one vocabulary:

```ts
presentation?: "auto" | <desktop-form> | <small-screen-form>;
```

`"auto"` resolves through the viewport seam. The desktop form is always today's behavior and is
the default, so existing consumers render identically. The resolved form is exposed on the root
element as `data-cc-presentation` so CSS, tests, and the verifier can read it. This ADR applies the
convention to navigation, the picker, and the dialog; ADR 007 applies it to tables.

### 4. Overlay navigation

`ApplicationNavigationShell` gains:

```ts
presentation?: "auto" | "docked" | "overlay";
menuOpen?: boolean;
onMenuOpenChange?: (open: boolean) => void;
```

`docked` is the existing flex row. `overlay` renders the rail and panel as one off-canvas drawer
over the content with a scrim, a focus trap, Escape and outside-pointer dismissal, scroll lock,
`role="dialog"` with `aria-modal`, and the rail forced expanded so every label is visible. The
host controls `menuOpen`; the SDK never opens or closes the menu on its own except through
`onMenuOpenChange`. `auto` resolves to `overlay` below `md`.

`ApplicationNavigationTrigger` is exported: the menu button a host places in its own topbar,
carrying `aria-controls`, `aria-expanded`, and the accessible label. The panel's overlay offset
reads `--application-navigation-rail-width` instead of a literal 52px.

A bottom tab bar is explicitly out of scope for this decision. It may be proposed separately after
overlay mode has been adopted by at least one host.

### 5. Sheet presentations for picker and dialog

`ResourcePicker` gains `presentation?: "auto" | "popover" | "sheet"`. The sheet is
bottom-anchored, full width, padded by the safe-area variables, positioned from
`window.visualViewport` so the keyboard pushes it up rather than covering it, and uses
`--application-control-min-size` rows. `auto` resolves to the sheet below `sm` and on `sm` with a
coarse pointer. Popover mode also gains a vertical flip when the space below the trigger is
insufficient. `ResourceBulkActionPicker` inherits the prop, and every picker the SDK renders
itself passes `auto`.

`ResourceActionConfirmationDialog` gains the same prop with `"dialog" | "sheet"` forms. The sheet
is bottom-anchored with stacked full-width actions and safe-area padding. Both forms gain a focus
trap, the fixed-body scroll lock that iOS honors, and no backdrop blur under a coarse pointer.

The drawer, picker, and dialog share one internal overlay utility for scroll lock, focus trap, and
dismissal so the behavior cannot drift between them. The utility is not a public export.

### 6. Verifier matrix and rules

`CommandCenterLayoutViewport` gains an optional `pointer?: "fine" | "coarse"` field. The default
matrix becomes:

| Viewport | Pointer | Purpose |
| --- | --- | --- |
| 320 × 568 | coarse | Smallest supported phone |
| 375 × 812 | coarse | Phone portrait |
| 812 × 375 | coarse | Phone landscape |
| 768 × 1024 | coarse | Tablet portrait |
| 1024 × 768 | fine | Tablet landscape, small laptop |
| 1280 × 800 | fine | Desktop |

Rules apply by the declared pointer, not by detection, because touch emulation is a browser-context
setting the verifier cannot toggle through its adapter interface. Three rule codes are added:

- `touch-target`: at a coarse-pointer viewport, a visible interactive element smaller than 44×44px
  is a warning and smaller than 24×24px is a violation, matching WCAG 2.5.5 and 2.5.8.
- `input-zoom`: at a viewport narrower than `md`, a text input whose computed font size is under
  16px.
- `sticky-hover`: a style rule whose selector contains `:hover` and is not enclosed by a
  `(hover: hover)` media rule, read from the page's CSSOM. Reported as a warning because
  third-party stylesheets are outside the page author's control; `checkStickyHover: false`
  disables it.

Consumers running Playwright configure `hasTouch: true` and `isMobile: true` for the coarse
entries. SDK CI adds browser tests for the navigation drawer, the picker sheet, and the dialog
sheet at 375×812 with touch.

### 7. Documentation and skills

The release that implements this ADR adds `docs/concepts/mobile.md` stating the target definition
above, updates the navigation, layout, resources, and themes guides, corrects the navigation README
to describe the narrow-viewport test it will then actually have, and adds a phone-check step to the
`compose-command-center-page`, `build-resource-list`, `build-resource-detail`, and
`build-resource-picker` skills. The theme audit gains a warning for consumer CSS that hardcodes a
max-width media query outside the published scale.

## Compatibility and release impact

- Every prop, export, constant, and verifier field is additive. Defaults reproduce 0.2.1 output.
- The new CSS variable names become part of the consumer theme contract on release. They are
  named once here and must not be renamed afterwards.
- Migrating the 559px rule to the `sm` boundary changes when the progress stage list stacks. It is
  a visible change and is recorded in the changelog; it is not a contract change.
- Mobile browsers lay a page out at 980px unless the document carries a viewport meta tag. The SDK
  cannot supply it; the concept guide names it as a host responsibility.
- No backend, storage, iframe protocol, contract schema, fixture, or persisted field changes.
  `contracts/manifest.json` is unchanged. This statement is required by the extending guide and
  is made deliberately.
- The verifier's default matrix grows, so consumer tests that relied on exactly three reports
  must read `reports` by viewport rather than by index.

## Rollout plan

1. All sections are implemented in SDK source together with ADR 007 and ship in the next release.
   After it, the host can adopt overlay navigation, and every existing SDK page stops zooming on
   input focus and stops holding hover state after a tap.
2. Host adoption is the host's own work; this ADR does not carry the host's implementation plan.

## Acceptance criteria

This ADR moves to Accepted when:

- the breakpoint constants, viewport seam, and CSS variables are exported and documented;
- `ApplicationNavigationShell` renders `docked` output identical to 0.2.1 apart from the
  `data-cc-presentation` attribute and the published rail-width variable when no new prop is
  passed, and `overlay` passes the focus-trap, dismissal, and scroll-lock tests plus a 375×812
  touch browser test;
- the picker and dialog sheets pass their browser tests, including keyboard-visible positioning;
- the verifier reports `touch-target` and `input-zoom` violations on deliberately broken fixtures
  and none on the SDK's own primitives at every matrix entry;
- the packed consumer fixture imports the new seam and types; and
- the documentation and skills describe only what the package exports.

## Alternatives considered

### Leave device handling to hosts

Rejected. This is the current state. Every host and every agent building an application rebuilds
the same drawer, zoom guard, and hover guard differently, and most do not build them at all.

### Container queries instead of a breakpoint scale

Rejected as the sole mechanism. Container queries are the right tool for card grids, which already
size from their container, and are welcome inside SDK CSS. They cannot express pointer type, safe
areas, or a host-level decision such as "the navigation becomes a drawer", and they cannot be read
from JavaScript for controlled state. The published scale coexists with container-sized internals.

### A `mobile` flag on the theme preset

Rejected. Density and device are independent. A tight theme on a tablet and a relaxed theme on a
phone are both legitimate. Persisting a device choice in a theme ID would also make theme IDs
device-specific, which breaks the theme compatibility rule.

### A separate mobile package or mobile variants of each component

Rejected. Two implementations of the same surface diverge. One component with a `presentation`
prop keeps one state model, one accessibility contract, and one test suite.

### Detect touch at runtime and switch silently

Rejected. Silent switching removes host control and makes tests nondeterministic. `auto` is an
explicit opt-in resolved through a public seam that tests can drive.

## Consequences

- Extenders inherit phone behavior from declarations and props they already write.
- The SDK takes on long-term compatibility responsibility for a device axis: a breakpoint scale,
  new CSS variables, and a presentation vocabulary.
- The verifier becomes the mandatory automated baseline for touch usability, not only geometry.
- Consumers still own menu state. SDK ADR 009 adds an SDK-owned floating trigger for complete
  embedded children while preserving this external-trigger pattern for real hosts.
- The progress stage list stacks 80px later than before; consumers with pixel snapshots between
  560px and 639px will see a diff.
