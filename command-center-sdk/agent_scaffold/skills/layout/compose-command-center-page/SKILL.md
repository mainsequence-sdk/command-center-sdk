---
name: compose-command-center-page
description: Compose, migrate, review, or verify a complete responsive application page with the public @dev-mainsequence/command-center-sdk/layout primitives and browser geometry verifier. Use for page gutters and maximum width, title and action headers, top-level section rhythm, padded or full-bleed cards, responsive sibling-card grids, or layout conformance across supported phone, tablet, and desktop viewports. Do not use for internal layout already owned by ResourceListPage, ResourceDetailShell, widgets, or specialized editors and canvases.
---

# Compose A Command Center Page

## Confirm The Installed Surface

Inspect the installed package version and export map before editing. Require both `/layout` and
`/layout/testing`; do not infer their availability from an ADR or a newer repository checkout.
Import the SDK component and theme styles once at the application entrypoint:

```ts
import "@dev-mainsequence/command-center-sdk/theme/styles.css";
import "@dev-mainsequence/command-center-sdk/styles.css";
```

Do not copy SDK CSS or import `dist`, `src`, Command Center application components, aliases, or
repository-only files.

## Give Each Layout Rule One Owner

Compose one complete route with:

- `ApplicationPage` for responsive page gutters and `content`, `wide`, or `full` maximum width;
- `ApplicationPageHeader` for the eyebrow, title, description, and wrapping actions;
- `ApplicationPageStack` for all top-level vertical rhythm;
- `ApplicationCard` for an ordinary bordered surface with safe default content padding; and
- `ApplicationCardGrid` for responsive sibling cards with an explicit minimum card width only
  when the default `18rem` does not fit the content.

Do not add top-level sibling margins to recreate stack spacing. Do not add default padding to a
consumer `.panel` class when `ApplicationCard` owns that surface.

```tsx
import {
  ApplicationCard,
  ApplicationCardGrid,
  ApplicationPage,
  ApplicationPageHeader,
  ApplicationPageStack,
} from "@dev-mainsequence/command-center-sdk/layout";

export function PortfolioPage() {
  return (
    <ApplicationPage maxWidth="wide">
      <ApplicationPageHeader
        eyebrow="Portfolio operations"
        title="Portfolio overview"
        description="Monitor exposures and rebalance the active portfolio."
        actions={<button type="button">Rebalance</button>}
      />
      <ApplicationPageStack>
        <StatusBanner />
        <ApplicationCardGrid minimumCardWidth="18rem">
          <ApplicationCard header={<h2>Exposure</h2>}>
            <ExposureSummary />
          </ApplicationCard>
          <ApplicationCard header={<h2>Risk</h2>}>
            <RiskSummary />
          </ApplicationCard>
        </ApplicationCardGrid>
        <ApplicationCard contentPadding="none" header={<h2>Positions</h2>}>
          <PositionsTable />
        </ApplicationCard>
      </ApplicationPageStack>
    </ApplicationPage>
  );
}
```

Use `contentPadding="none"` only for intentional edge-to-edge content such as a table scroller,
media renderer, or canvas. Keep ordinary text, controls, errors, empty states, and loading states in
the default padded content region. Use `surface="nested"` only for a card nested inside another
owned surface.

## Preserve Existing SDK View Ownership

Place `ResourceListPage` and `ResourceDetailShell` directly in `ApplicationPageStack`. Do not wrap
them in `ApplicationCard`; those views already own their internal surface, padding, and lifecycle.
Do the same for a widget or workspace renderer whose public documentation says it owns its frame.

Keep domain-specific charts, forms, split panes, maps, editors, and canvases application-owned.
The layout primitives do not own routing, authentication, permissions, persistence, API transport,
notifications, or product actions. Route application-level staged loading, retry, and failure
presentation to `$build-application-loading-flow`; the application still owns the underlying
policy.

## Verify Final Browser Geometry

Run the theme audit and the layout verifier as separate mandatory checks. The theme audit proves
semantic token use; it cannot prove sibling gaps, computed card padding, action wrapping, or grid
collapse.

After the page reaches the state being tested, run the public verifier in a real browser:

```ts
import { test } from "@playwright/test";
import {
  assertCommandCenterPageLayout,
} from "@dev-mainsequence/command-center-sdk/layout/testing";

test("portfolio layout conforms", async ({ page }) => {
  await page.goto("/portfolios/current");
  await page.getByRole("heading", { name: "Portfolio overview" }).waitFor();
  await assertCommandCenterPageLayout(page);
});
```

The default matrix verifies 375×812, 768×900, and 1280×800. Exercise at least one dark and one
light preset and representative loaded, loading, error, empty, long-title, dense-table, and
variable-card-count states. Treat every reported overflow, missing stack gap, missing standard card
inset, card overlap/collapse failure, header collision, or clipped interactive element as a failure.
Use screenshots for review when layout changes, but do not replace geometry assertions with visual
approval alone.

Run the closed theme audit separately:

```bash
npx command-center-sdk theme audit --path src
```

## Enforce The Boundary

- Keep exactly one `ApplicationPage` root per complete rendered route.
- Keep stable `data-cc-*` attributes; the verifier uses them as a public test contract.
- Prefer parent stack/grid gaps over child margins.
- Keep standard card padding unless the content is explicitly full-bleed.
- Do not double-wrap SDK views that already own a surface.
- Do not override SDK layout variables or stable geometry and still claim conformance.
- Do not mistake a passing theme audit or absence of horizontal overflow for complete layout
  verification.
