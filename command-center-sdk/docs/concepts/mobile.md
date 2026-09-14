---
sidebar_position: 4
title: Mobile and touch
---

# Mobile and touch

The SDK has a device axis alongside its theme and density axes. Surfaces read the viewport band
and the pointer type through one seam, stylesheets react to a coarse pointer, and the layout
verifier runs touch rules against a declared pointer. This page defines the target and explains
what each public surface does on a phone, so a consuming application inherits that behavior from
the declarations it already writes.

## The target

Command Center applications are operator and analyst consoles. On a phone the job is to read
first and act second: check a status, open a detail, run one action, pick a resource. The SDK
targets:

- phone portrait from 320px to 430px wide with a coarse pointer;
- phone landscape and tablets from 768px to 1024px in either orientation; and
- any embedded iframe whose own width falls in those bands.

Desktop remains the primary surface. Nothing below changes fine-pointer output unless a consumer
opts in.

## One breakpoint scale

`/theme` publishes the scale every SDK stylesheet uses:

| Band | Width |
| --- | --- |
| `xs` | below 640px |
| `sm` | 640px to 767px |
| `md` | 768px to 1023px |
| `lg` | 1024px and up |

```ts
import {
  commandCenterBreakpoints,
  resolveCommandCenterBreakpoint,
} from "@dev-mainsequence/command-center-sdk/theme";
```

CSS media queries cannot read custom properties, so the scale is a constant set. SDK stylesheets
express the boundaries as `@media (max-width: 639px)` and `@media (max-width: 767px)`. Use the
same values in application CSS instead of inventing another scale.

## One viewport seam

`/layout` exports the hook SDK surfaces and hosts use instead of writing `matchMedia` code:

```tsx
import { useCommandCenterViewport } from "@dev-mainsequence/command-center-sdk/layout";

const { breakpoint, coarsePointer, hoverCapable, reducedMotion } = useCommandCenterViewport();
```

Server rendering and environments without `matchMedia` resolve to `lg`, a fine pointer, hover
capable, and no reduced motion, so the first client render matches the server. Framework-neutral
code can call `resolveCommandCenterViewport(window)` once or subscribe with
`subscribeCommandCenterViewport`.

## Presentation, not detection

A surface that changes shape on a small screen accepts one prop:

```ts
presentation?: "auto" | <desktop form> | <small-screen form>;
```

The desktop form is always the 0.2.1 behavior and the default. `auto` resolves through the
viewport seam. The resolved form appears as `data-cc-presentation` on the surface's root so CSS,
tests, and the verifier can read it. `ApplicationNavigationShell` applies it with `docked` and
`overlay`, `DataTable` with `table` and `stacked`, `ResourcePagination` with `full` and `compact`,
`ResourcePicker` with `popover` and `sheet`, and `ResourceActionConfirmationDialog` with `dialog`
and `sheet`. See [Application navigation](../navigation.md) and [Resources](../resources.md).

## What the stylesheets do on touch

Under `@media (pointer: coarse)` the SDK sheets:

- raise `--application-control-min-size` from 36px to 44px and apply it to rail items, panel
  destinations, pagination, pickers, dialog actions, tabs, breadcrumbs, and summary controls;
- keep every SDK text input at `max(16px, …)` so iOS Safari does not zoom the page on focus;
- floor table text at 13px and cell padding at the standard row, whatever the density preset says;
  and
- stop painting the body background with `background-attachment: fixed`, which iOS ignores or
  repaints on scroll.

Independent of pointer, every hover rule sits under `@media (hover: hover)` so a tap never leaves a
row or rail item lit, viewport-height surfaces use `100dvh` with a `100vh` fallback, and page
gutters, the rail footer, the status screen, and dialogs add `env(safe-area-inset-*)` through the
`--application-safe-area-*` variables. Application CSS should follow the same rules.

## Two host responsibilities

The SDK cannot supply these; the host must.

- **A viewport meta tag.** Without `<meta name="viewport" content="width=device-width,
  initial-scale=1">` a mobile browser lays the page out at 980px and scales it down. No SDK
  breakpoint or touch rule will fire. Every host document and every embedded static site needs
  the tag.
- **A menu trigger and menu state.** In the overlay presentation the SDK renders the drawer, but
  the host places `ApplicationNavigationTrigger` in its own top bar and owns `menuOpen`.

## Verify with the declared pointer

The layout verifier's default matrix declares a pointer per entry. Coarse entries run the
`touch-target` and `sticky-hover` rules; entries narrower than 768px run `input-zoom`. Warnings
never fail a report, so a 36px control at a coarse entry is reported without blocking CI, while a
control under 24px or a text input under 16px does block it. Configure `hasTouch: true` and
`isMobile: true` on the browser context for coarse entries so `(pointer: coarse)` CSS applies; the
verifier itself cannot switch touch emulation. See [Application layout](../application-layout.md)
for the full rule list.
