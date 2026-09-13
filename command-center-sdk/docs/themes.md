---
title: Themes
description: Apply presets, consume the closed token contract, and verify themed applications.
---

# Themes

The theme system is a compatibility contract between SDK components and consuming applications.
A preset supplies semantic tokens, mode, density, surface hierarchy, fonts, and chart palette
inputs. The SDK turns that model into CSS variables consumed by both SDK and application UI.

Use themes when an application should share Command Center's visual language without copying
literal values or depending on another application's CSS.

## Load CSS in the right order

For a normal browser application, load theme variables before component styles once:

```ts
// src/main.tsx
import "@dev-mainsequence/command-center-sdk/theme/styles.css";
import "@dev-mainsequence/command-center-sdk/styles.css";
```

`theme/styles.css` establishes the default semantic variables and base typography.
`styles.css` styles SDK components using those variables. Importing either file in many feature
modules makes ordering harder to reason about; keep global CSS imports at the application entry.

Tailwind v4 applications place the SDK mapping after Tailwind and before optional utilities:

```css
@import "tailwindcss";
@import "@dev-mainsequence/command-center-sdk/theme/tailwind.css";
@import "@dev-mainsequence/command-center-sdk/theme/styles.css";
@import "@dev-mainsequence/command-center-sdk/theme/utilities.css";
```

Optional Markdown and AG Grid skins should be imported only when those surfaces exist:

```css
@import "@dev-mainsequence/command-center-sdk/theme/markdown.css";
@import "@dev-mainsequence/command-center-sdk/theme/ag-grid.css";
```

## Resolve and apply a preset

Persist a preset's stable ID, not its entire token object. Resolve that ID against the installed
SDK and choose an explicit fallback for removed, unknown, or environment-provided values:

```ts
import {
  applyThemePresetToRoot,
  commandCenterThemes,
  resolveCommandCenterThemeById,
} from "@dev-mainsequence/command-center-sdk/theme";

const fallbackTheme = commandCenterThemes[0];
const activeTheme = resolveCommandCenterThemeById(savedThemeId) ?? fallbackTheme;

if (activeTheme) {
  applyThemePresetToRoot(document.documentElement, { theme: activeTheme });
}
```

Application code owns reading and writing `savedThemeId`. The SDK owns preset resolution and DOM
application. `applyThemePresetToRoot` updates `data-theme`, `data-tightness`,
`data-surface-hierarchy`, the `dark` class, and the complete CSS-variable map on the supplied root.

Apply to `document.documentElement` for a whole application. Apply to a narrower element only when
the application deliberately supports independently themed islands and has tested portal behavior.

## Treat tokens as a closed consumer contract

Use variables published by the installed stylesheet. Core semantic names include
`--background`, `--foreground`, `--card`, `--card-foreground`, `--border`, `--primary`,
`--muted-foreground`, `--danger`, `--success`, `--warning`, `--ring`, and `--radius`.

```css
.service-panel {
  background: var(--card);
  color: var(--card-foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-family: var(--font-sans);
  font-size: var(--font-size-body);
  line-height: var(--line-height-body);
}
```

Do not invent an SDK-looking namespace and do not add literal fallbacks:

```css
/* Both hide a contract error. */
color: var(--ms-color-foreground);
background: var(--background, #ffffff);
```

A consumer-owned alias is acceptable when it derives entirely from public tokens:

```css
:root {
  --service-health-ok: var(--success);
  --service-health-failed: var(--danger);
}
```

This closed-token rule is what makes a theme switch complete. Literal colors, fallback values, or
invented tokens create surfaces that look correct in one preset and drift in the next.

## Density and surface hierarchy are semantic inputs

Every preset chooses a `tightness` and `surfaceHierarchy`. Those values drive more than one CSS
property: page gutters, card insets, table rows, typography, summary spacing, and nested surface
chrome move together.

Do not locally reproduce their lookup tables. Use the applied variables for CSS and the public
helpers only when integrating a library that requires JavaScript numbers or strings:

```ts
import {
  getThemeSurfaceHierarchyMetrics,
  getThemeTightnessMetrics,
} from "@dev-mainsequence/command-center-sdk/theme";

const density = getThemeTightnessMetrics(activeTheme.tightness);
const surfaces = getThemeSurfaceHierarchyMetrics(activeTheme.surfaceHierarchy);

configureGrid({
  headerHeight: density.table.agGridHeaderHeight,
  rowHeight: density.table.agGridRowHeight,
});

configureNestedPanel({ borderColor: surfaces.nestedCardBorderColor });
```

For standard application pages and cards, prefer the `/layout` components. The helpers are for
external libraries and specialized surfaces, not a reason to recreate SDK layout primitives.

## Use semantic chart palettes

Charts should follow the active preset rather than borrowing arbitrary interface colors:

```ts
import {
  getThemeCategoricalPalette,
  getThemeDivergingScale,
  getThemeSequentialScale,
  resolveThemeDataVizPalette,
} from "@dev-mainsequence/command-center-sdk/theme";

const palette = resolveThemeDataVizPalette(activeTheme, activeTheme.tokens);
const seriesColors = getThemeCategoricalPalette(palette, 6);
const riskScale = getThemeDivergingScale(palette, "positive-negative");
const volumeScale = getThemeSequentialScale(palette, "primary");
```

Use categorical colors for peers, sequential scales for magnitude, and diverging scales only when
there is a meaningful neutral point. Do not use status colors to distinguish unrelated series.

## Generate variables without mutating the DOM

`buildThemeCssVariableMap` is useful for framework adapters. `buildThemeStyleText` creates a scoped
style block for a document or embedded artifact:

```ts
import { buildThemeStyleText } from "@dev-mainsequence/command-center-sdk/theme";

const cssText = buildThemeStyleText({
  selector: "[data-report-theme]",
  theme: activeTheme,
});
```

Do not serialize a generated style block as the persisted theme preference. Persist the stable ID
and regenerate from the installed SDK so compatible token additions are received automatically.

## Verify a theme integration

Run the closed-token audit over authored application code:

```bash
npx command-center-sdk theme audit --path src
```

It rejects unknown variables, theme-variable fallbacks, literal colors, and hardcoded semantic
typography, radii, and shadows. Then verify rendered output in at least one dark and one light
preset. Inspect computed styles; seeing the correct `data-theme` attribute alone does not prove
that a component consumes the contract.

For complete pages, also run the real-browser verifier from `/layout/testing` at the documented
viewport matrix. A valid token set cannot prove that sibling gaps, card insets, header wrapping,
or interactive geometry are correct.

When adding or changing a preset, test:

- text, control, focus, and status contrast;
- standard and nested card hierarchy;
- compact and relaxed density-sensitive surfaces;
- categorical, sequential, and diverging charts;
- Markdown or AG Grid skins that the application imports; and
- persistence fallback when an unknown ID is restored.

Theme IDs and token names are compatibility boundaries. Renaming or removing either requires an
explicit migration and consumer impact review.

See [Application layout](./application-layout.md) for structural composition and
[Static-site embeds](./static-site-embeds.md) for synchronizing theme context into an iframe.
