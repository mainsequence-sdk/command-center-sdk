# Command Center Themes

Public theme APIs and CSS for Command Center-compatible hosts and embedded applications. Import
JavaScript from `@dev-mainsequence/command-center-sdk/theme` and styles from the documented theme
CSS subpaths.

## Purpose

This package is the source of truth for reusable Command Center theme contracts, presets,
data-visualization palettes, density and application-layout metrics, surface hierarchy metrics,
bundled CSS, font stacks, and DOM CSS-variable application helpers.

External iframe applications install the SDK and resolve the active `themeId` sent by the host.

## Main Entry Points

- `src/types.ts`: stable `ThemePreset`, token, density, and data-viz palette contracts.
- `src/breakpoints.ts`: the published viewport scale (`sm` 640, `md` 768, `lg` 1024 CSS pixels)
  and pure band resolution used by every SDK stylesheet and the `/layout` viewport seam.
- `src/presets/`: built-in theme presets exported by id-stable objects.
- `src/chart-palettes.ts`: data-viz palette resolution and palette helper functions.
- `src/tightness.ts`: density metrics used by complete application layouts, tables, and compact UI
  surfaces.
- `src/surface-hierarchy.ts`: nested-surface chrome metrics.
- `src/css-vars.ts`: helpers for building CSS-variable maps or style blocks.
- `src/apply-theme.ts`: DOM helper for applying a resolved theme to an element.
- `styles.css`: browser-ready base stylesheet, theme chrome variables, body typography, and reusable
  Command Center chrome selectors.
  It also publishes the device-axis variables `--application-control-min-size` (36px, 44px under
  a coarse pointer), `--application-safe-area-top/right/bottom/left`, and
  `--application-navigation-rail-width`, and drops `background-attachment: fixed` on coarse-pointer
  devices.
- `utilities.css`: optional text-size, line-clamp, token-swatch, and positive/negative utility
  classes.
- `tailwind.css`: Tailwind v4 theme-variable mapping for apps that use Tailwind utilities.
- `fonts.css`: shared Command Center font-stack custom properties.
- `markdown.css`: optional scoped markdown skin for `.command-center-markdown`.
- `ag-grid.css`: optional AG Grid skin keyed off Command Center CSS variables.

## Usage

Import the CSS bundle once in the embedded application:

```ts
import "@dev-mainsequence/command-center-sdk/theme/styles.css";
```

Tailwind v4 applications should also import the theme mapping after `tailwindcss`:

```css
@import "tailwindcss";
@import "@dev-mainsequence/command-center-sdk/theme/tailwind.css";
@import "@dev-mainsequence/command-center-sdk/theme/styles.css";
@import "@dev-mainsequence/command-center-sdk/theme/utilities.css";
```

Then apply the active preset to the iframe document root:

```ts
import {
  applyThemePresetToRoot,
  commandCenterThemes,
  resolveCommandCenterThemeById,
} from "@dev-mainsequence/command-center-sdk/theme";

const theme = resolveCommandCenterThemeById("main-sequence-space") ?? commandCenterThemes[0];

if (theme) {
  applyThemePresetToRoot(document.documentElement, { theme });
}
```

For host-to-iframe messaging, the host can send either the `themeId` or a serialized style block:

```ts
import { buildThemeStyleText, resolveCommandCenterThemeById } from "@dev-mainsequence/command-center-sdk/theme";

const theme = resolveCommandCenterThemeById("main-sequence-space");
const cssText = theme ? buildThemeStyleText({ theme }) : "";
```

Import optional skins only when the consuming application uses those surfaces:

```css
@import "@dev-mainsequence/command-center-sdk/theme/markdown.css";
@import "@dev-mainsequence/command-center-sdk/theme/ag-grid.css";
```

## Maintenance Notes

- Keep theme ids stable once published. Command Center persists selected theme ids in user
  preferences.
- Add new presets to `src/presets/` and export them from both `src/presets/index.ts` and
  `src/index.ts`.
- Treat token key removals or renames as breaking changes.
- Keep browser-ready portable base theme CSS in `styles.css`; keep framework or library-specific
  skins in separate optional CSS entrypoints.
- Keep Tailwind-specific mapping in `tailwind.css`.
- This package intentionally has no React, Vite, app-registry, auth, or storage dependencies.

## Validation And Release

- `npm run check` validates declarations.
- `npm run build` produces the JavaScript/declaration entry points; CSS files ship directly.
- Record public compatibility changes in the SDK changelog.
- Validate both a plain CSS consumer and any optional library skin that changed.

## Backend And Storage Impact

This package performs no persistence. Theme IDs are stored by Command Center preferences, so
renaming or removing a released ID requires an application migration even though no backend schema
changes.

## Architecture Documentation

- [Package publishing](https://github.com/mainsequence-sdk/command-center-sdk/blob/main/docs/packages/publishing.md)
- [Platform theming](https://github.com/mainsequence-sdk/command-center-sdk/blob/main/docs/platform/theming.md)
