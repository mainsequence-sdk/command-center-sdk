# SDK ADR 015: Detail Tabs Own Their Keyboard, Panel, and Overflow

- Status: Accepted
- Date: 2026-09-29
- Implementation: `@dev-mainsequence/command-center-sdk` 0.5.8
- Owners: Command Center SDK maintainers
- Package: `@dev-mainsequence/command-center-sdk`
- Related:
  - [SDK ADR 006: Device-Aware Primitives](./adr-sdk-006-device-aware-primitives.md)
  - [SDK ADR 007: Responsive Column Importance and Stacked Tables](./adr-sdk-007-responsive-column-importance-and-stacked-tables.md)
    (amended: its §5 tab strip)
  - [SDK ADR 011: Public Control and Form Primitives](./adr-sdk-011-public-control-and-form-primitives.md)
  - [Resources](../resources.md), [Application controls](../application-controls.md),
    [Mobile](../concepts/mobile.md)

## Publication status

This decision is implemented in SDK source for the next package release. A consumer may use
`resolveResourceDetailTabs`, the `disabled` tab field, and the `renderTabLead`,
`renderBreadcrumbLead`, `tabsLabel`, and `tabsOverflow` props only when its installed package's
declarations contain them.

## Decision summary

A detail page is a summary over sections, and `ResourceDetailShell` already owns that anatomy. Its
tab strips now carry everything an application otherwise rebuilt: a keyboard model with one Tab
stop, a linked tab panel, disabled tabs, leading icons, and a **More** menu for tabs that do not
fit. Tab selection is resolved by one pure function, `resolveResourceDetailTabs`, which the host
and the shell share, so the highlighted tab and the rendered body cannot disagree. There is still
no standalone `Tabs` control: tabs remain part of the detail shell.

## Context

### The shell's tab strip was the least capable part of a detail

The strip rendered `role="tab"` buttons and an `aria-selected` flag, and nothing else. Every tab
was its own Tab stop, arrow keys did nothing, the content was not a tab panel, a tab could not be
disabled or carry an icon, and tabs that did not fit could only be scrolled sideways, which is
awkward with a mouse. On mount it called `scrollIntoView`, which also scrolled the page when the
strip was below the fold.

### Hosts rebuilt tabs to get what the shell lacked

Detail pages that wanted icons, a keyboard model, or an overflow menu kept a private tab
component, and some pages faked tabs with a row of buttons that swapped variants, which exposes no
tab semantics at all. Each copy restated focus, overflow, and styling rules the SDK already owns
for its other surfaces.

### Visibility was declared but never applied

`ResourceDetailTabDefinition.isVisible` has been part of the public type since the resource
definitions shipped, but nothing evaluated it: the shell never received the resource. When the
requested tab id was missing, the shell highlighted the first tab while the host rendered whatever
body its own state named. Hosts filtered tabs by hand and resolved fallbacks inconsistently; some
rewrote a deep link before the record that decides visibility had loaded.

### A standalone Tabs control is still not warranted

ADR 011 deferred `Tabs` for lack of demand beyond detail pages. That remains true: every surface
that needs tabs is a detail with a summary and sections. Publishing a general control now would fix
an API that only the detail shell uses.

### The More menu depends on a keyboard-usable picker

`ResourcePicker` in action mode is the SDK's menu, and `DataTable` already folds row actions into
it. In a real browser it had three keyboard defects that jsdom hid: it focused the first option
while the popup was still `visibility: hidden`, so focus stayed on the trigger; ArrowDown or ArrowUp
on the trigger of an open popup hid the popup without repositioning it; and Tab left a portaled
popover open with focus at the end of the document.

## Decision

### 1. Tabs stay part of `ResourceDetailShell`

The keyboard model, panel, disabled state, leading visuals, and overflow belong to the shell's tab
strips. No `Tabs` or `Menu` component joins `/controls`; the ADR 011 deferral stands and is
revisited when a surface other than a detail needs tabs.

### 2. Keyboard and semantics

- Each strip is a `tablist` with one Tab stop: the selected tab, or the first tab when none is
  selectable.
- ArrowLeft and ArrowRight move focus between the strip's rendered tabs and wrap; they are reversed
  in a right-to-left layout. Home and End move to the ends. Arrows with Alt, Control, or Meta are
  left to the browser, and handled keys prevent their default.
- Activation is manual: Enter, Space, or a click selects, focus alone never does, because a tab's
  body usually loads data.
- The content is the strip's `tabpanel`. It is focusable and labelled by the label of the selected
  tab and, when a secondary strip shows, the selected sub-tab, so a count is not part of its name.
  Every tab's `aria-controls` names it. The strip and panel render only when a tab is visible.
- `tabsLabel` names the primary strip (default "Detail sections"); a secondary strip is named after
  its tab.
- Tabs expose `data-cc-tab-id` and `data-state` for host tests.

### 3. Disabled tabs

`ResourceDetailTabDefinition` and `ResourceDetailSubTabDefinition` gain
`disabled?: boolean | ((resource: T) => boolean)`. A disabled tab renders `aria-disabled`, stays
focusable and in the arrow order so its existence is discoverable, and never selects. The sub-tab
type becomes generic with a default, so existing references are unchanged.

### 4. Leading visuals

`renderTabLead` on the shell draws a leading visual, usually an icon, from a context of
`{ level, tab, active, disabled }` plus `parent` for a secondary tab. It lives in `/views` because
`/resource` has no React dependency, and it is a narrow callback rather than a tab renderer. Its
output is `aria-hidden`, so the label stays the accessible name, and it must be pure: it also
renders in the hidden measurement copy and in the More menu. An `svg` lead is sized to 1rem.

A detail that moves onto the shell must not lose the object's own icon, which hosts often showed
beside its name in the header. Breadcrumb labels are strings in the framework-neutral
`ResourceBreadcrumbDefinition`, so `renderBreadcrumbLead` on the shell draws a breadcrumb's leading
visual from `{ crumb, index, current }`, `current` marking the last crumb. It follows the same
rules: `aria-hidden`, a 1rem `svg`, and the label as the name.

### 5. Overflow

`tabsOverflow` takes `auto` (default), `menu`, or `scroll`. `auto` resolves through the viewport
seam of ADR 006 to `scroll` with a coarse pointer and `menu` with a fine one, and the resolved form
appears as `data-overflow` on the strip.

- In `menu` form, tabs that do not fit move, in declaration order, into a **More** menu: a
  `ResourcePicker` in action mode placed after the `tablist`, since a tab list may own only tabs.
  Its accessible name starts with the visible "More", names the strip, and counts the hidden tabs.
  Its `auto` presentation makes it a bottom sheet on small screens.
- The selected tab, and a focused tab, always stay in the strip. When one would overflow it takes
  the last visible slot. This keeps the panel's label pointing at a rendered tab and the current
  section on screen.
- Choosing a tab from More moves focus to the More trigger, reports the choice, and moves focus to
  the tab once the host selects it, unless focus has moved elsewhere or the host selected another
  tab.
- Fitting uses the width of a flexible frame shared with the More trigger, so hiding a tab never
  shrinks the room for the others, and the rendered width of hidden, non-interactive button copies
  measured in the selected style. The fit is not recomputed while the menu is open.
- Server-rendered HTML and the first paint before measurement use the `scroll` form, so no tab is
  clipped out of reach before the page is interactive.
- In `scroll` form the strip keeps its edge shadows and scrolls only itself to show the selected
  tab; the page never moves.

### 6. One resolution for the host and the shell

`resolveResourceDetailTabs(tabs, { activeTabId, activeSubTabId, resource })` from `/resource`
returns the visible tabs with `disabled` resolved, the active tab and sub-tab, and a `fallback` flag.

- `isVisible` and a function-valued `disabled` run only here, and only when `resource` is neither
  `null` nor `undefined`, so a deep link keeps its tab while the record loads.
- The active tab is the requested one when it is visible and enabled, otherwise the first enabled
  tab. Sub-tabs follow the same rule, so with no requested sub-tab the first enabled one is
  selected.
- `fallback` is true when a requested id was not honoured. Hosts show the resolved tab and do not
  rewrite the URL.
- The shell resolves the ids it receives the same way, so passing the result's `tabs`,
  `activeTab.id`, and `activeSubTab.id` is idempotent.

### 7. Picker keyboard fixes

`ResourcePicker` moves focus into its popup only once the popup is positioned and visible; ArrowDown
or ArrowUp on the trigger of an open popup moves focus into it; Tab closes a popover, returning
focus to the trigger when focus was inside the portaled popup; and choosing an action, a value, or
the header action returns focus to the trigger when closing the popup would otherwise leave it on
the page, while a choice that moved focus on (into a dialog, onto a newly selected tab) keeps it.
These apply to every picker.

### 8. Styling

The tab focus ring is inset (`outline-offset: -4px`) so neither the scrolling strip nor the card
clips it. Tabs keep their entry in the coarse-pointer selector list and do not adopt `cc-control`:
that class sets control typography and an outer ring, which would restyle every tab and be clipped
by the strip. The secondary strip's band now belongs to the frame that holds the strip and its More
trigger.

## Ownership boundary

The SDK owns tab semantics, keyboard focus, the tab panel, overflow measurement, the More menu, and
the resolution rules. The host owns the tab definitions, the requested ids and where they are
stored, the tab bodies, the icons, and what a fallback means for its URL. No route, endpoint, or
product type enters the SDK.

## Serialized contracts and backend impact

None. Tab definitions are in-memory TypeScript values; no contract ID, JSON Schema, fixture, iframe
protocol, theme, or storage format changes, and no backend action is required.

## Consumer adoption

1. Resolve the tabs once per render with `resolveResourceDetailTabs`, pass the result to
   `ResourceDetailShell`, and switch the tab body on the same result.
2. Move hand-written visibility filters into `isVisible` and gates into `disabled`.
3. Replace icons inside tab labels with `renderTabLead`, move an object's icon from a
   hand-built header into `renderBreadcrumbLead`, and name the strip with `tabsLabel`.
4. Delete private tab components and button rows that imitate tabs; move such pages onto the shell.
5. Leave `tabsOverflow` at `auto` unless a page has a reason to force one form.

## Verification

- Pure tests for the resolver and for the fitting and scrolling rules.
- Server-render tests for the Tab stop, `aria-controls`, the panel's label, `aria-disabled`, leads,
  and the pre-measurement `scroll` form.
- jsdom tests for the arrow keys, Home and End, right-to-left, modifier keys, disabled tabs, the
  secondary strip, the More path with focus handoff, the coarse-pointer form, and a `loading`
  toggle.
- A browser test that bundles a live fixture: Enter and Space selection, the inset ring, one Tab
  stop, More as a popover and as a sheet with first-item focus and focus handoff, strip-only
  scrolling, and coarse-pointer sizing and stacking.
- `ResourcePicker` tests for each keyboard fix.

## Compatibility and rollout

All additions are optional; no export is removed or renamed. Observable changes for existing
details:

- A strip is one Tab stop and the panel is a Tab stop of its own.
- With a fine pointer, tabs that do not fit move into More instead of scrolling; pass
  `tabsOverflow="scroll"` to keep the previous behaviour.
- With no requested sub-tab, the first enabled sub-tab is selected instead of none.
- The tabs row gains a frame element around each strip and its More trigger.
- Pickers keep focus inside an open popup on ArrowDown and close a popover on Tab.

## Rejected alternatives

### Publish a standalone `Tabs` in `/controls` now

Every current use is a detail with a summary and sections. A general control would fix an API for
one caller and invite tab strips outside the shell's layout.

### Publish a host's private tab component as it is

It used application styling, its own dropdown, and no tab panel, and it could leave a selected tab
inside its overflow menu with nothing selected in the strip.

### Build a separate menu for More

The SDK already has one menu, `ResourcePicker` in action mode, with a sheet form on small screens.
Fixing its keyboard defects improves every picker instead of adding a second popup.

### Keep the selected tab inside More

The panel's label would point at a tab that is not rendered, and the strip would show no current
section. Keeping the selected tab in the strip avoids both.
