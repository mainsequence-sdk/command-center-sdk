---
sidebar_position: 4
title: Application layout
---

# Compose a complete application page

Use the public layout primitives when a complete route needs consistent page gutters, title and
action placement, vertical section rhythm, card padding, or responsive sibling-card behavior. The
SDK owns this repeated application chrome; the application continues to own domain-specific
content and product policy.

Import both browser style entrypoints once near the application root:

```ts
import "@dev-mainsequence/command-center-sdk/theme/styles.css";
import "@dev-mainsequence/command-center-sdk/styles.css";
```

## Build the page

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

`ApplicationPage` defaults to `maxWidth="wide"`. Use `content` for reading-oriented pages and
`full` for a route that needs the complete available width while retaining responsive page
gutters. `ApplicationPageHeader` defaults to an `h1`; use `titleAs` when the page is nested under an
existing accessible heading.

`ApplicationCard` pads content by default. Select `contentPadding="none"` only for intentional
edge-to-edge content such as a table scroller, media renderer, or canvas. Optional `header` and
`footer` regions remain padded. Use `surface="nested"` for a card inside an already framed surface.

`ApplicationCardGrid` defaults to an `18rem` minimum card width and collapses before a card becomes
too narrow. Override `minimumCardWidth` only when the card's real content requires a different
minimum.

## Keep one spacing owner

`ApplicationPage` owns the separation between its header and body. `ApplicationPageStack` owns the
vertical rhythm between top-level sections. `ApplicationCardGrid` owns spacing between sibling
cards. Do not add margins to each child to recreate those relationships.

Place `ResourceListPage` and `ResourceDetailShell` directly in `ApplicationPageStack`. Do not wrap
them in `ApplicationCard`; those high-level views already own their internal surfaces and padding.
Specialized chart, form, split-pane, map, editor, canvas, widget, and workspace internals remain
application-owned unless their public module says otherwise.

The SDK does not own section order, routing, authentication, permissions, API transport,
persistence, notifications, or product-specific loading and error policy. Use the controlled
[`/feedback` primitives](./application-feedback.md) when the SDK should own reusable status and
progress presentation while the application retains that policy.

## Extend with public metrics

The theme resolves the following layout variables for the active tightness:

```css
--application-page-gutter-inline
--application-page-gutter-block
--application-page-content-max-width
--application-page-wide-max-width
--application-section-gap
--application-card-grid-gap
--application-card-min-width
--application-card-padding-inline
--application-card-padding-block
--application-card-header-gap
--application-card-content-gap
```

Use these variables for adjacent custom structure. Do not copy their resolved numbers or invent
SDK-looking aliases. The standard-density baseline uses 16px mobile/24px regular page gutters,
20px mobile/24px regular section gaps, 16px grid gaps, and 16px mobile/20px regular card padding.
Relaxed and tight themes resolve their own coherent values.

## Verify in a real browser

Theme and layout conformance are separate. Continue to run the semantic CSS audit:

```bash
npx command-center-sdk theme audit --path src
```

Then verify final DOM geometry with the test-only public entrypoint:

```ts
import { test } from "@playwright/test";
import {
  assertCommandCenterPageLayout,
} from "@dev-mainsequence/command-center-sdk/layout/testing";

test("portfolio page layout conforms", async ({ page }) => {
  await page.goto("/portfolios/current");
  await page.getByRole("heading", { name: "Portfolio overview" }).waitFor();
  await assertCommandCenterPageLayout(page);
});
```

The default verifier matrix is 375×812, 768×900, and 1280×800. It detects missing or duplicate
page roots, horizontal overflow, missing parent-owned section gaps, unpadded standard cards, card
grid overflow/overlap/collapse failures, page-header collisions, and unusable interactive geometry.
`verifyCommandCenterPageLayout` returns a structured report when a test runner needs custom
assertions; `assertCommandCenterPageLayout` throws `CommandCenterPageLayoutError` with the same
report.

Run the matrix against representative loaded, loading, error, empty, long-title, dense-table, and
variable-card-count states in at least one dark and one light preset. Review screenshots whenever
layout changes, but keep geometry assertions as the mandatory automated baseline.

Drivers other than Playwright can implement the small `CommandCenterLayoutBrowserPage` interface:
set a viewport and evaluate a function in the page. The SDK does not add Playwright to the consumer
runtime dependency graph.
