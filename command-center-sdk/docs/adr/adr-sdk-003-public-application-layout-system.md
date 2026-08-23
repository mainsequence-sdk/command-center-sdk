# SDK ADR 003: Public Application Layout System

- Status: Accepted
- Date: 2026-08-23
- Implementation: `@dev-mainsequence/command-center-sdk@0.1.14`
- Owners: Command Center SDK Layout
- Package: `@dev-mainsequence/command-center-sdk`
- Related: [Themes and embeds](../themes-and-embeds.md), [Resources](../resources.md)

## Publication status

This decision is implemented in SDK source for the next package release. A consumer may use the
component names, entrypoints, CSS variables, test helpers, and agent skill only when its installed
package export map and declarations contain them.

An ADR or a newer checkout does not make an API available in an older package. Repository-only
components from Command Center or another application are not substitutes for the public SDK API.

## Decision summary

The SDK publishes a small, composable application-layout system for complete SDK applications:

- a page container with standard responsive gutters and width behavior;
- a page header with responsive title, description, and action placement;
- a vertical page stack that owns spacing between top-level sections;
- a card with SDK-owned surface treatment and safe default content padding;
- a responsive card grid that owns spacing and collapse behavior; and
- a browser-level conformance helper that verifies final geometry at supported viewport sizes.

These primitives are exported from a dedicated `/layout` entrypoint. They complement,
not replace, the existing semantic theme contract and domain-specific views such as resource lists
and resource details.

The SDK also ships an agent skill for composing complete application pages in the same package
release as the layout entrypoint and verification API.

## Context

The SDK already provides two useful but incomplete layers:

1. The theme system defines semantic colors, typography, density, radii, shadows, and other visual
   values. Its audit detects invalid authored CSS such as non-semantic colors or unsupported token
   use.
2. High-level views such as `ResourceListPage` and `ResourceDetailShell` contain their own coherent
   spacing and card treatment for those specific workflows.

Neither layer provides the structural primitives needed to assemble a complete custom
application. A consumer that combines a status banner, filters, summary panels, charts, forms,
and tables must currently invent all of the following:

- page gutters and maximum width;
- vertical rhythm between sibling sections;
- card padding and full-bleed exceptions;
- responsive grid gaps and minimum item widths;
- title/action wrapping at narrow widths; and
- a browser test that proves those rules survive real content.

This is a public SDK design-system gap. It is not a defect in the theme audit. The audit evaluates
authored semantic declarations; it cannot infer whether two rendered sibling cards have adequate
space, whether a bordered surface accidentally has zero content padding, or whether actions overlap
at a specific viewport. Those are DOM and computed-geometry questions.

The existing guidance correctly says that structural layout remains application-owned unless the
SDK publishes a metric. That boundary is too broad for repeated application chrome. It causes each
consumer—and each coding agent rebuilding a similar application—to recreate the same page and card
rules with subtly different results.

Observed consumer applications demonstrate the failure mode: a generic panel can receive a
semantic border, background, radius, and shadow while still rendering with no internal padding or
space from the preceding sibling. Other panels may appear correct only because screen-specific CSS
adds incidental insets. The result can pass the theme audit and avoid horizontal overflow while
still having inconsistent visual rhythm.

### Motivating audit evidence

The application audit that motivated this proposal recorded the following on 2026-08-23:

- the tutorial consumed SDK `0.1.8`; inspection of SDK `0.1.13` confirmed that no newer public
  complete-application layout API existed;
- its generic `.panel` rule supplied semantic surface chrome but no default content padding;
- the first ordinary panel after the backend status banner had 0px effective preceding gap and 0px
  effective content inset at both 375px and 1280px viewport widths;
- specialized panels appeared to have roughly 16px–22.4px of inset only because individual screen
  subclasses supplied it; and
- the page had no horizontal overflow, demonstrating that an overflow check and the semantic theme
  audit can both pass while the layout remains inconsistent.

These measurements are motivating evidence, not an instruction to copy tutorial markup or promote
its application-owned CSS into the SDK.

## Decision drivers

- Complete applications need consistent macro layout without importing another application's
  private components.
- Safe composition should be the default; zero-padding and full-bleed cards should require an
  explicit decision.
- Responsive behavior should come from the same public system as the spacing metrics.
- Applications must retain ownership of domain-specific and highly specialized layouts.
- Verification must inspect rendered geometry because source-level CSS linting is insufficient.
- The public API must remain backend-neutral, router-neutral, and independent of Command Center
  product internals.
- Agent guidance must never describe planned APIs as published capabilities.

## Decision

### 1. Publish a dedicated layout entrypoint

The public import is:

```tsx
import {
  ApplicationCard,
  ApplicationCardGrid,
  ApplicationPage,
  ApplicationPageHeader,
  ApplicationPageStack,
} from "@dev-mainsequence/command-center-sdk/layout";
```

The stable responsibilities are:

| Primitive | SDK-owned responsibility | Consumer-owned content |
| --- | --- | --- |
| `ApplicationPage` | Responsive outer gutters, maximum width, width containment, and page root semantics | Page contents and product state |
| `ApplicationPageHeader` | Title/description hierarchy, optional eyebrow, action gap, and narrow-width wrapping | Labels, descriptions, actions, and navigation callbacks |
| `ApplicationPageStack` | Vertical rhythm between top-level page sections | Section ordering and conditional presence |
| `ApplicationCard` | Surface hierarchy, border, radius, shadow, and default content padding | Card contents, loading/error states, and domain interactions |
| `ApplicationCardGrid` | Sibling gap, minimum item sizing, wrapping/collapse behavior, and width containment | Card count, content, and application-specific column intent |

The primitives must accept `className`, `data-*`, `aria-*`, and appropriate semantic element
selection without requiring repository aliases or private source imports. Consumer styles may
extend domain presentation but must not silently redefine the SDK-owned layout invariants and still
claim conformance.

### 2. Make safe card spacing the default

`ApplicationCard` renders with standard content padding by default. A consumer may request an
explicit full-bleed mode for content such as a table, media canvas, or edge-to-edge custom renderer.
The rendered card will expose the selected padding mode through stable markup so the conformance
helper can distinguish an intentional full-bleed surface from missing padding.

The authoring model is:

```tsx
<ApplicationPage>
  <ApplicationPageHeader
    title="Portfolio overview"
    description="Monitor exposures and rebalance the active portfolio."
    actions={<RebalanceButton />}
  />

  <ApplicationPageStack>
    <StatusBanner />

    <ApplicationCardGrid minimumCardWidth="18rem">
      <ApplicationCard><ExposureSummary /></ApplicationCard>
      <ApplicationCard><RiskSummary /></ApplicationCard>
    </ApplicationCardGrid>

    <ApplicationCard contentPadding="none">
      <PositionsTable />
    </ApplicationCard>
  </ApplicationPageStack>
</ApplicationPage>
```

Regular cards are padded; full-bleed cards select `contentPadding="none"` explicitly. Optional
`header` and `footer` regions remain padded, and `surface="nested"` consumes the existing nested
surface hierarchy.

### 3. Publish layout metrics through the existing theme resolution

The layout system derives its values from the active theme tightness and exposes resolved CSS
variables for controlled extension:

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

The initial standard-density baseline is:

| Metric | Narrow viewport | Regular viewport |
| --- | ---: | ---: |
| Page inline gutter | 16px | 24px |
| Page block gutter | 16px | 24px |
| Top-level section gap | 20px | 24px |
| Card grid gap | 16px | 16px |
| Card inline padding | 16px | 20px |
| Card block padding | 16px | 20px |
| Header action gap | 8px | 8px |

Relaxed and tight presets resolve coherent variants around this standard-density baseline. The
implementation preserves a documented minimum safe inset and section gap. Responsive padding uses
fluid metrics; grids size from their available container rather than depending only on the browser
viewport.

Applications may consume the public variables for adjacent custom layout. They must not invent
lookalike variables or copy resolved numeric values into their own design system.

### 4. Preserve a clear ownership boundary

The SDK owns repeated complete-application chrome:

- page gutters and width containment;
- page header hierarchy and wrapping;
- top-level section rhythm;
- standard card surfaces and insets; and
- ordinary responsive card grids.

The application continues to own:

- domain-specific chart, form, canvas, and table layout;
- split panes, editors, maps, and other specialized workspaces;
- the order and conditional visibility of sections;
- route, permission, authentication, persistence, and transport policy; and
- explicit full-bleed regions where standard card padding is inappropriate.

Existing high-level views keep ownership of their internal layout. Consumers must not wrap
`ResourceListPage` or `ResourceDetailShell` in extra cards merely to obtain padding. Those views can
be placed as sections in the page stack and may adopt the common metrics internally without changing
their workflow APIs.

No backend endpoint, stored payload, iframe message, authentication contract, or application route
is introduced by this decision.

### 5. Keep semantic auditing and geometry verification separate

The existing theme audit remains responsible for semantic authored CSS. It must not add heuristics
that guess whether a margin, padding, or gap is visually adequate.

The SDK instead provides a test-only browser helper through:

```ts
import {
  verifyCommandCenterPageLayout,
} from "@dev-mainsequence/command-center-sdk/layout/testing";
```

The helper operates on the small structural `CommandCenterLayoutBrowserPage` interface so the
runtime package does not take a production dependency on Playwright. Playwright's `Page` is
structurally compatible.

The baseline verification matrix is:

- 375 × 812 for a narrow phone-sized viewport;
- 768 × 900 for a compact/tablet-sized viewport; and
- 1280 × 800 for a regular desktop viewport.

At each size, geometry verification must detect at least:

- missing or duplicated application page roots;
- horizontal document overflow;
- top-level stack children with no effective separation;
- non-full-bleed cards with missing content inset;
- card grids whose children overlap, overflow, or fail to collapse;
- page-header actions that overlap or escape the header; and
- visible interactive elements that are clipped or have zero usable size.

SDK CI will exercise the primitives in light and dark themes, with representative long titles,
actions, loading states, error states, tables, and variable card counts. Consumer CI should run the
geometry helper at the baseline viewport matrix and use screenshot review when application layout
changes. Geometry checks are the mandatory automated baseline; pixel snapshots alone are not a
substitute because their approval can normalize a spacing regression.

### 6. Publish agent guidance only with the implementation

The release that publishes `/layout` includes the focused packaged skill
`layout/compose-command-center-page`. It teaches agents to:

- start complete application pages with `ApplicationPage`;
- use `ApplicationPageStack` as the owner of top-level vertical rhythm instead of ad hoc sibling
  margins;
- use `ApplicationCard` for ordinary bordered surfaces and select full-bleed mode explicitly;
- use `ApplicationCardGrid` for responsive sibling cards;
- avoid double-wrapping SDK resource views;
- run browser verification at the supported viewport matrix in light and dark themes; and
- keep specialized domain layout application-owned.

The general application-building skill routes page-composition tasks to that skill, and the theme
skill clarifies that semantic theme auditing does not prove structural conformance.

The skill is packaged atomically with the entrypoint. It first checks the installed package so an
older consumer cannot mistake this accepted ADR for an export available in its installed version.

## Compatibility and release impact

The implementation is an additive React and CSS public API. Once released, exported component
names, documented props, stable layout markup used by the verifier, and public CSS variables become
compatibility commitments.

The implementation does not require a serialized contract because all values are runtime React,
CSS, DOM, or test-adapter concerns. `contracts/manifest.json`, JSON Schemas, and backend fixtures
remain unchanged. There is no backend or storage rollout.

Because the layout system establishes a foundational authoring standard and is expected to cause
visible application migrations, the recommended first release is a minor version, provisionally
`0.2.0`, even though adoption is opt-in.

## Rollout plan

Completed in SDK source:

1. Implement `/layout` and `/layout/testing` as public package entrypoints using only SDK-owned
   theme dependencies.
2. Add focused component, theme-metric, responsive Chromium, package-export, and packed-consumer
   tests.
3. Add public documentation and copyable examples that import only declared package paths.
4. Add and validate the packaged page-composition skill; update the general application and theme
   skills to route to it.

Release and consumer adoption remain ordered:

1. Publish the package and confirm the tarball contains the layout code, styles, declarations,
   documentation, and agent skill.
2. Migrate tutorial and reference applications from locally invented panel/page CSS to the released
   primitives. Do not migrate them against repository-only source.
3. Run semantic theme auditing and browser geometry verification before each migrated application
   is deployed.

## Acceptance criteria

This ADR is Accepted because:

- the public prop types and ownership boundaries do not rely on Command Center
  application internals;
- focused tests validate the baseline metrics for every supported theme tightness;
- the five primitives handle representative empty, loading, error, dense-table, and long-content
  states;
- Chromium verification catches deliberate missing-gap, missing-padding, overflow, overlap,
  collapse, action-collision, clipping, and zero-size-control regressions;
- the packed-consumer fixture imports both public entrypoints and the packed smoke test verifies
  their declarations and JavaScript files;
- public documentation and examples contain no private or planned-only imports; and
- the packaged skill is included atomically with the APIs it describes.

## Alternatives considered

### Expand the theme audit to reject inadequate spacing

Rejected. Static CSS inspection cannot reliably determine DOM relationships, computed geometry,
intentional full-bleed regions, or responsive behavior. It would create false confidence and false
positives while weakening the audit's clear semantic purpose.

### Publish spacing tokens without layout components

Rejected. Tokens make numbers reusable but do not establish which element owns spacing, make safe
card padding the default, or define responsive composition. Consumers would continue to implement
incompatible structures around the same values.

### Update only the agent skill

Rejected. Guidance cannot make a repository-private component into a supported SDK capability.
Agents would still invent markup or copy another application's implementation, and the skill would
misrepresent proposed APIs as published.

### Export Command Center's private page and card components

Rejected. Those components may depend on product routes, stores, aliases, and policy. The SDK must
publish a small backend-neutral implementation with an independently testable contract.

### Let each sibling own margins

Rejected. Child-owned margins create collapsed, doubled, and conditional-spacing bugs. A parent
stack or grid provides one predictable owner for sibling rhythm.

### Require Playwright as a runtime dependency

Rejected. Layout verification belongs in development and CI. A structural adapter keeps the SDK
test API usable with Playwright or another browser driver without adding browser automation to the
production dependency graph.

## Consequences

- Consumers gain a supported way to build visually coherent complete applications without copying
  Command Center internals.
- Theme conformance and layout conformance become distinct, complementary checks.
- Standard pages will carry consistent spacing, padding, and responsive behavior across products
  and themes.
- Applications retain freedom for specialized workspaces and can opt into explicit full-bleed
  content.
- The SDK assumes long-term compatibility responsibility for another public React/CSS surface.
- Existing custom applications require deliberate migration; the SDK will not globally rewrite
  application CSS or mutate layouts at install time.
- Older installed package versions remain unchanged; consumers must verify `/layout` in their
  installed export map before following this ADR or the new workflow.
