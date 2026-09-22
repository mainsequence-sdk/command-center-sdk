# Application layout

This module provides the public React primitives for complete Command Center-compatible page
composition. Import components from `@dev-mainsequence/command-center-sdk/layout`, import the SDK
component and theme styles once, and use
`@dev-mainsequence/command-center-sdk/layout/testing` for real-browser geometry verification.

## Public entrypoints

- `/layout`: `ApplicationPage`, `ApplicationPageHeader`, `ApplicationPageStack`,
  `ApplicationCard`, and `ApplicationCardGrid` plus their public prop types, and the viewport
  seam `useCommandCenterViewport`, `resolveCommandCenterViewport`, and
  `subscribeCommandCenterViewport`.
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

## Composition model

Use one `ApplicationPage` as the page geometry owner. Put the title and page-level actions in
`ApplicationPageHeader`, then group sibling sections with `ApplicationPageStack`. Use
`ApplicationCard` for an ordinary surface and `ApplicationCardGrid` for responsive peer cards.

```tsx
import { Button } from "@dev-mainsequence/command-center-sdk/controls";
import {
  ApplicationCard,
  ApplicationCardGrid,
  ApplicationPage,
  ApplicationPageHeader,
  ApplicationPageStack,
} from "@dev-mainsequence/command-center-sdk/layout";

<ApplicationPage maxWidth="wide">
  <ApplicationPageHeader
    eyebrow="Operations"
    title="Runtime overview"
    description="Current service health and capacity."
    actions={<Button>Refresh</Button>}
  />
  <ApplicationPageStack>
    <ApplicationCardGrid>
      <ApplicationCard header="Healthy services">18</ApplicationCard>
      <ApplicationCard header="Attention required">2</ApplicationCard>
    </ApplicationCardGrid>
    <ApplicationCard contentPadding="none">{table}</ApplicationCard>
  </ApplicationPageStack>
</ApplicationPage>;
```

`maxWidth` supports `content`, `wide`, and `full`. Components accept a narrow semantic `as` prop
and standard element attributes. `ApplicationCard` supports `default` and `nested` surfaces plus
`standard` or `none` content padding. Use `contentPadding="none"` when a child such as a table or
canvas already owns edge geometry; do not double-wrap or add a second inset.

## Responsive behavior

`viewport.ts` is the one place SDK surfaces and hosts read device facts. `useCommandCenterViewport()`
returns `{ breakpoint, coarsePointer, hoverCapable, reducedMotion }` from the published `/theme`
breakpoint scale and the `pointer`, `hover`, and `prefers-reduced-motion` media queries. It uses
`useSyncExternalStore`, so server rendering and environments without `matchMedia` resolve to the
desktop, fine-pointer, hover-capable default and hydrate without a mismatch. Do not write
`matchMedia` logic in a consumer when this seam answers the question.

Theme density controls gutters, section gaps, card insets, and grid minimums through public CSS
variables. Do not copy their resolved values into application CSS. Specialized editors, split
panes, maps, and full-bleed canvases may own internal geometry, but should still participate in one
page-level spacing system.

Header copy and actions wrap without overlap. Card grids collapse according to available width
rather than a product-specific breakpoint. Preserve `min-width: 0` behavior in custom children so
long content cannot force horizontal overflow.

## Browser verification

The testing entrypoint accepts a Playwright-compatible page or another adapter implementing
`setViewportSize` and `evaluate`:

```ts
import {
  assertCommandCenterPageLayout,
  COMMAND_CENTER_LAYOUT_VIEWPORTS,
} from "@dev-mainsequence/command-center-sdk/layout/testing";

await assertCommandCenterPageLayout(page, {
  viewports: COMMAND_CENTER_LAYOUT_VIEWPORTS,
});
```

The standard matrix is 320×568, 375×812, 812×375, and 768×1024 with a declared `coarse` pointer,
then 1024×768 and 1280×800 with a `fine` pointer. Reports cover root count, page and header
overflow, header overlap, stack gaps, card insets, grid collapse/overlap, and interactive
clipping/size at every entry. Coarse entries add `touch-target` (an error below 24px, a warning
below 44px; inline links are exempt) and `sticky-hover` (a warning for a hover rule with no
`@media (hover: hover)` guard). Entries narrower than 768px add `input-zoom` (an error for a text
input under 16px). Warnings are returned in `warnings` and never change `ok`. Rules apply by the
declared pointer because the adapter cannot toggle a browser context's touch emulation; configure
`hasTouch` and `isMobile` on the driver for coarse entries. Keep the stable `data-cc-*` attributes
because the verifier measures them in the rendered document.

## Maintenance constraints

- Keep this module free of routers, transports, authentication, permissions, and persistence.
- Add a primitive only for geometry repeated across complete applications; domain geometry stays
  in the consumer.
- Coordinate component markup, component CSS, theme metrics, browser verification, examples, and
  package exports for any public behavior change.
- Verify at least one dark and one light theme in addition to the viewport matrix.
- Prefer composition and semantic props to whole-surface renderer overrides.
