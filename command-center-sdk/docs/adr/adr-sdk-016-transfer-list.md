# SDK ADR 016: A Side-by-Side Transfer List for Choosing Many Items

- Status: Accepted
- Date: 2026-09-29
- Implementation: `@dev-mainsequence/command-center-sdk` 0.5.9
- Owners: Command Center SDK maintainers
- Package: `@dev-mainsequence/command-center-sdk`
- Related:
  - [SDK ADR 006: Device-Aware Primitives](./adr-sdk-006-device-aware-primitives.md)
  - [SDK ADR 011: Public Control and Form Primitives](./adr-sdk-011-public-control-and-form-primitives.md)
  - [SDK ADR 015: Detail Tabs Own Their Keyboard, Panel, and Overflow](./adr-sdk-015-detail-tabs.md)
  - [Resources](../resources.md), [Mobile](../concepts/mobile.md)

## Publication status

This decision is implemented in SDK source for the next package release. A consumer may use
`ResourceTransferList` and its types only when its installed package's declarations contain them.

## Decision summary

`/views` publishes `ResourceTransferList`: two searchable lists side by side, the items not chosen
and the items chosen, with buttons that move the marked items or every shown item across. It is a
controlled, generic selection primitive over the picker's option model. It has no notion of users,
teams, or access: applications compose it into those controls, and they own what a choice means
and when it is saved.

## Context

### Applications choose many items from long lists

Assigning people to access levels, members to groups, or datasets to a job means choosing many
items from a list of hundreds while seeing what is already chosen. `ResourcePicker` in multiple
mode chooses many items, but in a popup: once it closes, the choice is a count on a trigger, and
reviewing or trimming a long selection means reopening it.

### Hosts built their own dual lists

A host application built this control itself, twice per access level: a list for users and a list
for teams. Its rows were plain buttons with a visual highlight and no selection semantics; its move
buttons held only arrow icons, so they had no accessible name; every row was a Tab stop; its "move
all" ignored the search; and on a phone its lists grew without limit, so one access editor became a
column of eight lists and sixteen buttons. It also dropped chosen values it could not show, which
turned a missing option into a removal.

### No SDK primitive fits

`ResourcePicker` cannot be a pane: its open state is internal and it renders as a popup or sheet.
`DataTable` selection has no search of its own, every checkbox is a Tab stop, and a table is heavier
than a list. ADR 011 deferred a public `Checkbox` and `Select`, so a checklist would also need new
controls.

## Decision

### 1. A generic, controlled primitive in `/views`

`ResourceTransferList` takes `options` (the picker's `ResourcePickerOption`), `value` (the chosen
values in order), and `onValueChange(value, change)`, where `change` is `{ added, removed }` in move
order, so an application can send exactly the changes its backend expects. `itemLabel`, a plural
noun, names the lists, searches, and buttons. The SDK does not model users, teams, or access, and no
wire contract changes.

### 2. Value rules

- The chosen list follows `value` order; added items are appended in the order of the unchosen list.
- A chosen value with no option stays in the value and is not shown. The list never removes what it
  cannot display.
- A `disabled` option cannot be marked or moved. Among the chosen items it is a locked choice, such
  as an owner who always has access; the application says why in `meta` or `subtitle`.

### 3. Semantics and keyboard

- Each list is a `listbox` with `aria-multiselectable`, named by its heading, item label, and count
  ("Available users (42)", or "3 of 42" while searching), and described by `description`.
- Options are buttons with `role="option"` and `aria-selected`, as in the picker, so the layout
  verifier measures every row. Disabled options use `aria-disabled` and stay focusable, as in
  ADR 015.
- Each list is one Tab stop. ArrowUp and ArrowDown move focus; Home and End jump; Space marks the
  focused option; Shift with an arrow extends the marks; Ctrl or Cmd with A marks every shown,
  enabled option and clears them when all are marked; Enter moves the marked options, or the focused
  one, across. A click marks; a double-click moves one option.
- After a move, focus stays in the source list on the next option that remains, or moves to the
  other list when the source empties. A status region announces the move.

### 4. Move buttons

Four `/controls` `Button`s with `iconOnly` and an `aria-label`: "Add selected", "Add all shown",
"Remove selected", and "Remove all shown", each followed by the item label. "All shown" follows the
search, and only shown marks move. A button with nothing to move is `aria-disabled` rather than
disabled, so focus never falls to the page after it moves the last item.

### 5. Search

Each list has its own search, labelled for assistive technology and filtering by label, subtitle,
meta, and keywords. The rule is shared with the picker through one internal helper.

### 6. Presentation

`presentation` is `columns` (unchosen, buttons, chosen), `stacked` (unchosen, a row of buttons,
chosen), or `auto`, which stacks below `sm`; the resolved form is `data-cc-presentation`. Server
HTML uses `columns`. Each list scrolls inside a fixed height (in the stacked form, up to that
height). The move icons point down and up when stacked. Rows reach 44px on a coarse pointer through
the coarse-pointer selector list, as picker options do, and the move buttons through `cc-control`.

### 7. Read only

`disabled` keeps the lists browsable and searchable and moves nothing.

## Ownership boundary

The SDK owns the lists' semantics, keyboard, focus, search, marks, announcements, presentation, and
the move rules. The application owns the options and what they stand for, the value and where it is
stored, locked choices and their reasons, when and how a change is saved, and any error from saving.

## Serialized contracts and backend impact

None. No contract ID, JSON Schema, fixture, iframe protocol, theme, or storage format changes, and
no backend action is required.

## Consumer adoption

1. Replace a hand-built dual list with `ResourceTransferList`, one per kind of item.
2. Map items to `ResourcePickerOption`s and pass the chosen values.
3. Save from `onValueChange`, using `change` to send only what moved.
4. Mark items that must stay chosen as `disabled`, with the reason in `meta` or `subtitle`.
5. Leave `presentation` at `auto`.

## Verification

- Pure tests for ordering, preserved values, locked choices, and the change payload.
- Server-render tests for the named listboxes, one Tab stop per list, button names, locked options,
  and the `columns` form on the server.
- jsdom tests for marking, Shift and Ctrl/Cmd+A, Enter and double-click moves, "all shown" with a
  search, preserved values, read only, focus after a move, the announcement, and the stacked form.
- A browser test that bundles a live composition of a user list and a team list: real keyboard
  focus and moves, the focus ring, and the coarse-pointer form with 44px rows and no horizontal
  overflow.

## Compatibility and rollout

Additive. `ResourcePicker` behaves as before; its search rule moved to a shared internal helper with
the same behavior.

## Rejected alternatives

### A sharing or access component

Users, teams, access levels, and their semantics differ by backend and product. A generic primitive
serves every assignment screen; an access component would fix one product's model into the SDK.

### A picker mode

The picker is a popup by design, with a trigger, a closed state, and sheet presentation on phones.
An always-visible pair of lists is a different surface.

### Checkbox lists

A checklist per list needs a public `Checkbox`, which ADR 011 deferred, and it shows chosen and
unchosen items together, which does not scale to reviewing a long selection.
