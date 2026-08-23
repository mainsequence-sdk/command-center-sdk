---
name: theme-command-center-app
description: Apply, extend, audit, review, or troubleshoot Command Center themes with @dev-mainsequence/command-center-sdk/theme and its CSS subpaths. Use for theme presets, strict CSS-variable consumption, typography, radii, status colors, data-visualization palettes, density and surface metrics, Tailwind integration, optional library skins, or host-to-iframe theme propagation.
---

# Theme A Command Center Application

## Load The Published Theme Surface

Inspect the installed `/theme`, `/theme/presets`, and `/theme/data-viz` declarations and declared
CSS exports. Import the browser-ready base stylesheet once. Import optional Markdown, AG Grid,
React Flow, or React Grid Layout skins only when the application uses those libraries.

For Tailwind v4, load Tailwind first, then the SDK mapping and SDK theme styles. Do not copy the
SDK CSS into application source or import unpublished theme files.

## Apply Themes Through Tokens

1. Resolve a published theme by stable id.
2. Apply it to the intended root element with the SDK DOM helper or build a serialized style block
   for a controlled embed boundary.
3. Use exported density, surface hierarchy, and data-visualization helpers instead of hardcoded
   approximations.
4. Build every branded or semantic visual property from published CSS variables so preset changes
   propagate consistently.

## Enforce A Closed Theme Contract

Once the base theme stylesheet is imported, treat its variables as a closed contract:

- Use SDK variables for colors, surfaces, foregrounds, font family, font size, font weight, letter
  spacing, text transformation, line height, radii, shadows, focus rings, statuses, density,
  surface hierarchy, and chart palettes.
- Do not invent an SDK-looking namespace such as `--ms-color-*`. Read the installed stylesheet;
  core tokens are semantic names such as `--background`, `--card`, and `--primary`.
- Do not add literal fallback values to SDK variables. A fallback conceals a misspelled, removed,
  or unapplied token and makes theme switching appear only partially functional.
- Permit consumer aliases only when every semantic value is derived from published variables, for
  example `--app-panel: var(--card)` or a `color-mix` based on `--primary` and `transparent`.
- Route complete page gutters, headers, top-level section rhythm, standard cards, and responsive
  card grids to `$compose-command-center-page`. Keep only specialized grid placement, split panes,
  editors, canvases, positioning, and intrinsic domain geometry application-owned.
- Use `/theme/data-viz` helpers for chart series. Do not reuse one brand color for every series.

Run the deterministic audit against authored CSS and make it part of the consumer check/CI command:

```bash
npx command-center-sdk theme audit --path src
```

Treat every audit violation as a build failure. Do not suppress it with a new literal or alias;
either consume the published token or record a genuine missing SDK capability.

## Preserve Compatibility

Keep released theme ids and token keys stable. Treat removal or renaming as a breaking change.
When a host persists a theme id, coordinate a preference migration before changing it.

Keep portable theme CSS separate from framework-specific skins. Keep authentication, storage,
application registries, and routing outside the theme layer.

## Verify

Run the theme audit. Test at least one plain CSS consumer, active preset switching, fallback theme
resolution, and every optional library skin changed by the task. In a real browser, compare
computed component values with root tokens across at least one dark and one light preset; merely
observing the theme ID or root-variable update is not sufficient. Check typography, focus,
statuses, charts, contrast, and nested-surface hierarchy.

Do not treat the theme audit as proof of page spacing or responsive geometry. When the application
uses `/layout`, run its public browser verifier through `$compose-command-center-page` as a separate
required check.
